import type { Metadata, Viewport } from "next";
import { Archivo_Black, Manrope } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

// Tipografías de marca Kaizen: Manrope para el texto y Archivo Black para títulos.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-archivo-black", display: "swap" });

export const metadata: Metadata = { title: APP_NAME, description: "Chat con IA para clientes que llegan desde WhatsApp" };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#181615",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${archivoBlack.variable}`}>
      <body>{children}</body>
    </html>
  );
}
