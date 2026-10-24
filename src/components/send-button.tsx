"use client";

import { useFormStatus } from "react-dom";

export function SendButton({children,className}:{children:React.ReactNode;className:string}) {
  const {pending}=useFormStatus();
  return <button className={className} disabled={pending} aria-disabled={pending}>{pending?"Sending…":children}</button>;
}
