"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

interface NavLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  workspaceSlug?: string | null;
  isAuthenticated?: boolean;
}

export function NavLogo({ className, size = "md", showText = true, workspaceSlug, isAuthenticated = false }: NavLogoProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = !mounted || resolvedTheme === 'dark';

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-11 w-11",
    lg: "h-16 w-16",
  };

  // Context-aware href: 
  // - If workspaceSlug provided → workspace dashboard
  // - If authenticated but no workspace → /dashboard
  // - Otherwise → marketing home
  const href = workspaceSlug 
    ? `/${workspaceSlug}/dashboard` 
    : isAuthenticated 
      ? '/dashboard'
      : '/';

  return (
    <Link
      href={href}
      aria-label={workspaceSlug ? "Workspace Home" : "Lucid Home"}
      className={cn("flex items-center space-x-2 group", className)}
    >
      <div className={cn("cursor-pointer transition-transform group-hover:scale-105", sizeClasses[size])}>
        <Image
          src={isDark ? (isHovered ? "/lucid_w.gif" : "/lucid_w.png") : "/lucid.png"}
          alt="Lucid Logo"
          width={44}
          height={44}
          className="h-full w-auto object-contain"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          unoptimized
        />
      </div>
      {showText && (
        <span className="text-xl font-semibold text-primary hidden sm:inline">
          Lucid
        </span>
      )}
    </Link>
  );
}
