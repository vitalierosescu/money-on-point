import config from "@/lib/config"
import { getSession } from "@/lib/auth"
import { getUiLocale } from "@/lib/locale"
import { getSettings } from "@/models/settings"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import "./globals.css"

const geist = localFont({
  src: [
    {
      path: "../public/fonts/Inter/Inter-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter/Inter-Italic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter/Inter-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter/Inter-MediumItalic.otf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter/Inter-SemiBold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter/Inter-SemiBoldItalic.otf",
      weight: "600",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter/Inter-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter/Inter-BoldItalic.otf",
      weight: "700",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter/Inter-ExtraBold.otf",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter/Inter-ExtraBoldItalic.otf",
      weight: "800",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter/Inter-Black.otf",
      weight: "900",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter/Inter-BlackItalic.otf",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-geist",
})

export const metadata: Metadata = {
  title: {
    template: "%s | TaxHacker",
    default: config.app.title,
  },
  description: config.app.description,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  metadataBase: new URL(config.app.baseURL),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: config.app.baseURL,
    title: config.app.title,
    description: config.app.description,
    siteName: config.app.title,
  },
  twitter: {
    card: "summary_large_image",
    title: config.app.title,
    description: config.app.description,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const settings = session?.user?.id ? await getSettings(session.user.id) : null
  const locale = getUiLocale(settings)

  return (
    <html lang={locale}>
      <body
        className={`${geist.variable} min-h-screen bg-background antialiased`}
        style={{
          "--font-geist-mono":
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
        } as React.CSSProperties}
      >
        {children}
      </body>
    </html>
  )
}
