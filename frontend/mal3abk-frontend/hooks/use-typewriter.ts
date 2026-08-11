import { useState, useEffect } from "react"

export function useTypewriter(words: string[], typingSpeed = 100, deletingSpeed = 50, pauseTime = 2000) {
  const [text, setText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    if (!words || words.length === 0) return;
    
    const currentWord = words[wordIndex]
    let timeoutId: NodeJS.Timeout

    const type = () => {
      setText((current) => {
        if (isDeleting) {
          return currentWord.substring(0, current.length - 1)
        }
        return currentWord.substring(0, current.length + 1)
      })
    }

    let timeoutSpeed = isDeleting ? deletingSpeed : typingSpeed

    if (!isDeleting && text === currentWord) {
      timeoutSpeed = pauseTime
      setIsDeleting(true)
    } else if (isDeleting && text === "") {
      setIsDeleting(false)
      setWordIndex((prev) => (prev + 1) % words.length)
      timeoutSpeed = 500 // pause before starting next word
    }

    timeoutId = setTimeout(type, timeoutSpeed)

    return () => clearTimeout(timeoutId)
  }, [text, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, pauseTime])

  return text
}
