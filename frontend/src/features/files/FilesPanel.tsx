import { useRef, useState } from "react"
import { Check, Copy, Download, File as FileIcon, Trash2, Upload } from "lucide-react"
import {
  attachmentDownloadUrl,
  attachmentRawUrl,
  type Attachment,
} from "@/lib/api"
import {
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from "@/lib/queries"
import { cn } from "@/lib/utils"

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImage(contentType?: string | null): boolean {
  return Boolean(contentType && contentType.startsWith("image/"))
}

interface Target {
  item_id?: number
  space_id?: number
}

export function FilesPanel({ target }: { target: Target }) {
  const { data: files } = useAttachments(target)
  const upload = useUploadAttachment()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const onFiles = (list: FileList | null) => {
    if (!list) return
    for (const file of Array.from(list)) upload.mutate({ file, target })
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          onFiles(e.dataTransfer.files)
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground transition-colors hover:bg-accent/40",
          dragOver && "border-primary bg-primary/10 text-foreground",
        )}
      >
        <Upload className="size-5" />
        <span>
          {upload.isPending ? "Uploading…" : "Drop files here, or click to upload"}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {(files?.length ?? 0) > 0 && (
        <ul className="space-y-1.5">
          {files!.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FileRow({ file }: { file: Attachment }) {
  const del = useDeleteAttachment()
  const [copied, setCopied] = useState(false)

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(file.path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }

  const iconBtn =
    "grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
      {isImage(file.content_type) ? (
        <a
          href={attachmentRawUrl(file.id)}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0"
        >
          <img
            src={attachmentRawUrl(file.id)}
            alt=""
            className="size-10 rounded border object-cover"
          />
        </a>
      ) : (
        <div className="grid size-10 shrink-0 place-items-center rounded border bg-muted text-muted-foreground">
          <FileIcon className="size-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <a
          href={attachmentRawUrl(file.id)}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate text-sm hover:underline"
        >
          {file.filename}
        </a>
        <div className="text-xs text-muted-foreground">
          {formatSize(file.size)}
        </div>
      </div>

      <button
        type="button"
        onClick={copyPath}
        title="Copy server path"
        className={iconBtn}
      >
        {copied ? (
          <Check className="size-4 text-emerald-500" />
        ) : (
          <Copy className="size-4" />
        )}
      </button>
      <a
        href={attachmentDownloadUrl(file.id)}
        title="Download"
        className={iconBtn}
      >
        <Download className="size-4" />
      </a>
      <button
        type="button"
        onClick={() => del.mutate(file.id)}
        title="Delete"
        className={cn(iconBtn, "hover:bg-destructive/15 hover:text-destructive")}
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  )
}
