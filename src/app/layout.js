// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "@/app/globals.css";
import Navbar from "@/components/Navbar";
import HtmlAttributeGuard from "@/components/HtmlAttributeGuard";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// La tipografía de la UI del juego. Sólo tenemos el corte Bold, así que se
// declara como 700: pedirle otro peso haría que el navegador lo simule.
const markPro = localFont({
  src: "./fonts/MarkPro-Medium.woff2",
  variable: "--font-mark",
  weight: "400",
  style: "normal",
  display: "swap",
});

export const metadata = {
  title: "Valorant Esports",
  description: "Matches, Teams, Tournaments",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${markPro.variable} antialiased valorant-bg text-white`}>
        <HtmlAttributeGuard />
        <Navbar />
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
