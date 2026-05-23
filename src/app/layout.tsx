import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "AlignMD — Precision Matching for Modern Healthcare",
    template: "%s · AlignMD",
  },
  description:
    "AlignMD is a two-sided healthcare staffing platform — clinicians matched to facility jobs by a credential-aware, rule-based match score.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
