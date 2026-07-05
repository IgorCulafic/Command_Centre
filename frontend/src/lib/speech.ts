import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Minimal typings for the Web Speech API (not in the default DOM lib).
 * Only what we use. Chrome/Android expose `webkitSpeechRecognition`.
 */
interface SRAlternative {
  transcript: string
}
interface SRResult {
  readonly length: number
  isFinal: boolean
  [index: number]: SRAlternative
}
interface SRResultList {
  readonly length: number
  [index: number]: SRResult
}
interface SREvent extends Event {
  resultIndex: number
  results: SRResultList
}
interface SRErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
}
type SRCtor = new () => SpeechRecognitionLike

function getCtor(): SRCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SRCtor
    webkitSpeechRecognition?: SRCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface UseDictationOptions {
  /** BCP-47 language tag for recognition (default browser locale). */
  lang?: string
  /** Called with each finalized chunk of transcript (trimmed). */
  onFinal: (text: string) => void
}

/**
 * Speech-to-text via the browser's Web Speech API. Returns whether it's
 * supported, the listening state, any error, and start/stop/toggle controls.
 * Finalized speech is delivered through `onFinal`. No audio leaves the device
 * beyond the browser's own recognition backend.
 */
export function useDictation({ lang, onFinal }: UseDictationOptions) {
  const [supported] = useState(() => getCtor() != null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) {
      setError("Voice input isn't supported in this browser.")
      return
    }
    setError(null)
    const rec = new Ctor()
    rec.lang = lang ?? navigator.language ?? "en-US"
    rec.continuous = false
    rec.interimResults = true
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          const text = result[0]?.transcript?.trim()
          if (text) onFinalRef.current(text)
        }
      }
    }
    rec.onerror = (e) => {
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone permission denied."
          : e.error === "no-speech"
            ? "Didn't catch that — try again."
            : `Voice error: ${e.error}`,
      )
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      // start() throws if already running — ignore.
    }
  }, [lang])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // Abort any in-flight recognition on unmount.
  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, error, start, stop, toggle }
}
