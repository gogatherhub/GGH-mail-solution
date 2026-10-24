import { ChartNoAxesCombined, ContactRound, FileText, Inbox, LayoutDashboard, Mail, Megaphone, MessagesSquare, Send, UsersRound } from "lucide-react";

export const workspaceLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/conversations?filter=inbox", label: "Inbox", icon: Inbox },
  { href: "/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/outbox", label: "Outbox", icon: Send },
  { href: "/drafts", label: "Drafts", icon: FileText },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined, admin: true },
  { href: "/contacts", label: "Contacts", icon: ContactRound, admin: true },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, admin: true },
  { href: "/users", label: "Team members", icon: UsersRound, admin: true },
  { href: "/email-accounts", label: "Email accounts", icon: Mail, admin: true },
];

export function routeLabel(pathname: string) {
  const segment = pathname.split("/")[1];
  return ({ dashboard: "Dashboard", conversations: "Conversations", outbox: "Outbox", drafts: "Drafts", analytics: "Analytics", contacts: "Contacts", campaigns: "Campaigns", users: "Team members", "email-accounts": "Email accounts", profile: "My profile" } as Record<string, string>)[segment] || "Workspace";
}
