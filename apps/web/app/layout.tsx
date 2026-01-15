import "./globals.css";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import IntlProviderWrapper from "@/components/Providers/IntlProviderWrapper";
import SWRProvider from "@/components/Providers/SWRProvider";
import { ToastProvider, ToastInput } from "@/components/Providers/ToastProvider";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import { ServiceWorkerReset } from "@/components/Layout/ServiceWorkerReset";

const inter = Inter({ subsets: ["latin"] });

// Removed force-dynamic to allow Next.js to optimize pages statically where possible
// Individual routes can still use dynamic rendering if needed
export const metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "LeMedia Request List",
  description: "LeMedia Request List (TMDB + Sonarr + Radarr)",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: process.env.NEXT_PUBLIC_APP_NAME ?? "LeMedia",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

const flashMessages: { [key: string]: string } = {
  "login-success": "You have logged in",
  "logged-out": "You have logged out",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const flash = cookieStore.get("lemedia_flash")?.value;
  const flashError = cookieStore.get("lemedia_flash_error")?.value;

  const initialToasts: ToastInput[] = [];
  if (flashError) {
    initialToasts.push({ type: "error", title: "Something went wrong", message: flashError, dedupeKey: `flash_error:${flashError}` });
  }
  if (flash) {
    const message = flashMessages[flash] ?? flash;
    initialToasts.push({ type: "success", message, dedupeKey: `flash:${flash}` });
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b1224" />
        <meta name="theme-color" content="#0b1224" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f1f5f9" media="(prefers-color-scheme: light)" />
        <meta name="color-scheme" content="dark light" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={process.env.NEXT_PUBLIC_APP_NAME ?? "LeMedia"} />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="mask-icon" href="/icon-512-maskable.png" color="#000000" />
      </head>
      <body className={cn(inter.className, "antialiased min-h-screen md:overflow-hidden")}>
        <ThemeProvider attribute="class" defaultTheme="dark" storageKey="lemedia-theme" enableSystem>
          <IntlProviderWrapper>
            <SWRProvider>
              <ToastProvider initialToasts={initialToasts}>
                <ServiceWorkerReset />
                {children}
              </ToastProvider>
            </SWRProvider>
          </IntlProviderWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
