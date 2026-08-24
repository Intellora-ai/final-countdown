import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Practice",
  description: "Your syllabus as a map.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The map fills the viewport and manages its own overflow; a scrolling
          body behind it would fight the pan gesture at the edges. */}
      <body className="h-dvh overflow-hidden bg-void text-ink">{children}</body>
    </html>
  );
}
