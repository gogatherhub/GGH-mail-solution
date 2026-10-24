import { z } from "zod";
import { rows, type Row } from "./db";

export const draftFields = z.object({
  mailbox_id: z.number().int().nonnegative(),
  conversation_id: z.number().int().nonnegative().default(0),
  to: z.string().max(255), name: z.string().max(200), cc: z.string().max(4000), bcc: z.string().max(4000), subject: z.string().max(500), body_html: z.string().max(400_000),
});
export type DraftFields = z.infer<typeof draftFields>;
export const emptyDraft: DraftFields = { mailbox_id: 0, conversation_id: 0, to: "", name: "", cc: "", bcc: "", subject: "", body_html: "" };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function draftAllowed(user: Row, data: DraftFields) {
  if (data.mailbox_id) {
    if (user.role !== "admin" && Number(user.assigned_mailbox_id) !== data.mailbox_id) return false;
    if (!(await rows("SELECT id FROM mailboxes WHERE id=? AND status='active'",[data.mailbox_id])).length) return false;
  }
  if (data.conversation_id) {
    const [conversation] = await rows("SELECT mailbox_id FROM conversations WHERE id=?",[data.conversation_id]);
    if (!conversation || Number(conversation.mailbox_id) !== data.mailbox_id) return false;
  }
  return true;
}
