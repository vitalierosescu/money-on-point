import { getCurrentUser } from "@/lib/auth"
import { fileExists, fullPathForFile } from "@/lib/files"
import { codeFromName } from "@/lib/utils"
import { prisma } from "@/lib/db"
import JSZip from "jszip"
import fs from "fs/promises"
import path from "path"

function getMonthFolderName(value: Date | string | null | undefined) {
  const date = value ? new Date(value) : new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}/${month}`
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  const url = new URL(request.url)
  const ids = Array.from(new Set(url.searchParams.getAll("ids").filter(Boolean)))

  if (ids.length === 0) {
    return new Response("No expense ids provided", { status: 400 })
  }

  const expenses = await prisma.transaction.findMany({
    where: {
      id: { in: ids },
      userId: user.id,
      type: "expense",
    },
    orderBy: { issuedAt: "desc" },
  })

  const fileIds = Array.from(
    new Set(
      expenses.flatMap((expense) => (Array.isArray(expense.files) ? (expense.files as string[]) : []))
    )
  )

  if (fileIds.length === 0) {
    return new Response("No files attached to the selected expenses", { status: 400 })
  }

  const files = await prisma.file.findMany({
    where: {
      id: { in: fileIds },
      userId: user.id,
    },
  })

  const filesById = new Map(files.map((file) => [file.id, file]))
  const zip = new JSZip()

  for (const expense of expenses) {
    const folder = getMonthFolderName(expense.issuedAt ?? expense.createdAt)
    const expenseLabel = codeFromName(expense.merchant ?? expense.name ?? expense.id, 40) || expense.id.slice(0, 8)
    const expenseFileIds = Array.isArray(expense.files) ? (expense.files as string[]) : []

    for (const fileId of expenseFileIds) {
      const file = filesById.get(fileId)
      if (!file) continue

      const fullPath = fullPathForFile(user, file)
      if (!(await fileExists(fullPath))) continue

      const fileBuffer = await fs.readFile(fullPath)
      const storedName = path.basename(file.filename)
      zip.file(`${folder}/${expenseLabel}/${storedName}`, fileBuffer)
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  const archiveName = `expenses-files-${new Date().toISOString().slice(0, 10)}.zip`

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archiveName}"`,
      "X-Archive-Name": archiveName,
    },
  })
}
