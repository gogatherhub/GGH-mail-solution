"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({ children, pendingLabel = "Saving…", disabled, className, variant, ...props }: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const resolvedVariant = variant || (className?.includes("secondary") || className?.includes("danger") ? "outline" : "default");
  return <Button type="submit" {...props} className={className} variant={resolvedVariant} disabled={disabled || pending} aria-busy={pending}>
    {pending && <Loader2 size={15} className="animate-spin" aria-hidden="true"/>}
    <span className="inline-flex items-center gap-2" aria-live="polite">{pending ? pendingLabel : children}</span>
  </Button>;
}
