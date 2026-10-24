import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { recordProviderEvent } from "@/lib/provider-events";
import { recordInboundMessage } from "@/lib/inbound";
import { revalidatePath } from "next/cache";

export async function POST(request:NextRequest){
  const secret=process.env.RESEND_WEBHOOK_SECRET;
  if(!secret)return NextResponse.json({error:"Webhook not configured"},{status:503});
  const size=Number(request.headers.get("content-length")||0);if(size>64*1024)return NextResponse.json({error:"Payload too large"},{status:413});
  const payload=await request.text();if(payload.length>64*1024)return NextResponse.json({error:"Payload too large"},{status:413});
  let event:ReturnType<Resend["webhooks"]["verify"]>;
  try{
    const resend=new Resend(process.env.RESEND_API_KEY||"re_webhook_verification_only");
    event=resend.webhooks.verify({payload,headers:{id:request.headers.get("svix-id")||"",timestamp:request.headers.get("svix-timestamp")||"",signature:request.headers.get("svix-signature")||""},webhookSecret:secret});
  }catch{return NextResponse.json({error:"Invalid signature"},{status:401})}
  const mapping:{[key:string]:"delivered"|"bounce"|"complaint"|"open"|"click"}={"email.delivered":"delivered","email.bounced":"bounce","email.complained":"complaint","email.opened":"open","email.clicked":"click"};
  const type=mapping[event.type];
  if(type&&"email_id" in event.data){const recorded=await recordProviderEvent(type,String(event.data.email_id),request.headers.get("svix-id")||`${event.data.email_id}:${type}`);if(!recorded)return NextResponse.json({error:"Email is not stored yet; retry event"},{status:503})}
  if(event.type==="email.received"){
    if(!process.env.RESEND_API_KEY)return NextResponse.json({error:"Receiving API key is not configured"},{status:503});
    const resend=new Resend(process.env.RESEND_API_KEY);
    const {data,error}=await resend.emails.receiving.get(event.data.email_id);
    if(error||!data)return NextResponse.json({error:"Could not retrieve received email"},{status:502});
    try{const conversationId=await recordInboundMessage({from:data.from,to:data.received_for[0]||data.to[0]||"",recipients:[...data.received_for,...data.to],subject:data.subject,html:data.html,text:data.text,messageId:data.id});revalidatePath("/conversations");revalidatePath("/dashboard");revalidatePath(`/conversations/${conversationId}`)}
    catch(error){if(error instanceof Error&&error.message==="Mailbox not found")return NextResponse.json({ok:true,ignored:"unknown mailbox"});throw error}
  }
  return NextResponse.json({ok:true});
}
