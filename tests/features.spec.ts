import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { login, createEmployee, testDb } from "./helpers";

test("queued emails return promptly, remain idempotent, and repeated recipients have individual history",async({page})=>{
  await login(page);
  let replay:{headers:Record<string,string>;body:Buffer}|undefined;
  page.on("request",request=>{if(request.method()==="POST"&&request.url().includes("/conversations/new")&&request.headers()["next-action"]){const headers=request.headers();replay={headers:{"next-action":headers["next-action"],"content-type":headers["content-type"],"origin":"http://localhost:3100"},body:request.postDataBuffer()!};}});
  for(let number=1;number<=2;number++){
    await page.goto("/conversations/new");
    await page.getByRole("combobox",{name:"From",exact:true}).selectOption("1");
    await page.getByRole("textbox",{name:"To",exact:true}).fill("repeat-recipient@example.com");
    await page.getByRole("textbox",{name:"Subject",exact:true}).fill(`Queued repeat ${number}`);
    await page.getByRole("textbox",{name:"Write your message..."}).fill("A separate, intentional follow-up.");
    await page.getByRole("button",{name:"Send email",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Outbox",exact:true})).toBeVisible();
    const row=page.getByRole("row").filter({hasText:`Queued repeat ${number}`});
    await expect(row).toBeVisible();
    const db=testDb();
    try{await expect.poll(async()=>{const result=await db.execute({sql:"SELECT o.status FROM email_outbox o JOIN messages m ON m.id=o.message_id WHERE m.subject=?",args:[`Queued repeat ${number}`]});return result.rows[0]?.status;}).toBe("sent");}finally{db.close();}
  }
  expect(replay).toBeDefined();
  const duplicate=await page.request.post("/conversations/new",{headers:replay!.headers,data:replay!.body});
  expect(duplicate.ok()).toBe(true);
  const db=testDb();
  try{
    const messages=await db.execute("SELECT id,provider_id FROM messages WHERE recipient='repeat-recipient@example.com' AND direction='outbound'");
    expect(messages.rows).toHaveLength(2);
    for(let index=0;index<2;index++){
      const event=await page.request.post("/api/events",{headers:{"x-welfog-secret":"ui-test-event-secret-123456789"},data:{type:"delivered",providerId:String(messages.rows[index].provider_id),eventId:`ui-delivered-${index}`}});
      expect(event.ok()).toBe(true);
    }
    // Several open events on one email must still count as one opened email.
    for(let index=0;index<3;index++)await db.execute({sql:"INSERT INTO email_events (message_id,type) VALUES (?,'open')",args:[Number(messages.rows[0].id)]});
  }finally{db.close();}
  await page.goto("/analytics?q=repeat-recipient%40example.com&repeat=yes");
  const recipient=page.getByRole("row").filter({hasText:"repeat-recipient@example.com"});
  await expect(recipient.getByText("2 emails",{exact:true})).toBeVisible();
  await recipient.getByRole("link",{name:"View every email"}).click();
  await expect(page.getByRole("heading",{name:"2 emails sent to this address"})).toBeVisible();
  await expect(page.getByRole("cell",{name:"Queued repeat 1 direct",exact:false})).toBeVisible();
  await expect(page.getByRole("link",{name:"View email",exact:true})).toHaveCount(2);
  await expect(page.getByText("1 opened · 0 clicked · 50.0% open rate")).toBeVisible();
  await page.screenshot({path:"test-results/recipient-history.png",fullPage:true});
});

test("drafts survive reload, reject stale writes, sanitize HTML and stay private across users",async({page,browser})=>{
  await login(page);
  await page.goto("/conversations/new");
  await page.getByRole("combobox",{name:"From",exact:true}).selectOption("1");
  await page.getByRole("textbox",{name:"To",exact:true}).fill("draft@example.com");
  await page.getByRole("textbox",{name:"Subject",exact:true}).fill("Private autosaved draft");
  await page.getByRole("textbox",{name:"Write your message..."}).fill("Keep this body when I come back.");
  await expect(page.getByText("All changes saved",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"View drafts",exact:true}).click();
  await page.getByRole("link",{name:/Private autosaved draft/}).click();
  await page.reload();
  await expect(page.getByRole("textbox",{name:"Subject",exact:true})).toHaveValue("Private autosaved draft");
  await expect(page.getByRole("textbox",{name:"Write your message..."})).toHaveText("Keep this body when I come back.");
  const draftId=new URL(page.url()).searchParams.get("draft")!;
  const response=await page.request.get(`/api/drafts?id=${draftId}`);const draft=await response.json();
  expect(response.headers()["cache-control"]).toContain("no-store");
  const sanitized=await page.request.post("/api/drafts",{headers:{Origin:"http://localhost:3100"},data:{id:draftId,revision:draft.revision,fields:{...draft.fields,body_html:'<p>Safe</p><script>alert(1)</script><img src="x" onerror="alert(1)">'}}});
  expect(sanitized.ok()).toBe(true);
  const stale=await page.request.post("/api/drafts",{headers:{Origin:"http://localhost:3100"},data:{id:draftId,revision:draft.revision,fields:draft.fields}});
  expect(stale.status()).toBe(409);
  const clean=await(await page.request.get(`/api/drafts?id=${draftId}`)).json();
  expect(clean.fields.body_html).not.toMatch(/script|onerror/);
  const crossOrigin=await page.request.post("/api/drafts",{headers:{Origin:"https://attacker.invalid"},data:{id:draftId,revision:clean.revision,fields:clean.fields}});
  expect(crossOrigin.status()).toBe(403);
  await createEmployee("private_draft_employee");
  const context=await browser.newContext();const employee=await context.newPage();
  try{
    await login(employee,"private_draft_employee","ui-employee-password-1234");
    const hidden=await employee.request.get(`/api/drafts?id=${draftId}`);expect(hidden.status()).toBe(404);
    await employee.goto(`/conversations/new?draft=${draftId}`);
    await expect(employee.getByRole("textbox",{name:"Subject",exact:true})).toHaveCount(0);
    await employee.goto("/conversations/2");
    await expect(employee.getByText("Vendor availability",{exact:true})).toHaveCount(0);
    const scoped=await employee.request.get("/api/search?q=Vendor%20availability");
    expect((await scoped.json()).results).toEqual([]);
    await employee.goto("/analytics");await expect(employee).toHaveURL(/\/dashboard$/);
    await employee.screenshot({path:"test-results/employee-dashboard.png",fullPage:true});
  }finally{await context.close();}
});

test("reimport skips case and CSV duplicates while preserving the contact with its send history",async({page})=>{
  await login(page);
  const db=testDb();let contactId:number;
  try{
    const [contact]= (await db.execute("SELECT id FROM contacts WHERE email='aarav@example.com'")).rows;contactId=Number(contact.id);
    await db.execute({sql:"INSERT INTO messages (conversation_id,direction,sender,recipient,subject,body_html,status) VALUES (1,'outbound','hello@example.com','aarav@example.com','Before reimport','<p>Keep this</p>','sent')",args:[]});
  }finally{db.close();}
  const csv="name,email,kind,consent\nReplacement Name,AARAV@EXAMPLE.COM,client,yes\nNew Person,new-import@example.com,vendor,no\nDuplicate New,new-import@example.com,vendor,yes\nInvalid,not-an-email,client,no";
  for(let pass=0;pass<2;pass++){
    await page.goto("/contacts");
    await page.locator('input[type="file"][name="file"]').setInputFiles({name:"contacts.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
    await page.getByRole("button",{name:"Import CSV",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Existing records and email history were preserved"})).toBeVisible();
  }
  const verify=testDb();try{
    const contact=await verify.execute("SELECT id,name,consent FROM contacts WHERE LOWER(email)='aarav@example.com'");
    expect(contact.rows).toHaveLength(1);expect(Number(contact.rows[0].id)).toBe(contactId);expect(contact.rows[0].name).toBe("Aarav Mehta");expect(contact.rows[0].consent).toBe(0);
    expect((await verify.execute("SELECT id FROM contacts WHERE email='new-import@example.com'")).rows).toHaveLength(1);
    expect((await verify.execute("SELECT id FROM messages WHERE subject='Before reimport'")).rows).toHaveLength(1);
  }finally{verify.close();}
});

test("global search and keyboard shortcuts work without escaping mailbox permissions",async({page})=>{
  await login(page);await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog",{name:"Search your workspace"})).toBeVisible();
  await page.getByPlaceholder("Search people, emails or pages…").fill("Upcoming event details");
  await page.getByRole("option",{name:/Upcoming event details/}).click();
  await expect(page).toHaveURL(/\/conversations\/1/);
  await page.keyboard.press("c");await expect(page).toHaveURL(/\/conversations\/new/);
  await page.getByRole("textbox",{name:"Subject",exact:true}).fill("ccc");
  await expect(page).toHaveURL(/\/conversations\/new/);
  await expect(page.getByText("All changes saved",{exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
});

test("expired worker leases become needs review without sending another copy",async({page})=>{
  await login(page);const db=testDb(),key=randomUUID();
  try{
    const conversation=await db.execute("INSERT INTO conversations (mailbox_id,contact_id,subject) VALUES (1,1,'Stopped worker fixture')");
    const message=await db.execute({sql:"INSERT INTO messages (conversation_id,direction,sender,recipient,subject,body_html,status) VALUES (?,'outbound','hello@example.com','aarav@example.com','Stopped worker fixture','<p>Review</p>','queued')",args:[Number(conversation.lastInsertRowid)]});
    await db.execute({sql:"INSERT INTO send_attempts (idempotency_key,user_id,conversation_id,message_id,status) VALUES (?,1,?,?,'processing')",args:[key,Number(conversation.lastInsertRowid),Number(message.lastInsertRowid)]});
    await db.execute({sql:"INSERT INTO email_outbox (message_id,user_id,idempotency_key,payload_json,status,locked_at) VALUES (?,1,?,'{}','processing','2000-01-01 00:00:00')",args:[Number(message.lastInsertRowid),key]});
    const result=await page.request.get("/api/jobs/send-outbox",{headers:{Authorization:"Bearer ui-test-worker-secret-123456789"}});expect(result.ok()).toBe(true);
    const [outbox]=(await db.execute({sql:"SELECT status,attempts FROM email_outbox WHERE idempotency_key=?",args:[key]})).rows;
    expect(outbox.status).toBe("needs_review");expect(outbox.attempts).toBe(0);
    expect((await db.execute({sql:"SELECT status FROM messages WHERE id=?",args:[Number(message.lastInsertRowid)]})).rows[0].status).toBe("needs_review");
    await page.goto("/outbox?q=Stopped%20worker%20fixture");
    const row=page.getByRole("row").filter({hasText:"Stopped worker fixture"});
    await expect(row.getByText("needs review",{exact:true})).toBeVisible();
    await expect(row.getByRole("button",{name:"Retry",exact:true})).toHaveCount(0);
  }finally{db.close();}
});

test("revoked sessions stop API access and repeated failed sign-ins are throttled",async({page})=>{
  await createEmployee("revoked_employee");await login(page,"revoked_employee","ui-employee-password-1234");
  const db=testDb();try{await db.execute("UPDATE users SET session_version=session_version+1 WHERE username='revoked_employee'");}finally{db.close();}
  expect((await page.request.get("/api/search?q=aarav")).status()).toBe(401);
  await page.goto("/dashboard");await expect(page.getByRole("heading",{name:"Welcome back."})).toBeVisible();
  await page.getByLabel("Username",{exact:true}).fill("revoked_employee");await page.getByLabel("Password",{exact:true}).fill("incorrect-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"Invalid username or password"})).toBeVisible();
  const limitDb=testDb();try{const {createHash}=await import("node:crypto");const throttle=createHash("sha256").update("revoked_employee").digest("hex");await limitDb.execute({sql:"UPDATE auth_throttles SET attempts=12 WHERE key_hash=?",args:[throttle]});}finally{limitDb.close();}
  await page.getByLabel("Username",{exact:true}).fill("revoked_employee");await page.getByLabel("Password",{exact:true}).fill("ui-employee-password-1234");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"Invalid username or password"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Welcome back."})).toBeVisible();
});

test("copied private links, forged cookies, webhooks and worker endpoints reject unauthenticated access",async({page,request})=>{
  for(const path of ["/dashboard","/analytics","/analytics/recipients?email=aarav@example.com","/outbox","/drafts","/conversations/1","/contacts/1"]){
    await page.goto(path);await expect(page.getByRole("heading",{name:"Welcome back."})).toBeVisible();
    await expect(page.getByText("Upcoming event details",{exact:true})).toHaveCount(0);
  }
  for(const path of ["/api/search?q=aarav","/api/drafts?id="+randomUUID(),"/api/jobs/send-outbox","/api/jobs/send-campaigns"])expect((await request.get(path)).status()).toBe(401);
  expect((await request.post("/api/drafts",{data:{id:randomUUID()}})).status()).toBe(401);
  expect((await request.post("/api/inbound",{data:{from:"attacker@example.com"}})).status()).toBe(401);
  expect((await request.post("/api/events",{data:{type:"delivered",providerId:"fake"}})).status()).toBe(401);
  expect((await request.get("/api/track/m1/open?sig="+"a".repeat(64))).status()).toBe(403);
  expect((await request.get("/api/track/m1/open?sig="+encodeURIComponent("é".repeat(64)))).status()).toBe(403);
  await page.context().addCookies([{name:"welfog_session",value:`1.1.9999999999999.${"a".repeat(64)}`,domain:"localhost",path:"/"}]);
  await page.goto("/dashboard");await expect(page.getByRole("heading",{name:"Welcome back."})).toBeVisible();
  const headers=(await request.get("/login")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");expect(headers["x-content-type-options"]).toBe("nosniff");expect(headers["referrer-policy"]).toBe("no-referrer");
});
