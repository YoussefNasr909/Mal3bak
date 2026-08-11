export const PAYMOB_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYMOB_PUBLIC_KEY || "";
export const PAYMOB_BASE_URL = process.env.NEXT_PUBLIC_PAYMOB_BASE_URL || "https://accept.paymob.com";

/**
 * Returns the hosted Unified Checkout URL for redirection.
 */
export function getPaymobCheckoutUrl(clientSecret: string): string {
  const publicKey = PAYMOB_PUBLIC_KEY;
  return `${PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;
}

/**
 * Formats amount from cents to EGP display string.
 */
export function formatAmountEGP(amountCents: number): string {
  const egp = (amountCents / 100).toFixed(2);
  return `${egp} EGP`;
}
