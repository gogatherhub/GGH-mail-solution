import { createClient, type Client } from "@libsql/client";
import { hash } from "bcryptjs";

let ready: Promise<Client> | undefined;

async function initialize() {
  const client = createClient({ url: "file:./welfog-demo.db" });
  const schema = [
    "CREATE TABLE IF NOT EXISTS mailboxes (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,type TEXT DEFAULT 'General',quota_mb INTEGER DEFAULT 5120,catch_all INTEGER DEFAULT 0,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,name TEXT NOT NULL,email TEXT,phone TEXT,department TEXT,job_role TEXT DEFAULT 'Employee',role TEXT NOT NULL DEFAULT 'employee',assigned_mailbox_id INTEGER,session_version INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,company TEXT,kind TEXT NOT NULL DEFAULT 'client',phone TEXT,tags TEXT,consent INTEGER DEFAULT 0,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT,mailbox_id INTEGER,contact_id INTEGER,subject TEXT NOT NULL,unread INTEGER DEFAULT 0,last_message_at TEXT DEFAULT CURRENT_TIMESTAMP,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id INTEGER NOT NULL,direction TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT NOT NULL,cc TEXT,bcc TEXT,subject TEXT NOT NULL,body_html TEXT NOT NULL,provider_id TEXT,status TEXT DEFAULT 'queued',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,subject TEXT NOT NULL,body_html TEXT NOT NULL,segment TEXT NOT NULL,mailbox_id INTEGER,status TEXT DEFAULT 'draft',send_at TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS campaign_recipients (id INTEGER PRIMARY KEY AUTOINCREMENT,campaign_id INTEGER NOT NULL,contact_id INTEGER NOT NULL,provider_id TEXT,status TEXT DEFAULT 'queued',sent_at TEXT,delivered_at TEXT,opened_at TEXT,clicked_at TEXT,UNIQUE(campaign_id,contact_id))",
    "CREATE TABLE IF NOT EXISTS email_events (id INTEGER PRIMARY KEY AUTOINCREMENT,recipient_id INTEGER,message_id INTEGER,type TEXT NOT NULL,url TEXT,provider_event_id TEXT UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS suppressions (email TEXT NOT NULL PRIMARY KEY,reason TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  ];
  for (const sql of schema) await client.execute(sql);
  const existing = await client.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(existing.rows[0]?.n) === 0) {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD for demo mode");
    if (process.env.NODE_ENV === "production" && password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters in production");
    await client.execute({ sql: "INSERT INTO users (username,password_hash,name,email,role,job_role) VALUES (?,?,?,?,?,?)", args: [username, await hash(password, 12), "Administrator", "admin@example.com", "admin", "Administrator"] });
    await client.execute("INSERT INTO mailboxes (email,display_name,type) VALUES ('hello@example.com','General Inbox','General'),('events@example.com','Events Team','Events')");
    await client.execute("INSERT INTO contacts (name,email,company,kind,consent) VALUES ('Aarav Mehta','aarav@example.com','Northstar Co','client',0),('Priya Shah','priya@example.com','Bloom Vendors','vendor',0),('Rohan Kapoor','rohan@example.com','Event Studio','planner',0),('Neha Rao','neha@example.com','Bright Events','client',0),('Kabir Jain','kabir@example.com','Supply House','vendor',0)");
    await client.execute("INSERT INTO conversations (mailbox_id,contact_id,subject,unread) VALUES (1,1,'Upcoming event details',1),(2,2,'Vendor availability',0),(1,3,'Planning call follow-up',1)");
    await client.execute("INSERT INTO messages (conversation_id,direction,sender,recipient,subject,body_html,status) VALUES (1,'inbound','aarav@example.com','hello@example.com','Upcoming event details','<p>Could you share the event details?</p>','delivered'),(2,'outbound','events@example.com','priya@example.com','Vendor availability','<p>Thanks for confirming your availability.</p>','sent'),(3,'inbound','rohan@example.com','hello@example.com','Planning call follow-up','<p>Let us schedule the next call.</p>','delivered')");
    await client.execute("INSERT INTO campaigns (name,subject,body_html,segment,mailbox_id,status,created_by) VALUES ('Client welcome','Welcome to Welfog','<p>Hi {{name}}, welcome!</p>','client',1,'completed',1),('Vendor update','New opportunities','<p>Hi {{name}}, here is our update.</p>','vendor',2,'draft',1)");
    await client.execute("INSERT INTO campaign_recipients (campaign_id,contact_id,provider_id,status,sent_at,delivered_at,opened_at,clicked_at) VALUES (1,1,'demo-seed-1','delivered',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),(1,4,'demo-seed-2','delivered',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,NULL)");
    await client.execute("INSERT INTO email_events (recipient_id,type) VALUES (1,'sent'),(1,'delivered'),(1,'open'),(1,'click'),(2,'sent'),(2,'delivered')");
  }
  return client;
}

async function demoClient() {
  if (!ready) ready = initialize().catch(error => { ready = undefined; throw error; });
  return ready;
}

function sqliteSql(sql: string) {
  return sql.replace(/INSERT IGNORE/gi, "INSERT OR IGNORE").replace(/CURDATE\(\)/gi, "date('now')");
}

type Arg = string | number | null;
export async function demoRows(sql: string, args: Arg[] = []) {
  const result = await (await demoClient()).execute({ sql: sqliteSql(sql), args });
  return result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value]))) as Record<string, string | number | null>[];
}
export async function demoRun(sql: string, args: Arg[] = []) {
  const result = await (await demoClient()).execute({ sql: sqliteSql(sql), args });
  return { lastInsertRowid: Number(result.lastInsertRowid || 0), rowsAffected: result.rowsAffected };
}
