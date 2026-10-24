import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { cache } from "react";
import { redirect } from "next/navigation";
import { rows, run, isDemo, type Row } from "./db";

const cookieName = "welfog_session";
function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("Set SESSION_SECRET to at least 32 characters");
  return process.env.SESSION_SECRET;
}
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }

export async function authenticate(username: string, password: string) {
  if (!username || username.length>100 || !password || password.length>1024) return false;
  const throttle = createHash("sha256").update(username.toLowerCase()).digest("hex"), now=Date.now(), cutoff=now-15*60_000;
  await run(isDemo
    ? "INSERT INTO auth_throttles (key_hash,attempts,window_started) VALUES (?,1,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_throttles.window_started<? THEN 1 ELSE auth_throttles.attempts+1 END,window_started=CASE WHEN auth_throttles.window_started<? THEN excluded.window_started ELSE auth_throttles.window_started END"
    : "INSERT INTO auth_throttles (key_hash,attempts,window_started) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=CASE WHEN window_started<? THEN 1 ELSE attempts+1 END,window_started=CASE WHEN window_started<? THEN VALUES(window_started) ELSE window_started END",[throttle,now,cutoff,cutoff]);
  const [attempts]=await rows("SELECT attempts FROM auth_throttles WHERE key_hash=?",[throttle]);
  if(Number(attempts?.attempts||0)>12)return false;
  const user = (await rows("SELECT id,password_hash,session_version FROM users WHERE username = ?", [username]))[0];
  const matches=await compare(password,user?String(user.password_hash):"$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttx2R/vQaMThqo1hH5O98PB./8.W");
  if (!user || !matches) return false;
  await run("DELETE FROM auth_throttles WHERE key_hash=?",[throttle]);
  const payload = `${user.id}.${user.session_version}.${Date.now() + 12 * 3600000}`;
  (await cookies()).set(cookieName, `${payload}.${sign(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  return true;
}

export const currentUser = cache(async (): Promise<Row | null> => {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const parts=token.split(".");if(parts.length!==4)return null;
  const [id, version, expires, signature] = parts;
  if (!/^\d+$/.test(id)||!/^\d+$/.test(version)||!/^\d+$/.test(expires)||!/^([0-9a-f]{64})$/.test(signature)||Number(expires)<Date.now()) return null;
  const expected = sign(`${id}.${version}.${expires}`);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return (await rows("SELECT u.id,u.username,u.name,u.email,u.role,u.assigned_mailbox_id,a.updated_at avatar_updated FROM users u LEFT JOIN user_avatars a ON a.user_id=u.id WHERE u.id=? AND u.session_version=?", [Number(id),Number(version)]))[0] || null;
});

export async function requireUser() { const user = await currentUser(); if (!user) redirect("/login"); return user; }
export async function requireAdmin() { const user = await requireUser(); if (user.role !== "admin") redirect("/dashboard"); return user; }
export async function logout() { const user=await currentUser();if(user)await run("UPDATE users SET session_version=session_version+1 WHERE id=?",[Number(user.id)]);(await cookies()).delete(cookieName); }
