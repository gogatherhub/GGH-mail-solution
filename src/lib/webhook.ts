import { timingSafeEqual } from "node:crypto";

export function validWebhookSecret(provided:string|null,expected:string|undefined){
  if(!provided||!expected)return false;
  const a=Buffer.from(provided),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}

export async function readLimitedJson(request:Request,maxBytes:number){
  const declared=Number(request.headers.get("content-length")||0);
  if(declared>maxBytes)throw new Error("Payload too large");
  const reader=request.body?.getReader();if(!reader)throw new Error("Empty payload");
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error("Payload too large")}chunks.push(value)}
  const json=JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  if(!json||typeof json!=="object"||Array.isArray(json))throw new Error("Invalid payload");
  return json as Record<string,unknown>;
}
