import { describe, expect, it } from "vitest"
import {
  PASSWORD_MIN_LENGTH,
  buildPasswordSchema,
  getPasswordRequirements,
  getPasswordStrength,
  getPasswordValidationMessages,
  passwordStrengthColors,
  passwordStrengthLabels,
} from "@/lib/password-validation"

describe("password-validation utilities", () => {
  it("exposes the expected strength scale metadata", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(passwordStrengthColors).toHaveLength(5)
    expect(passwordStrengthLabels.en).toEqual(["Very Weak", "Weak", "Fair", "Good", "Strong"])
    expect(passwordStrengthLabels.ar).toHaveLength(5)
  })

  it("builds the english schema with the correct minimum-length message", () => {
    const schema = buildPasswordSchema("en")
    const messages = getPasswordValidationMessages("en")

    const result = schema.safeParse("Short1!")

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(messages.passwordMin)
    }
  })

  it("scores password strength across length and character rules", () => {
    expect(getPasswordStrength("")).toBe(0)
    expect(getPasswordStrength("password")).toBe(2)
    expect(getPasswordStrength("Password1!")).toBe(5)
  })

  it("returns requirement states and labels for partially complete passwords", () => {
    const requirements = getPasswordRequirements("Password", "en")

    expect(requirements).toEqual([
      { met: true, label: "At least 8 characters" },
      { met: true, label: "One uppercase letter" },
      { met: true, label: "One lowercase letter" },
      { met: false, label: "One number" },
    ])
  })

  it("returns localized message bundles for both supported languages", () => {
    const english = getPasswordValidationMessages("en")
    const arabic = getPasswordValidationMessages("ar")

    expect(english.confirmMismatch).toBe("Passwords do not match")
    expect(english.minLengthLabel).toContain(String(PASSWORD_MIN_LENGTH))
    expect(arabic.passwordMin.length).toBeGreaterThan(0)
    expect(arabic.confirmMismatch.length).toBeGreaterThan(0)
  })
})
