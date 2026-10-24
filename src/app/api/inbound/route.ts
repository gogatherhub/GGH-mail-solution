import { NextRequest, NextResponse } from "next/server";
import { validWebhookSecret,readLimitedJson } from "@/lib/webhook";
import { recordInboundMessage } from "@/lib/inbound";

export async function POST(request:NextRequest){
  if(!validWebhookSecret(request.headers.get("x-welfog-secret"),process.env.INBOUND_WEBHOOK_SECRET))return NextResponse.json({error:"Unauthorized"},{status:401});
  let body:Record<string,unknown>;try{body=await readLimitedJson(request,1024*1024)}catch{return NextResponse.json({error:"Invalid or oversized payload"},{status:400})}
  try{const conversationId=await recordInboundMessage({from:String(body.from||""),to:String(body.to||""),subject:String(body.subject||""),html:String(body.html||""),text:String(body.text||""),name:String(body.name||""),messageId:String(body.messageId||"")});return NextResponse.json({ok:true,conversationId})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid message"},{status:400})}
}
