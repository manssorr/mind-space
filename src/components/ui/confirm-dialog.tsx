"use client"

import { useCallback, useState, createContext, useContext, type ReactNode } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { TriangleAlert, X } from "lucide-react"

interface ConfirmOptions {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider")
  return ctx.confirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolve, setResolve] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((res) => {
      setOptions(opts)
      setOpen(true)
      setResolve(() => res)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolve?.(true)
    setOpen(false)
  }, [resolve])

  const handleCancel = useCallback(() => {
    resolve?.(false)
    setOpen(false)
  }, [resolve])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        {children}
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95">
            <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
              <X className="h-4 w-4" />
            </Dialog.Close>

            <div className="flex items-start gap-4">
              {options?.variant === "destructive" && (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <TriangleAlert className="h-5 w-5 text-destructive" />
                </div>
              )}
              <div className="flex-1">
                <Dialog.Title className="text-lg font-semibold">
                  {options?.title}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  {options?.description}
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={handleCancel}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {options?.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                className={
                  options?.variant === "destructive"
                    ? "rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    : "rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
                }
              >
                {options?.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  )
}
