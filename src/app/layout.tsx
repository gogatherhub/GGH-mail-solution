import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Welfog Mail",
  description: "Shared inbox and outreach workspace",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={geist.className}><TooltipProvider delayDuration={350}>{children}<Toaster position="bottom-right" closeButton richColors/></TooltipProvider></body>
    </html>
  );
}
