import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foreman",
  description: "Foreman job queue monitor dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}