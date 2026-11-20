import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./styles.generated.css"; // compiled from globals.css by scripts/tw-build.mjs
import { AppShell } from "@/components/AppShell";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Saans | Know the air before you breathe it",
  description:
    "Live AQI from ground stations, an interactive pollution map, forecasts, an ML model, health guidance and a personal breath budget.",
};

export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
