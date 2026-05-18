import React from "react";
import { cn } from "@/components/marketing/lucid/lib/utils";

export const Card = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return <div className={cn("p-4 md:p-8", className)}>{children}</div>;
};

export const CardTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <h3
      className={cn(
        "text-charcoal-700 text-lg font-medium dark:text-neutral-100",
        className,
      )}
    >
      {children}
    </h3>
  );
};

export const CardDescription = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <p
      className={cn(
        "mt-2 text-base text-gray-600 opacity-[0.55] dark:text-gray-300",
        className,
      )}
    >
      {children}
    </p>
  );
};

export const CardMeta = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <p
      className={cn(
        "mt-3 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400",
        className,
      )}
    >
      {children}
    </p>
  );
};
