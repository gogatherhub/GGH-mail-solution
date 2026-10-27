import { expect, test } from "@playwright/test";
import { login, testDb } from "./helpers";

test("email account delete explains linked records and deletes unused accounts", async ({page}) => {
  await login(page);
  await page.goto("/email-accounts/1");
  await page.getByRole("button",{name:"Delete mailbox"}).click();
  await expect(page.locator(".form-error")).toContainText("has conversations");

  const db=testDb();
  let id:number;
  try {
    const result=await db.execute("INSERT INTO mailboxes (email,display_name,type) VALUES ('delete-ui@example.com','Delete UI','General')");
    id=Number(result.lastInsertRowid);
  } finally { db.close(); }
  await page.goto(`/email-accounts/${id}`);
  await page.getByRole("button",{name:"Delete mailbox"}).click();
  await expect(page.getByText("Email account deleted")).toBeVisible();
  await expect(page).toHaveURL(/\/email-accounts$/);
  await expect(page.getByText("delete-ui@example.com")).toHaveCount(0);
});
