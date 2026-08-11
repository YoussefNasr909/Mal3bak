"use client"

import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/components/providers/language-provider"

interface SessionExpiredDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionExpiredDialog({ open, onOpenChange }: SessionExpiredDialogProps) {
  const { t } = useLanguage()
  const router = useRouter()

  const handleLogin = () => {
    onOpenChange(false)
    router.push("/auth/login")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <DialogTitle className="text-center">{t("auth.sessionExpired")}</DialogTitle>
          <DialogDescription className="text-center">{t("auth.sessionExpiredDesc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button onClick={handleLogin}>{t("auth.login")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

