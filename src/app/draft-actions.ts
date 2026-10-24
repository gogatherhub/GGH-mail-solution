"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { uuidPattern } from "@/lib/drafts";
export async function deleteDraft(form: FormData) {
  const user = await requireUser(), id = String(form.get("id")||"");
  if (!uuidPattern.test(id)) throw new Error("Draft unavailable");
  await run("DELETE FROM email_drafts WHERE id=? AND user_id=?",[id,Number(user.id)]);
  revalidatePath("/drafts");
}
