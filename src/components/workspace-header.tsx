"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, LogOut, Settings2, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { routeLabel } from "@/lib/navigation";
import { RefreshData } from "@/components/refresh-data";
import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { WorkspaceSearch } from "@/components/workspace-search";
import { UserAvatar } from "@/components/user-avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function WorkspaceHeader({ name, role, userId, avatarVersion }: { name: string; role: string; userId: number; avatarVersion?:string|number|null }) {
  const pathname = usePathname();
  return <header className="topbar"><ActionFeedback/>
    <div className="breadcrumb"><span className="breadcrumb-workspace"><Settings2 size={14}/>{role==="admin"?"Workspace":"My workspace"}</span><ChevronRight size={13}/><strong>{routeLabel(pathname)}</strong></div><WorkspaceSearch role={role}/>
    <div className="topbar-right"><RefreshData/><span className="topbar-divider"/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="profile-trigger" aria-label="Account menu"><UserAvatar userId={userId} name={name} version={avatarVersion} className="small"/><span className="profile-name">{name}</span><ChevronDown size={13}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel><span className="block truncate">{name}</span><span className="mt-1 block text-xs font-normal text-muted-foreground capitalize">{role}</span></DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem asChild><Link href="/profile"><UserRound/>My profile</Link></DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onSelect={() => { void logoutAction(); }}><LogOut/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
  </header>;
}
