import { useState } from "react"
import { Download, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { useRestoreItem, useTrash } from "@/lib/queries"

/** Data section: one-click JSON backup + a Trash list to restore deleted items. */
export function DataSettings() {
  const { data: trash } = useTrash()
  const restore = useRestoreItem()
  const [exporting, setExporting] = useState(false)
  const items = trash ?? []

  const exportBackup = async () => {
    setExporting(true)
    try {
      const data = await api.exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `command-center-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a full backup, or restore something you deleted.
        </p>
      </div>

      <Button
        variant="outline"
        onClick={exportBackup}
        disabled={exporting}
        className="gap-2"
      >
        <Download className="size-4" />
        {exporting ? "Exporting…" : "Export backup (JSON)"}
      </Button>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Trash2 className="size-4" />
          Trash ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing deleted. Removed items land here and can be restored.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
                <span className="shrink-0 text-xs capitalize text-muted-foreground">
                  {it.type}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1"
                  onClick={() => restore.mutate(it.id)}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="size-3.5" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
