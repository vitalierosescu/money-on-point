"use server"

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { createElement, type ReactElement } from "react"
import { InvoiceFormData } from "./types"
import { InvoicePDF } from "./invoice-pdf"

export async function generateInvoicePDF(data: InvoiceFormData): Promise<Uint8Array> {
  const pdfElement = createElement(InvoicePDF, { data }) as unknown as ReactElement<DocumentProps>
  const buffer = await renderToBuffer(pdfElement)
  return new Uint8Array(buffer)
}
