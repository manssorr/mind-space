"use client"

import { useEffect } from "react"
import { toast } from "sonner"

export function StorageErrorListener() {
  useEffect(() => {
    function handleStorageError() {
      toast.error("Storage is full", {
        description: "Recent changes may not be saved. Export or delete some content.",
      })
    }

    window.addEventListener("mind-space:storage-error", handleStorageError)
    return () => {
      window.removeEventListener("mind-space:storage-error", handleStorageError)
    }
  }, [])

  return null
}
