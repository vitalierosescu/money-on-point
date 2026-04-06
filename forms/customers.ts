import { z } from "zod"

export const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  billingEmails: z.array(z.string().email()).optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  contactPerson: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  bus: z.string().optional(),
  zipCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  peppolId: z.string().optional(),
  invoiceDeliveryMethod: z.enum(["peppol", "email_pdf", "manual_choice"]).optional(),
  defaultRate: z.number().optional(),
  defaultCurrency: z.string().optional(),
  note: z.string().optional(),
})

export type CustomerFormData = z.infer<typeof customerSchema>
