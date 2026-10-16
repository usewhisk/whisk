import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Whisk Console",
    template: "%s · Whisk Console",
  },
  description:
    "Create projects, manage API keys, and monitor usage for the Whisk USDC widget.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
