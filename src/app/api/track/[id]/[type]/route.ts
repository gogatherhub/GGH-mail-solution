import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { rows, run } from "@/lib/db";
import { signature } from "@/lib/tracking";

const pixel=Buffer.from("R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=","base64");
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string;type:string}>}){
  const {id,type}=await params; const url=request.nextUrl.searchParams.get("url")||""; const target=type==="open"?"open":url; const sig=request.nextUrl.searchParams.get("sig")||"";
  if(/^m[1-9]\d*$/.test(id)){
    const messageId=Number(id.slice(1)),expected=signature(id,target);
    if(!Number.isSafeInteger(messageId)||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return new NextResponse("Invalid link",{status:403});
    const message=(await rows("SELECT id FROM messages WHERE id=? AND direction='outbound'",[messageId]))[0];
    if(!message)return new NextResponse("Not found",{status:404});
    if(type==="open"){
      await run("INSERT INTO email_events (message_id,type) VALUES (?,'open')",[messageId]);
      return new NextResponse(pixel,{headers:{"content-type":"image/gif","cache-control":"no-store"}});
    }
    if(type==="click"){
      let destination:URL;try{destination=new URL(url)}catch{return new NextResponse("Invalid URL",{status:400})}
      if(!["http:","https:"].includes(destination.protocol))return new NextResponse("Invalid URL",{status:400});
      await run("INSERT INTO email_events (message_id,type,url) VALUES (?,'click',?)",[messageId,url]);
      await run("INSERT INTO email_events (message_id,type) VALUES (?,'open')",[messageId]);
      return NextResponse.redirect(destination);
    }
    return new NextResponse("Not found",{status:404});
  }
  const rid=Number(id),expected=signature(rid,target);
  if(!Number.isSafeInteger(rid)||rid<1||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return new NextResponse("Invalid link",{status:403});
  const recipient=(await rows("SELECT id FROM campaign_recipients WHERE id=?",[rid]))[0]; if(!recipient)return new NextResponse("Not found",{status:404});
  if(type==="open"){
    await run("UPDATE campaign_recipients SET opened_at=COALESCE(opened_at,CURRENT_TIMESTAMP) WHERE id=?",[rid]); await run("INSERT INTO email_events (recipient_id,type) VALUES (?,'open')",[rid]);
    return new NextResponse(pixel,{headers:{"content-type":"image/gif","cache-control":"no-store"}});
  }
  if(type==="click"){
    let destination:URL;try{destination=new URL(url)}catch{return new NextResponse("Invalid URL",{status:400})}
    if(!["http:","https:"].includes(destination.protocol))return new NextResponse("Invalid URL",{status:400});
    await run("UPDATE campaign_recipients SET clicked_at=COALESCE(clicked_at,CURRENT_TIMESTAMP),opened_at=COALESCE(opened_at,CURRENT_TIMESTAMP) WHERE id=?",[rid]); await run("INSERT INTO email_events (recipient_id,type,url) VALUES (?,'click',?)",[rid,url]);
    return NextResponse.redirect(destination);
  }
  return new NextResponse("Not found",{status:404});
}
