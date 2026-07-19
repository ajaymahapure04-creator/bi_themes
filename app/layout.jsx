import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata = {
  title: "BI Theme Studio — AI-assisted UI/UX for Power BI",
  description:
    "Design Power BI themes and page layouts visually: domain templates, brand palettes, AI-generated designs, and one-click theme.json export.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${grotesk.variable} ${jbmono.variable}`}>{children}</body>
    </html>
  );
}
