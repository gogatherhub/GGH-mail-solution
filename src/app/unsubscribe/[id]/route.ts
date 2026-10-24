import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { rows, run, isDemo } from "@/lib/db";
import { signature } from "@/lib/tracking";

async function unsubscribe(request:NextRequest,params:Promise<{id:string}>,showPage:boolean){
  const id=Number((await params).id),sig=request.nextUrl.searchParams.get("sig")||"",expected=signature(id,"unsubscribe");
  if(!Number.isSafeInteger(id)||id<1||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return new NextResponse("Invalid unsubscribe link",{status:403});
  if(showPage)return new NextResponse("<html><body style='font:16px sans-serif;max-width:520px;margin:80px auto'><h1>Unsubscribe</h1><p>To stop campaign emails, confirm below.</p><form method='post'><button style='padding:12px 20px'>Unsubscribe</button></form></body></html>",{headers:{"content-type":"text/html; charset=utf-8"}});
  const contact=(await rows("SELECT c.email FROM campaign_recipients cr JOIN contacts c ON c.id=cr.contact_id WHERE cr.id=?",[id]))[0];
  if(contact){await run(isDemo?"INSERT INTO suppressions (email,reason) VALUES (?,'unsubscribe') ON CONFLICT(email) DO UPDATE SET reason='unsubscribe'":"INSERT INTO suppressions (email,reason) VALUES (?,'unsubscribe') ON DUPLICATE KEY UPDATE reason='unsubscribe'",[String(contact.email)]);await run("UPDATE contacts SET consent=0 WHERE email=?",[String(contact.email)]);await run("INSERT INTO email_events (recipient_id,type) VALUES (?,'unsubscribe')",[id]);}
  return new NextResponse("<html><body style='font:16px sans-serif;max-width:520px;margin:80px auto'><h1>You're unsubscribed</h1><p>You won't receive future campaign emails from us.</p></body></html>",{headers:{"content-type":"text/html; charset=utf-8"}});
}
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){return unsubscribe(request,params,true)}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){return unsubscribe(request,params,false)}
