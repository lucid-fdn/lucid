"use client";

import React from "react";
import { useAuth } from "@/contexts/auth-context";
import { useGlobalShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";
import { useResolvedFeatureFlags } from "@/contexts/feature-flags-context";
import { NavLogo } from "./nav-logo";
import { NavUserMenu } from "./nav-user-menu";
import { NavNotifications } from "./nav-notifications";
import { SearchInput } from "@/components/search-input";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "@/content/nav";
import type { NavItem } from "@/content/nav";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

interface UnifiedNavbarProps {
  variant?: "marketing" | "studio";
  banner?: React.ReactNode;
  onSettingsClick?: (tab?: string) => void;
  workspaceSlug?: string | null;
  userWorkspaces?: Array<{
    id: string;
    slug: string;
    name: string;
    type: string;
    role: string;
    logo_url?: string;
    member_count?: number;
    plan_name?: string;
  }>;
}

function DesktopDropdown({ item }: { item: NavItem }) {
  if (item.groups) {
    return (
      <div className="w-screen max-w-lg p-4">
        {item.groups.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <div className="my-2 border-t border-border" />}
            <div className="mb-1 px-4 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h3>
            </div>
            {group.items.map((subitem) => (
              <Link
                key={subitem.name}
                href={subitem.href}
                className="group relative flex gap-x-4 rounded-lg p-3 hover:bg-accent transition-colors"
              >
                <div className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted group-hover:bg-background">
                  <subitem.icon className="size-5 text-muted-foreground group-hover:text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {subitem.name}
                  </div>
                  <p className="text-xs text-muted-foreground">{subitem.description}</p>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (item.subitems) {
    return (
      <div className="w-screen max-w-md p-4">
        {item.subitems.map((subitem) => (
          <Link
            key={subitem.name}
            href={subitem.href}
            className="group relative flex gap-x-4 rounded-lg p-3 hover:bg-accent transition-colors"
          >
            <div className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted group-hover:bg-background">
              <subitem.icon className="size-5 text-muted-foreground group-hover:text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {subitem.name}
              </div>
              <p className="text-xs text-muted-foreground">{subitem.description}</p>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return null;
}

function MobileMenu({
  open,
  isAuthenticated,
  onClose,
}: {
  open: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "lg:hidden fixed inset-0 top-14 bg-background/95 backdrop-blur-lg transition-all duration-300 ease-in-out overflow-y-auto z-50",
        open
          ? "opacity-100 visible pointer-events-auto"
          : "opacity-0 invisible pointer-events-none"
      )}
    >
      <div className="h-full py-6 px-6 space-y-6">
        <div className="space-y-4">
          {NAV_LINKS.map((item) => (
            <div key={item.name} className="space-y-2">
              {item.href ? (
                <Link
                  href={item.href}
                  className="font-medium text-sm px-2 block hover:text-primary transition-colors"
                  onClick={onClose}
                >
                  {item.name}
                </Link>
              ) : (
                <>
                  <div className="font-medium text-sm px-2">{item.name}</div>
                  {item.groups && (
                    <div className="pl-4 space-y-3">
                      {item.groups.map((group) => (
                        <div key={group.label}>
                          <div className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            {group.label}
                          </div>
                          {group.items.map((subitem) => (
                            <Link
                              key={subitem.name}
                              href={subitem.href}
                              className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors duration-120"
                              onClick={onClose}
                            >
                              {subitem.name}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.subitems && (
                    <div className="pl-4 space-y-1">
                      {item.subitems.map((subitem) => (
                        <Link
                          key={subitem.name}
                          href={subitem.href}
                          className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors duration-120"
                          onClick={onClose}
                        >
                          {subitem.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {!isAuthenticated && (
          <Button
            variant="outline"
            disabled
            className="w-full cursor-not-allowed opacity-50"
          >
            Coming Soon
          </Button>
        )}
      </div>
    </div>
  );
}

export function UnifiedNavbar({
  variant = "marketing",
  banner,
  onSettingsClick,
  workspaceSlug,
  userWorkspaces = [],
}: UnifiedNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const { isAuthenticated } = useAuth();

  const FEATURES = useResolvedFeatureFlags();
  useGlobalShortcuts();

  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [_openPopover, setOpenPopover] = React.useState<string | null>(null);

  const handleMouseEnter = (itemName: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setOpenPopover(itemName);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setOpenPopover(null);
    }, 100);
  };

  React.useEffect(() => {
    if (variant !== "marketing") return;
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [variant]);

  React.useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  return (
    <header
      className={cn(
        "fixed z-50 w-full transition-[top] duration-200",
        variant === "studio"
          ? "bg-sidebar border-b"
          : ""
      )}
      style={{ top: 'var(--status-banner-height, 0px)' }}
    >
      <nav
        className={cn(
          "mx-auto backdrop-blur-lg",
          variant === "marketing" && "transition-all duration-500 ease-in-out",
          variant === "marketing" && isScrolled
            ? "mt-2 w-[min(100%,64rem)] px-6 bg-background/50 rounded-2xl border-border lg:px-5"
            : "w-full px-6 border-transparent",
          mobileMenuOpen && "h-screen"
        )}
      >
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Left: Logo + Search + Nav (desktop) */}
          <div className="flex items-center gap-6 flex-1">
            <NavLogo size="md" showText={false} workspaceSlug={workspaceSlug} />

            {/* Desktop Search */}
            {FEATURES.search && (
              <div className="hidden md:block flex-shrink min-w-[200px] max-w-[300px] relative group">
                <div className="opacity-50 pointer-events-none">
                  <SearchInput
                    placeholder="Explore the Internet of AI"
                    searchContext="navbar"
                    variant="minimal"
                    size="sm"
                    showKeyboardShortcut={false}
                  />
                </div>
                <div className="absolute top-full left-0 mt-1 px-3 py-1.5 bg-popover text-popover-foreground border border-border shadow-md text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Coming Soon
                </div>
              </div>
            )}

            {/* Desktop Navigation */}
            {variant === "marketing" && (
              <ul className="hidden lg:flex text-sm items-center ml-auto">
                {NAV_LINKS.map((item, index) => (
                  <li key={index} className="flex items-center">
                    {item.groups || item.subitems ? (
                      <NavigationMenu
                        onMouseEnter={() => handleMouseEnter(item.name)}
                        onMouseLeave={handleMouseLeave}
                      >
                        <NavigationMenuList>
                          <NavigationMenuItem>
                            <NavigationMenuTrigger className="text-sm bg-transparent hover:bg-transparent data-[state=open]:bg-transparent">
                              {item.name}
                            </NavigationMenuTrigger>
                            <NavigationMenuContent>
                              <DesktopDropdown item={item} />
                            </NavigationMenuContent>
                          </NavigationMenuItem>
                        </NavigationMenuList>
                      </NavigationMenu>
                    ) : (
                      <Link
                        href={item.href || '#'}
                        className="inline-flex items-center px-4 text-foreground hover:text-muted-foreground duration-150"
                      >
                        <span>{item.name}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {banner && <div className="hidden lg:block">{banner}</div>}

            {isAuthenticated ? (
              <>
                {FEATURES.notifications && <NavNotifications />}
                <NavUserMenu
                  onSettingsClick={onSettingsClick}
                  userWorkspaces={userWorkspaces}
                  currentWorkspaceSlug={workspaceSlug}
                />
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled
                className="hidden lg:flex cursor-not-allowed opacity-50"
              >
                Coming Soon
              </Button>
            )}

            {/* Mobile menu button */}
            {variant === "marketing" && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 hover:bg-accent rounded-md transition-colors duration-120"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {variant === "marketing" && (
          <MobileMenu
            open={mobileMenuOpen}
            isAuthenticated={isAuthenticated}
            onClose={() => setMobileMenuOpen(false)}
          />
        )}
      </nav>
    </header>
  );
}
