import { cn } from "@/components/marketing/lucid/lib/utils";
import React from "react";

export const DivideX = ({ className }: { className?: string }) => {
  return <div className={cn("bg-divide h-[1px] w-full", className)} />;
};
