import type { PoolOptions } from "mysql2";

export function mysqlConfigFromUrl(rawUrl: string): PoolOptions {
  let url: URL;
  try { url = new URL(rawUrl); }
  catch { throw new Error("DATABASE_URL is not a valid MySQL URL"); }
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must start with mysql://");
  if (!url.hostname || !url.username || !url.password || !url.pathname.slice(1)) {
    throw new Error("DATABASE_URL needs a host, username, password and database name");
  }
  if (/CLICK_TO_REVEAL|REPLACE_WITH|YOUR_PASSWORD/i.test(url.password)) {
    throw new Error("DATABASE_URL still contains a password placeholder");
  }
  const sslMode = (url.searchParams.get("ssl-mode") || url.searchParams.get("sslmode") || "").toUpperCase();
  if (sslMode && !["DISABLED", "REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY"].includes(sslMode)) {
    throw new Error("DATABASE_URL has an unsupported ssl-mode");
  }
  const ca = process.env.MYSQL_CA_CERT?.replace(/\\n/g, "\n");
  if (["VERIFY_CA", "VERIFY_IDENTITY"].includes(sslMode) && !ca) {
    throw new Error("Set MYSQL_CA_CERT for verified MySQL TLS");
  }
  const ssl = sslMode !== "DISABLED" && (sslMode || ca)
    ? ca ? { ca, rejectUnauthorized: true, verifyIdentity: sslMode === "VERIFY_IDENTITY" }
      : { rejectUnauthorized: false }
    : undefined;
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl,
    // Vercel creates a pool per warm function instance. Keep each instance small
    // and release idle sockets so a burst of navigation cannot exhaust Aiven.
    connectionLimit: 2,
    maxIdle: 1,
    idleTimeout: 5000,
    waitForConnections: true,
    decimalNumbers: true,
  };
}
