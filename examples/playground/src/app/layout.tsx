import type { Metadata } from "next";
import localFont from "next/font/local";
import "@usewhisk/react/styles.css";
import "./globals.css";

const sans = localFont({
  src: "./fonts/Inter.woff2",
  weight: "400 700",
  variable: "--font-sans",
  display: "swap",
});

const display = localFont({
  src: "./fonts/FamiljenGrotesk.woff2",
  weight: "400 700",
  variable: "--font-display",
  display: "swap",
});

const mono = localFont({
  src: "./fonts/JetBrainsMono.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Whisk Playground",
  description:
    "Drive the Whisk widget through every config shape — testnet QA surface for sending and bridging USDC.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
