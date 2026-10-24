import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Footer, Header } from "@/components/Chrome";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const inter = localFont({ src: "./fonts/inter.woff2", variable: "--font-inter", display: "swap" });
const grotesk = localFont({ src: "./fonts/space-grotesk.woff2", variable: "--font-display", display: "swap" });
const mono = localFont({ src: "./fonts/ibm-plex-mono.woff2", variable: "--font-mono", weight: "400", display: "swap" });

const description = "Stay on top of your life with Axiom. Bring your plans, projects, reading, goals and everyday life into one connected workspace. Free, private and built around you.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Axiom — Your life. Back in command.", template: "%s · Axiom" },
  description,
  openGraph: { title: "Axiom — Your life. Back in command.", description, siteName: "Axiom", type: "website", images: [{ url: "/social-card.png", width: 1200, height: 630, alt: "Axiom — Your life. Back in command." }] },
  icons: { icon: "/mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0e0e0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${grotesk.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
