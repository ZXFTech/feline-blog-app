import type { Metadata } from "next";
import "material-symbols/outlined.css";
import "../styles/index.scss";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Head from "next/head";
import { Toaster } from "@/components/ProMessage";
import AuthProviders from "@/providers/AuthProviders";
import { getCurrentUser } from "@/lib/auth/userAuth";

export const metadata: Metadata = {
  title: "neon cat",
  description: "道阻且长,行则将至。",
};

const routeList = ["home", "blog", "album", "contact", "todo"];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentUser();
  const initialUser = currentUser
    ? {
        id: currentUser.id,
        username: currentUser.username,
        email: currentUser.email,
        role: currentUser.role,
        avatar: currentUser.avatar,
      }
    : null;

  return (
    <html lang="zh-cn">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <body>
        <AuthProviders initialUser={initialUser}>
          <Navbar routeList={routeList} />
          {children}
          <Footer />
          <Toaster richColors visibleToasts={5} />
        </AuthProviders>
      </body>
    </html>
  );
}
