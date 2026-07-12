"use client"

import { memo, useEffect, useState } from "react"
import { ContextMenu } from "@base-ui/react/context-menu"
import { useStore } from "@/store"
import { Copy, Trash2, Palette, ChevronRight, Pencil } from "lucide-react"
import { WidgetColorPalette } from "./widget-color-palette"

interface WidgetContextMenuProps {
  widgetId: string
  onStartRename: () => void
  children: React.ReactElement
}

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground transition-colors"
const destructiveItemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10 transition-colors"
const popupClass =
  "pointer-events-auto z-50 min-w-[176px] rounded-lg border bg-popover p-1 shadow-md outline-none"

export const WidgetContextMenu = memo(function WidgetContextMenu({
  widgetId,
  onStartRename,
  children,
}: WidgetContextMenuProps) {
  const [open, setOpen] = useState(false)
  const isMulti = useStore(
    (s) => s.selectedWidgetIds.includes(widgetId) && s.selectedWidgetIds.length > 1
  )
  const count = useStore((s) => s.selectedWidgetIds.length)
  const widget = useStore((s) => s.widgets[widgetId])

  // Base UI's ContextMenu.Root has no `modal` prop (unlike Menu.Root), so it
  // never locks pointer-events outside the menu the way Radix does. Without
  // this, the page behind the menu stays hover/pointer-interactive even
  // though it's marked aria-hidden. Lock body pointer-events while open and
  // restore on close/unmount so we never leave the app dead.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.pointerEvents
    document.body.style.pointerEvents = "none"
    return () => {
      document.body.style.pointerEvents = previous
    }
  }, [open])

  if (!widget) return children

  function applyColor(id: string) {
    const s = useStore.getState()
    const colorTheme = id === "default" ? undefined : id
    if (isMulti) {
      s.updateWidgets(s.selectedWidgetIds, { colorTheme })
    } else {
      s.updateWidget(widgetId, { colorTheme })
    }
    setOpen(false)
  }

  function duplicate() {
    const s = useStore.getState()
    if (!s.currentSheetId) return
    if (isMulti) {
      s.duplicateWidgets(s.currentSheetId, s.selectedWidgetIds)
    } else {
      s.duplicateWidget(s.currentSheetId, widgetId)
    }
  }

  function remove() {
    const s = useStore.getState()
    if (!s.currentSheetId) return
    if (isMulti) {
      s.deleteWidgets(s.currentSheetId, s.selectedWidgetIds)
    } else {
      s.deleteWidget(s.currentSheetId, widgetId)
    }
  }

  // The popups portal to body in the DOM but stay inside the canvas React
  // tree, so pointerdowns on menu items would bubble (through the React tree)
  // to the canvas marquee handler and deselect everything mid-click, swapping
  // the multi-select items out from under the click.
  const blockCanvasGestures = (e: React.PointerEvent) => e.stopPropagation()

  return (
    <ContextMenu.Root open={open} onOpenChange={setOpen}>
      <ContextMenu.Trigger render={children} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner onPointerDown={blockCanvasGestures}>
          <ContextMenu.Popup className={popupClass}>
            {!isMulti && (
              <ContextMenu.Item className={itemClass} onClick={onStartRename}>
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </ContextMenu.Item>
            )}
            <ContextMenu.Item className={itemClass} onClick={duplicate}>
              <Copy className="h-3.5 w-3.5" />
              {isMulti ? `Duplicate ${count} widgets` : "Duplicate"}
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px bg-border my-1" />
            <ContextMenu.SubmenuRoot>
              <ContextMenu.SubmenuTrigger className={itemClass} openOnHover>
                <Palette className="h-3.5 w-3.5" />
                Color
                <ChevronRight className="h-3.5 w-3.5 ml-auto" />
              </ContextMenu.SubmenuTrigger>
              <ContextMenu.Portal>
                <ContextMenu.Positioner
                  side="right"
                  alignOffset={-4}
                  sideOffset={-4}
                  onPointerDown={blockCanvasGestures}
                >
                  <ContextMenu.Popup className={popupClass}>
                    <WidgetColorPalette currentId={widget.colorTheme} onSelect={applyColor} />
                  </ContextMenu.Popup>
                </ContextMenu.Positioner>
              </ContextMenu.Portal>
            </ContextMenu.SubmenuRoot>
            <ContextMenu.Separator className="h-px bg-border my-1" />
            <ContextMenu.Item className={destructiveItemClass} onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
              {isMulti ? `Delete ${count} widgets` : "Delete"}
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
})
