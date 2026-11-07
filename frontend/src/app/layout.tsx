import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Voice Lesson",
  description: "GreatUniHack 2026 MVP",
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
