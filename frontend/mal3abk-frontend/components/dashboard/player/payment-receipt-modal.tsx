"use client"

import React, { useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Booking } from "@/lib/types"
import { useLanguage } from "@/components/providers/language-provider"
import {
  CheckCircle2,
  Copy,
  Download,
  Printer,
  ShieldCheck,
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  Building2,
  Receipt,
  User,
  QrCode,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface PaymentReceiptModalProps {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PaymentReceiptModal({
  booking,
  open,
  onOpenChange,
}: PaymentReceiptModalProps) {
  const { language, direction } = useLanguage()
  const isRTL = direction === "rtl"
  const receiptRef = useRef<HTMLDivElement>(null)
  const [copiedCode, setCopiedCode] = React.useState(false)
  const [copiedSummary, setCopiedSummary] = React.useState(false)

  if (!booking) return null

  const isAr = language === "ar"
  const tr = (ar: string, en: string) => (isAr ? ar : en)

  const courtName = isAr ? booking.courtName : (booking.courtNameEn || booking.courtName)
  const courtAddress = isAr
    ? (booking.courtAddress || booking.courtCity || "")
    : (booking.courtAddressEn || booking.courtCityEn || booking.courtAddress || "")

  const totalAmount = Number(booking.totalPrice ?? booking.amount ?? 0)
  const paymentPolicy = booking.court?.paymentPolicy || "full"
  const depositValue = Number(booking.court?.depositValue || 0)

  // Calculate actual paid online amount vs remaining at venue
  const latestPayment = booking.payments?.find((payment) => payment.status === "paid")
    || (booking.latestPayment?.status === "paid" ? booking.latestPayment : null)
  let paidOnlineAmount = 0
  if (latestPayment?.amount) {
    paidOnlineAmount = Number(latestPayment.amount)
  } else if (booking.amount !== undefined && Number(booking.amount) > 0) {
    paidOnlineAmount = Number(booking.amount)
  } else if (paymentPolicy === "percentage" && depositValue > 0) {
    paidOnlineAmount = Math.round(((totalAmount * depositValue) / 100) * 100) / 100
  } else if (paymentPolicy === "fixed" && depositValue > 0) {
    paidOnlineAmount = Math.min(totalAmount, depositValue)
  } else {
    paidOnlineAmount = totalAmount
  }

  const remainingDueAtCourt = Math.max(0, Math.round((totalAmount - paidOnlineAmount) * 100) / 100)
  const isDeposit = paidOnlineAmount < totalAmount
  const transactionId = latestPayment?.paymobTransactionId || "N/A"
  const receiptNumber = `REC-${(booking.checkInCode || booking.id.slice(0, 8)).toUpperCase()}`
  const paymentDate = latestPayment?.createdAt
    ? new Date(latestPayment.createdAt).toLocaleString(isAr ? "ar-EG" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : new Date().toLocaleString(isAr ? "ar-EG" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })

  const handleCopyCode = async () => {
    if (!booking.checkInCode) return
    try {
      await navigator.clipboard.writeText(booking.checkInCode)
      setCopiedCode(true)
      toast.success(tr("تم نسخ كود الدخول", "Check-in code copied!"))
      setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      toast.error(tr("فشل نسخ الكود", "Failed to copy code"))
    }
  }

  const handleCopySummary = async () => {
    const summaryText = `
🧾 ${tr("إيصال حجز ملعبك الإلكتروني", "Mal3bk Official Booking Receipt")}
--------------------------------
🏟️ ${tr("الملعب", "Court")}: ${courtName}
📅 ${tr("التاريخ", "Date")}: ${booking.date}
⏰ ${tr("الوقت", "Time")}: ${booking.startTime} - ${booking.endTime}
🔑 ${tr("كود الدخول", "Check-In Code")}: ${booking.checkInCode || "---"}
💳 ${tr("المدفوع أونلاين (Paymob)", "Paid Online (Paymob)")}: ${paidOnlineAmount} EGP
${remainingDueAtCourt > 0 ? `💵 ${tr("المتبقي في الملعب", "Remaining Balance at Court")}: ${remainingDueAtCourt} EGP` : `✅ ${tr("تم دفع المبلغ كاملاً", "Fully Paid")}`}
🔢 ${tr("رقم المعاملة", "Tx ID")}: ${transactionId}
--------------------------------
${tr("شكراً لاستخدامك منصة ملعبك!", "Thank you for using Mal3bk!")}
`.trim()

    try {
      await navigator.clipboard.writeText(summaryText)
      setCopiedSummary(true)
      toast.success(tr("تم نسخ تفاصيل الإيصال", "Receipt details copied!"))
      setTimeout(() => setCopiedSummary(false), 2000)
    } catch {
      toast.error(tr("تعذر النسخ", "Failed to copy"))
    }
  }

  const handlePrint = () => {
    const printContent = receiptRef.current
    if (!printContent) return

    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      window.print()
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${isRTL ? "rtl" : "ltr"}" lang="${language}">
      <head>
        <title>${tr("إيصال دفع إلكتروني - ملعبك", "Payment Receipt - Mal3bk")}</title>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 24px;
            background: #fff;
            color: #111;
          }
          .receipt-container {
            max-width: 480px;
            margin: 0 auto;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            padding: 24px;
          }
          .header {
            text-align: center;
            border-bottom: 2px dashed #e5e7eb;
            padding-bottom: 16px;
            margin-bottom: 16px;
          }
          .logo {
            font-size: 24px;
            font-weight: 900;
            color: #10b981;
          }
          .badge {
            display: inline-block;
            background: #ecfdf5;
            color: #059669;
            font-weight: bold;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 12px;
            margin-top: 8px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 13px;
          }
          .label {
            color: #6b7280;
          }
          .value {
            font-weight: bold;
            color: #111827;
          }
          .divider {
            border-top: 1px dashed #e5e7eb;
            margin: 14px 0;
          }
          .code-box {
            background: #f3f4f6;
            border: 2px solid #e5e7eb;
            border-radius: 12px;
            padding: 12px;
            text-align: center;
            margin: 16px 0;
          }
          .code-text {
            font-family: monospace;
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 4px;
            color: #059669;
          }
          .footer {
            text-align: center;
            font-size: 11px;
            color: #9ca3af;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <div class="logo">MAL3BK ⚽ ملعبك</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${tr("إيصال دفع إلكتروني معتمد", "Official Electronic Receipt")}</div>
            <div class="badge">${tr("تم الدفع بنجاح عبر Paymob", "Paid Successfully via Paymob")}</div>
          </div>

          <div class="row">
            <span class="label">${tr("رقم الإيصال", "Receipt No.")}:</span>
            <span class="value">${receiptNumber}</span>
          </div>
          <div class="row">
            <span class="label">${tr("تاريخ المعاملة", "Payment Date")}:</span>
            <span class="value">${paymentDate}</span>
          </div>
          <div class="row">
            <span class="label">${tr("رقم المعاملة (Paymob)", "Tx ID")}:</span>
            <span class="value">${transactionId}</span>
          </div>

          <div class="divider"></div>

          <div class="row">
            <span class="label">${tr("الملعب", "Court")}:</span>
            <span class="value">${courtName}</span>
          </div>
          ${courtAddress ? `
          <div class="row">
            <span class="label">${tr("العنوان", "Address")}:</span>
            <span class="value">${courtAddress}</span>
          </div>` : ""}
          <div class="row">
            <span class="label">${tr("تاريخ المباراة", "Match Date")}:</span>
            <span class="value">${booking.date}</span>
          </div>
          <div class="row">
            <span class="label">${tr("وقت الحجز", "Time Slot")}:</span>
            <span class="value">${booking.startTime} - ${booking.endTime} (${booking.duration || 1} ${tr("ساعة", "hr")})</span>
          </div>

          <div class="divider"></div>

          <div class="row">
            <span class="label">${tr("إجمالي سعر الحجز", "Total Court Fee")}:</span>
            <span class="value">${totalAmount} EGP</span>
          </div>
          <div class="row" style="color: #059669; font-size: 14px;">
            <span class="label" style="color: #059669; font-weight: bold;">${tr("المدفوع أونلاين (Paymob)", "Amount Paid Online")}:</span>
            <span class="value" style="color: #059669; font-size: 16px;">${paidOnlineAmount} EGP</span>
          </div>
          ${remainingDueAtCourt > 0 ? `
          <div class="row" style="color: #d97706;">
            <span class="label" style="color: #d97706; font-weight: bold;">${tr("المتبقي في الملعب", "Remaining Due at Venue")}:</span>
            <span class="value" style="color: #d97706; font-weight: bold;">${remainingDueAtCourt} EGP</span>
          </div>` : ""}

          <div class="code-box">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${tr("كود الدخول المعتمد عند الوصول", "Official Check-In Code at Venue")}</div>
            <div class="code-text">${booking.checkInCode || "------"}</div>
          </div>

          <div class="footer">
            ${tr("تم إصدار هذا الإيصال إلكترونياً ولا يتطلب توقيعاً خطياً.", "This receipt was generated electronically and requires no physical signature.")}<br/>
            www.mal3bk.com
          </div>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 flex flex-col max-h-[90dvh] overflow-hidden border-border/80 shadow-2xl rounded-3xl bg-card">
        {/* Printable Receipt Paper Container */}
        <div ref={receiptRef} className="p-4 sm:p-6 space-y-4 sm:space-y-5 bg-card overflow-y-auto">
          {/* Receipt Header */}
          <div className="text-center space-y-2 pb-4 border-b border-dashed border-border">
            <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-bold tracking-wide">
                {tr("إيصال دفع إلكتروني معتمد", "Official Verified Receipt")}
              </span>
            </div>

            <DialogHeader className="pt-1">
              <DialogTitle className="text-xl font-black tracking-tight text-foreground flex items-center justify-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <span>MAL3BK</span>
                <span className="text-xs font-normal text-muted-foreground">| ملعبك</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {tr("بوابة الدفع الإلكتروني Paymob Egypt", "Paymob Egypt Payment Gateway")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-center gap-3 pt-1 text-[11px] text-muted-foreground font-mono">
              <span>{receiptNumber}</span>
              <span>•</span>
              <span>{paymentDate}</span>
            </div>
          </div>

          {/* Match & Venue Details */}
          <div className="space-y-2.5 rounded-2xl bg-muted/30 p-3.5 border border-border/50 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {tr("الملعب", "Venue / Court")}
              </span>
              <span className="font-bold text-foreground">{courtName}</span>
            </div>

            {courtAddress && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {tr("العنوان", "Location")}
                </span>
                <span className="font-medium text-foreground max-w-[200px] truncate text-end">
                  {courtAddress}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                {tr("تاريخ المباراة", "Match Date")}
              </span>
              <span className="font-bold text-foreground">{booking.date}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Clock className="h-3.5 w-3.5 text-primary" />
                {tr("الفترة الزمنية", "Time Slot")}
              </span>
              <span className="font-bold text-foreground">
                {booking.startTime} - {booking.endTime} ({booking.duration || 1} {tr("ساعة", "hr")})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <User className="h-3.5 w-3.5 text-primary" />
                {tr("اسم اللاعب", "Player Name")}
              </span>
              <span className="font-bold text-foreground">{booking.playerName || booking.userName || tr("لاعب", "Player")}</span>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-2.5 px-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{tr("إجمالي رسوم الحجز", "Total Court Fee")}</span>
              <span className="font-semibold text-foreground">{totalAmount} EGP</span>
            </div>

            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold">
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                {tr("المدفوع إلكترونياً (Paymob)", "Paid Online (Paymob)")}
              </span>
              <span className="text-sm font-black">{paidOnlineAmount} EGP</span>
            </div>

            {remainingDueAtCourt > 0 && (
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                <span>{tr("المتبقي للدفع في الملعب", "Remaining Due at Venue")}</span>
                <span className="text-sm font-black">{remainingDueAtCourt} EGP</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-dashed border-border/70 font-mono">
              <span>{tr("رقم عملية Paymob", "Paymob Tx ID")}</span>
              <span className="font-bold">{transactionId}</span>
            </div>
          </div>

          {/* Official Check-In Code Highlight Box */}
          <div className="rounded-2xl bg-gradient-to-b from-primary/10 to-primary/5 border-2 border-dashed border-primary/40 p-3 sm:p-4 text-center space-y-1.5">
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
              <QrCode className="h-3.5 w-3.5" />
              {tr("كود الدخول المعتمد عند الوصول", "Official Check-In Code")}
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-primary selection:bg-primary/20">
              {booking.checkInCode || "------"}
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              {copiedCode ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{copiedCode ? tr("تم النسخ!", "Copied!") : tr("نسخ الكود", "Copy Code")}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-muted/40 border-t border-border flex shrink-0 items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopySummary}
            className="flex-1 rounded-xl text-xs gap-1.5 border-border/80 hover:bg-background"
          >
            {copiedSummary ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedSummary ? tr("تم النسخ", "Copied") : tr("مشاركة الإيصال", "Share Summary")}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="flex-1 rounded-xl text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-sm"
          >
            <Printer className="h-3.5 w-3.5" />
            {tr("طباعة الإيصال", "Print / Save PDF")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
