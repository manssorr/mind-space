"use client"

import { useEffect } from "react"
import { useStore } from "@/store"

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      const mod = e.metaKey || e.ctrlKey

      if ((e.key === "Backspace" || e.key === "Delete") && !isInput) {
        const s = useStore.getState()
        if (s.selectedWidgetIds.length > 0 && s.currentSheetId) {
          e.preventDefault()
          s.deleteWidgetsAnimated(s.currentSheetId, s.selectedWidgetIds)
        }
        return
      }

      if (mod && e.key === "z" && !e.shiftKey && !isInput) {
        e.preventDefault()
        useStore.getState().undo()
        return
      }

      if (mod && e.key === "z" && e.shiftKey && !isInput) {
        e.preventDefault()
        useStore.getState().redo()
        return
      }

      if (mod && e.key === "Z" && !isInput) {
        e.preventDefault()
        useStore.getState().redo()
        return
      }

      if (mod && (e.key === "d" || e.key === "D") && !isInput) {
        e.preventDefault()
        const s = useStore.getState()
        if (s.selectedWidgetIds.length > 0 && s.currentSheetId) {
          s.duplicateWidgets(s.currentSheetId, s.selectedWidgetIds)
        }
        return
      }

      if (mod && (e.key === "c" || e.key === "C") && !isInput) {
        e.preventDefault()
        const s = useStore.getState()
        if (s.selectedWidgetIds.length > 0 && s.currentSheetId) {
          s.copyWidgets(s.currentSheetId, s.selectedWidgetIds)
        }
        return
      }

      if (mod && (e.key === "v" || e.key === "V") && !isInput) {
        e.preventDefault()
        const s = useStore.getState()
        if (s.clipboard && s.currentSheetId) {
          s.pasteWidgets(s.currentSheetId)
        }
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])
}
