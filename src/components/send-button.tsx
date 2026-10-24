"use client";

import { Send } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";

export function SendButton({children,className,disabled=false}:{children:React.ReactNode;className:string;disabled?:boolean}) {
  return <SubmitButton className={className} disabled={disabled} pendingLabel="Queuing…"><Send size={15}/>{children}</SubmitButton>;
}
