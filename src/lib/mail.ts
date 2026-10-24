import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { signature } from "./tracking";
import { Resend } from "resend";
import { appOrigin } from "./app-url";

export async function sendMail(input: { from: string; to: string; subject: string; html: string; cc?: string; bcc?: string; campaignId?: number; recipientId?: number; idempotencyKey?: string; attachments?: { filename: string; content: Buffer; contentType: string }[] }) {
  const unsubscribe = input.recipientId ? `${appOrigin()}/unsubscribe/${input.recipientId}?sig=${signature(input.recipientId,"unsubscribe")}` : undefined;
  if(process.env.RESEND_API_KEY){
    const resend=new Resend(process.env.RESEND_API_KEY);
    const {data,error}=await resend.emails.send({from:input.from,to:input.to,cc:input.cc?input.cc.split(",").map(x=>x.trim()).filter(Boolean):undefined,bcc:input.bcc?input.bcc.split(",").map(x=>x.trim()).filter(Boolean):undefined,subject:input.subject,html:input.html,attachments:input.attachments?.map(a=>({filename:a.filename,content:a.content,contentType:a.contentType})),headers:unsubscribe?{"List-Unsubscribe":`<${unsubscribe}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}:undefined,tags:input.campaignId&&input.recipientId?[{name:"campaign_id",value:String(input.campaignId)},{name:"recipient_id",value:String(input.recipientId)}]:undefined},input.recipientId?{idempotencyKey:`campaign-recipient-${input.recipientId}`}:input.idempotencyKey?{idempotencyKey:input.idempotencyKey}:{});
    if(error||!data?.id)throw new Error(error?.message||"Resend did not return an email ID");
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
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT || 587) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
    const result = await transport.sendMail({ from: input.from, to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, html: input.html, attachments: input.attachments, headers: unsubscribe ? { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined });
    return result.messageId as string;
  }
  throw new Error("Set RESEND_API_KEY before sending email");
}
