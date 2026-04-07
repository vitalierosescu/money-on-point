import config from "@/lib/config"
import { getSession } from "@/lib/auth"
import { getUiLocale } from "@/lib/locale"
import { getSettings } from "@/models/settings"
import type { Metadata, Viewport } from "next"
import { JetBrains_Mono, Rethink_Sans } from "next/font/google"
import "./globals.css"

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-recommand",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
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
  themeColor: "#F7F5F2",
  width: "device-width",
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const settings = session?.user?.id ? await getSettings(session.user.id) : null
  const locale = getUiLocale(settings)

  return (
    <html lang={locale}>
      <body className={`${rethinkSans.variable} ${jetbrainsMono.variable} min-h-screen bg-background antialiased`}>
        {children}
      </body>
    </html>
  )
}
