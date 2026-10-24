"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rows, transaction } from "@/lib/db";
import { dispatchOutbox } from "@/lib/outbox";

async function accessibleJob(form: FormData) {
  const user = await requireUser(), id = Number(form.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Request unavailable");
  const [job] = await rows("SELECT o.*,co.mailbox_id FROM email_outbox o JOIN messages m ON m.id=o.message_id JOIN conversations co ON co.id=m.conversation_id WHERE o.id=?", [id]);
  if (!job || (user.role !== "admin" && (Number(job.user_id) !== Number(user.id) || Number(job.mailbox_id) !== Number(user.assigned_mailbox_id)))) throw new Error("Request unavailable");
  return job;
}
export async function retryOutbox(form: FormData) {
  const job = await accessibleJob(form);
  // Only preparation failures or explicit provider rejections are retryable. Unconfirmed requests require review.
  const changed = await transaction(async tx => {
    const result = await tx.run("UPDATE email_outbox SET status='queued',last_error=NULL,locked_at=NULL WHERE id=? AND status='failed'", [Number(job.id)]);
    if (result.rowsAffected) await tx.run("UPDATE messages SET status='queued' WHERE id=? AND status='failed'", [Number(job.message_id)]);
    return result.rowsAffected;
  });
  if (changed) after(async () => { await dispatchOutbox(Number(job.id)); revalidatePath("/outbox"); revalidatePath("/conversations"); revalidatePath("/analytics"); });
  revalidatePath("/outbox");
}
export async function cancelOutbox(form: FormData) {
  const job = await accessibleJob(form);
  await transaction(async tx => {
    const changed = await tx.run("UPDATE email_outbox SET status='cancelled',last_error=NULL,payload_json='{}' WHERE id=? AND status IN ('queued','failed')", [Number(job.id)]);
    if (changed.rowsAffected) {
      await tx.run("UPDATE messages SET status='cancelled' WHERE id=?", [Number(job.message_id)]);
      await tx.run("UPDATE send_attempts SET status='cancelled' WHERE idempotency_key=?", [String(job.idempotency_key)]);
    }
  });
  revalidatePath("/outbox"); revalidatePath("/conversations");
}
