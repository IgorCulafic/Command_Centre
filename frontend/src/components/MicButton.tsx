import { Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useDictation } from "@/lib/speech"

interface MicButtonProps {
  /** Receives each finalized chunk of dictated text. */
  onText: (text: string) => void
  /** BCP-47 language tag; defaults to the browser locale. */
  lang?: string
  className?: string
}

/**
 * Tap-to-dictate button. Hidden entirely when the browser has no speech
 * recognition (e.g. Firefox). Pulses red while listening.
 */
export function MicButton({ onText, lang, className }: MicButtonProps) {
  const { supported, listening, error, toggle } = useDictation({ lang, onFinal: onText })
  if (!supported) return null
  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      title={error ?? (listening ? "Listening… tap to stop" : "Dictate")}
      className={cn(
        "size-9 shrink-0 p-0",
        listening && "animate-pulse border-red-500 text-red-500",
        className,
      )}
    >
      <Mic className="size-4" />
    </Button>
  )
}
