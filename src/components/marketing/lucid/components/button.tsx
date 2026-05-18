import { cn } from "@/components/marketing/lucid/lib/utils";
import React from "react";

type ButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "brand";
  className?: string;
  as?: React.ElementType;
} & Record<string, unknown>;

export const Button = ({
  children,
  variant = "primary",
  className,
  as,
  ...props
}: ButtonProps) => {
  const Component: any = as || "button";

  return (
    <Component
      {...(props as Record<string, unknown>)}
      className={cn(
        "block rounded-xl px-6 py-2 text-center text-sm font-medium transition duration-150 active:scale-[0.98] sm:text-base",
        variant === "primary"
          ? "bg-charcoal-900 text-white dark:bg-white dark:text-black"
          : variant === "brand"
            ? "bg-brand text-white"
            : "border-divide border bg-white text-black transition duration-200 hover:bg-gray-300 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800",
        className,
      )}
    >
      {children}
    </Component>
  );
};
