import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "License Manager", template: "%s · License Manager" },
  description: "Software inventory, renewal monitoring, and license cost management.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
