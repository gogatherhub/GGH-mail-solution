import { WorkspaceFrame } from "@/components/shell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
