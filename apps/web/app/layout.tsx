import "./globals.css";
import { cookies } from "next/headers";
import IntlProviderWrapper from "@/components/Providers/IntlProviderWrapper";
import SWRProvider from "@/components/Providers/SWRProvider";
import { ToastProvider, ToastInput } from "@/components/Providers/ToastProvider";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerReset } from "@/components/Layout/ServiceWorkerReset";
import { TurnstileScript } from "@/components/Common/TurnstileScript";

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

        {/* iOS PWA Configuration */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={process.env.NEXT_PUBLIC_APP_NAME ?? "LeMedia"} />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* iOS Touch Icons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120.png" />

        {/* Favicons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="mask-icon" href="/icon-512-maskable.png" color="#000000" />

        {/* iOS Splash Screens - iPhone */}
        {/* iPhone 15 Pro Max, 14 Pro Max */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1290-2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 15 Pro, 14 Pro */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1179-2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 15 Plus, 14 Plus, 13 Pro Max, 12 Pro Max */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1284-2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 15, 14, 13, 13 Pro, 12, 12 Pro */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1170-2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 13 mini, 12 mini */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1125-2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 11 Pro Max, XS Max */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 11, XR */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-828-1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone SE 3rd gen, SE 2nd gen, 8, 7 */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-750-1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />

        {/* iOS Splash Screens - iPad */}
        {/* iPad Pro 12.9" */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-2048-2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad Pro 11" */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1668-2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad Air, iPad 10th gen */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1640-2360.png" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad mini */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1488-2266.png" media="(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
      </head>
      <body className="antialiased min-h-screen md:overflow-hidden">
        <TurnstileScript />
        <ThemeProvider attribute="class" defaultTheme="dark" storageKey="lemedia-theme" enableSystem>
          <IntlProviderWrapper>
            <ToastProvider initialToasts={initialToasts}>
              <SWRProvider>
                <ServiceWorkerReset />
                {children}
              </SWRProvider>
            </ToastProvider>
          </IntlProviderWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
