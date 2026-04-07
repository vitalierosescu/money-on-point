import { addFieldAction, deleteFieldAction, editFieldAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { PageHeader } from "@/components/ui/page-header"
import { getCurrentUser } from "@/lib/auth"
import { getFields } from "@/models/fields"
import { Prisma } from "@/prisma/client"
import { formatFieldOptions } from "@/lib/fields"

export default async function FieldsSettingsPage() {
  const user = await getCurrentUser()
  const fields = await getFields(user.id)
  const fieldsWithActions = fields.map((field) => ({
    ...field,
    options: formatFieldOptions(field.options),
    isEditable: true,
    isDeletable: field.isExtra,
  }))

  return (
    <div className="container space-y-space-6">
      <PageHeader
        title="Custom Fields"
        description="You can add new fields to your transactions. Standard fields can't be removed but you can tweak their prompts or hide them. If you don't want a field to be analyzed by AI but filled in by hand, leave the LLM prompt empty."
        size="md"
      />
      <CrudTable
        items={fieldsWithActions}
        columns={[
          { key: "name", label: "Name", editable: true },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["string", "number", "boolean", "single_select"],
            defaultValue: "string",
            editable: true,
          },
          { key: "options", label: "Options (comma or line separated)", editable: true },
          { key: "llm_prompt", label: "LLM Prompt", editable: true },
          {
            key: "isVisibleInList",
            label: "Show in transactions table",
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
          {
            key: "isVisibleInAnalysis",
            label: "Show in analysis form",
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
          {
            key: "isRequired",
            label: "Is required",
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteFieldAction(user.id, code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addFieldAction(user.id, data as Prisma.FieldCreateInput)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editFieldAction(user.id, code, data as Prisma.FieldUpdateInput)
        }}
      />
    </div>
  )
}
