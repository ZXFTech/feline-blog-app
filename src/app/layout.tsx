import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "material-symbols/outlined.css";
import "../styles/index.scss";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Head from "next/head";
import { Toaster } from "@/components/ProMessage";
import AuthProviders from "@/providers/AuthProviders";
import { Ma_Shan_Zheng } from "next/font/google";
import classNames from "classnames";

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
  title: "行者",
  description: "道阻且长,行则将至。",
};

const routeList = ["home", "blog", "album", "contact", "todo"];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-cn" className={classNames(maShanZheng.variable)}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased neu-light body-content`}
      >
        <AuthProviders>
          <Navbar routeList={routeList} />
          <Toaster richColors visibleToasts={5} />
          {children}
          <Footer />
        </AuthProviders>
      </body>
    </html>
  );
}
