import { currentUser } from "@/lib/auth";
import { rows, run, transaction } from "@/lib/db";
import { draftAllowed, draftFields, uuidPattern } from "@/lib/drafts";
import { privateJson, sameOrigin } from "@/lib/http-security";
import { readLimitedJson } from "@/lib/webhook";
import sanitizeHtml from "sanitize-html";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return privateJson({error:"Unauthorized"},401);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!uuidPattern.test(id)) return privateJson({error:"Draft unavailable"},404);
  const [draft] = await rows("SELECT id,payload_json,revision,updated_at FROM email_drafts WHERE id=? AND user_id=?",[id,Number(user.id)]);
  if (!draft) return privateJson({error:"Draft unavailable"},404);
  const data = draftFields.parse(JSON.parse(String(draft.payload_json)));
  if (!await draftAllowed(user,data)) return privateJson({error:"Draft unavailable"},404);
  return privateJson({id,fields:data,revision:Number(draft.revision),updatedAt:draft.updated_at});
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return privateJson({error:"Unauthorized"},401);
  if (!sameOrigin(request)) return privateJson({error:"Origin not allowed"},403);
  let body: Record<string,unknown>;
  try { body = await readLimitedJson(request,512*1024); } catch { return privateJson({error:"Invalid or oversized draft"},400); }
  const id = String(body.id || ""), revision = Number(body.revision);
  const parsed = draftFields.safeParse(body.fields);
  if (!uuidPattern.test(id) || !Number.isSafeInteger(revision) || revision<0 || !parsed.success) return privateJson({error:"Invalid draft"},400);
  const fields = parsed.data;
  if (!await draftAllowed(user,fields)) return privateJson({error:"Mailbox unavailable"},403);
  fields.body_html = sanitizeHtml(fields.body_html,{allowedTags:sanitizeHtml.defaults.allowedTags.concat(["img"]),allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,a:["href","target","rel"],img:["src","alt"]},allowedSchemes:["http","https","mailto"]});
  const outcome = await transaction(async tx => {
    // A delayed autosave must not resurrect a draft that was already queued.
    if ((await tx.rows("SELECT idempotency_key FROM send_attempts WHERE idempotency_key=?",[id])).length) return "consumed";
    if (!revision) {
      const created = await tx.run("INSERT IGNORE INTO email_drafts (id,user_id,payload_json,revision) VALUES (?,?,?,1)",[id,Number(user.id),JSON.stringify(fields)]);
      return created.rowsAffected ? "saved" : "conflict";
    }
    const updated = await tx.run("UPDATE email_drafts SET payload_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revision=?",[JSON.stringify(fields),id,Number(user.id),revision]);
    return updated.rowsAffected ? "saved" : "conflict";
  });
  if (outcome==="consumed") return privateJson({error:"This draft was already queued"},410);
  if (outcome==="conflict") return privateJson({error:"This draft changed in another tab. Copy your edits before reloading."},409);
  return privateJson({revision:revision+1});
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return privateJson({error:"Unauthorized"},401);
  if (!sameOrigin(request)) return privateJson({error:"Origin not allowed"},403);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!uuidPattern.test(id)) return privateJson({error:"Draft unavailable"},404);
  await run("DELETE FROM email_drafts WHERE id=? AND user_id=?",[id,Number(user.id)]);
  return privateJson({ok:true});
}
