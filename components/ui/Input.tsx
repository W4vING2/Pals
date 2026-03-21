import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none transition-[border-color,box-shadow] duration-200 ease-out focus-visible:border-[rgba(168,85,247,0.5)] focus-visible:shadow-[0_0_0_3px_rgba(168,85,247,0.25)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--text-primary)] aria-invalid:border-[var(--destructive)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
