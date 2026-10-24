"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function NavLink({href,children}:{href:string;children:React.ReactNode}) {
  const router=useRouter();
  return <Link href={href} prefetch={false} onMouseEnter={()=>router.prefetch(href)} onFocus={()=>router.prefetch(href)}>{children}</Link>;
}
