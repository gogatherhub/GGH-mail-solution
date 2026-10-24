import { Shell } from "@/components/shell";import { MailboxForm } from "@/components/mailbox-form";import { requireAdmin } from "@/lib/auth";
export default async function NewMailbox(){await requireAdmin();return <Shell title="Add mailbox" subtitle="Register a team email address"><MailboxForm/></Shell>}
