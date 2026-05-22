require('dotenv').config();
const { Pool } = require('pg');
const imaps = require('imap-simple');

(async () => {
    const pool = new Pool({connectionString: process.env.DATABASE_URL, ssl: false});
    const { rows: accounts } = await pool.query("SELECT * FROM email_accounts WHERE provider = 'imap'");
    console.log(`Found ${accounts.length} imap accounts.`);
    
    for (const account of accounts) {
        console.log(`Checking account: ${account.id} ${account.from_email}`);
        let creds;
        try {
          creds = typeof account.credential_data === 'string' ? JSON.parse(account.credential_data) : account.credential_data;
        } catch (e) {
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

          const allMessages = await connection.search(['ALL'], { bodies: ['HEADER.FIELDS (DATE)'], struct: false });

          const latestMessages = allMessages.slice(-10);
          console.log(`Latest 10 messages count: ${latestMessages.length}`);
          const uids = latestMessages.map(m => m.attributes.uid);
          
          let messages = [];
          if (uids.length > 0) {
            messages = await connection.search([['UID', uids.join(',')]], {
              bodies: [''],
              struct: false,
              markSeen: false
            });
            console.log(`Fetched bodies for ${messages.length} messages.`);
            for (const item of messages) {
               console.log("part which are '':", item.parts.filter(p => p.which === '').length)
            }
          }
          connection.end();
        } catch(err) {
            console.error(err);
        }
    }
    process.exit(0);
})();
