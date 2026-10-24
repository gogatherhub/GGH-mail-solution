"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function PendingHint() {
  const { pending } = useLinkStatus();
  return <Loader2 size={14} className={`nav-pending ${pending ? "is-pending" : ""}`} aria-hidden="true"/>;
}

export function NavLink({ href, label, children }: { href: string; label?: string; children: React.ReactNode }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [path, query] = href.split("?");
  const active = path === "/conversations"
    ? pathname.startsWith(path) && (query ? params.get("filter") === "inbox" : params.get("filter") !== "inbox")
    : pathname === path || pathname.startsWith(`${path}/`);
  return <Link href={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} aria-label={label} title={label} onMouseEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)}>{children}<PendingHint/></Link>;
}
