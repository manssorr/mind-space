"use client"

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Something went wrong</p>
        <p className="text-xs text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
      </div>
      <button
        onClick={() => unstable_retry()}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80"
      >
        Try again
      </button>
    </div>
  )
}
