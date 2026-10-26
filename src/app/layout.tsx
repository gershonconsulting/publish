export const runtime = 'edge';
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PRODUCT_NAME, PRODUCT_DESCRIPTION } from "@/lib/product";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} by Gershon.AI`,
  applicationName: `${PRODUCT_NAME} by Gershon.AI`,
  description: PRODUCT_DESCRIPTION,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
