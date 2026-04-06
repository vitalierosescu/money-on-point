import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { getCurrentUser } from "@/lib/auth"
import { resetFieldsAndCategories, resetLLMSettings } from "./actions"

export default async function DangerSettingsPage() {
  const user = await getCurrentUser()

  return (
    <div className="container space-y-space-8">
      <PageHeader
        title="The Danger Zone"
        description="The settings here will overwrite your existing fields, categories and prompts. Use them only if something is broken."
        size="md"
      />

      <Section
        title="LLM settings"
        description="This will reset the system prompt and other LLM settings to their default values."
      >
        <form
          action={async () => {
            "use server"
            await resetLLMSettings(user)
          }}
        >
          <Button variant="destructive" type="submit">
            Reset main LLM prompt
          </Button>
        </form>
      </Section>

      <Section
        title="Fields, currencies and categories"
        description="This will reset all fields, currencies and categories to their default values."
      >
        <form
          action={async () => {
            "use server"
            await resetFieldsAndCategories(user)
          }}
        >
          <Button variant="destructive" type="submit">
            Reset fields, currencies and categories
          </Button>
        </form>
      </Section>
    </div>
  )
}
