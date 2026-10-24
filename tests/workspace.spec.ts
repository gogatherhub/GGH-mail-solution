import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username = "ui_admin", password = "ui-review-password-1234") {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

test("navigation preserves the workspace and highlights the correct inbox", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page);
  await page.screenshot({ path: "test-results/ui-review-dashboard.png", fullPage: true });
  const recentRow=page.locator(".linked-table-row").filter({hasText:"Planning call follow-up"});
  await expect(recentRow).toHaveCSS("cursor","pointer");
  // Hit the subject cell, outside the visible View link, to check the full row hit area.
  const rowBounds=await recentRow.boundingBox(),subjectBounds=await recentRow.locator("td").nth(1).boundingBox();
  await recentRow.click({position:{x:subjectBounds!.x-rowBounds!.x+20,y:rowBounds!.height/2}});
  await expect(page).toHaveURL(/\/conversations\/3$/);
  await page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:"Dashboard",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible();
  await page.evaluate(() => { document.querySelector(".sidebar")!.setAttribute("data-persistence-check", "kept"); });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Team members", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveAttribute("data-persistence-check", "kept");
  await expect(nav.getByRole("link", { name: "Team members", exact: true })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page).toHaveURL(/filter=inbox/);
  await expect(nav.getByRole("link", { name: "Inbox", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Conversations", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("navigation", { name: "Conversation filters" }).getByRole("link", { name: "Unread", exact: true }).click();
  await expect(page).toHaveURL(/filter=unread/);
  await expect(page.locator(".sidebar")).toHaveAttribute("data-persistence-check", "kept");
  expect(errors).toEqual([]);
});

test("user creation shows immediate pending feedback and persists the saved user", async ({ page }) => {
  await login(page);
  await page.goto("/users/new");
  await page.getByLabel("Username", { exact: true }).fill("ui_employee");
  await page.getByLabel("Password", { exact: true }).fill("ui-employee-password-1234");
  await page.getByLabel("Name", { exact: true }).fill("UI Review Member");
  await page.getByLabel("Assigned mailbox").selectOption("1");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/users/new", async route => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  await expect(page.getByText("Team member created", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Search by name, email, phone or department").fill("UI Review Member");
  await expect(page).toHaveURL(/q=UI/);
  await expect(page.getByRole("link", { name: "UI Review Member" })).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("UI Review Member");
  await page.getByLabel("Department").fill("Design");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Team member updated", { exact: true })).toBeVisible();
});

test("employee navigation stays scoped and admin routes stay protected", async ({ page }) => {
  await login(page);
  await page.goto("/users/new");
  await page.getByLabel("Username", { exact: true }).fill("ui_scoped_employee");
  await page.getByLabel("Password", { exact: true }).fill("ui-employee-password-1234");
  await page.getByLabel("Name", { exact: true }).fill("UI Scoped Member");
  await page.getByLabel("Assigned mailbox").selectOption("1");
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await login(page, "ui_scoped_employee", "ui-employee-password-1234");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav.getByRole("link", { name: "Team members" })).toHaveCount(0);
  await page.goto("/users");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

test("contacts, mailboxes and campaign drafts still save", async ({ page }) => {
  await login(page);
  await page.goto("/contacts/new");
  await page.getByLabel("Name", { exact: true }).fill("UI Review Contact");
  await page.getByLabel("Email", { exact: true }).fill("ui-review@example.com");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page.getByText("Contact saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /UI Review Contact/ })).toBeVisible();
  await page.goto("/email-accounts/new");
  await page.getByLabel("Email address").fill("ui-mailbox@example.com");
  await page.getByLabel("Display name").fill("UI Review Mailbox");
  await page.getByRole("button", { name: "Add mailbox", exact: true }).click();
  await expect(page.getByText("Email account saved", { exact: true })).toBeVisible();
  await page.goto("/campaigns/new");
  await page.getByLabel("Campaign name").fill("UI Review Draft");
  await page.getByLabel("From mailbox").selectOption("1");
  await page.getByLabel("Subject", { exact: true }).fill("UI Review Subject");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Campaign draft saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /UI Review Draft/ })).toBeVisible();
});

test("failed email sending stays honest and disables both send controls while pending", async ({ page }) => {
  await login(page);
  await page.goto("/conversations/new");
  await page.screenshot({ path: "test-results/ui-review-compose.png", fullPage: true });
  await page.getByRole("combobox", { name: "From", exact: true }).selectOption("1");
  await page.getByLabel("To", { exact: true }).fill("ui-review@example.com");
  await page.getByLabel("Subject", { exact: true }).fill("UI Review Send Check");
  await page.getByRole("textbox", { name: "Write your message..." }).fill("UI review email body");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/conversations/new", async route => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Send email", exact: true }).click();
  await expect(page.getByRole("button", { name: "Queuing…", exact: true })).toHaveCount(2);
  for (const button of await page.getByRole("button", { name: "Queuing…", exact: true }).all()) await expect(button).toBeDisabled();
  release();
  await expect(page).toHaveURL(/\/outbox/);
  const row=page.getByRole("row").filter({hasText:"UI Review Send Check"});
  await expect(row).toBeVisible();
  await expect(row.getByText("failed",{exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByText("Email sent", { exact: true })).toHaveCount(0);
});

test("bulk read actions preserve the selected action and update conversation status", async ({ page }) => {
  await login(page);
  await page.goto("/conversations?filter=inbox");
  await page.getByRole("checkbox", { name: "Select Planning call follow-up", exact: true }).check();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  const row = page.locator(".conversation-row").filter({ hasText: "Planning call follow-up" });
  await expect(row.getByText("Read", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Planning call follow-up", exact: true }).check();
  await page.getByRole("button", { name: "Mark unread", exact: true }).click();
  await expect(row.getByText("Unread", { exact: true })).toBeVisible();
});

test("mobile layout avoids page overflow and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  for (const route of ["/dashboard", "/conversations", "/users/new", "/conversations/new", "/analytics", "/outbox", "/drafts", "/analytics/recipients?email=aarav@example.com"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "test-results/ui-review-mobile.png", fullPage: true });
});
