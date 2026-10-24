import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { signature } from "./tracking";
import { Resend } from "resend";
import { appOrigin } from "./app-url";

export class MailRejectedError extends Error {}

export function mailWasRejected(error:unknown){
  const code=Number((error as {responseCode?:number}|null)?.responseCode);
  return error instanceof MailRejectedError||(code>=400&&code<=599)||["MessageRejected","BadRequestException","MailFromDomainNotVerifiedException","AccountSuspendedException"].includes(error instanceof Error?error.name:"");
}

export async function sendCampaignMailBatch(items:{sender:string;to:string;subject:string;html:string;campaignId:number;recipientId:number}[],key:string){
  if(!process.env.RESEND_API_KEY)throw new Error("Batch sending requires Resend");
  const resend=new Resend(process.env.RESEND_API_KEY);
  const {data,error}=await resend.batch.send(items.map(item=>({from:item.sender,to:item.to,subject:item.subject,html:item.html,headers:{"List-Unsubscribe":`<${appOrigin()}/unsubscribe/${item.recipientId}?sig=${signature(item.recipientId,"unsubscribe")}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"},tags:[{name:"campaign_id",value:String(item.campaignId)},{name:"recipient_id",value:String(item.recipientId)}]})),{idempotencyKey:key});
  if(error){if([400,401,403,404,422,429].includes(Number((error as {statusCode?:number}).statusCode)))throw new MailRejectedError("Resend rejected the batch");throw new Error("Batch acceptance was not confirmed");}
  if(!data||data.data.length!==items.length||data.data.some(item=>!item.id))throw new Error("Batch acceptance was not confirmed");
  return data.data.map(item=>item.id);
}

export async function sendMail(input: { from: string; to: string; subject: string; html: string; cc?: string; bcc?: string; campaignId?: number; recipientId?: number; idempotencyKey?: string; attachments?: { filename: string; content: Buffer; contentType: string }[] }) {
  const unsubscribe = input.recipientId ? `${appOrigin()}/unsubscribe/${input.recipientId}?sig=${signature(input.recipientId,"unsubscribe")}` : undefined;
  if(process.env.RESEND_API_KEY){
    const resend=new Resend(process.env.RESEND_API_KEY);
    const {data,error}=await resend.emails.send({from:input.from,to:input.to,cc:input.cc?input.cc.split(",").map(x=>x.trim()).filter(Boolean):undefined,bcc:input.bcc?input.bcc.split(",").map(x=>x.trim()).filter(Boolean):undefined,subject:input.subject,html:input.html,attachments:input.attachments?.map(a=>({filename:a.filename,content:a.content,contentType:a.contentType})),headers:unsubscribe?{"List-Unsubscribe":`<${unsubscribe}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}:undefined,tags:input.campaignId&&input.recipientId?[{name:"campaign_id",value:String(input.campaignId)},{name:"recipient_id",value:String(input.recipientId)}]:undefined},input.recipientId?{idempotencyKey:`campaign-recipient-${input.recipientId}`}:input.idempotencyKey?{idempotencyKey:input.idempotencyKey}:{});
    if(error){
      const status=Number((error as {statusCode?:number}).statusCode);
      if([400,401,403,404,422,429].includes(status))throw new MailRejectedError("Provider rejected this email");
      throw new Error("Provider did not confirm email acceptance");
    }
    if(!data?.id)throw new Error("Resend did not return an email ID");
    return data.id;
  }
  if (process.env.AWS_REGION) {
    const client = new SESv2Client({ region: process.env.AWS_REGION });
    const result = await client.send(new SendEmailCommand({
      FromEmailAddress: input.from,
      Destination: { ToAddresses: [input.to], CcAddresses: input.cc ? input.cc.split(",").map(x => x.trim()).filter(Boolean) : [], BccAddresses: input.bcc ? input.bcc.split(",").map(x => x.trim()).filter(Boolean) : [] },
      Content: { Simple: { Subject: { Data: input.subject }, Body: { Html: { Data: input.html } }, Headers: unsubscribe ? [{ Name: "List-Unsubscribe", Value: `<${unsubscribe}>` }, { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }] : undefined, Attachments: input.attachments?.map(a=>({ FileName:a.filename, RawContent:a.content, ContentType:a.contentType })) } },
      ConfigurationSetName: input.campaignId ? process.env.SES_CONFIGURATION_SET : undefined,
      EmailTags: input.campaignId && input.recipientId ? [{ Name: "campaign_id", Value: String(input.campaignId) }, { Name: "recipient_id", Value: String(input.recipientId) }] : undefined,
    }));
    return result.MessageId || "";
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT || 587) === 465, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
    const result = await transport.sendMail({ from: input.from, to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, html: input.html, attachments: input.attachments, headers: unsubscribe ? { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined });
    return result.messageId as string;
  }
  throw new Error("Set RESEND_API_KEY before sending email");
}
