import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "../src/lib/ui-toaster";

export const metadata: Metadata = {
  title: "LedgerLite",
  description: "LedgerLite platform foundation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
