"use client";

import React, { useState } from "react";
import { Smartphone, ArrowRight, Loader2, ShieldCheck, AlertCircle, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { formatAmountEGP } from "@/lib/paymob";
import { cn } from "@/lib/utils";

interface PaymobWalletCheckoutProps {
  bookingId: string;
  amountCents: number;
  courtName?: string;
  onInitiateSuccess?: (redirectUrl: string) => void;
  className?: string;
}

export function PaymobWalletCheckout({
  bookingId,
  amountCents,
  courtName,
  onInitiateSuccess,
  className = "",
}: PaymobWalletCheckoutProps) {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const tr = (ar: string, en: string) => (isAr ? ar : en);

  const [walletNumber, setWalletNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validateEgyptianNumber = (num: string) => {
    const cleaned = num.trim().replace(/\s+/g, "").replace(/^\+20/, "0").replace(/^20/, "0");
    return /^01[0125]\d{8}$/.test(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanedNumber = walletNumber.trim().replace(/\s+/g, "").replace(/^\+20/, "0").replace(/^20/, "0");
    if (!validateEgyptianNumber(cleanedNumber)) {
      setError(
        tr(
          "يرجى إدخال رقم محفظة إلكترونية مصري صحيح (مثال: 01012345678)",
          "Please enter a valid Egyptian mobile wallet number (e.g. 01012345678)"
        )
      );
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/v1/payments/wallet/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          walletNumber: cleanedNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || tr("فشل بدء عملية الدفع عبر المحفظة", "Failed to initiate mobile wallet payment."));
      }

      if (data.data?.redirectUrl) {
        if (onInitiateSuccess) {
          onInitiateSuccess(data.data.redirectUrl);
        } else {
          window.location.href = data.data.redirectUrl;
        }
      }
    } catch (err: any) {
      setError(err.message || tr("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.", "An unexpected error occurred. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-orange-500/20 bg-gradient-to-b from-orange-500/5 to-amber-500/10 p-5 backdrop-blur-md dark:border-orange-500/30",
        className
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-foreground text-sm">
              {tr("محفظة إلكترونية (فودافون كاش، أورنج، اتصالات، وي، ميزة)", "Mobile Wallet (Vodafone, Orange, Etisalat, WE, Meeza)")}
            </h3>
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {tr("ادفع مباشرة من رصيد محفظتك عبر رقم هاتفك", "Pay directly using your mobile wallet balance")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            {tr("رقم هاتف المحفظة الإلكترونية", "Wallet Mobile Number")}
          </label>
          <div className="relative">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="01012345678"
              value={walletNumber}
              onChange={(e) => {
                setWalletNumber(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl bg-background/90 border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-mono tracking-wider"
              dir="ltr"
            />
            <span className="absolute right-3 top-3 text-xs text-muted-foreground font-mono font-medium">
              EG (+20)
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !walletNumber}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 py-3.5 px-5 font-bold text-white shadow-lg shadow-orange-500/20 hover:from-orange-600 hover:to-amber-700 transition-all disabled:opacity-50 text-sm cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{tr("جارٍ الاتصال ببوابة المحفظة...", "Connecting to Wallet Gateway...")}</span>
            </>
          ) : (
            <>
              <span>
                {tr(
                  `دفع ${formatAmountEGP(amountCents)} عبر المحفظة`,
                  `Pay ${formatAmountEGP(amountCents)} via Wallet`
                )}
              </span>
              <ArrowRight className={cn("h-4 w-4", isAr && "rotate-180")} />
            </>
          )}
        </button>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
          <ShieldCheck className="h-4 w-4 text-orange-500 shrink-0" />
          <span>
            {tr(
              "سيتم توجيهك لصفحة تأكيد الرقم السري OTP لإتمام العملية بأمان",
              "You will be redirected to confirm your wallet OTP/PIN securely"
            )}
          </span>
        </div>
      </form>
    </div>
  );
}
