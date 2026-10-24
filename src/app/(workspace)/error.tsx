"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Workspace request failed", error); }, [error]);
  return <div className="page"><div className="card empty" role="alert"><div className="empty-icon"><CircleAlert size={26}/></div><h3>Something couldn’t be completed</h3><p>Please try again. If you were sending an email, check the conversation before resending.</p><Button onClick={reset}><RotateCcw size={15}/>Try again</Button></div></div>;
}
