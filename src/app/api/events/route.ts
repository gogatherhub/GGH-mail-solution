import { NextRequest, NextResponse } from "next/server";
import { validWebhookSecret,readLimitedJson } from "@/lib/webhook";
import { recordProviderEvent } from "@/lib/provider-events";

export async function POST(request:NextRequest){
  if(!validWebhookSecret(request.headers.get("x-welfog-secret"),process.env.EVENT_WEBHOOK_SECRET))return NextResponse.json({error:"Unauthorized"},{status:401});
  let body:Record<string,unknown>;try{body=await readLimitedJson(request,16*1024)}catch{return NextResponse.json({error:"Invalid or oversized payload"},{status:400})}
  const event=String(body.type||"").toLowerCase(),providerId=String(body.providerId||"");
  if(!["delivered","bounce","complaint"].includes(event)||!providerId)return NextResponse.json({error:"Invalid event"},{status:400});
  await recordProviderEvent(event as "delivered"|"bounce"|"complaint",providerId,String(body.eventId||`${providerId}:${event}`));
  return NextResponse.json({ok:true});
}
