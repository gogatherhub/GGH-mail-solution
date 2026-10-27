"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

const notices: Record<string, string> = {
  user_created: "Team member created",
  user_updated: "Team member updated",
  contact_saved: "Contact saved",
  mailbox_saved: "Email account saved",
  mailbox_deleted: "Email account deleted",
  campaign_saved: "Campaign draft saved",
  campaign_started: "Selected recipients reserved. Your campaign is sending in the background.",
  profile_saved: "Profile updated",
  email_sent: "Email sent",
  email_queued: "Email queued. You can keep working while it sends.",
  email_already_queued: "This email request is already in your outbox.",
  contact_exists: "Existing contact kept. Email history is unchanged.",
};

export function ActionFeedback() {
  const params = useSearchParams();
  const notice = params.get("notice");
  useEffect(() => {
    if (!notice || !notices[notice]) return;
    toast.success(notices[notice], { id: notice });
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [notice]);
  return null;
}
