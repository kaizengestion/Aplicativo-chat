import type { Metadata, Viewport } from "next";
import { Archivo_Black, Manrope } from "next/font/google";
import "./globals.css";

// Tipografías de marca Kaizen: Manrope para el texto y Archivo Black para títulos.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-archivo-black", display: "swap" });

export const metadata: Metadata = { title: "Chat de atención", description: "Chat con IA para clientes que llegan desde WhatsApp" };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#181615" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${archivoBlack.variable}`}>
      <body>{children}</body>
    </html>
  );
}
