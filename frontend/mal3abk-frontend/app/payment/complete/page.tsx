"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock, Calendar, MapPin, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";

interface BookingStatusData {
  booking: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    paymentStatus: string;
    checkInCode: string;
    court?: {
      name: string;
      nameEn?: string;
      address?: string;
    };
  };
  payment?: {
    status: string;
    amountCents: number;
    paymentMethod?: string;
  };
}

function PaymentCompleteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BookingStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Paymob redirect parameters
  const isPaymobSuccess = searchParams.get("success") === "true";
  const isPaymobPending = searchParams.get("pending") === "true";
  const bookingId = searchParams.get("booking_id") || searchParams.get("special_reference") || searchParams.get("merchant_order_id");

  useEffect(() => {
    async function fetchStatus() {
      if (!bookingId) {
        setLoading(false);
        return;
      }

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
        const res = await fetch(`${backendUrl}/api/v1/payments/status/${bookingId}`, {
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        } else {
          setError("Could not retrieve booking details.");
        }
      } catch (err) {
        console.error("Error fetching payment status:", err);
        setError("Network error while verifying payment status.");
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4 animate-bounce">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
        <h2 className="text-xl font-bold">Verifying Payment Status...</h2>
        <p className="text-slate-400 text-sm mt-1">Confirming transaction with Paymob gateway</p>
      </div>
    );
  }

  const isConfirmed = (data?.booking.status === "confirmed" && data?.booking.paymentStatus === "paid") || (isPaymobSuccess && !isPaymobPending);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        {/* Top Glow Background */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full blur-3xl opacity-30 ${
            isConfirmed ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />

        {isConfirmed ? (
          /* Success Screen */
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
              {data?.booking.court?.name && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-white">{data.booking.court.name}</span>
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

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push("/my-bookings")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 px-4 font-semibold text-slate-950 hover:bg-emerald-400 transition-all"
              >
                <span>View My Bookings</span>
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
                {error || "The transaction could not be completed. No charges were made."}
              </p>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <button
                onClick={() => router.push("/courts")}
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
