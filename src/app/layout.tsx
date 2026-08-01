import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hosela Notion",
  description: "Ruang kerja digital internal Hosela",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
