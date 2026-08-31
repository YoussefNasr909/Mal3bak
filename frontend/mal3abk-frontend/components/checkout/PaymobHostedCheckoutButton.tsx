"use client";

import React, { useState } from "react";
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { getPaymobCheckoutUrl, formatAmountEGP } from "@/lib/paymob";

interface PaymobHostedCheckoutButtonProps {
  clientSecret: string;
  checkoutUrl?: string;
  amountCents: number;
  courtName: string;
  bookingDate: string;
  timeSlot: string;
  className?: string;
}

export function PaymobHostedCheckoutButton({
  clientSecret,
  checkoutUrl,
  amountCents,
  courtName,
  bookingDate,
  timeSlot,
  className = "",
}: PaymobHostedCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const finalCheckoutUrl = checkoutUrl || getPaymobCheckoutUrl(clientSecret);

  const handleRedirectToPaymob = () => {
    if (!finalCheckoutUrl) {
      console.error("Paymob checkout URL is missing.");
      alert("Payment checkout is currently unavailable. Please try again later.");
      return;
    }
    setLoading(true);
    // Direct browser redirection to Paymob Unified Hosted Checkout
    window.location.href = finalCheckoutUrl;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <button
        onClick={handleRedirectToPaymob}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-3.5 px-5 font-semibold text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Redirecting to Paymob Hosted Checkout...</span>
          </>
        ) : (
          <>
            <CreditCard className="h-5 w-5" />
            <span>Pay {formatAmountEGP(amountCents)} with Paymob</span>
            <ExternalLink className="h-4 w-4 ml-1 opacity-80" />
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span>Unified Paymob Hosted Checkout (Cards, Wallets, BNPL)</span>
      </div>
    </div>
  );
}
