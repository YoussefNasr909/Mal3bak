"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  MapPin,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { apiFetch, cancelBooking } from "@/lib/api";

interface BookingStatusData {
  booking: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    paymentStatus: string;
    checkInCode: string;
    courtId?: string;
    court?: {
      name: string;
      nameEn?: string;
      address?: string;
      paymentPolicy?: string; // "full" | "percentage" | "fixed"
      allowOnlinePayment?: boolean;
    };
  };
  payment?: {
    status: string;
    amountCents: number;
    paymentMethod?: string;
  };
}

// The customer-facing outcome is derived ONLY from the HMAC-verified backend state — never from
// the redirect query params, which Paymob does not sign and anyone can forge.
type Phase = "verifying" | "confirmed" | "refunded" | "failed" | "pending";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20; // ~60s: enough for a slightly-late webhook / inquiry to settle

function derivePhase(data: BookingStatusData | null): Phase | null {
  if (!data?.booking) return null;
  const bStatus = data.booking.status;
  const pStatus = data.booking.paymentStatus || data.payment?.status;

  if (bStatus === "confirmed" && pStatus === "paid") return "confirmed";
  // Money captured but the slot could not be honored — being returned (or already returned).
  if (pStatus === "refunded" || pStatus === "refund_pending") return "refunded";
  if (bStatus === "cancelled" || pStatus === "failed") return "failed";
  return null; // still pending — keep polling
}

function PaymentCompleteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Strip the timestamp suffix we append to avoid Paymob duplicate order errors
  // (e.g. "uuid_1723641234567" -> "uuid").
  const rawBookingId =
    searchParams.get("booking_id") ||
    searchParams.get("special_reference") ||
    searchParams.get("merchant_order_id");
  const bookingId = rawBookingId ? rawBookingId.split("_")[0] : null;
  const txId = searchParams.get("id"); // Paymob transaction id in the redirect URL (for inquiry)

  const [data, setData] = useState<BookingStatusData | null>(null);
  const [phase, setPhase] = useState<Phase>("verifying");
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!bookingId) {
      setPhase("failed");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const txIdParam = txId ? `?transactionId=${encodeURIComponent(txId)}` : "";

    const refreshNotificationsOnce = () => {
      if (notifiedRef.current) return;
      notifiedRef.current = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("mal3bk:notifications:refresh"));
      }
    };

    async function poll() {
      attempts += 1;
      try {
        // This endpoint actively reconciles via Paymob's Inquiry API when the payment is still
        // pending, so repeated polling drives a stuck transaction to a terminal state.
        const result = await apiFetch<BookingStatusData>(`/payments/status/${bookingId}${txIdParam}`);
        if (cancelled) return;
        setData(result);

        // If Paymob explicitly told us the user cancelled or was declined via the redirect query string,
        // we can safely trust it (forging a failure only hurts the user) and abort the loop immediately.
        if (searchParams.get("success") === "false") {
          // Fire off a background cancel to ensure the slot is instantly freed, 
          // even if the backend webhook hasn't arrived or the inquiry still says "pending".
          cancelBooking(bookingId).catch(() => {});
          setPhase("failed");
          refreshNotificationsOnce();
          return;
        }

        const resolved = derivePhase(result);
        if (resolved) {
          setPhase(resolved);
          refreshNotificationsOnce();
          return;
        }
      } catch {
        // Transient error (network / 502 from inquiry) — fall through to retry until the cap.
        if (cancelled) return;
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        setPhase("pending");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [bookingId, txId]);

  if (phase === "verifying") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
        <h2 className="text-xl font-bold">Verifying payment with gateway…</h2>
        <p className="text-slate-400 text-sm mt-1 text-center max-w-sm">
          Confirming your transaction with Paymob. Please keep this page open — this only takes a moment.
        </p>
      </div>
    );
  }

  const court = data?.booking.court;
  const isConfirmed = phase === "confirmed";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        {/* Top Glow Background */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full blur-3xl opacity-30 ${
            isConfirmed ? "bg-emerald-500" : phase === "refunded" || phase === "pending" ? "bg-amber-500" : "bg-rose-500"
          }`}
        />

        {phase === "confirmed" ? (
          /* Success Screen — only reached when the backend reports confirmed + paid */
          <div className="relative text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Payment Confirmed
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Booking Successful!</h1>
              <p className="text-slate-400 text-sm mt-1">Your court reservation has been secured.</p>
            </div>

            {/* Check-In Code Card */}
            {data?.booking.checkInCode && (
              <div className="rounded-2xl bg-slate-800/80 p-4 border border-slate-700/60">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Check-In Code</span>
                <div className="text-3xl font-black text-emerald-400 tracking-widest mt-1">
                  {data.booking.checkInCode}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Present this code upon arrival at the court</p>
              </div>
            )}

            {/* Booking Details */}
            <div className="rounded-2xl bg-slate-950/60 p-4 text-left space-y-3 border border-slate-800">
              {court?.name && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-white">{court.name}</span>
                </div>
              )}
              {data?.booking.date && (
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Calendar className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Date: {data.booking.date}</span>
                </div>
              )}
              {data?.booking.startTime && (
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Clock className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Time: {data.booking.startTime} - {data.booking.endTime}</span>
                </div>
              )}
            </div>

            {/* Payment type notice */}
            {court?.paymentPolicy && court.paymentPolicy !== "full" && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-amber-300 text-sm font-medium text-left flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                <span>A deposit has been paid. Please pay the remaining balance directly at the court upon arrival.</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push("/dashboard/player/bookings")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 px-4 font-semibold text-slate-950 hover:bg-emerald-400 transition-all"
              >
                <span>View My Bookings</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : phase === "refunded" ? (
          /* Refund Screen — money was captured but the slot could not be honored */
          <div className="relative text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 border-2 border-amber-500/30 text-amber-400">
              <RotateCcw className="h-10 w-10" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Payment Refunded</h1>
              <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto">
                We couldn&apos;t confirm this slot in time and it was taken by another player, so your payment is being
                refunded to your original payment method. No action is needed on your part.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={() => router.push("/dashboard/player/browse")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 px-4 font-semibold text-slate-950 hover:bg-emerald-400 transition-all"
              >
                <span>Find Another Slot</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push("/dashboard/player/bookings")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 px-4 font-semibold text-white hover:bg-slate-700 transition-all border border-slate-700"
              >
                <span>View My Bookings</span>
              </button>
            </div>
          </div>
        ) : phase === "pending" ? (
          /* Still-pending Screen — verification timed out, not a hard failure */
          <div className="relative text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 border-2 border-amber-500/30 text-amber-400">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Still Confirming Your Payment</h1>
              <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto">
                Your payment is taking a little longer than usual to confirm. If money was debited, your booking will be
                secured automatically — you can check its status anytime under My Bookings.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={() => router.push("/dashboard/player/bookings")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 px-4 font-semibold text-slate-950 hover:bg-emerald-400 transition-all"
              >
                <span>Check My Bookings</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Failure Screen */
          <div className="relative text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/15 border-2 border-rose-500/30 text-rose-400">
              <XCircle className="h-10 w-10" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-white">Payment Unsuccessful</h1>
              <p className="text-slate-400 text-sm mt-1">
                The transaction could not be completed. No charge was captured.
              </p>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <button
                onClick={() => {
                  if (data?.booking?.courtId) {
                    router.push(`/dashboard/player/browse/${data.booking.courtId}`);
                  } else {
                    router.push("/dashboard/player/browse");
                  }
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 px-4 font-semibold text-white hover:bg-slate-700 transition-all border border-slate-700"
              >
                <span>Try Booking Again</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentCompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    }>
      <PaymentCompleteContent />
    </Suspense>
  );
}
