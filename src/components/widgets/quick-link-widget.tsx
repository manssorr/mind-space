"use client"

import { memo, useCallback, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import { getWidgetData } from "@/lib/widget-utils"
import { getFaviconUrl, normalizeUrl, safeHostname } from "@/lib/quick-link-utils"
import { IconButton, InlineInput } from "@/components/ui/icon-button"
import { ExternalLink, Edit3, Check, X } from "lucide-react"

interface QuickLinkData {
  url: string
}

export const QuickLinkWidget = memo(function QuickLinkWidget({ widgetId }: { widgetId: string }) {
  const widget = useStore((s) => s.widgets[widgetId])
  const updateWidget = useStore((s) => s.updateWidget)
  const [editing, setEditing] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const data = useMemo(() => getWidgetData<QuickLinkData>(widget), [widget])
  const url = data.url ?? ""

  const handleOpen = useCallback(() => {
    if (url && safeHostname(url)) window.open(normalizeUrl(url), "_blank", "noopener,noreferrer")
  }, [url])

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setUrlInput(url)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [url])

  const handleFinishEdit = useCallback(() => {
    const trimmed = urlInput.trim()
    updateWidget(widgetId, { data: { url: trimmed } })
    setEditing(false)
  }, [urlInput, updateWidget, widgetId])

  const favicon = useMemo(() => url ? getFaviconUrl(url) : "", [url])
  const hostname = url ? safeHostname(url) : null

  return (
    <div className="flex h-full flex-col p-4">
      {editing ? (
        <div className="flex items-center gap-2">
          <InlineInput
            inputRef={inputRef}
            value={urlInput}
            onChange={setUrlInput}
            placeholder="https://example.com"
            onEnter={handleFinishEdit}
            onEscape={() => setEditing(false)}
            onBlur={handleFinishEdit}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
          />
          <IconButton label="Save" onClick={handleFinishEdit} size="sm">
            <Check className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Cancel" onClick={() => setEditing(false)} size="sm">
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ) : (
        <div className="relative flex-1 flex group/link">
          <button
            onClick={handleOpen}
            className="flex flex-col items-center justify-center flex-1 gap-3 rounded-lg hover:bg-accent/50 transition-colors"
          >
            {favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={favicon}
                alt=""
                className="h-10 w-10 rounded"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none"
                }}
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <ExternalLink className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="text-center">
              <p
                className="text-xs font-medium truncate max-w-full"
                title={hostname ?? undefined}
              >
                {hostname ?? (url ? "Invalid URL" : "No URL set")}
              </p>
              <p
                className="text-[10px] text-muted-foreground truncate max-w-full"
                title={url || undefined}
              >
                {url || "Click edit to add URL"}
              </p>
            </div>
          </button>

          <IconButton
            label="Edit URL"
            onClick={handleStartEdit}
            size="sm"
            className="absolute top-0 right-0 opacity-0 group-hover/link:opacity-100 transition-opacity"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}
    </div>
  )
})
