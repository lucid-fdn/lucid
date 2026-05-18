import { cn } from "@/components/marketing/lucid/lib/utils";
import React from "react";

export const Container = ({
  children,
  className,
  as,
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) => {
  const Component: any = as || "div";
  return (
    <Component className={cn("max-w-7xl mx-auto", className)}>
      {children}
    </Component>
  );
};
