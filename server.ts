import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(process.cwd(), '.env') });
import express from "express";
import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { Pool } from "pg";
import axios from "axios";
import Outscraper from "outscraper";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const CLAWBACK_DAYS = 14;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_super_secret_for_dev_12345";

// Global pool variable, initialized gracefully
let pool: Pool | null = null;
let dbInitialized = false;
let dbError: string | null = null;

async function initDB() {
  if (!process.env.DATABASE_URL) {
    dbError = "DATABASE_URL is not configured.";
    return;
  }
  
  try {
    // Try to connect with SSL first, unless it's explicitly localhost
    let useSsl: boolean | { rejectUnauthorized: boolean } = process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false };
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl,
      connectionTimeoutMillis: 5000
    });

    let client;
    try {
      // Test connection
      client = await pool.connect();
    } catch (connErr: any) {
      // If server does not support SSL, retry without SSL
      if (connErr.message && (connErr.message.includes("SSL") || connErr.message.includes("ssl"))) {
        console.warn("SSL connection failed, retrying without SSL...");
        await pool.end().catch(() => {}); // cleanup failed pool
        
        pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: false,
          connectionTimeoutMillis: 5000
        });
        client = await pool.connect();
      } else {
        throw connErr;
      }
    }
    
    // Create schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'sales';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        website VARCHAR(255),
        phone VARCHAR(255),
        address TEXT,
        country VARCHAR(255),
        province VARCHAR(255),
        city VARCHAR(255),
        industry VARCHAR(255),
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_pinned BOOLEAN DEFAULT FALSE,
        tags JSONB DEFAULT '[]',
        contact_methods JSONB DEFAULT '[]',
        last_contacted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      DO $$ 
      BEGIN 
        BEGIN
          ALTER TABLE customers ADD COLUMN contact_methods JSONB DEFAULT '[]';
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column contact_methods already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN country VARCHAR(255);
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column country already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN province VARCHAR(255);
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column province already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN city VARCHAR(255);
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column city already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN previous_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column previous_owner_id already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN released_at TIMESTAMP;
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column released_at already exists.';
        END;
      END $$;

      CREATE TABLE IF NOT EXISTS email_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        from_name VARCHAR(255),
        from_email VARCHAR(255),
        credential_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES email_accounts(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        direction VARCHAR(50),
        thread_id VARCHAR(255),
        from_address VARCHAR(255),
        to_address VARCHAR(255),
        subject VARCHAR(1024),
        body_text TEXT,
        body_html TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(255),
        role VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS interactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        type VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT
      );
    `);

    // Ensure at least one default user
    const hash = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO users (name, email, password_hash, role, status) 
      VALUES ('Super Admin', 'admin@example.com', $1, 'super_admin', 'approved')
      ON CONFLICT (email) 
      DO UPDATE SET role = 'super_admin', status = 'approved', password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash)
    `, [hash]);

    client.release();
    dbInitialized = true;
    dbError = null;
    console.log("Database connected and initialized successfully.");
  } catch (err: any) {
    console.error("Database connection failed:", err);
    pool = null;
    dbInitialized = false;
    dbError = err.message || "Failed to connect to database";
  }
}

// Background task to run clawback logic (releasing untouched private clients to public pool)
setInterval(async () => {
  if (!pool || !dbInitialized) return;
  try {
    // Release customers that haven't been contacted in CLAWBACK_DAYS days
    const result = await pool.query(`
      UPDATE customers 
      SET owner_id = NULL 
      WHERE owner_id IS NOT NULL 
      AND (last_contacted_at IS NULL OR last_contacted_at < NOW() - INTERVAL '${CLAWBACK_DAYS} days')
    `);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Clawback: Released ${result.rowCount} customers back to public pool.`);
    }
  } catch (err) {
    console.error("Clawback error:", err);
  }
}, 60 * 60 * 1000); // Check every hour


async function startServer() {
  await initDB();

  const app = express();
  app.use(express.json());

  // Authentication logic
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: "Forbidden" });
      req.user = user;
      next();
    });
  };

  const requireSuperAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: "Requires super admin privileges" });
    }
    next();
  };

  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!pool || !dbInitialized) return res.status(503).json({ error: "Database not ready" });
      const { name, email, password } = req.body;
      const hash = await bcrypt.hash(password, 10);
      
      const { rows } = await pool.query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role, status",
        [name, email, hash]
      );
      res.json({ message: "Registration successful, awaiting approval", user: rows[0] });
    } catch (e: any) {
      if (e.code === '23505') {
        return res.status(400).json({ error: "Email already registered" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!pool || !dbInitialized) return res.status(503).json({ error: "Database not ready" });
      const { email, password } = req.body;
      
      const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
      
      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash || '');
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      
      if (user.status !== 'approved') {
        return res.status(403).json({ error: `Account is ${user.status}. Please wait for admin approval.` });
      }

      const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res: any) => {
    try {
      const { rows } = await pool!.query("SELECT id, name, email, role, status FROM users WHERE id = $1", [req.user.id]);
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      if (rows[0].status !== 'approved') return res.status(403).json({ error: "Account no longer approved" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/auth/profile", authenticateToken, async (req: any, res: any) => {
    try {
      if (!pool || !dbInitialized) return res.status(503).json({ error: "Database not ready" });
      
      const { name, password } = req.body;
      const userId = req.user.id;
      
      let query = "UPDATE users SET ";
      const values: any[] = [];
      let counter = 1;
      
      if (name) {
        query += `name = $${counter}, `;
        values.push(name);
        counter++;
      }
      
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        query += `password_hash = $${counter}, `;
        values.push(hash);
        counter++;
      }
      
      if (values.length === 0) {
        return res.json({ message: "No changes made" });
      }
      
      query = query.slice(0, -2); // remove trailing comma and space
      query += ` WHERE id = $${counter} RETURNING id, name, email, role, status`;
      values.push(userId);
      
      const { rows } = await pool.query(query, values);
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      
      res.json({ user: rows[0] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin routes
  app.get("/api/admin/users", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      const { rows } = await pool!.query("SELECT id, name, email, role, status FROM users ORDER BY id DESC");
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/users/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      const { role, status } = req.body;
      let updates = [];
      let params = [];
      let idx = 1;
      
      if (role) { updates.push(`role = $${idx++}`); params.push(role); }
      if (status) { updates.push(`status = $${idx++}`); params.push(status); }
      
      if (updates.length === 0) return res.json({ success: true });
      
      params.push(req.params.id);
      const { rowCount } = await pool!.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
        params
      );
      res.json({ success: rowCount === 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ====== API ROUTES ======

  app.get("/api/config", (req, res) => {
    res.json({ 
      hasDb: dbInitialized, 
      error: dbError,
      hasOutscraper: !!process.env.OUTSCRAPER_API_KEY
    });
  });

  // DB Middleware
  app.use("/api/db/*", authenticateToken, (req, res, next) => {
    if (!pool || !dbInitialized) {
      return res.status(503).json({ error: "Database not configured or currently unavailable." });
    }
    next();
  });

  // Settings
  app.get("/api/db/settings", async (req, res) => {
    try {
      const { rows } = await pool!.query("SELECT * FROM app_settings");
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/settings", requireSuperAdmin, async (req, res) => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const settings = req.body;
      for (const [key, value] of Object.entries(settings)) {
        await client.query(
          "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
          [key, String(value)]
        );
      }
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (e: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // Customers endpoint
  app.get("/api/db/customers", async (req, res) => {
    try {
      const { filter } = req.query; // 'public' | 'private'
      let query = "SELECT * FROM customers";
      let params: any[] = [];

      if (filter === 'public') {
        query += " WHERE owner_id IS NULL ORDER BY is_pinned DESC, id DESC";
      } else if (filter === 'private') {
        const userId = req.query.userId || 1;
        query += " WHERE owner_id = $1 ORDER BY last_contacted_at DESC NULLS LAST, id DESC";
        params.push(userId);
      } else {
        query += " ORDER BY id DESC";
      }

      const { rows } = await pool!.query(query, params);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/db/customers/:id", async (req, res) => {
    try {
      const { rows } = await pool!.query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: "Customer not found" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Claim or Release a customer
  app.post("/api/db/customers/:id/claim", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      // Check 7-day rule
      const { rows } = await pool!.query("SELECT previous_owner_id, released_at FROM customers WHERE id = $1", [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: "Customer not found" });
      const cust = rows[0];
      
      if (cust.previous_owner_id === userId && cust.released_at) {
        const releasedTime = new Date(cust.released_at).getTime();
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (releasedTime > sevenDaysAgo) {
          return res.status(403).json({ error: "原认领人7天内不可重新认领该客户" });
        }
      }

      const { rowCount } = await pool!.query("UPDATE customers SET owner_id = $1 WHERE id = $2", [userId, req.params.id]);
      res.json({ success: rowCount === 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/customers/:id/release", authenticateToken, async (req: any, res) => {
    try {
      const { rowCount } = await pool!.query(
        "UPDATE customers SET owner_id = NULL, previous_owner_id = $1, released_at = NOW() WHERE id = $2 AND owner_id = $1", 
        [req.user.id, req.params.id]
      );
      res.json({ success: rowCount === 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update customer (tags, pins, etc)
  app.patch("/api/db/customers/:id", async (req, res) => {
    try {
      const { tags, is_pinned, name, website, phone, address, country, province, city, industry, contact_methods } = req.body;
      let updates = [];
      let params = [];
      let paramCount = 1;

      if (tags !== undefined) {
        updates.push(`tags = $${paramCount++}`);
        params.push(JSON.stringify(tags)); // tags is JSONB array
      }
      if (is_pinned !== undefined) {
        updates.push(`is_pinned = $${paramCount++}`);
        params.push(is_pinned);
      }
      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        params.push(name);
      }
      if (website !== undefined) {
        updates.push(`website = $${paramCount++}`);
        params.push(website);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        params.push(phone);
      }
      if (address !== undefined) {
        updates.push(`address = $${paramCount++}`);
        params.push(address);
      }
      if (country !== undefined) {
        updates.push(`country = $${paramCount++}`);
        params.push(country);
      }
      if (province !== undefined) {
        updates.push(`province = $${paramCount++}`);
        params.push(province);
      }
      if (city !== undefined) {
        updates.push(`city = $${paramCount++}`);
        params.push(city);
      }
      if (industry !== undefined) {
        updates.push(`industry = $${paramCount++}`);
        params.push(industry);
      }
      if (contact_methods !== undefined) {
        updates.push(`contact_methods = $${paramCount++}`);
        params.push(JSON.stringify(contact_methods));
      }
      
      if (updates.length === 0) return res.json({ success: true });

      params.push(req.params.id);
      const queryStr = `UPDATE customers SET ${updates.join(', ')} WHERE id = $${paramCount}`;
      
      const { rowCount } = await pool!.query(queryStr, params);
      res.json({ success: rowCount === 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create customer manually
  app.post("/api/db/customers", authenticateToken, async (req: any, res) => {
    try {
      const { name, website, phone, address, country, province, city, industry, contact_methods } = req.body;
      let methodsJson = '[]';
      if (contact_methods) {
          methodsJson = JSON.stringify(contact_methods);
      }
      const { rows } = await pool!.query(
        "INSERT INTO customers (name, website, phone, address, country, province, city, industry, contact_methods, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
        [name, website, phone, address, country, province, city, industry, methodsJson, req.user.id]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get customer contacts
  app.get("/api/db/customers/:id/contacts", async (req, res) => {
    try {
      const { rows } = await pool!.query("SELECT * FROM contacts WHERE customer_id = $1 ORDER BY id DESC", [req.params.id]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Add contact
  app.post("/api/db/customers/:id/contacts", async (req, res) => {
    try {
      const { name, email, phone, role } = req.body;
      const { rows } = await pool!.query(
        "INSERT INTO contacts (customer_id, name, email, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [req.params.id, name, email, phone, role]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get customer interactions
  app.get("/api/db/customers/:id/interactions", async (req, res) => {
    try {
      const { rows } = await pool!.query("SELECT i.*, u.name as user_name FROM interactions i LEFT JOIN users u ON i.user_id = u.id WHERE customer_id = $1 ORDER BY i.created_at DESC", [req.params.id]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Add interaction
  app.post("/api/db/customers/:id/interactions", async (req, res) => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const { userId, type, notes } = req.body;
      
      const { rows } = await client.query(
        "INSERT INTO interactions (customer_id, user_id, type, notes) VALUES ($1, $2, $3, $4) RETURNING *",
        [req.params.id, userId, type, notes]
      );

      // Update last_contacted_at
      await client.query("UPDATE customers SET last_contacted_at = NOW() WHERE id = $1", [req.params.id]);

      await client.query("COMMIT");
      res.json(rows[0]);
    } catch (e: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.post("/api/outscraper/import", authenticateToken, async (req: any, res: any) => {
    const apiKey = process.env.OUTSCRAPER_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Outscraper API Key is not configured." });
    }
    if (!pool || !dbInitialized) {
      return res.status(503).json({ error: "Database not configured." });
    }

    try {
      let { query, limit = 10 } = req.body;
      
      // Fetch AI settings
      const { rows } = await pool!.query("SELECT * FROM app_settings");
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      
      let optimizedQuery = query;
      
      // Use AI if configured
      if (settings.module_outscraper_ai && settings.ai_profiles) {
        try {
          const profiles = JSON.parse(settings.ai_profiles);
          const profile = profiles.find((p: any) => p.id === settings.module_outscraper_ai);
          
          if (profile && profile.apiKey) {
            const openai = new OpenAI({
              apiKey: profile.apiKey,
              baseURL: profile.baseURL || "https://api.openai.com/v1"
            });
            
            const model = profile.model || "gpt-3.5-turbo";
            const completion = await openai.chat.completions.create({
              model,
              messages: [
                { role: "system", content: "You are a helpful assistant that translates user intent into professional English search queries optimized for Google Maps. Given the user's input, output strictly the English query phrase and nothing else. Example: '北京的餐馆' -> 'restaurants in Beijing'" },
                { role: "user", content: query }
              ]
            });
            
            if (completion.choices && completion.choices[0] && completion.choices[0].message.content) {
              optimizedQuery = completion.choices[0].message.content.trim().replace(/^"|"$/g, '');
              console.log(`Original query: "${query}" -> Optimized: "${optimizedQuery}"`);
            }
          }
        } catch (aiErr: any) {
          console.error("AI translation failed:", aiErr.message);
          // If translation fails, we still try parsing with the original query
        }
      }
      
      const client = new Outscraper(apiKey);
      // googleMapsSearch(query, limit, language, region, skip, dropDuplicates, enrichment, asyncRequest)
      const result = await client.googleMapsSearch([optimizedQuery], limit, "en", null, 0, false, null, false);
      
      // result is an array of arrays (one for each query), so we get the first one
      const scrapedData = Array.isArray(result) && result.length > 0 ? result[0] : null; 
      
      if (!scrapedData || !Array.isArray(scrapedData)) {
        return res.json({ imported: 0, message: "No data found", optimizedQuery });
      }

      let imported = 0;
      for (const place of scrapedData) {
        if (!place.name) continue;
        const name = place.name;
        const website = place.site || "";
        const phone = place.phone || "";
        const address = place.full_address || "";
        const country = place.country || "";
        const province = place.state || "";
        const city = place.city || "";
        const industry = place.type || "";
        const tags = place.subtypes ? place.subtypes : [];

        // Insert into public pool
        await pool!.query(
          "INSERT INTO customers (name, website, phone, address, country, province, city, industry, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [name, website, phone, address, country, province, city, industry, JSON.stringify(tags)]
        );
        imported++;
      }

      res.json({ imported, success: true, optimizedQuery });
    } catch (e: any) {
      console.error(e.response ? e.response.data : e.message);
      res.status(500).json({ error: "Failed to scrape and import data." });
    }
  });


  // ====== EMAIL ACCOUNTS ======
  app.get("/api/db/email-accounts", authenticateToken, async (req: any, res) => {
    try {
      const { rows } = await pool!.query("SELECT * FROM email_accounts WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/email-accounts", authenticateToken, async (req: any, res) => {
    try {
      const { provider, from_name, from_email, credential_data } = req.body;
      const { rows } = await pool!.query(
        "INSERT INTO email_accounts (user_id, provider, from_name, from_email, credential_data) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [req.user.id, provider, from_name, from_email, JSON.stringify(credential_data)]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/db/email-accounts/:id", authenticateToken, async (req: any, res) => {
    try {
      const { provider, from_name, from_email, credential_data } = req.body;
      const { rows } = await pool!.query(
        "UPDATE email_accounts SET provider = $1, from_name = $2, from_email = $3, credential_data = $4 WHERE id = $5 AND user_id = $6 RETURNING *",
        [provider, from_name, from_email, JSON.stringify(credential_data), req.params.id, req.user.id]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/db/email-accounts/:id", authenticateToken, async (req: any, res) => {
    try {
      await pool!.query("DELETE FROM email_accounts WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ====== EMAILS ======
  app.get("/api/db/emails", authenticateToken, async (req: any, res) => {
    try {
      const { customer_id } = req.query;
      let query = "SELECT * FROM emails WHERE account_id IN (SELECT id FROM email_accounts WHERE user_id = $1)";
      let params: any[] = [req.user.id];
      if (customer_id) {
        query += " AND customer_id = $2";
        params.push(customer_id);
      }
      query += " ORDER BY created_at DESC";
      const { rows } = await pool!.query(query, params);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/emails/sync", authenticateToken, async (req: any, res) => {
    try {
      const { rows: accounts } = await pool!.query("SELECT * FROM email_accounts WHERE user_id = $1 AND provider = 'imap'", [req.user.id]);
      let syncedCount = 0;

      for (const account of accounts) {
        let creds;
        try {
          creds = typeof account.credential_data === 'string' ? JSON.parse(account.credential_data) : account.credential_data;
        } catch (e) {
          continue;
        }
        
        if (!creds.host || !creds.user || !creds.password) continue;
        
        const config = {
          imap: {
            user: creds.user,
            password: creds.password,
            host: creds.host,
            port: creds.port || 993,
            tls: creds.tls !== false,
            authTimeout: 5000
          }
        };

        try {
          const connection = await imaps.connect(config);
          await connection.openBox('INBOX');

          const delay = 10 * 24 * 3600 * 1000;
          const searchCriteria = [
            ['SINCE', new Date(Date.now() - delay).toISOString()]
          ];
          const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            struct: true,
            markSeen: false
          };

          const messages = await connection.search(searchCriteria, fetchOptions);

          for (const item of messages) {
            const all = item.parts.find((part) => part.which === '');
            if (!all || !all.body) continue;
            const id = item.attributes.uid;

            const parsed = await simpleParser(all.body);
            
            const subject = parsed.subject || '';
            const text = parsed.text || parsed.html || '';
            const threadId = parsed.messageId || String(id);
            const fromAdd = (parsed.from?.value as any)?.[0]?.address || '';
            const toAdd = (parsed.to?.value as any)?.[0]?.address || '';
            
            const existing = await pool!.query("SELECT id FROM emails WHERE account_id = $1 AND thread_id = $2", [account.id, threadId]);
            if (existing.rows.length === 0) {
              await pool!.query(
                "INSERT INTO emails (account_id, direction, thread_id, from_address, to_address, subject, body_text, sent_at, created_at) VALUES ($1, 'inbound', $2, $3, $4, $5, $6, $7, NOW())",
                [account.id, threadId, fromAdd, toAdd, subject, text, parsed.date || new Date()]
              );
              syncedCount++;
            }
          }
          connection.end();
        } catch (err: any) {
          console.error("IMAP sync failed for account " + account.id, err);
        }
      }

      res.json({ success: true, syncedCount });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/emails", authenticateToken, async (req: any, res) => {
    try {
      const { account_id, customer_id, direction, thread_id, to_address, subject, body_text } = req.body;
      const { rows: accountRows } = await pool!.query("SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2", [account_id, req.user.id]);
      if (accountRows.length === 0) return res.status(403).json({ error: "Unauthorized account" });
      const account = accountRows[0];
      
      const { rows } = await pool!.query(
        "INSERT INTO emails (account_id, customer_id, direction, thread_id, from_address, to_address, subject, body_text, sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *",
        [account_id, customer_id, direction, thread_id, account.from_email, to_address, subject, body_text]
      );
      
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/email/generate", authenticateToken, async (req: any, res) => {
    try {
      const { prompt, customer_info, email_history } = req.body;
      const { rows } = await pool!.query("SELECT * FROM app_settings");
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      
      if (!settings.module_email_ai || !settings.ai_profiles) {
        return res.status(400).json({ error: "AI for Emails not configured in Settings." });
      }
      
      const profiles = JSON.parse(settings.ai_profiles);
      const profile = profiles.find((p: any) => p.id === settings.module_email_ai);
      if (!profile) return res.status(400).json({ error: "Email AI Profile not found." });
      
      const openai = new OpenAI({
        apiKey: profile.apiKey,
        baseURL: profile.baseURL || "https://api.openai.com/v1"
      });
      
      const completion = await openai.chat.completions.create({
        model: profile.model || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a professional email assistant. Draft an email based on the prompt. Customer Info: " + JSON.stringify(customer_info) + ". History: " + JSON.stringify(email_history) },
          { role: "user", content: prompt }
        ]
      });
      res.json({ draft: completion.choices[0].message.content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generate-message", authenticateToken, async (req: any, res) => {
    try {
      const { prompt, method_type, customer_info } = req.body;
      const { rows } = await pool!.query("SELECT * FROM app_settings");
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      
      const aiModuleId = settings.module_email_ai || settings.module_outscraper_ai;
      if (!aiModuleId || !settings.ai_profiles) {
        return res.status(400).json({ error: "请在设置中配置 AI 模型。" });
      }
      
      const profiles = JSON.parse(settings.ai_profiles);
      const profile = profiles.find((p: any) => p.id === aiModuleId);
      if (!profile) return res.status(400).json({ error: "AI 配置未找到。" });
      
      const openai = new OpenAI({
        apiKey: profile.apiKey,
        baseURL: profile.baseURL || "https://api.openai.com/v1"
      });
      
      const completion = await openai.chat.completions.create({
        model: profile.model || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: `You are a professional sales assistant. Draft a short, concise ${method_type} message based on the prompt. Customer Info: ${JSON.stringify(customer_info)}` },
          { role: "user", content: prompt }
        ]
      });
      res.json({ message: completion.choices[0].message.content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ====== FRONTEND ======
  
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Note: express@4.x uses '*'
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
