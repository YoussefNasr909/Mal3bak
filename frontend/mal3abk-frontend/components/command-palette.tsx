"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Calendar,
  CreditCard,
  Settings,
  User,
  LogOut,
  Users,
  LayoutDashboard,
  MapPin,
  CheckCircle2,
  FileText,
  Moon,
  Sun,
  Languages,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { useTheme } from "next-themes"

export function CommandPalette() {
  const [mounted, setMounted] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { t, language, setLanguage } = useLanguage()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()


  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  const runLogout = React.useCallback(() => {
    setOpen(false)

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        void logout()
      })
      return
    }

    void logout()
  }, [logout])

  const adminCommands = [
    {
      icon: LayoutDashboard,
      label: language === "ar" ? "لوحة التحكم" : "Dashboard",
      shortcut: "⌘D",
      action: () => router.push("/dashboard/admin"),
    },
    {
      icon: Users,
      label: language === "ar" ? "إدارة المستخدمين" : "User Management",
      shortcut: "⌘U",
      action: () => router.push("/dashboard/admin/users"),
    },
  ]

  const managerCommands = [
    {
      icon: LayoutDashboard,
      label: language === "ar" ? "لوحة التحكم" : "Dashboard",
      shortcut: "⌘D",
      action: () => router.push("/dashboard/manager"),
    },
    {
      icon: MapPin,
      label: language === "ar" ? "إدارة الملاعب" : "Manage Courts",
      shortcut: "⌘C",
      action: () => router.push("/dashboard/manager/courts"),
    },
    {
      icon: Calendar,
      label: language === "ar" ? "الحجوزات" : "Bookings",
      shortcut: "⌘B",
      action: () => router.push("/dashboard/manager/bookings"),
    },
    {
      icon: CheckCircle2,
      label: language === "ar" ? "تسجيل الحضور" : "Check-in",
      shortcut: "⌘I",
      action: () => router.push("/dashboard/manager/check-in"),
    },

  ]

  const playerCommands = [
    {
      icon: LayoutDashboard,
      label: language === "ar" ? "لوحة التحكم" : "Dashboard",
      shortcut: "⌘D",
      action: () => router.push("/dashboard/player"),
    },
    {
      icon: MapPin,
      label: language === "ar" ? "تصفح الملاعب" : "Browse Courts",
      shortcut: "⌘C",
      action: () => router.push("/dashboard/player/browse"),
    },
    {
      icon: Calendar,
      label: language === "ar" ? "حجوزاتي" : "My Bookings",
      shortcut: "⌘B",
      action: () => router.push("/dashboard/player/bookings"),
    },

  ]

  if (!mounted) return null

  const getRoleCommands = () => {
    switch (user?.role) {
      case "admin":
        return adminCommands
      case "manager":
        return managerCommands
      case "player":
        return playerCommands
      default:
        return []
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={language === "ar" ? "اكتب أمرًا أو ابحث..." : "Type a command or search..."} />
      <CommandList>
        <CommandEmpty>{language === "ar" ? "لا توجد نتائج." : "No results found."}</CommandEmpty>

        {user && (
          <CommandGroup heading={language === "ar" ? "التنقل" : "Navigation"}>
            {getRoleCommands().map((cmd) => (
              <CommandItem key={cmd.label} onSelect={() => runCommand(cmd.action)}>
                <cmd.icon className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                <span>{cmd.label}</span>
                <CommandShortcut>{cmd.shortcut}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading={language === "ar" ? "المظهر" : "Appearance"}>
          <CommandItem onSelect={() => runCommand(() => setTheme(theme === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? (
              <Sun className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            ) : (
              <Moon className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            )}
            <span>
              {theme === "dark"
                ? language === "ar"
                  ? "الوضع الفاتح"
                  : "Light Mode"
                : language === "ar"
                  ? "الوضع الداكن"
                  : "Dark Mode"}
            </span>
            <CommandShortcut>⌘T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLanguage(language === "ar" ? "en" : "ar"))}>
            <Languages className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            <span>{language === "ar" ? "English" : "العربية"}</span>
            <CommandShortcut>⌘/</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={language === "ar" ? "الحساب" : "Account"}>
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/profile"))}>
            <Settings className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            <span>{language === "ar" ? "الملف الشخصي" : "Profile"}</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          {user ? (
            <CommandItem onSelect={runLogout}>
              <LogOut className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              <span>{language === "ar" ? "تسجيل الخروج" : "Logout"}</span>
              <CommandShortcut>⌘Q</CommandShortcut>
            </CommandItem>
          ) : (
            <CommandItem onSelect={() => runCommand(() => router.push("/auth/login"))}>
              <User className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              <span>{language === "ar" ? "تسجيل الدخول" : "Login"}</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
