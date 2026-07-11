"use client"

import { Toaster as Sonner } from "sonner"
import { useTheme } from "@/components/theme-provider"

export function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      richColors
      closeButton
      position="bottom-right"
      theme={resolvedTheme}
    />
  )
}
