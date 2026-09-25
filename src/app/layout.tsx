import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP-WMS",
  description: "Skladište, prodaja, najam i servis uređaja",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const tema = (await cookies()).get("tema")?.value;
  return (
    <html lang="hr" className="h-full antialiased" data-tema={tema === "tamna" || tema === "svijetla" ? tema : undefined} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
