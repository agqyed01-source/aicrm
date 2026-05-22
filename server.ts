import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(process.cwd(), '.env') });
import express from "express";
import nodemailer from "nodemailer";
import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { Pool } from "pg";
import axios from "axios";
import Outscraper from "outscraper";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { parse } from "csv-parse";

const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const CLAWBACK_DAYS = 7;
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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

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
        BEGIN
          ALTER TABLE customers ADD COLUMN source VARCHAR(255);
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column source already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN source_keyword VARCHAR(255);
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column source_keyword already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN ai_agent_status VARCHAR(50) DEFAULT 'none';
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column ai_agent_status already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN ai_agent_workflow JSONB DEFAULT '{}';
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column ai_agent_workflow already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN ai_agent_next_run TIMESTAMP;
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column ai_agent_next_run already exists.';
        END;
        BEGIN
          ALTER TABLE customers ADD COLUMN stage VARCHAR(50) DEFAULT 'uncontacted';
        EXCEPTION
          WHEN duplicate_column THEN RAISE NOTICE 'column stage already exists.';
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
        is_read BOOLEAN DEFAULT FALSE,
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

// AI Agent Background Worker
setInterval(async () => {
  if (!pool || !dbInitialized) return;
  try {
    const { rows: dueCustomers } = await pool.query(`
      SELECT * FROM customers 
      WHERE ai_agent_status = 'active' AND ai_agent_next_run <= NOW()
    `);

    if (dueCustomers.length === 0) return;

    // Load AI Profile
    const { rows: appSettings } = await pool.query("SELECT * FROM app_settings");
    const settings = appSettings.reduce((acc: any, row: any) => ({ ...acc, [row.key]: row.value }), {});
    if (!settings.ai_profiles || !settings.module_email_ai) return;

    const profiles = JSON.parse(settings.ai_profiles);
    const profile = profiles.find((p: any) => p.id === settings.module_email_ai);
    if (!profile) return;

    const openai = new OpenAI({
      apiKey: profile.apiKey,
      baseURL: profile.baseURL || "https://api.openai.com/v1"
    });

      for (const customer of dueCustomers) {
      let workflow = customer.ai_agent_workflow;
      if (typeof workflow === 'string') workflow = JSON.parse(workflow);
      if (!workflow) continue;

      const currentStepIndex = workflow.current_step || 0;
      const stepConfig = (workflow.steps && workflow.steps.length > currentStepIndex) 
          ? workflow.steps[currentStepIndex] 
          : { prompt: workflow.prompt, channel: workflow.channel || 'email' };
      
      const totalSteps = workflow.steps ? workflow.steps.length : (workflow.max_steps || 3);
      if (currentStepIndex >= totalSteps) continue;

      try {
        const completion = await openai.chat.completions.create({
          model: profile.model || "gpt-3.5-turbo",
          messages: [
            { role: "system", content: `You are an autonomous AI sales agent following up with a potential B2B customer. You are on step ${currentStepIndex + 1} of ${totalSteps}. Overall goal: ${workflow.prompt || 'Follow up'}. Step-specific instructions: ${stepConfig.prompt || 'Draft a follow-up message.'}. Contact channel: ${stepConfig.channel}. Generate a short, compelling message draft for this channel.` },
            { role: "user", content: `Customer Name: ${customer.name}, Website: ${customer.website || 'N/A'}, Industry: ${customer.industry || 'N/A'}` }
          ]
        });

        const content = completion.choices[0].message.content;

        // Add interaction log
        await pool.query(
          "INSERT INTO interactions (customer_id, user_id, type, notes) VALUES ($1, $2, $3, $4)",
          [customer.id, customer.owner_id, "ai_generation", `[AI Agent Step ${currentStepIndex + 1} - ${stepConfig.channel}]:\n\n${content}`]
        );

        workflow.current_step = currentStepIndex + 1;

        if (workflow.current_step >= totalSteps) {
          // Finish workflow
          await pool.query("UPDATE customers SET ai_agent_status = 'completed', ai_agent_next_run = NULL, ai_agent_workflow = $1 WHERE id = $2", [JSON.stringify(workflow), customer.id]);
        } else {
           // Schedule next
           let nextIntervalDays = workflow.interval_days || 3;
           if (workflow.steps && workflow.steps.length > workflow.current_step) {
               nextIntervalDays = workflow.steps[workflow.current_step].delayDays || 0;
           }
           await pool.query(`UPDATE customers SET ai_agent_workflow = $1, ai_agent_next_run = NOW() + INTERVAL '${nextIntervalDays} days' WHERE id = $2`, [JSON.stringify(workflow), customer.id]);
        }
      } catch (err) {
        console.error("AI Agent error for customer " + customer.id, err);
      }
    }
  } catch (err) {
    console.error("AI Agent loop error:", err);
  }
}, 5 * 60 * 1000); // Check every 5 minutes


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
      if (err) return res.status(401).json({ error: "Forbidden" });
      req.user = user;
      next();
    });
  };

  const requireSuperAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'super_admin') {
      return res.status(401).json({ error: "Requires super admin privileges" });
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
        return res.status(401).json({ error: `Account is ${user.status}. Please wait for admin approval.` });
      }

      const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res: any) => {
    try {
      const { rows } = await pool!.query("SELECT id, name, email, role, status, preferences FROM users WHERE id = $1", [req.user.id]);
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      if (rows[0].status !== 'approved') return res.status(401).json({ error: "Account no longer approved" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/auth/preferences", authenticateToken, async (req: any, res: any) => {
    try {
      if (!pool || !dbInitialized) return res.status(503).json({ error: "Database not ready" });
      const { preferences } = req.body;
      const { rows } = await pool.query(
        "UPDATE users SET preferences = $1 WHERE id = $2 RETURNING preferences",
        [JSON.stringify(preferences || {}), req.user.id]
      );
      res.json({ preferences: rows[0].preferences });
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
          return res.status(400).json({ error: "原认领人7天内不可重新认领该客户" });
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
  // Update customer (tags, pins, etc)
  app.patch("/api/db/customers/:id", async (req, res) => {
    try {
      const { tags, is_pinned, name, website, phone, address, country, province, city, industry, stage, contact_methods, ai_agent_status, ai_agent_workflow, ai_agent_next_run } = req.body;
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
      if (stage !== undefined) {
        updates.push(`stage = $${paramCount++}`);
        params.push(stage);
      }
      if (contact_methods !== undefined) {
        updates.push(`contact_methods = $${paramCount++}`);
        params.push(JSON.stringify(contact_methods));
      }
      if (ai_agent_status !== undefined) {
        updates.push(`ai_agent_status = $${paramCount++}`);
        params.push(ai_agent_status);
      }
      if (ai_agent_workflow !== undefined) {
        updates.push(`ai_agent_workflow = $${paramCount++}`);
        params.push(JSON.stringify(ai_agent_workflow));
      }
      if (ai_agent_next_run !== undefined) {
        if (ai_agent_next_run === null) {
          updates.push(`ai_agent_next_run = NULL`);
        } else {
          updates.push(`ai_agent_next_run = $${paramCount++}`);
          params.push(ai_agent_next_run);
        }
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

  // Delegate customer to AI Agent
  app.post("/api/db/customers/:id/ai-agent", authenticateToken, async (req: any, res) => {
    try {
      const { workflow } = req.body;
      const { rowCount } = await pool!.query(
        "UPDATE customers SET ai_agent_status = 'active', ai_agent_workflow = $1, ai_agent_next_run = NOW() WHERE id = $2 AND owner_id = $3", 
        [JSON.stringify(workflow), req.params.id, req.user.id]
      );
      if (rowCount === 0) return res.status(401).json({ error: "Not authorized or customer not found" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stop AI Agent
  app.post("/api/db/customers/:id/ai-agent/stop", authenticateToken, async (req: any, res) => {
    try {
      const { rowCount } = await pool!.query(
        "UPDATE customers SET ai_agent_status = 'paused', ai_agent_next_run = NULL WHERE id = $1 AND owner_id = $2", 
        [req.params.id, req.user.id]
      );
      if (rowCount === 0) return res.status(401).json({ error: "Not authorized or customer not found" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/customers/batch", authenticateToken, upload.single('file'), async (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const owner_id = req.body.owner_id === 'null' ? null : (req.body.owner_id ? parseInt(req.body.owner_id) : req.user.id);
    
    try {
      parse(req.file.buffer, { columns: true, skip_empty_lines: true }, async (err, records: any[]) => {
        if (err) return res.status(400).json({ error: err.message });
        
        let imported = 0;
        for (const record of records) {
          const name = record.name || record.Name || record.NAME;
          if (!name) continue;
          
          const website = record.website || record.Website || "";
          const phone = record.phone || record.Phone || "";
          const address = record.address || record.Address || "";
          const country = record.country || record.Country || "";
          const province = record.province || record.Province || record.state || "";
          const city = record.city || record.City || "";
          const industry = record.industry || record.Industry || "";
          
          await pool!.query(
            "INSERT INTO customers (name, website, phone, address, country, province, city, industry, owner_id, source, source_keyword) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            [name, website, phone, address, country, province, city, industry, owner_id, 'csv_import', req.file.originalname]
          );
          imported++;
        }
        res.json({ success: true, imported });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create customer manually
  app.post("/api/db/customers", authenticateToken, async (req: any, res) => {
    try {
      const { name, website, phone, address, country, province, city, industry, contact_methods, source, source_keyword, owner_id } = req.body;
      let methodsJson = '[]';
      if (contact_methods) {
          methodsJson = JSON.stringify(contact_methods);
      }
      
      const insertOwnerId = owner_id !== undefined ? owner_id : req.user.id;
      
      const { rows } = await pool!.query(
        "INSERT INTO customers (name, website, phone, address, country, province, city, industry, contact_methods, owner_id, source, source_keyword) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
        [name, website, phone, address, country, province, city, industry, methodsJson, insertOwnerId, source || 'manual', source_keyword || null]
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
      let { query, limit = 10, owner_id } = req.body;
      const targetOwner = owner_id || null;
      
      // Fetch AI settings
      const { rows } = await pool!.query("SELECT * FROM app_settings");
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      
      let optimizedQuery = query;
      
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

        // Insert into pool
        await pool!.query(
          "INSERT INTO customers (name, website, phone, address, country, province, city, industry, tags, source, source_keyword, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
          [name, website, phone, address, country, province, city, industry, JSON.stringify(tags), 'outscraper', optimizedQuery, targetOwner]
        );
        imported++;
      }

      res.json({ imported, success: true, optimizedQuery });
    } catch (e: any) {
      console.error(e.response ? e.response.data : e.message);
      res.status(500).json({ error: "Failed to scrape and import data." });
    }
  });


  app.post("/api/outscraper/translate", authenticateToken, async (req: any, res: any) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: "Query is required" });

      const { rows } = await pool!.query("SELECT * FROM app_settings");
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});

      if (!settings.module_outscraper_ai || !settings.ai_profiles) {
        return res.status(400).json({ error: "AI translation is not configured in settings." });
      }

      const profiles = JSON.parse(settings.ai_profiles);
      const profile = profiles.find((p: any) => p.id === settings.module_outscraper_ai);

      if (!profile || !profile.apiKey) {
        return res.status(400).json({ error: "Selected AI profile is missing API Key." });
      }

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

      let translated = query;
      if (completion.choices && completion.choices[0] && completion.choices[0].message.content) {
        translated = completion.choices[0].message.content.trim().replace(/^"|"$/g, '');
      }

      res.json({ translated });
    } catch (e: any) {
      console.error("Translation error:", e.message);
      res.status(500).json({ error: "Failed to translate query" });
    }
  });

  // ====== EMAIL ACCOUNTS ======
  app.post("/api/db/email-accounts/test", authenticateToken, async (req: any, res) => {
    try {
      const { provider, credential_data } = req.body;
      
      if (provider === 'smtp') {
        const { host, port, user, pass } = credential_data;
        const transporter = nodemailer.createTransport({
          host,
          port: parseInt(port, 10),
          secure: parseInt(port, 10) === 465,
          auth: { user, pass }
        });
        await transporter.verify();
        return res.json({ success: true, message: "SMTP Connection successful." });
      } else if (provider === 'imap') {
        const { host, port, user, pass } = credential_data;
        const config = {
          imap: {
            user,
            password: pass,
            host,
            port: parseInt(port, 10),
            tls: parseInt(port, 10) === 993,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
            connTimeout: 10000
          }
        };
        const connection = await imaps.connect(config);
        connection.end();
        return res.json({ success: true, message: "IMAP Connection successful." });
      } else if (provider === 'resend') {
        const { api_key } = credential_data;
        const r = await axios.get('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${api_key}` }
        });
        if (r.status === 200) {
          return res.json({ success: true, message: "Resend API connection successful." });
        } else {
          return res.status(400).json({ error: "Resend API token 解析失败，请检查是否正确" });
        }
      } else if (provider === 'outscraper') {
        const { api_key } = credential_data;
        const r = await axios.get('https://api.app.outscraper.com/profile', {
          headers: { 'X-API-KEY': api_key }
        });
        if (r.status === 200) {
          return res.json({ success: true, message: "Outscraper API connection successful." });
        } else {
          return res.status(400).json({ error: "Outscraper API token 无效或被拒绝" });
        }
      }
      return res.status(400).json({ error: "Unknown provider or missing credentials" });
    } catch (e: any) {
      console.error("Test connection failed:", e);
      let errMsg = e.message || "Failed to connect";
      
      const errStr = String(errMsg).toLowerCase();
      if (errStr.includes('invalid login') || e.code === 'EAUTH') {
        errMsg = "用户名或密码错误，请检查您的凭证。";
      } else if (errStr.includes('enotfound')) {
        errMsg = "无法解析服务器地址，请检查主机名是否正确。";
      } else if (errStr.includes('etimedout') || errStr.includes('timeout')) {
        errMsg = "连接超时，请检查服务器地址和端口，或当前网络是否畅通。";
      } else if (errStr.includes('econnrefused')) {
        errMsg = "连接被拒绝，请检查端口号是否正确，以及服务器是否允许连接。";
      } else if (errStr.includes('self signed certificate')) {
        errMsg = "证书验证失败。如果使用的是自签名证书，请确认您的服务器配置。";
      } else if (e.response?.status === 401 || errStr.includes('unauthorized')) {
        errMsg = "身份验证失败，Token可能已过期或无效。";
      }
      
      return res.status(500).json({ error: errMsg });
    }
  });

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

  app.patch("/api/db/emails/:id/read", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool!.query(
        "UPDATE emails SET is_read = TRUE WHERE id = $1 AND account_id IN (SELECT id FROM email_accounts WHERE user_id = $2) RETURNING *",
        [id, req.user.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Email not found" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/emails/sync", authenticateToken, async (req: any, res) => {
    try {
      const { rows: accounts } = await pool!.query("SELECT * FROM email_accounts WHERE user_id = $1 AND provider = 'imap'", [req.user.id]);
      let syncedCount = 0;
      let debugInfo: any[] = [];

      for (const account of accounts) {
        let creds;
        try {
          creds = typeof account.credential_data === 'string' ? JSON.parse(account.credential_data) : account.credential_data;
        } catch (e) {
          continue;
        }
        
        const pass = creds.pass || creds.password;
        if (!creds.host || !creds.user || !pass) {
          debugInfo.push({ accountId: account.id, error: "Missing imap configuration fields" });
          continue;
        }
        
        const config = {
          imap: {
            user: creds.user,
            password: creds.pass || creds.password,
            host: creds.host,
            port: creds.port || 993,
            tls: creds.tls !== false,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
            connTimeout: 10000
          }
        };

        try {
          const connection = await imaps.connect(config);
          await connection.openBox('INBOX');

          // Get all message UIDs without bodies to avoid memory issues
          const allMessages = await connection.search(['ALL'], { bodies: ['HEADER.FIELDS (DATE)'], struct: false });
          // Get the last 100 messages
          const latestMessages = allMessages.slice(-100);
          const uids = latestMessages.map((m: any) => m.attributes.uid);
          
          let messages: any[] = [];
          if (uids.length > 0) {
            messages = await connection.search([['UID', ...uids]], {
              bodies: [''],
              struct: false,
              markSeen: false
            });
          }
          let skipped = 0;

          for (const item of messages) {
            // Find the part that has the body.
            // When requesting `bodies: ['']`, the part which is '' or '1'.
            let bodyPart = item.parts.find((part: any) => part.which === '');
            if (!bodyPart) bodyPart = item.parts.find((part: any) => part.body);
            
            if (!bodyPart || !bodyPart.body) {
              skipped++;
              continue;
            }
            const all = bodyPart;
            const id = item.attributes.uid;

            const parsed = await simpleParser(all.body);
            
            const subject = parsed.subject || '';
            const text = parsed.text || '';
            const html = parsed.html || '';
            const threadId = parsed.messageId || String(id);
            const fromAdd = (parsed.from?.value as any)?.[0]?.address || '';
            const toObj = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
            const toAdd = (toObj?.value as any)?.[0]?.address || '';
            
            const existing = await pool!.query("SELECT id, body_html FROM emails WHERE account_id = $1 AND thread_id = $2", [account.id, threadId]);
            if (existing.rows.length === 0) {
              await pool!.query(
                "INSERT INTO emails (account_id, direction, thread_id, from_address, to_address, subject, body_text, body_html, sent_at, created_at) VALUES ($1, 'inbound', $2, $3, $4, $5, $6, $7, $8, NOW())",
                [account.id, threadId, fromAdd, toAdd, subject, text, html, parsed.date || new Date()]
              );
              syncedCount++;
            } else if (!existing.rows[0].body_html && html) {
              await pool!.query(
                "UPDATE emails SET body_html = $1, body_text = $2 WHERE id = $3",
                [html, text, existing.rows[0].id]
              );
            }
          }
          connection.end();
          debugInfo.push({
            accountId: account.id,
            allMessagesCount: allMessages.length,
            requestedUidsLength: uids.length,
            messagesFetched: messages.length,
            skipped
          });
        } catch (err: any) {
          console.error("IMAP sync failed for account " + account.id, err);
          debugInfo.push({ accountId: account.id, error: err.message });
        }
      }

      res.json({ success: true, syncedCount, debugInfo });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/emails", authenticateToken, async (req: any, res) => {
    try {
      const { account_id, customer_id, direction, thread_id, to_address, subject, body_text } = req.body;
      const { rows: accountRows } = await pool!.query("SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2", [account_id, req.user.id]);
      if (accountRows.length === 0) return res.status(401).json({ error: "Unauthorized account" });
      const account = accountRows[0];
      
      if (direction === 'outbound') {
        let creds;
        try {
          creds = typeof account.credential_data === 'string' ? JSON.parse(account.credential_data) : account.credential_data;
        } catch (e) {
          return res.status(400).json({ error: "Invalid credential data for account" });
        }
        
        if (!creds.host || !creds.user || !(creds.pass || creds.password)) {
          return res.status(400).json({ error: "Account missing required credentials (host, user, pass)" });
        }

        const transporter = nodemailer.createTransport({
          host: creds.host,
          port: parseInt(creds.port, 10),
          secure: parseInt(creds.port, 10) === 465,
          auth: { user: creds.user, pass: creds.pass || creds.password }
        });

        await transporter.sendMail({
          from: `"${account.from_name}" <${account.from_email}>`,
          to: to_address,
          subject: subject,
          text: body_text
        });
      }

      const { rows } = await pool!.query(
        "INSERT INTO emails (account_id, customer_id, direction, thread_id, from_address, to_address, subject, body_text, sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *",
        [account_id, customer_id, direction, thread_id, account.from_email, to_address, subject, body_text]
      );
      
      res.json(rows[0]);
    } catch (e: any) {
      console.error("Failed to send email:", e);
      let errorMsg = e.message;
      if (errorMsg && errorMsg.includes('Invalid login')) {
        errorMsg = '发件账号登录失败，请检查账号密码或授权码是否正确。';
      } else if (errorMsg && errorMsg.includes('ETIMEDOUT')) {
        errorMsg = '连接邮箱服务器超时，请检查服务器地址和端口配置。';
      } else if (errorMsg && errorMsg.includes('ECONNREFUSED')) {
        errorMsg = '邮箱服务器拒绝连接，请检查SSL/端口配置。';
      }
      res.status(500).json({ error: errorMsg });
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

  // ====== API 404 and Error Handlers ======
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use((err: any, req: any, res: any, next: any) => {
    if (req.path.startsWith('/api/')) {
       console.error("Express API Error:", err);
       return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
    }
    next(err);
  });

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
