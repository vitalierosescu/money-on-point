"use server"

import { prisma } from "@/lib/db"
import { File, Prisma } from "@/prisma/client"
import { unlink } from "fs/promises"
import path from "path"
import { unstable_cache } from "next/cache"
import { cache } from "react"
import { getTransactionById } from "./transactions"

export type FileRelatedRecord = {
  kind: "expense" | "invoice" | "income"
  id: string
  href: string
  title: string
  subtitle?: string | null
  status?: string | null
}

export type FileLibraryItem = File & {
  relatedRecords: FileRelatedRecord[]
  isUnsorted: boolean
}

export const getUnsortedFiles = cache(async (userId: string) => {
  return await prisma.file.findMany({
    where: {
      isReviewed: false,
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  })
})

const getUnsortedFilesCountCached = (userId: string) =>
  unstable_cache(
    async () =>
      prisma.file.count({
        where: {
          isReviewed: false,
          userId,
        },
      }),
    ["unsorted-files-count", userId],
    {
      revalidate: 30,
      tags: [`unsorted:${userId}`],
    }
  )()

export const getUnsortedFilesCount = cache(async (userId: string) => {
  return await getUnsortedFilesCountCached(userId)
})

export const getFileById = cache(async (id: string, userId: string) => {
  return await prisma.file.findFirst({
    where: { id, userId },
  })
})

export const getFilesLibrary = cache(async (userId: string): Promise<FileLibraryItem[]> => {
  const [files, transactions] = await Promise.all([
    prisma.file.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: {
        customer: true,
        invoice: {
          include: {
            customer: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const relatedRecordsByFileId = new Map<string, FileRelatedRecord[]>()

  for (const transaction of transactions) {
    const fileIds = Array.isArray(transaction.files) ? (transaction.files as string[]) : []
    if (fileIds.length === 0) continue

    const relatedRecord: FileRelatedRecord =
      transaction.invoice
        ? {
            kind: "invoice",
            id: transaction.invoice.id,
            href: `/invoices/${transaction.invoice.id}`,
            title: transaction.invoice.invoiceNumber,
            subtitle: transaction.invoice.customer?.name ?? transaction.customer?.name ?? null,
            status: transaction.invoice.status,
          }
        : transaction.type === "expense"
          ? {
              kind: "expense",
              id: transaction.id,
              href: `/expenses/${transaction.id}`,
              title: transaction.merchant ?? transaction.name ?? "Expense",
              subtitle: transaction.categoryCode ?? null,
              status: transaction.status,
            }
          : {
              kind: "income",
              id: transaction.id,
              href: "/invoices",
              title: transaction.name ?? "Income transaction",
              subtitle: transaction.customer?.name ?? null,
              status: transaction.status,
            }

    for (const fileId of fileIds) {
      const current = relatedRecordsByFileId.get(fileId) ?? []
      current.push(relatedRecord)
      relatedRecordsByFileId.set(fileId, current)
    }
  }

  return files.map((file) => ({
    ...file,
    isUnsorted: !file.isReviewed,
    relatedRecords: relatedRecordsByFileId.get(file.id) ?? [],
  }))
})

export const getFilesByTransactionId = cache(async (id: string, userId: string) => {
  const transaction = await getTransactionById(id, userId)
  if (transaction && transaction.files) {
    return await prisma.file.findMany({
      where: {
        id: {
          in: transaction.files as string[],
        },
        userId,
      },
      orderBy: {
        createdAt: "asc",
      },
    })
  }
  return []
})

export const createFile = async (userId: string, data: Omit<Prisma.FileUncheckedCreateInput, "userId">) => {
  return await prisma.file.create({
    data: {
      ...data,
      userId,
    },
  })
}

export const updateFile = async (id: string, userId: string, data: Prisma.FileUncheckedUpdateInput) => {
  return await prisma.file.update({
    where: { id, userId },
    data,
  })
}

export const deleteFile = async (id: string, userId: string) => {
  const file = await getFileById(id, userId)
  if (!file) {
    return
  }

  try {
    await unlink(path.resolve(path.normalize(file.path)))
  } catch (error) {
    console.error("Error deleting file:", error)
  }

  return await prisma.file.delete({
    where: { id, userId },
  })
}
