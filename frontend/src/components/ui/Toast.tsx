"use client"

import * as React from "react"
import * as ToastPrimitive from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X, CheckCircle, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Toast Variants ──────────────────────────────────────────

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-4 py-3 shadow-lg transition-all duration-300 data-[state=closed]:animate-slide-out data-[state=open]:animate-slide-in",
  {
    variants: {
      variant: {
        success:
          "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/80 dark:text-green-200",
        error:
          "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/80 dark:text-red-200",
        info:
          "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950/80 dark:text-brand-200",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

// ── Context ─────────────────────────────────────────────────

type ToastData = {
  id: string
  title: string
  description?: string
  variant?: VariantProps<typeof toastVariants>["variant"]
}

type ToastContextType = {
  toasts: ToastData[]
  toast: (data: Omit<ToastData, "id">) => void
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextType | null>(null)

function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

// ── Styles ──────────────────────────────────────────────────

const toastKeyframes = `
@keyframes ui-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes ui-slide-out {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
.animate-slide-in { animation: ui-slide-in 0.3s ease-out; }
.animate-slide-out { animation: ui-slide-out 0.2s ease-in forwards; }
`

// ── Provider ────────────────────────────────────────────────

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([])

  const toast = React.useCallback((data: Omit<ToastData, "id">) => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts((prev) => [...prev, { ...data, id }])

    // Auto-dismiss after 3s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      <style>{toastKeyframes}</style>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}

        <ToastPrimitive.Viewport className="fixed right-0 top-0 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2 p-4 outline-none" />

        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onDismiss={dismiss} />
        ))}
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

// ── Individual Toast Item ───────────────────────────────────

interface ToastItemProps extends ToastData {
  onDismiss: (id: string) => void
}

function ToastItem({ id, title, description, variant, onDismiss }: ToastItemProps) {
  const resolvedVariant = variant ?? "info"
  const Icon = iconMap[resolvedVariant]

  return (
    <ToastPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onDismiss(id)
      }}
      className={cn(toastVariants({ variant: resolvedVariant }))}
      duration={3000}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <ToastPrimitive.Title className="text-sm font-medium">
          {title}
        </ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="mt-0.5 text-xs opacity-80">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      <ToastPrimitive.Close className="shrink-0 rounded-md p-1 text-current opacity-50 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
        <X className="h-4 w-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}

// ── Exports ─────────────────────────────────────────────────

export { ToastProvider, useToast }
export type { ToastData }
