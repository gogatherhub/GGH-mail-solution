import { SMTPServer } from "smtp-server";
import { writeFile, appendFile } from "node:fs/promises";

const mailbox=new URL("../../.next/ui-test-mailbox.jsonl",import.meta.url);
await writeFile(mailbox,"");
const server=new SMTPServer({
  authOptional:true,
  disabledCommands:["STARTTLS"],
  onAuth(auth,session,callback){callback(null,{user:"ui-test"});},
  onData(stream,session,callback){
    const chunks=[];
    stream.on("data",chunk=>chunks.push(chunk));
    stream.on("end",async()=>{
      const raw=Buffer.concat(chunks).toString("utf8");
      if(/Subject: UI Review Send Check/i.test(raw)){const error=new Error("UI fixture rejected this email");error.responseCode=550;callback(error);return;}
      if(/Subject: Queued repeat/i.test(raw))await new Promise(resolve=>setTimeout(resolve,1800));
      try{await appendFile(mailbox,JSON.stringify({to:session.envelope.rcptTo.map(item=>item.address),raw})+"\n");callback();}
      catch(error){callback(error);}
    });
  },
});
server.on("error",error=>{console.error(error.message);});
server.listen(3101,"127.0.0.1",()=>{console.log("Isolated SMTP fixture ready on 3101; no messages leave this machine.");});
