import { SideNav } from "@/components/settings/side-nav"
import { PageHeader } from "@/components/ui/page-header"
import { Separator } from "@/components/ui/separator"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Settings",
  description: "Customize your settings here",
}

const settingsCategories = [
  {
    title: "General",
    href: "/settings",
  },
  {
    title: "Profile & Plan",
    href: "/settings/profile",
  },
  {
    title: "Business Details",
    href: "/settings/business",
  },
  {
    title: "Integrations",
    href: "/settings/integrations",
  },
  {
    title: "LLM settings",
    href: "/settings/llm",
  },
  {
    title: "Fields",
    href: "/settings/fields",
  },
  {
    title: "Categories",
    href: "/settings/categories",
  },
  {
    title: "Projects",
    href: "/settings/projects",
  },
  {
    title: "Currencies",
    href: "/settings/currencies",
  },
  {
    title: "Backups",
    href: "/settings/backups",
  },
  {
    title: "Danger Zone",
    href: "/settings/danger",
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="space-y-space-6 p-space-10 pb-space-16">
        <PageHeader title="Settings" description="Customize your settings here" size="md" />
        <Separator className="my-space-6" />
        <div className="flex flex-col gap-space-8 lg:flex-row lg:gap-space-12">
          <aside className="-mx-4 lg:w-1/5">
            <SideNav items={settingsCategories} />
          </aside>
          <div className="flex w-full">{children}</div>
        </div>
      </div>
    </>
  )
}
