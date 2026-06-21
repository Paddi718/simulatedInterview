"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number
  showLabel?: boolean
  max?: number
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value = 0, showLabel = false, max = 100, ...props }, ref) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const clampedValue = Math.min(Math.max(value, 0), max)

  return (
    <div className="w-full">
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800",
          className
        )}
        value={clampedValue}
        max={max}
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={max}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className="h-full w-full flex-1 rounded-full bg-brand-500 transition-all duration-500 ease-out dark:bg-brand-500"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
      {showLabel && (
        <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">
          {Math.round(percentage)}%
        </p>
      )}
    </div>
  )
})
Progress.displayName = "Progress"

export { Progress }
