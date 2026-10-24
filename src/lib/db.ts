import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { hash } from "bcryptjs";
import { demoRows, demoRun } from "./demo-db";
import { mysqlConfigFromUrl } from "./mysql-config";

let pool: Pool | undefined;
let ready: Promise<Pool> | undefined;

export type Row = Record<string, string | number | null>;
export type DbResult = { lastInsertRowid: number; rowsAffected: number };
export const isDemo = process.env.DEMO_MODE === "true";

async function initialize() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to a MySQL connection URL");
  pool = mysql.createPool(mysqlConfigFromUrl(process.env.DATABASE_URL));
  const statements = [
    `CREATE TABLE IF NOT EXISTS mailboxes (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, display_name VARCHAR(255) NOT NULL, type VARCHAR(40) DEFAULT 'General', quota_mb INT DEFAULT 5120, catch_all TINYINT(1) DEFAULT 0, status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS users (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(50), department VARCHAR(120), job_role VARCHAR(100) DEFAULT 'Employee', role VARCHAR(20) NOT NULL DEFAULT 'employee', assigned_mailbox_id BIGINT UNSIGNED, session_version INT NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS contacts (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, company VARCHAR(255), kind VARCHAR(20) NOT NULL DEFAULT 'client', phone VARCHAR(50), tags TEXT, consent TINYINT(1) DEFAULT 0, status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_contacts_kind (kind)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS conversations (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, mailbox_id BIGINT UNSIGNED, contact_id BIGINT UNSIGNED, subject VARCHAR(500) NOT NULL, unread TINYINT(1) DEFAULT 0, last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_conversations_mailbox (mailbox_id), KEY idx_conversations_contact (contact_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS messages (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, conversation_id BIGINT UNSIGNED NOT NULL, direction VARCHAR(20) NOT NULL, sender VARCHAR(255) NOT NULL, recipient VARCHAR(255) NOT NULL, cc TEXT, bcc TEXT, subject VARCHAR(500) NOT NULL, body_html MEDIUMTEXT NOT NULL, provider_id VARCHAR(255), status VARCHAR(30) DEFAULT 'queued', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_messages_conversation (conversation_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS campaigns (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, subject VARCHAR(500) NOT NULL, body_html MEDIUMTEXT NOT NULL, segment VARCHAR(20) NOT NULL, mailbox_id BIGINT UNSIGNED, status VARCHAR(20) DEFAULT 'draft', send_at TIMESTAMP NULL, created_by BIGINT UNSIGNED, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS campaign_recipients (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, campaign_id BIGINT UNSIGNED NOT NULL, contact_id BIGINT UNSIGNED NOT NULL, provider_id VARCHAR(255), status VARCHAR(30) DEFAULT 'queued', sent_at TIMESTAMP NULL, delivered_at TIMESTAMP NULL, opened_at TIMESTAMP NULL, clicked_at TIMESTAMP NULL, UNIQUE KEY uq_campaign_contact (campaign_id,contact_id), KEY idx_recipients_contact (contact_id), KEY idx_recipients_provider (provider_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS email_events (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, recipient_id BIGINT UNSIGNED, message_id BIGINT UNSIGNED, type VARCHAR(30) NOT NULL, url TEXT, provider_event_id VARCHAR(255) UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_events_recipient (recipient_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS suppressions (email VARCHAR(255) NOT NULL PRIMARY KEY, reason VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS send_attempts (idempotency_key CHAR(36) NOT NULL PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, conversation_id BIGINT UNSIGNED, message_id BIGINT UNSIGNED, status VARCHAR(20) NOT NULL DEFAULT 'processing', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
  // Existing deployments only need a cheap metadata check on a cold start.
  // Keep CREATE TABLE for fresh or partially initialized databases.
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('mailboxes','users','contacts','conversations','messages','campaigns','campaign_recipients','email_events','suppressions','send_attempts')"
  );
  if (Number(existing[0].count) !== statements.length) {
    for (const sql of statements) await pool.query(sql);
  }
  const admin=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD;
  if(admin&&password){
    if(process.env.NODE_ENV==="production"&&password.length<8)throw new Error("ADMIN_PASSWORD must be at least 8 characters in production");
    const [found]=await pool.execute<RowDataPacket[]>("SELECT id FROM users WHERE username=?",[admin]);
    if(!found.length)await pool.execute("INSERT INTO users (username,password_hash,name,role,job_role) VALUES (?,?,?,?,?)",[admin,await hash(password,12),"Administrator","admin","Administrator"])
  }
  return pool;
}

export async function db(){if(!ready)ready=initialize().catch(error=>{ready=undefined;pool?.end().catch(()=>{});pool=undefined;throw error});return ready}
export async function rows(sql:string,args:(string|number|null)[]=[]):Promise<Row[]>{if(isDemo)return demoRows(sql,args);const [result]=await (await db()).execute<RowDataPacket[]>(sql,args);return result as Row[]}
export async function run(sql:string,args:(string|number|null)[]=[]):Promise<DbResult>{if(isDemo)return demoRun(sql,args);const [result]=await (await db()).execute<ResultSetHeader>(sql,args);return {lastInsertRowid:result.insertId,rowsAffected:result.affectedRows}}
