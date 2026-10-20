import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MaintAI - Industrielle Instandhaltung",
  description: "Offline-fähige CMMS & SAP PM Middleware",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="dark">
      <body className="antialiased bg-neutral-950 text-neutral-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
