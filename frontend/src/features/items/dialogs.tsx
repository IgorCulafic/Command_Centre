import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { QuickCaptureDialog } from "./QuickCaptureDialog"
import { ItemEditDialog } from "./ItemEditDialog"
import { ItemDetailDialog } from "./ItemDetailDialog"
import { SpaceDialog } from "@/features/spaces/SpaceDialog"
import { SearchDialog } from "@/features/search/SearchDialog"
import type { Item, Space } from "@/lib/api"

interface DialogsContextValue {
  /** Open quick capture, optionally pre-selecting a space. */
  openCapture: (defaultSpaceId?: number) => void
  /** Open global search (also bound to Ctrl/Cmd+K). */
  openSearch: () => void
  /** Open the read-only "full post" view (with an Edit button). */
  openDetail: (item: Item) => void
  /** Open the editor for an existing item directly. */
  openItem: (item: Item) => void
  /** Open the "new space" dialog, optionally under a parent (subspace). */
  openSpaceCreate: (parentId?: number) => void
  /** Open the "edit space" dialog. */
  openSpaceEdit: (space: Space) => void
}

const DialogsContext = createContext<DialogsContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useDialogs(): DialogsContextValue {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error("useDialogs must be used within <DialogsProvider>")
  return ctx
}

/**
 * Owns the app's dialogs (item capture/edit + space create/edit) so any button
 * anywhere can trigger them via useDialogs(). Rendered once near the app root.
 */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureSpace, setCaptureSpace] = useState<number | undefined>(undefined)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [detailItem, setDetailItem] = useState<Item | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // Ctrl/Cmd+K opens search anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const [spaceOpen, setSpaceOpen] = useState(false)
  const [spaceEdit, setSpaceEdit] = useState<Space | null>(null)
  const [spaceParent, setSpaceParent] = useState<number | null>(null)

  // Hardware/browser Back closes an open dialog instead of leaving the app.
  // While any dialog is open we push a sentinel history entry; Back pops it and
  // closes the dialog. Closing via the UI removes the sentinel so Back still
  // navigates routes normally.
  const anyDialogOpen =
    captureOpen ||
    editItem !== null ||
    detailItem !== null ||
    searchOpen ||
    spaceOpen
  useEffect(() => {
    if (!anyDialogOpen) return
    const closeAll = () => {
      setCaptureOpen(false)
      setEditItem(null)
      setDetailItem(null)
      setSearchOpen(false)
      setSpaceOpen(false)
    }
    window.history.pushState({ ccDialog: true }, "")
    window.addEventListener("popstate", closeAll)
    return () => {
      window.removeEventListener("popstate", closeAll)
      if ((window.history.state as { ccDialog?: boolean } | null)?.ccDialog) {
        window.history.back()
      }
    }
  }, [anyDialogOpen])

  const value: DialogsContextValue = {
    openCapture: (defaultSpaceId) => {
      setCaptureSpace(defaultSpaceId)
      setCaptureOpen(true)
    },
    openDetail: (item) => setDetailItem(item),
    openSearch: () => setSearchOpen(true),
    openItem: (item) => setEditItem(item),
    openSpaceCreate: (parentId) => {
      setSpaceEdit(null)
      setSpaceParent(parentId ?? null)
      setSpaceOpen(true)
    },
    openSpaceEdit: (space) => {
      setSpaceEdit(space)
      setSpaceParent(null)
      setSpaceOpen(true)
    },
  }

  return (
    <DialogsContext.Provider value={value}>
      {children}
      <QuickCaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        defaultSpaceId={captureSpace}
      />
      <ItemDetailDialog
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(o) => {
          if (!o) setDetailItem(null)
        }}
        onEdit={(item) => {
          setDetailItem(null)
          setEditItem(item)
        }}
      />
      <ItemEditDialog
        item={editItem}
        open={editItem !== null}
        onOpenChange={(o) => {
          if (!o) setEditItem(null)
        }}
      />
      <SpaceDialog
        open={spaceOpen}
        onOpenChange={setSpaceOpen}
        editSpace={spaceEdit}
        parentId={spaceParent}
      />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </DialogsContext.Provider>
  )
}
