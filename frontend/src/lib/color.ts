/** "#6366f1" + 0.1 → "rgba(99, 102, 241, 0.1)". Used for highlighter row tints. */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "").trim()
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("")
  }
  const n = Number.parseInt(h, 16)
  if (Number.isNaN(n) || h.length !== 6) return hex
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
