"use client";

import React from "react";
import { Badge } from "./badge";
import { SectionHeading } from "./seciton-heading";
import { SubHeading } from "./subheading";
import { cn } from "@/components/marketing/lucid/lib/utils";

export function SectionHeader({
  badge,
  title,
  description,
  align = "center",
  descriptionOpacity = "muted",
  className,
  titleClassName,
  descriptionClassName,
}: {
  badge?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "left";
  descriptionOpacity?: "default" | "muted";
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  const isCenter = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col",
        isCenter ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {badge ? <Badge text={badge} /> : null}
      <SectionHeading className={cn(badge ? "mt-4" : "", titleClassName)}>
        {title}
      </SectionHeading>
      {description ? (
        <SubHeading
          as="p"
          className={cn(
            "mt-6",
            descriptionOpacity === "muted" && "opacity-[0.55]",
            isCenter ? "mx-auto" : "",
            descriptionClassName,
          )}
        >
          {description}
        </SubHeading>
      ) : null}
    </div>
  );
}
