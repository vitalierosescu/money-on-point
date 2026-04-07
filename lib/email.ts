import { NewsletterWelcomeEmail } from "@/components/emails/newsletter-welcome-email"
import { OTPEmail } from "@/components/emails/otp-email"
import React from "react"
import { Resend } from "resend"
import config from "./config"

export const resend = new Resend(config.email.apiKey)

export async function sendOTPCodeEmail({ email, otp }: { email: string; otp: string }) {
  const html = React.createElement(OTPEmail, { otp })

  return await resend.emails.send({
    from: config.email.from,
    to: email,
    subject: "Your TaxHacker verification code",
    react: html,
  })
}

export async function sendNewsletterWelcomeEmail(email: string) {
  const html = React.createElement(NewsletterWelcomeEmail)

  return await resend.emails.send({
    from: config.email.from,
    to: email,
    subject: "Welcome to TaxHacker Newsletter!",
    react: html,
  })
}

export async function sendInvoicePdfEmail(input: {
  to: string[]
  invoiceNumber: string
  businessName: string
  customerName?: string | null
  pdfFilename: string
  pdfContent: Buffer
  isCourtesyCopy?: boolean
}) {
  const subjectPrefix = input.isCourtesyCopy ? "Invoice copy" : "Invoice"
  const subject = `${subjectPrefix} ${input.invoiceNumber} from ${input.businessName}`
  const greetingName = input.customerName?.trim() || "there"
  const intro = input.isCourtesyCopy
    ? `A courtesy copy of invoice ${input.invoiceNumber} is attached as a PDF.`
    : `Invoice ${input.invoiceNumber} is attached as a PDF.`
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <p>Hello ${greetingName},</p>
      <p>${intro}</p>
      <p>Regards,<br />${input.businessName}</p>
    </div>
  `
  const text = `Hello ${greetingName},\n\n${intro}\n\nRegards,\n${input.businessName}`

  return await resend.emails.send({
    from: config.email.from,
    to: input.to,
    subject,
    html,
    text,
    attachments: [
      {
        filename: input.pdfFilename,
        content: input.pdfContent,
        contentType: "application/pdf",
      },
    ],
  })
}
