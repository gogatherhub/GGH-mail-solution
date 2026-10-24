import { expect,test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { login,testDb } from "./helpers";

test.afterEach(async()=>{
  const db=testDb();
  try{
    const campaigns=(await db.execute("SELECT id FROM campaigns WHERE name LIKE 'Budget fixture%'")).rows;
    for(const campaign of campaigns){const recipients=(await db.execute({sql:"SELECT id FROM campaign_recipients WHERE campaign_id=?",args:[Number(campaign.id)]})).rows;for(const recipient of recipients){await db.execute({sql:"DELETE FROM email_send_reservations WHERE send_key=?",args:[`campaign:${recipient.id}`]});await db.execute({sql:"DELETE FROM email_events WHERE recipient_id=?",args:[Number(recipient.id)]});}await db.execute({sql:"DELETE FROM campaign_recipients WHERE campaign_id=?",args:[Number(campaign.id)]});await db.execute({sql:"DELETE FROM campaigns WHERE id=?",args:[Number(campaign.id)]});}
    const messages=(await db.execute("SELECT id,conversation_id FROM messages WHERE subject LIKE 'Budget fixture%'")).rows;
    for(const message of messages){const id=Number(message.id);await db.execute({sql:"DELETE FROM email_send_reservations WHERE send_key=?",args:[`direct:${id}`]});await db.execute({sql:"DELETE FROM email_events WHERE message_id=?",args:[id]});await db.execute({sql:"DELETE FROM send_attempts WHERE message_id=?",args:[id]});await db.execute({sql:"DELETE FROM email_outbox WHERE message_id=?",args:[id]});await db.execute({sql:"DELETE FROM messages WHERE id=?",args:[id]});await db.execute({sql:"DELETE FROM conversations WHERE id=?",args:[Number(message.conversation_id)]});}
    await db.execute("DELETE FROM email_send_reservations WHERE send_key LIKE 'budget-fixture:%'");
    await db.execute("DELETE FROM email_drafts WHERE JSON_EXTRACT(payload_json,'$.subject') LIKE 'Budget fixture%'");
    await db.execute("DELETE FROM contacts WHERE email LIKE 'budget-fixture-%'");
  }finally{db.close();}
});

async function capacity(page:import("@playwright/test").Page){return(await(await page.request.get("/api/sending-budget")).json()) as {remaining:number;sent:number;reserved:number;received:number;individual:number;campaign:number;day:string;limit:number};}
async function campaignFixture(count:number){
  const db=testDb();try{
    for(let index=0;index<count;index++)await db.execute({sql:"INSERT INTO contacts (name,email,kind,consent) VALUES (?,?,'planner',1)",args:[`Budget fixture person ${index}`,`budget-fixture-${index}@example.com`]});
    const campaign=await db.execute("INSERT INTO campaigns (name,subject,body_html,segment,mailbox_id,status,created_by) VALUES ('Budget fixture campaign','Budget fixture campaign','<p>Hello {{name}}</p>','planner',1,'draft',1)");return Number(campaign.lastInsertRowid);
  }finally{db.close();}
}

test("one chosen campaign count sends as one Resend batch and leaves unused daily capacity",async({page})=>{
  await login(page);const before=await capacity(page),count=Math.min(50,before.remaining-1),id=await campaignFixture(80);
  expect(count).toBeGreaterThan(20);
  await page.goto(`/campaigns/${id}`);await page.getByRole("spinbutton",{name:"Campaign send count"}).fill(String(count));await page.getByRole("button",{name:"Start selected campaign",exact:true}).click();
  const db=testDb();try{await expect.poll(async()=>Number((await db.execute({sql:"SELECT COUNT(*) n FROM campaign_recipients WHERE campaign_id=? AND sent_at IS NOT NULL",args:[id]})).rows[0].n)).toBe(count);expect((await db.execute({sql:"SELECT id FROM campaign_recipients WHERE campaign_id=?",args:[id]})).rows).toHaveLength(count);}finally{db.close();}
  const after=await capacity(page);expect(after.campaign-before.campaign).toBe(count);expect(after.remaining).toBe(before.remaining-count);expect(after.reserved).toBe(before.reserved);
  const batches=(await readFile(".next/ui-test-batches.jsonl","utf8")).trim().split("\n").map(line=>JSON.parse(line)).filter(batch=>batch.subjects[0]==="Budget fixture campaign");expect(batches).toHaveLength(1);expect(batches[0].count).toBe(count);
});

test("campaign selection above live remaining capacity is rejected on the server without reserving extra recipients",async({page})=>{
  await login(page);const before=await capacity(page),db=testDb(),id=await campaignFixture(10);
  try{await db.execute({sql:"INSERT INTO email_send_reservations (send_key,day_key,channel,recipient_count,status) VALUES ('budget-fixture:near-cap',?,'direct',?,'sent')",args:[before.day,before.remaining-2]});}finally{db.close();}
  await page.goto(`/campaigns/${id}`);await page.getByRole("spinbutton",{name:"Campaign send count"}).evaluate((input:HTMLInputElement)=>{input.max="70";});await page.getByRole("spinbutton",{name:"Campaign send count"}).fill("3");await page.getByRole("button",{name:"Start selected campaign",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"Only 2 recipient slots remain"})).toBeVisible();expect((await capacity(page)).remaining).toBe(2);
  const check=testDb();try{expect((await check.execute({sql:"SELECT id FROM campaign_recipients WHERE campaign_id=?",args:[id]})).rows).toHaveLength(0);}finally{check.close();}
});

test("CC and BCC use recipient slots and a quota rejection preserves the unsent composer",async({page})=>{
  await login(page);const before=await capacity(page);
  await page.goto("/conversations/new");await page.getByRole("combobox",{name:"From",exact:true}).selectOption("1");await page.getByRole("textbox",{name:"To",exact:true}).fill("budget-fixture-copy@example.com");await page.getByRole("textbox",{name:"Cc",exact:true}).fill("budget-fixture-cc@example.com");await page.getByRole("textbox",{name:"Bcc",exact:true}).fill("budget-fixture-bcc@example.com");await page.getByRole("textbox",{name:"Subject",exact:true}).fill("Budget fixture copies");await page.getByRole("textbox",{name:"Write your message..."}).fill("Three recipient slots.");await page.getByRole("button",{name:"Send email",exact:true}).click();await expect(page).toHaveURL(/\/outbox/);
  await expect.poll(async()=>(await capacity(page)).individual-before.individual).toBe(3);
  const available=await capacity(page),db=testDb();try{await db.execute({sql:"INSERT INTO email_send_reservations (send_key,day_key,channel,recipient_count,status) VALUES ('budget-fixture:full',?,'direct',?,'sent')",args:[available.day,available.remaining]});}finally{db.close();}
  await page.goto("/conversations/new");await page.getByRole("combobox",{name:"From",exact:true}).selectOption("1");await page.getByRole("textbox",{name:"To",exact:true}).fill("budget-fixture-blocked@example.com");await page.getByRole("textbox",{name:"Subject",exact:true}).fill("Budget fixture preserved");await page.getByRole("textbox",{name:"Write your message..."}).fill("Do not lose this message.");await page.getByRole("button",{name:"Send email",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"Only 0 recipient slots remain"})).toBeVisible();await expect(page.getByRole("textbox",{name:"Write your message..."})).toHaveText("Do not lose this message.");
});

test("simultaneous individual sends compete atomically for the final daily slot",async({page,context})=>{
  await login(page);const before=await capacity(page),db=testDb();try{await db.execute({sql:"INSERT INTO email_send_reservations (send_key,day_key,channel,recipient_count,status) VALUES ('budget-fixture:last-slot',?,'direct',?,'sent')",args:[before.day,before.remaining-1]});}finally{db.close();}
  const second=await context.newPage(),pages=[page,second];
  for(const [index,target] of pages.entries()){await target.goto("/conversations/new");await target.getByRole("combobox",{name:"From",exact:true}).selectOption("1");await target.getByRole("textbox",{name:"To",exact:true}).fill(`budget-fixture-concurrent-${index}@example.com`);await target.getByRole("textbox",{name:"Subject",exact:true}).fill(`Budget fixture concurrent ${index}`);await target.getByRole("textbox",{name:"Write your message..."}).fill("Only one remaining slot.");}
  await Promise.all(pages.map(target=>target.getByRole("button",{name:"Send email",exact:true}).click()));
  const check=testDb();try{await expect.poll(async()=>Number((await check.execute("SELECT COUNT(*) n FROM messages WHERE subject LIKE 'Budget fixture concurrent%' AND status='sent'")).rows[0].n)).toBe(1);expect(Number((await check.execute("SELECT COUNT(*) n FROM messages WHERE subject LIKE 'Budget fixture concurrent%'")).rows[0].n)).toBe(1);}finally{check.close();}
  expect((await capacity(page)).remaining).toBe(0);expect((await capacity(page)).sent).toBe(70);
  await second.close();
});

test("deleting a sent conversation does not restore spent sending capacity",async({page})=>{
  await login(page);const before=await capacity(page);
  await page.goto("/conversations/new");await page.getByRole("combobox",{name:"From",exact:true}).selectOption("1");await page.getByRole("textbox",{name:"To",exact:true}).fill("budget-fixture-delete@example.com");await page.getByRole("textbox",{name:"Subject",exact:true}).fill("Budget fixture billed");await page.getByRole("textbox",{name:"Write your message..."}).fill("Quota remains used after deleting this conversation.");await page.getByRole("button",{name:"Send email",exact:true}).click();
  await expect.poll(async()=>(await capacity(page)).sent).toBe(before.sent+1);
  const db=testDb();let messageId=0;
  try{
    messageId=Number((await db.execute("SELECT id FROM messages WHERE subject='Budget fixture billed'")).rows[0].id);
    await page.goto("/conversations?q=Budget%20fixture%20billed");await page.getByRole("checkbox",{name:"Select Budget fixture billed",exact:true}).check();await page.getByRole("button",{name:"Delete",exact:true}).click();
    await expect(page.getByRole("checkbox",{name:"Select Budget fixture billed",exact:true})).toHaveCount(0);
    expect((await capacity(page)).sent).toBe(before.sent+1);expect((await capacity(page)).remaining).toBe(before.remaining-1);
  }finally{if(messageId)await db.execute({sql:"DELETE FROM email_send_reservations WHERE send_key=?",args:[`direct:${messageId}`]});db.close();}
});

test("recorded incoming emails reduce available capacity when provider headroom is lower than the app cap",async({page})=>{
  await login(page);const before=await capacity(page),count=100-before.sent-before.reserved-before.received-2,db=testDb();
  try{
    const conversation=await db.execute("INSERT INTO conversations (mailbox_id,contact_id,subject) VALUES (1,1,'Budget fixture inbound')");
    await db.execute({sql:`INSERT INTO messages (conversation_id,direction,sender,recipient,subject,body_html,status) VALUES ${Array.from({length:count},()=>"(?,'inbound','aarav@example.com','hello@example.com','Budget fixture inbound','<p>Received</p>','received')").join(",")}`,args:Array.from({length:count},()=>Number(conversation.lastInsertRowid))});
  }finally{db.close();}
  expect((await capacity(page)).remaining).toBe(2);
});
