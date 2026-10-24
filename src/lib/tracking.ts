import { createHmac } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { appOrigin } from "./app-url";

function key() { if (!process.env.TRACKING_SECRET || process.env.TRACKING_SECRET.length < 32) throw new Error("TRACKING_SECRET missing or too short"); return process.env.TRACKING_SECRET; }
export function signature(recipientId: number|string, url: string) { return createHmac("sha256", key()).update(`${recipientId}:${url}`).digest("hex"); }
function linkifyPlainUrls(html:string){
  let insideAnchor=false;
  return html.split(/(<[^>]+>)/g).map(part=>{
    if(part.startsWith("<")){
      if(/^<a\b/i.test(part))insideAnchor=true;
      if(/^<\/a\b/i.test(part))insideAnchor=false;
      return part;
    }
    if(insideAnchor)return part;
    return part.replace(/https?:\/\/[^\s<]+/gi,match=>{
      const urlText=match.replace(/[.,!?;:)]+$/g,"");
      const punctuation=match.slice(urlText.length);
      try{
        const url=new URL(urlText.replace(/&amp;/g,"&"));
        if(!["http:","https:"].includes(url.protocol))return match;
        const href=url.toString().replace(/&/g,"&amp;").replace(/"/g,"&quot;");
        return `<a href="${href}">${urlText}</a>${punctuation}`;
      }catch{return match}
    });
  }).join("");
}
function rewriteTrackedHtml(html:string,id:string|number) {
  const origin=appOrigin();
  const safe=sanitizeHtml(html,{allowedTags:sanitizeHtml.defaults.allowedTags.concat(["img"]),allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,a:["href","target","rel"],img:["src","alt"]},allowedSchemes:["http","https","mailto"]});
  const rewritten=linkifyPlainUrls(safe).replace(/href="(https?:[^\"]+)"/gi,(_match,escaped:string)=>{
    const url=escaped.replace(/&amp;/g,"&");
    return `href="${origin}/api/track/${id}/click?url=${encodeURIComponent(url)}&sig=${signature(id,url)}"`;
  });
  const openUrl=`${origin}/api/track/${id}/open?sig=${signature(id,"open")}`;
  return {rewritten,openUrl,origin};
}
export function trackedHtml(html: string, recipientId: number) {
  const {rewritten,openUrl,origin}=rewriteTrackedHtml(html,recipientId);
  const unsubscribeUrl=`${origin}/unsubscribe/${recipientId}?sig=${signature(recipientId,"unsubscribe")}`;
  return `${rewritten}<p style="font-size:12px;color:#64748b;margin-top:32px">No longer want these updates? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p><img src="${openUrl}" width="1" height="1" alt="" style="border:0;width:1px;height:1px"/>`;
}
export function trackedDirectHtml(html:string,messageId:number) {
  const {rewritten,openUrl}=rewriteTrackedHtml(html,`m${messageId}`);
  return `${rewritten}<img src="${openUrl}" width="1" height="1" alt="" style="border:0;width:1px;height:1px"/>`;
}
