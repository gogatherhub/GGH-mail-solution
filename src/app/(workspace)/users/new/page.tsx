import { Shell } from "@/components/shell";import { UserForm } from "@/components/user-form";import { requireAdmin } from "@/lib/auth";import { rows } from "@/lib/db";
export default async function NewUser(){await requireAdmin();return <Shell title="Add user" subtitle="Grant access to your workspace"><UserForm mailboxes={await rows("SELECT id,email FROM mailboxes ORDER BY email")}/></Shell>}
