import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "material-symbols/outlined.css";
import "../styles/index.scss";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Head from "next/head";
import { Toaster } from "@/components/ProMessage";
import AuthProviders from "@/providers/AuthProviders";
import { Ma_Shan_Zheng } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const maShanZheng = Ma_Shan_Zheng({
  variable: "--font-ma-shan-zheng",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "neon cat",
  description: "道阻且长,行则将至。",
};

const routeList = ["home", "blog", "album", "contact", "todo"];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-cn" className={cn(maShanZheng.variable, inter.variable)}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProviders>
          <Navbar routeList={routeList} />
          {children}
          <Footer />
          <Toaster richColors visibleToasts={5} />
        </AuthProviders>
      </body>
    </html>
  );
}
