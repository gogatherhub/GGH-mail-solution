import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { login,createEmployee } from "./helpers";

test("filter options open on hover and still work with keyboard and touch",async({page,browser})=>{
  await login(page);
  const mailboxes=page.getByRole("button",{name:"All mailboxes",exact:true});
  await mailboxes.hover();
  await expect(page.getByRole("menuitemradio",{name:"hello@example.com",exact:true})).toBeVisible();
  await page.getByRole("menuitemradio",{name:"hello@example.com",exact:true}).click();
  await expect(page).toHaveURL(/mailbox=1/);
  await page.getByRole("button",{name:"hello@example.com",exact:true}).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitemradio",{name:"All mailboxes",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/mailbox=0/);
  const context=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
  try{
    const mobile=await context.newPage();await login(mobile);
    await mobile.getByRole("button",{name:"All mailboxes",exact:true}).tap();
    await expect(mobile.getByRole("menuitemradio",{name:"hello@example.com",exact:true})).toBeVisible();
    await mobile.getByRole("menuitemradio",{name:"hello@example.com",exact:true}).tap();
    await expect(mobile).toHaveURL(/mailbox=1/);
    expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await context.close();}
});

test("users can upload a sanitized private photo that appears in the team directory",async({page,browser})=>{
  await login(page);await page.goto("/profile");
  const image=await sharp({create:{width:400,height:300,channels:3,background:"#6753d8"}}).png().toBuffer();
  await page.getByLabel("Choose your photo").setInputFiles({name:"profile.png",mimeType:"image/png",buffer:image});
  await page.getByRole("button",{name:"Upload photo",exact:true}).click();
  await expect(page.getByText("Profile photo updated",{exact:true})).toBeVisible();
  const preview=page.locator(".profile-photo-preview img");
  await expect(preview).toBeVisible();
  await expect.poll(()=>preview.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===256)).toBe(true);
  const response=await page.request.get("/api/avatars/1");
  expect(response.ok()).toBe(true);expect(response.headers()["content-type"]).toBe("image/webp");expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("/users");
  await expect(page.getByRole("row").filter({hasText:"Administrator"}).getByRole("img",{name:"Administrator profile photo"})).toBeVisible();
  const guest=await browser.newContext();try{expect((await guest.request.get("http://localhost:3100/api/avatars/1")).status()).toBe(401);}finally{await guest.close();}
  await createEmployee("avatar_employee");const employeeContext=await browser.newContext();
  try{const employee=await employeeContext.newPage();await login(employee,"avatar_employee","ui-employee-password-1234");expect((await employee.request.get("/api/avatars/1")).status()).toBe(404);}finally{await employeeContext.close();}
  await page.goto("/profile");
  await page.getByLabel("Choose your photo").setInputFiles({name:"unsafe.svg",mimeType:"image/svg+xml",buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')});
  await page.getByRole("button",{name:"Upload photo",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:/static JPG|could not be read/})).toBeVisible();
  await page.getByRole("button",{name:"Remove photo",exact:true}).click();
  await expect(page.getByText("Profile photo removed",{exact:true})).toBeVisible();
  await expect(page.locator(".profile-photo-preview img")).toHaveCount(0);
  expect((await page.request.get("/api/avatars/1")).status()).toBe(404);
});

test("workspace pages fit phone and tablet widths with readable responsive type",async({page})=>{
  await login(page);
  for(const width of [360,768,1024]){
    await page.setViewportSize({width,height:900});
    for(const route of ["/dashboard","/analytics","/users","/contacts","/campaigns","/campaigns/1","/email-accounts","/profile","/conversations/3","/conversations/new","/outbox","/drafts"]){
      await page.goto(route);await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} at ${width}px`).toBe(true);
    }
  }
  await page.setViewportSize({width:390,height:844});await page.goto("/dashboard");
  await page.screenshot({path:"test-results/mobile-dashboard.png",fullPage:true});
  await page.goto("/analytics");await page.screenshot({path:"test-results/mobile-analytics.png",fullPage:true});
});
