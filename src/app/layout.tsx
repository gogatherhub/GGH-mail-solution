import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins=Poppins({subsets:["latin"],weight:["400","500","600","700","800"],display:"swap"});

export const metadata: Metadata = {
  title: "Welfog Mail",
  description: "Shared inbox and outreach workspace",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={poppins.className}>{children}</body>
    </html>
  );
}
