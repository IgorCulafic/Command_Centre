import { useState } from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { EmojiPicker } from "frimousse"

interface IconPickerProps {
  value: string
  onChange: (icon: string) => void
}

/**
 * Searchable emoji picker (works by tap on phone).
 *
 * Note: we use the Radix Popover primitives **without a Portal** on purpose. When
 * this lives inside a modal Dialog (the space dialog), a portaled popover lands
 * outside the dialog's DOM, and the Dialog's scroll-lock then blocks touch/wheel
 * scrolling inside it. Rendering inline keeps the emoji list within the dialog's
 * allowed scroll area, so it scrolls on mobile.
 */
export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Choose icon"
          className="grid size-9 place-items-center rounded-md border text-lg hover:bg-accent"
        >
          {value || "📁"}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        className="z-50 w-fit overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden"
      >
        <EmojiPicker.Root
          onEmojiSelect={(emoji) => {
            onChange(emoji.emoji)
            setOpen(false)
          }}
          className="isolate flex h-80 w-[19rem] flex-col bg-popover text-popover-foreground"
        >
          <div className="flex items-center gap-2 p-2">
            <EmojiPicker.Search
              placeholder="Search emoji…"
              className="h-8 flex-1 appearance-none rounded-md border bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("")
                  setOpen(false)
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          <EmojiPicker.Viewport
            className="relative flex-1 overscroll-contain outline-hidden [touch-action:pan-y]"
          >
            <EmojiPicker.Loading className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              Loading…
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              No emoji found.
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="select-none pb-1.5"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    className="bg-popover px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground"
                    {...props}
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div className="scroll-my-1.5 px-1.5" {...props}>
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-md text-lg data-[active]:bg-accent"
                    {...props}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </EmojiPicker.Viewport>
        </EmojiPicker.Root>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  )
}
