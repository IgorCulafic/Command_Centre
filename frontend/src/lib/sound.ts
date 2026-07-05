/**
 * Tiny synthesized UI sounds via the Web Audio API — no audio files to ship,
 * load, or break. Callers should gate on the user's sound preference; these just
 * play. Audio needs a prior user gesture (browser autoplay policy); action
 * sounds (a click) satisfy that, and the Settings "Test" button primes it for
 * passive reminder chimes.
 */
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** One soft sine "note" at `start` seconds from now, fading out over `dur`. */
function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  gain = 0.08,
) {
  const t0 = c.currentTime + start
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = "sine"
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

/** Gentle 3-note rising chime — for an arriving reminder. */
export function playReminderChime() {
  const c = getCtx()
  if (!c) return
  tone(c, 587.33, 0, 0.18) // D5
  tone(c, 783.99, 0.12, 0.18) // G5
  tone(c, 1046.5, 0.24, 0.32) // C6
}

/** Short, subtle two-note "done" ding — for completing a task. */
export function playCompleteDing() {
  const c = getCtx()
  if (!c) return
  tone(c, 880.0, 0, 0.1, 0.06) // A5
  tone(c, 1318.51, 0.07, 0.16, 0.06) // E6
}
