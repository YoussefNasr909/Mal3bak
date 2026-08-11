"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicTournamentPath: string;
  isArabic: boolean;
}

export function ShareDialog({
  open,
  onOpenChange,
  publicTournamentPath,
  isArabic,
}: ShareDialogProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrCodeError, setQrCodeError] = useState(false);

  useEffect(() => {
    if (!open) {
      setQrCodeUrl(null);
      setQrCodeError(false);
      return;
    }
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${publicTournamentPath}`;
    QRCode.toDataURL(url, { width: 192, margin: 1 })
      .then((dataUrl: string) => setQrCodeUrl(dataUrl))
      .catch(() => setQrCodeError(true));
  }, [open, publicTournamentPath]);

  const copyPublicLink = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${publicTournamentPath}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(isArabic ? "تم نسخ الرابط العام" : "Public link copied");
    } catch {
      toast.error(
        isArabic ? "تعذر نسخ الرابط العام" : "Unable to copy the public link",
      );
    }
  };

  const publicLink =
    typeof window !== "undefined"
      ? `${window.location.origin}${publicTournamentPath}`
      : publicTournamentPath;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isArabic ? "مشاركة البطولة" : "Share Tournament"}
          </DialogTitle>
          <DialogDescription>
            {isArabic
              ? "امسح رمز الاستجابة السريعة أو انسخ الرابط لمشاركته مع اللاعبين."
              : "Scan the QR code or copy the link to share with players."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {qrCodeUrl ? (
            <div className="rounded-lg bg-white p-4 shadow-sm border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeUrl}
                alt={isArabic ? "رمز QR للبطولة" : "Tournament QR Code"}
                className="h-48 w-48 object-contain"
              />
            </div>
          ) : qrCodeError ? (
            <div className="flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-lg bg-muted text-center">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isArabic ? "تعذر إنشاء رمز QR" : "QR code unavailable"}
              </p>
            </div>
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="w-full space-y-2">
            <Label>{isArabic ? "الرابط العام" : "Public Link"}</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={publicLink}
                className="bg-muted text-sm font-mono"
              />
              <Button variant="secondary" onClick={copyPublicLink}>
                <Link2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
