import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anderson's Swim Tracker",
  description: "Track every meet. See if you're getting faster. That's it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-ink antialiased">{children}</body>
    </html>
  );
}
