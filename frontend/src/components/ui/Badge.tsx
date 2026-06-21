"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        blue: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        green:
          "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300",
        red: "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300",
        yellow:
          "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        purple:
          "bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
        gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      },
    },
    defaultVariants: {
      variant: "blue",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
