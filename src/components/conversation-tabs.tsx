"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Layers3, Loader2, MailOpen, Send } from "lucide-react";

const tabs = [
  { value: "", label: "All conversations", icon: Layers3 },
  { value: "inbox", label: "Inbox", icon: Inbox },
  { value: "unread", label: "Unread", icon: MailOpen },
  { value: "sent", label: "Sent", icon: Send },
];

function TabPending() {
  const { pending } = useLinkStatus();
  return <Loader2 className={`nav-pending ${pending ? "is-pending" : ""}`} aria-hidden="true"/>;
}

export function ConversationTabs({ current }: { current: string }) {
  const router = useRouter();
  return <nav className="tabs" aria-label="Conversation filters">{tabs.map(tab => {
    const href = `/conversations${tab.value ? `?filter=${tab.value}` : ""}`;
    return <Link key={tab.value} href={href} className={current === tab.value ? "selected" : undefined} aria-current={current === tab.value ? "page" : undefined} onMouseEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)}><tab.icon size={14} strokeWidth={1.7}/>{tab.label}<TabPending/></Link>;
  })}</nav>;
}
