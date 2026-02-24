import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PasteBin — Share code & text instantly",
  description: "A simple, fast pastebin. Create a paste and share it with anyone.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geistMono.variable} font-mono antialiased min-h-full bg-gray-950 text-gray-100`}>
        <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-xl">📋</span>
              <span className="text-lg font-bold text-white tracking-tight">PasteBin</span>
            </a>
            <span className="text-gray-600 text-sm ml-auto">share code & text instantly</span>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-800 mt-16">
          <div className="max-w-4xl mx-auto px-4 py-4 text-center text-gray-600 text-xs">
            Built with Next.js · Deployed on Vercel
          </div>
        </footer>
      </body>
    </html>
  );
}
