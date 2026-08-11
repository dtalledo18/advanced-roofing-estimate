import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {GoogleMapsProvider} from "@/shared/providers/GoogleMapsProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Advanced Roofing - Sales Estimator Platform",
  description: "Internal roof estimation tool for Advanced Roofing sales agents.",
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="en">
      <body className="antialiased bg-gray-100 text-gray-900 min-h-screen">
      <GoogleMapsProvider>
        {children}
      </GoogleMapsProvider>
      </body>
      </html>
  );
}
