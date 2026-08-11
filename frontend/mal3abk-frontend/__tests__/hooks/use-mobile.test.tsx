import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useIsMobile } from "@/hooks/use-mobile"

function Probe() {
  const isMobile = useIsMobile()
  return <div data-testid="is-mobile">{String(isMobile)}</div>
}

describe("useIsMobile", () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it("supports legacy media query listeners", () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()

    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addListener,
      removeListener,
    }) as typeof window.matchMedia

    render(<Probe />)

    expect(screen.getByTestId("is-mobile")).toHaveTextContent("true")
    expect(addListener).toHaveBeenCalledTimes(1)
  })

  it("supports modern media query listeners", () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener,
      removeEventListener,
    }) as typeof window.matchMedia

    render(<Probe />)

    expect(screen.getByTestId("is-mobile")).toHaveTextContent("false")
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function))
  })
})
