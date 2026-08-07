// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "@/app/globals.css";
import Navbar from "@/components/Navbar";
import HtmlAttributeGuard from "@/components/HtmlAttributeGuard";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// La tipografía de la UI del juego. Declaramos los dos cortes que tenemos para
// que los titulares pesados usen el Bold real en vez de uno simulado.
const markPro = localFont({
  src: [
    { path: "./fonts/MarkPro-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/MarkPro-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mark",
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
