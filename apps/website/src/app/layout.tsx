import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rainier Raiders",
  description: "Rainier Raiders guild. Announcements and events.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
