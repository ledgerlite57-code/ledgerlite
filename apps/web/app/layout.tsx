import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { Toaster } from "../src/lib/ui-toaster";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "LedgerLite",
  description: "LedgerLite platform foundation",
};

const themeInitScript = `
(() => {
  try {
    const key = "ledgerlite-theme";
    const stored = localStorage.getItem(key);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "light" || stored === "dark" ? stored : (prefersDark ? "dark" : "light");
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-theme", theme);
  } catch {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexArabic.variable}`} suppressHydrationWarning>
      <body className="antialiased" data-density="comfortable">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
