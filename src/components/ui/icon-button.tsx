"use client"

import { forwardRef } from "react"
import { cn } from "@/lib/utils"
import type { ReactNode, ButtonHTMLAttributes } from "react"

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
  size?: "sm" | "md"
  variant?: "default" | "destructive"
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { children, label, size = "sm", variant = "default", active, className, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          "flex items-center justify-center rounded-md transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] shrink-0",
          size === "sm" ? "h-6 w-6" : size === "md" ? "h-8 w-8" : "h-7 w-7",
          active
            ? "bg-foreground/10 text-foreground"
            : variant === "destructive"
              ? "text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

interface RoundButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
  variant?: "primary" | "destructive" | "muted"
}

export const RoundButton = forwardRef<HTMLButtonElement, RoundButtonProps>(
  function RoundButton({ children, label, variant = "muted", className, ...props }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          "flex size-8 items-center justify-center rounded-full transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
          variant === "primary"
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : variant === "destructive"
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

interface InputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onEnter?: () => void
  onEscape?: () => void
  onBlur?: () => void
  onPointerDown?: (e: React.PointerEvent) => void
  selectOnFocus?: boolean
  autoFocus?: boolean
  className?: string
  type?: string
  min?: number
  inputRef?: React.RefObject<HTMLInputElement | null>
}

export function InlineInput({
  value,
  onChange,
  placeholder,
  onEnter,
  onEscape,
  onBlur,
  onPointerDown,
  autoFocus,
  className,
  type = "text",
  min,
  inputRef,
}: InputProps) {
  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      type={type}
      min={min}
      placeholder={placeholder}
      className={cn(
        "h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
        className
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault()
          onEnter()
        }
        if (e.key === "Escape" && onEscape) {
          onEscape()
        }
      }}
      onPointerDown={onPointerDown}
      autoFocus={autoFocus}
    />
  )
}
