import * as z from "zod"

export type PasswordLang = "ar" | "en"

export const PASSWORD_MIN_LENGTH = 8

export const passwordStrengthColors = [
  "bg-muted",         // 0
  "bg-destructive",   // 1
  "bg-orange-500",    // 2
  "bg-amber-500",     // 3
  "bg-emerald-500",   // 4
]

export const passwordStrengthLabels = {
  ar: ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"],
  en: ["Very Weak", "Weak", "Fair", "Good", "Strong"],
} as const

export function getPasswordValidationMessages(lang: PasswordLang) {
  return lang === "ar"
    ? {
        passwordMin: `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`,
        confirmMismatch: "كلمات المرور غير متطابقة",
        minLengthLabel: `${PASSWORD_MIN_LENGTH} أحرف على الأقل`,
        uppercaseLabel: "حرف كبير واحد",
        lowercaseLabel: "حرف صغير واحد",
        numberLabel: "رقم واحد",
      }
    : {
        passwordMin: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        confirmMismatch: "Passwords do not match",
        minLengthLabel: `At least ${PASSWORD_MIN_LENGTH} characters`,
        uppercaseLabel: "One uppercase letter",
        lowercaseLabel: "One lowercase letter",
        numberLabel: "One number",
      }
}

export function buildPasswordSchema(lang: PasswordLang) {
  const msgs = getPasswordValidationMessages(lang)

  return z
    .string()
    .min(PASSWORD_MIN_LENGTH, msgs.passwordMin)
    .refine((password) => /[A-Z]/.test(password), msgs.uppercaseLabel)
    .refine((password) => /[a-z]/.test(password), msgs.lowercaseLabel)
    .refine((password) => /[0-9]/.test(password), msgs.numberLabel)
}

export function getPasswordStrength(password: string) {
  let strength = 0

  if (password.length >= PASSWORD_MIN_LENGTH) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/[a-z]/.test(password)) strength++
  if (/[0-9]/.test(password)) strength++

  return strength
}

export function getPasswordRequirements(password: string, lang: PasswordLang) {
  const msgs = getPasswordValidationMessages(lang)

  return [
    {
      met: password.length >= PASSWORD_MIN_LENGTH,
      label: msgs.minLengthLabel,
    },
    {
      met: /[A-Z]/.test(password),
      label: msgs.uppercaseLabel,
    },
    {
      met: /[a-z]/.test(password),
      label: msgs.lowercaseLabel,
    },
    {
      met: /[0-9]/.test(password),
      label: msgs.numberLabel,
    },
  ]
}
