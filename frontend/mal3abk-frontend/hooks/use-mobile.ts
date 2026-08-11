import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)

    onChange()

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    }

    if (typeof mql.addListener === "function") {
      mql.addListener(onChange)
      return () => mql.removeListener(onChange)
    }

    return
  }, [])

  return isMobile
}
