import { expect, type Page } from "@playwright/test";
import { createClient } from "@libsql/client";
import { hash } from "bcryptjs";

export async function login(page:Page,username="ui_admin",password="ui-review-password-1234"){
  await page.goto("/login");
  await page.getByLabel("Username",{exact:true}).fill(username);
  await page.getByLabel("Password",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible();
}
export function testDb(){
  const url=process.env.WELFOG_E2E_DB_URL;
  if(!url?.startsWith("file:./.next/ui-e2e-"))throw new Error("Only the isolated test database may be used");
  return createClient({url});
}
export async function createEmployee(username:string,mailbox=1){
  const db=testDb();
  try{await db.execute({sql:"INSERT INTO users (username,password_hash,name,role,assigned_mailbox_id) VALUES (?,?,?,'employee',?)",args:[username,await hash("ui-employee-password-1234",12),username,mailbox]});}finally{db.close();}
}
