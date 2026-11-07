import type { Metadata } from "next";
import "material-symbols/outlined.css";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Head from "next/head";
import { Toaster } from "@/components/ProMessage";
import AuthProviders from "@/providers/AuthProviders";
import { resolveAccountUser } from "@/lib/auth/userAuth";
import { PomodoroProvider } from "@/providers/PomodoroProvider";
import { ThemeProvider, ThemeScript } from "@/components/theme-provider";
import { headers } from "next/headers";
import { BlogReadingNavigation } from "@/lib/blog/navigation";
import { getSdkConfiguration } from "@/lib/auth/sdk/config";
import { assertBusinessReady } from "@/lib/auth/sdk/business";
import { redirect } from "next/navigation";
import { validateReturnTo } from "@user-center/next-better-auth/public";

export const metadata: Metadata = {
  title: "neon cat",
  description: "道阻且长,行则将至。",
};

const publicRoutes = ["home", "blog", "album", "contact", "todo"];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get("x-feline-pathname");
  const account = pathname === "/album" ? null : await resolveAccountUser();
  const currentUser = account?.status === "success" ? account.data : null;
  let publicConfig = null;
  let initialUnavailable = account?.status === "temporary_failure";
  try {
    publicConfig = getSdkConfiguration().publicConfig;
  } catch {
    initialUnavailable = pathname !== "/album";
  }
  const accountSurface =
    pathname === "/album" ||
    pathname === "/maintenance" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/profile" ||
    pathname?.startsWith("/auth/");
  let businessReady = true;
  if (!accountSurface) {
    try {
      await assertBusinessReady();
    } catch {
      businessReady = false;
    }
  }
  if (businessReady && !accountSurface && account?.status === "forbidden") {
    let target = "/profile";
    try {
      target = validateReturnTo(pathname ?? undefined, getSdkConfiguration().manifest);
    } catch {
      /* Keep the configured safe account destination. */
    }
    redirect(`/auth/setup?returnTo=${encodeURIComponent(target)}`);
  }
  const routeList = currentUser ? [...publicRoutes, "checklists"] : publicRoutes;
  const initialUser = currentUser
    ? {
        id: currentUser.id,
        username: currentUser.username,
        email: currentUser.email,
        role: currentUser.role,
        avatar: currentUser.avatar,
        authMode: currentUser.authMode,
      }
    : null;

  return (
    <html lang="zh-cn" suppressHydrationWarning>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <body>
        <BlogReadingNavigation />
        <ThemeScript />
        <ThemeProvider>
          <AuthProviders
            initialUser={initialUser}
            publicConfig={publicConfig}
            initialUnavailable={initialUnavailable}
          >
            <PomodoroProvider>
              <Navbar routeList={routeList} />
              {businessReady ? (
                children
              ) : (
                <main className="p-[var(--spacing-panel-inset-default)]">
                  <h1>业务维护中</h1>
                  <p role="status">暂时无法访问业务内容，请稍后重试。</p>
                  <a href="/profile">检查账号状态</a>
                </main>
              )}
              <Footer />
              <Toaster richColors visibleToasts={5} />
            </PomodoroProvider>
          </AuthProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
