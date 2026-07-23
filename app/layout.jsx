import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata = {
  title: "BI Theme Studio — guided Power BI report design",
  description:
    "Brand → Data → Layout → Validate → Order: a guided, client-ready path from a picked industry and company to a themed Power BI report package.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${grotesk.variable} ${jbmono.variable}`}>{children}</body>
    </html>
  );
}
