import { NextRequest, NextResponse } from "next/server";
import { dispatchCampaignBatch, sendingConfigError } from "@/lib/campaign-dispatch";

export async function GET(request:NextRequest){
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  const error=sendingConfigError();if(error)return NextResponse.json({error},{status:503});
  return NextResponse.json(await dispatchCampaignBatch());
}
