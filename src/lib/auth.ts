import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { cache } from "react";
import { redirect } from "next/navigation";
import { rows, run, type Row } from "./db";

const cookieName = "welfog_session";
function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("Set SESSION_SECRET to at least 32 characters");
  return process.env.SESSION_SECRET;
}
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }

export async function authenticate(username: string, password: string) {
  const user = (await rows("SELECT id,password_hash,session_version FROM users WHERE username = ?", [username]))[0];
  if (!user || !(await compare(password, String(user.password_hash)))) return false;
  const payload = `${user.id}.${user.session_version}.${Date.now() + 12 * 3600000}`;
  (await cookies()).set(cookieName, `${payload}.${sign(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  return true;
}

export const currentUser = cache(async (): Promise<Row | null> => {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const parts=token.split(".");if(parts.length!==4)return null;
  const [id, version, expires, signature] = parts;
  if (!/^\d+$/.test(id)||!/^\d+$/.test(version)||!/^\d+$/.test(expires)||!signature||Number(expires)<Date.now()) return null;
  const expected = sign(`${id}.${version}.${expires}`);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return (await rows("SELECT id,username,name,email,role,assigned_mailbox_id FROM users WHERE id = ? AND session_version = ?", [Number(id),Number(version)]))[0] || null;
});

export async function requireUser() { const user = await currentUser(); if (!user) redirect("/login"); return user; }
export async function requireAdmin() { const user = await requireUser(); if (user.role !== "admin") redirect("/dashboard"); return user; }
export async function logout() { const user=await currentUser();if(user)await run("UPDATE users SET session_version=session_version+1 WHERE id=?",[Number(user.id)]);(await cookies()).delete(cookieName); }
