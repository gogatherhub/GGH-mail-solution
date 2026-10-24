import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { validWebhookSecret } from "@/lib/webhook";
import { dispatchOutbox } from "@/lib/outbox";
import { privateJson } from "@/lib/http-security";

export const maxDuration=60;
export async function GET(request:NextRequest){
  if(!validWebhookSecret(request.headers.get("authorization"),process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))return privateJson({error:"Unauthorized"},401);
  const result=await dispatchOutbox();
  for(const path of ["/outbox","/conversations","/dashboard","/analytics"])revalidatePath(path);
  return privateJson(result);
}
