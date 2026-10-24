import Papa from "papaparse";
import { rows, run } from "./db";

export async function importContactCsv(csv:string){
  const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:true,transformHeader:header=>header.trim().toLowerCase()});
  if(parsed.errors.length||parsed.data.length>5000||!parsed.meta.fields?.includes("email")||!parsed.meta.fields.includes("kind"))throw new Error("Use a CSV with email and kind columns, up to 5000 rows");
  const incoming=new Map<string,(string|number)[]>();let invalid=0,duplicates=0;
  for(const item of parsed.data){
    const email=(item.email||"").trim().toLowerCase(),kind=(item.kind||"").trim().toLowerCase();
    if(email.length>255||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!["client","vendor","planner"].includes(kind)){invalid++;continue;}
    if(incoming.has(email)){duplicates++;continue;}
    incoming.set(email,[(item.name||email).trim().slice(0,200),email,(item.company||"").trim().slice(0,255),kind,(item.phone||"").trim().slice(0,50),(item.tags||"").trim().slice(0,2000),["yes","true","1"].includes((item.consent||"").trim().toLowerCase())?1:0]);
  }
  const emails=[...incoming.keys()],existing=new Set<string>();
  for(let offset=0;offset<emails.length;offset+=250){
    const batch=emails.slice(offset,offset+250);
    const found=await rows(`SELECT LOWER(TRIM(email)) email FROM contacts WHERE LOWER(TRIM(email)) IN (${batch.map(()=>"?").join(",")})`,batch);
    for(const contact of found)existing.add(String(contact.email));
  }
  const additions=[...incoming].filter(([email])=>!existing.has(email)).map(([,values])=>values);duplicates+=existing.size;
  let inserted=0;
  for(let offset=0;offset<additions.length;offset+=100){
    const batch=additions.slice(offset,offset+100);
    const result=await run(`INSERT IGNORE INTO contacts (name,email,company,kind,phone,tags,consent) VALUES ${batch.map(()=>"(?,?,?,?,?,?,?)").join(",")}`,batch.flat());
    inserted+=result.rowsAffected;
    duplicates+=batch.length-result.rowsAffected;
  }
  return {inserted,duplicates,invalid};
}
