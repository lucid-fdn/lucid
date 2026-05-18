import React, { ComponentPropsWithoutRef, CSSProperties } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const shimmerButtonVariants = cva(
  "group relative z-0 flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md border border-white/10 whitespace-nowrap text-sm font-medium text-white [background:var(--bg)] transform-gpu transition-all duration-300 ease-in-out active:translate-y-px",
  {
    variants: {
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md gap-1.5 px-3",
        lg: "h-10 rounded-md px-6",
      },
      rounded: {
        default: "rounded-md",
        full: "rounded-full",
        lg: "rounded-lg",
        xl: "rounded-xl",
        "2xl": "rounded-2xl",
      },
    },
    defaultVariants: {
      size: "default",
      rounded: "default",
    },
  }
)

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button">, VariantProps<typeof shimmerButtonVariants> {
  shimmerColor?: string
  shimmerSize?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
}

export const ShimmerButton = React.forwardRef<
  HTMLButtonElement,
  ShimmerButtonProps
>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      background = "hsl(var(--primary))",
      size,
      rounded,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": shimmerColor,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as CSSProperties
        }
        className={cn(
          shimmerButtonVariants({ size, rounded }),
          className
        )}
        ref={ref}
        {...props}
      >
        {/* spark container */}
        <div
          className={cn(
            "-z-30 blur-[2px]",
            "[container-type:size] absolute inset-0 overflow-visible"
          )}
        >
          {/* spark */}
          <div className="animate-shimmer-slide absolute inset-0 [aspect-ratio:1] h-[100cqh] [border-radius:0] [mask:none]">
            {/* spark before */}
            <div className="animate-spin-around absolute -inset-full w-auto [translate:0_0] rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
          </div>
        </div>
        {children}

        {/* Highlight */}
        <div
          className={cn(
            "absolute inset-0 size-full",
            "shadow-[inset_0_-8px_10px_#ffffff1f]",
            // transition
            "transform-gpu transition-all duration-300 ease-in-out",
            // on hover
            "group-hover:shadow-[inset_0_-6px_10px_#ffffff3f]",
            // on click
            "group-active:shadow-[inset_0_-10px_10px_#ffffff3f]",
            // Match button rounding
            rounded === "full" && "rounded-full",
            rounded === "lg" && "rounded-lg",
            rounded === "xl" && "rounded-xl",
            rounded === "2xl" && "rounded-2xl",
            (!rounded || rounded === "default") && "rounded-md"
          )}
        />

        {/* backdrop */}
        <div
          className={cn(
            "absolute [inset:var(--cut)] -z-20 [background:var(--bg)]",
            // Match button rounding
            rounded === "full" && "rounded-full",
            rounded === "lg" && "rounded-lg",
            rounded === "xl" && "rounded-xl",
            rounded === "2xl" && "rounded-2xl",
            (!rounded || rounded === "default") && "rounded-md"
          )}
        />
      </button>
    )
  }
)

ShimmerButton.displayName = "ShimmerButton"
