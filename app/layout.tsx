import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Syne, Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NavWrapper } from "@/components/nav/NavWrapper";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pals — Social Network",
  description: "Social network for students",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pals",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4f8ef7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={cn("h-full", plusJakarta.variable, syne.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-dvh bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
        <ThemeProvider>
          <NavWrapper>{children}</NavWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
