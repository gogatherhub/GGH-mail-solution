import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { appendFile,writeFile } from "node:fs/promises";
const batches=new URL("../../.next/ui-test-batches.jsonl",import.meta.url);
await writeFile(batches,"");
const accepted=new Map();
createServer(async(request,response)=>{
  if(request.method==="GET"){response.writeHead(200,{"Content-Type":"application/json"});response.end('{"ok":true}');return;}
  const chunks=[];for await(const chunk of request)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8")),batch=request.url==="/emails/batch",items=batch?body:[body],key=request.headers["idempotency-key"];
  response.setHeader("Content-Type","application/json");
  if(accepted.has(key)){response.end(JSON.stringify(accepted.get(key)));return;}
  if(items.some(item=>item.subject==="UI Review Send Check")){response.writeHead(422);response.end(JSON.stringify({name:"validation_error",statusCode:422,message:"Isolated fixture rejected the email"}));return;}
  if(items.some(item=>item.subject.startsWith("Queued repeat")||item.subject.startsWith("Budget fixture concurrent")))await new Promise(resolve=>setTimeout(resolve,1800));
  const data=items.map(()=>({id:randomUUID()})),result=batch?{data}:data[0];accepted.set(key,result);
  if(batch)await appendFile(batches,JSON.stringify({count:items.length,subjects:items.map(item=>item.subject),key})+"\n");
  response.end(JSON.stringify(result));
}).listen(3102,"127.0.0.1",()=>console.log("Isolated Resend fixture ready; no external delivery."));
