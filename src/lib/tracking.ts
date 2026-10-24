import { createHmac } from "node:crypto";
import sanitizeHtml from "sanitize-html";

function key() { if (!process.env.TRACKING_SECRET || process.env.TRACKING_SECRET.length < 32) throw new Error("TRACKING_SECRET missing or too short"); return process.env.TRACKING_SECRET; }
export function signature(recipientId: number|string, url: string) { return createHmac("sha256", key()).update(`${recipientId}:${url}`).digest("hex"); }
function trackingOrigin() {
  const origin=process.env.APP_URL;
  if(!origin) throw new Error("APP_URL missing");
  const publicUrl=new URL(origin);
  if(publicUrl.protocol!=="https:"||["localhost","127.0.0.1"].includes(publicUrl.hostname))throw new Error("Set APP_URL to a public HTTPS address before sending tracked campaigns");
  return origin;
}
function rewriteTrackedHtml(html:string,id:string|number) {
  const origin=trackingOrigin();
  const safe=sanitizeHtml(html,{allowedTags:sanitizeHtml.defaults.allowedTags.concat(["img"]),allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,a:["href","target","rel"],img:["src","alt"]},allowedSchemes:["http","https","mailto"]});
  const rewritten=safe.replace(/href="(https?:[^\"]+)"/gi,(_match,escaped:string)=>{
    const url=escaped.replace(/&amp;/g,"&");
    return `href="${origin}/api/track/${id}/click?url=${encodeURIComponent(url)}&sig=${signature(id,url)}"`;
  });
  const openUrl=`${origin}/api/track/${id}/open?sig=${signature(id,"open")}`;
  return {rewritten,openUrl,origin};
}
export function trackedHtml(html: string, recipientId: number) {
  const {rewritten,openUrl,origin}=rewriteTrackedHtml(html,recipientId);
  const unsubscribeUrl=`${origin}/unsubscribe/${recipientId}?sig=${signature(recipientId,"unsubscribe")}`;
  return `${rewritten}<p style="font-size:12px;color:#64748b;margin-top:32px">No longer want these updates? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p><img src="${openUrl}" width="1" height="1" alt="" style="display:none"/>`;
}
export function trackedDirectHtml(html:string,messageId:number) {
  const {rewritten,openUrl}=rewriteTrackedHtml(html,`m${messageId}`);
  return `${rewritten}<img src="${openUrl}" width="1" height="1" alt="" style="display:none"/>`;
}
