"use server"

import { getCurrentUser } from "@/lib/auth"
import { createCustomer, updateCustomer, deleteCustomer, CustomerData } from "@/models/customers"
import { revalidatePath } from "next/cache"

export async function createCustomerAction(data: CustomerData) {
  const user = await getCurrentUser()
  const customer = await createCustomer(user.id, data)
  revalidatePath("/customers")
  return { success: true, data: customer }
}

export async function updateCustomerAction(id: string, data: CustomerData) {
  const user = await getCurrentUser()
  const customer = await updateCustomer(id, user.id, data)
  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  return { success: true, data: customer }
}

export async function deleteCustomerAction(id: string) {
  const user = await getCurrentUser()
  await deleteCustomer(id, user.id)
  revalidatePath("/customers")
  return { success: true }
}
