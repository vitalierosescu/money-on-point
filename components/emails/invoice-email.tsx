import React from "react"
import { EmailLayout } from "./email-layout"

interface InvoiceEmailProps {
  businessName: string
  invoiceNumber: string
  invoiceTotal: string
  currency: string
  dueDate: string
  bankDetails?: string
  notes?: string
}

export const InvoiceEmail: React.FC<InvoiceEmailProps> = ({
  businessName,
  invoiceNumber,
  invoiceTotal,
  currency,
  dueDate,
  bankDetails,
  notes,
}) => (
  <EmailLayout preview={`Factuur ${invoiceNumber} van ${businessName}`}>
    <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", color: "#111" }}>
      Factuur {invoiceNumber}
    </h2>
    <p style={{ marginBottom: "16px", color: "#374151" }}>
      Hierbij ontvangt u factuur <strong>{invoiceNumber}</strong> van{" "}
      <strong>{businessName}</strong>. De factuur is bijgevoegd als PDF.
    </p>
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
      <tbody>
        <tr>
          <td
            style={{
              padding: "10px 0",
              borderBottom: "1px solid #e5e7eb",
              color: "#6b7280",
              fontSize: "14px",
            }}
          >
            Bedrag
          </td>
          <td
            style={{
              padding: "10px 0",
              borderBottom: "1px solid #e5e7eb",
              textAlign: "right",
              fontFamily: "monospace",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {currency} {invoiceTotal}
          </td>
        </tr>
        <tr>
          <td style={{ padding: "10px 0", color: "#6b7280", fontSize: "14px" }}>
            Vervaldatum
          </td>
          <td
            style={{
              padding: "10px 0",
              textAlign: "right",
              fontFamily: "monospace",
              fontSize: "14px",
            }}
          >
            {dueDate}
          </td>
        </tr>
      </tbody>
    </table>
    {bankDetails && (
      <div
        style={{
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          padding: "14px",
          marginBottom: "16px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "#374151",
            whiteSpace: "pre-line",
            lineHeight: "1.6",
          }}
        >
          {bankDetails}
        </p>
      </div>
    )}
    {notes && (
      <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "16px", lineHeight: "1.6" }}>
        {notes}
      </p>
    )}
  </EmailLayout>
)
