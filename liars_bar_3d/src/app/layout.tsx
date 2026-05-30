import type { Metadata } from "next";
import { Outfit, Cinzel } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Coup: Liar's Tavern Edition (3D)",
  description: "Immersive 3D multiplayer frontend for Coup variant card game, heavily inspired by the moody atmosphere and first-person mechanics of Liar's Bar.",
};

export default function RootLayout({
  children,
  }: Readonly<{
    children: React.ReactNode;
  }>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${outfit.variable} ${cinzel.variable} font-sans min-h-full bg-[#050308] text-[#f3effa] overflow-hidden antialiased flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
