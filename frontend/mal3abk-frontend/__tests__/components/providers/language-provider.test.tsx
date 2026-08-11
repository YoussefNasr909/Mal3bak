import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { LanguageProvider, useLanguage } from "@/components/providers/language-provider"

function LanguageProbe() {
  const { language, direction } = useLanguage()

  return <div>{`${language}:${direction}`}</div>
}

describe("LanguageProvider", () => {
  it("keeps the server-provided language even when localStorage is stale", async () => {
    localStorage.setItem("mal3bk_language", "en")

    render(
      <LanguageProvider initialLanguage="ar">
        <LanguageProbe />
      </LanguageProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("ar:rtl")).toBeInTheDocument()
    })
  })
})
