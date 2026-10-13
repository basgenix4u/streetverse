import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "STREETVERSE — Your Life. Your Hustle. Your City.",
  description: "Step into Lagos after dark. Run the streets, earn fictional naira and write your own story in STREETVERSE.",
  applicationName: "STREETVERSE",
};

export const viewport: Viewport = {
  themeColor: "#0c111b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG">
      <body>{children}</body>
    </html>
  );
}
