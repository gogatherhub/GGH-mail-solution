import { NextRequest, NextResponse } from "next/server";
import { dispatchCampaignBatch, sendingConfigError } from "@/lib/campaign-dispatch";
import { dispatchOutbox } from "@/lib/outbox";
import { validWebhookSecret } from "@/lib/webhook";
import { revalidatePath } from "next/cache";

export const maxDuration = 60;

export async function GET(request:NextRequest){
  if(!validWebhookSecret(request.headers.get("authorization"),process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))return NextResponse.json({error:"Unauthorized"},{status:401});
  const outbox=await dispatchOutbox();
  revalidatePath("/outbox");revalidatePath("/conversations");revalidatePath("/analytics");revalidatePath("/dashboard");
  const error=sendingConfigError();if(error)return NextResponse.json({error},{status:503});
  return NextResponse.json({...await dispatchCampaignBatch(),outbox});
}
