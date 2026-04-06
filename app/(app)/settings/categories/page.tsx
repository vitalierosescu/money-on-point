import { addCategoryAction, deleteCategoryAction, editCategoryAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { PageHeader } from "@/components/ui/page-header"
import { getCurrentUser } from "@/lib/auth"
import { randomHexColor } from "@/lib/utils"
import { getCategories } from "@/models/categories"
import { Prisma } from "@/prisma/client"

export default async function CategoriesSettingsPage() {
  const user = await getCurrentUser()
  const categories = await getCategories(user.id)
  const categoriesWithActions = categories.map((category) => ({
    ...category,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container space-y-space-6">
      <PageHeader
        title="Categories"
        description="Create your own categories that better reflect the type of income and expenses you have. Define an LLM Prompt so that AI can determine this category automatically."
        size="md"
      />

      <CrudTable
        items={categoriesWithActions}
        columns={[
          { key: "name", label: "Name", editable: true },
          { key: "llm_prompt", label: "LLM Prompt", editable: true },
          { key: "color", label: "Color", type: "color", defaultValue: randomHexColor(), editable: true },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteCategoryAction(user.id, code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addCategoryAction(user.id, data as Prisma.CategoryCreateInput)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editCategoryAction(user.id, code, data as Prisma.CategoryUpdateInput)
        }}
      />
    </div>
  )
}
