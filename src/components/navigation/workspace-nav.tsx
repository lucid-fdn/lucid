"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useWorkspace } from '@/contexts/workspace-context';
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context';
import {
  workspaceNavigation,
  projectsNavigation,
  bottomNavigation,
  upgradeNavItem,
  filterNavigationByPlan,
  type NavItem,
} from '@/config/workspace-nav';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Workspace Navigation Component
 * 
 * Shows workspace-level navigation
 * Adapts based on plan and feature flags
 * 
 * @example
 * ```tsx
 * <WorkspaceNav />
 * ```
 */
export function WorkspaceNav() {
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  const { multiProject } = useResolvedFeatureFlags();
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  
  if (!workspace) {
    return null;
  }
  
  // Get workspace plan (default to 'starter' for MVP)
  // TODO: Add plan field to organizations table
  const plan: 'starter' | 'pro' | 'business' = 'starter';
  
  // Filter navigation by plan
  const navItems = filterNavigationByPlan(workspaceNavigation, plan);
  
  // Show upgrade prompt for free users
  const showUpgrade = plan === 'starter';
  
  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      {/* Workspace Header */}
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {workspace.org?.name?.charAt(0).toUpperCase() || 'W'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">
              {workspace.org?.name || 'Workspace'}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {plan} plan
            </p>
          </div>
        </div>
      </div>
      
      {/* Navigation Content */}
      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="space-y-1">
          {/* Main workspace navigation */}
          {navItems.map((item) => (
            <NavItemButton
              key={item.href}
              item={item}
              isActive={pathname === item.href}
            />
          ))}
          
          {/* Projects section (Pro+) */}
          {multiProject && (
            <>
              <Separator className="my-2" />
              <div>
                <button
                  onClick={() => setProjectsExpanded(!projectsExpanded)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex items-center gap-2">
                    <NavIcon name={projectsNavigation.icon} />
                    <span>{projectsNavigation.title}</span>
                  </div>
                  {projectsExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                
                {projectsExpanded && (
                  <div className="ml-4 mt-1 space-y-1 border-l pl-2">
                    {(workspace.projects ?? []).map((project) => (
                      <Link
                        key={project.id}
                        href={`/${workspace.org.slug}/projects/${project.slug}`}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                          workspace.project?.id === project.id && 'bg-accent text-accent-foreground',
                        )}
                      >
                        <Icons.FolderKanban className="h-4 w-4" />
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        {workspace.project?.id === project.id ? <Icons.Check className="h-3.5 w-3.5" /> : null}
                      </Link>
                    ))}
                    <Link
                      href={`/${workspace.org.slug}/new`}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icons.Plus className="h-4 w-4" />
                      <span>New project</span>
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </nav>
      </ScrollArea>
      
      {/* Bottom navigation */}
      <div className="border-t p-3 space-y-1">
        {bottomNavigation.map((item) => (
          <NavItemButton
            key={item.href}
            item={item}
            isActive={false}
            variant="ghost"
          />
        ))}
        
        {/* Upgrade prompt */}
        {showUpgrade && (
          <NavItemButton
            item={upgradeNavItem}
            isActive={false}
            variant="default"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Navigation Item Button
 */
interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
  variant?: 'default' | 'ghost';
}

function NavItemButton({ item, isActive, variant = 'ghost' }: NavItemButtonProps) {
  const Component = item.href.startsWith('http') ? 'a' : Link;
  const linkProps = item.href.startsWith('http') 
    ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
    : { href: item.href };
  
  return (
    <Component
      {...linkProps}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors duration-120",
        variant === 'default' 
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <div className="flex items-center gap-2">
        <NavIcon name={item.icon} />
        <span>{item.title}</span>
      </div>
      
      {item.badge && (
        <Badge variant={item.badge.variant || 'default'}>
          {item.badge.text}
        </Badge>
      )}
    </Component>
  );
}

/**
 * Navigation Icon Component
 * Dynamically loads Lucide icon by name
 */
function NavIcon({ name }: { name: string }) {
  const Icon = (Icons as Record<string, unknown>)[name] as React.ComponentType<{ className?: string }>;
  
  if (!Icon) {
    return null;
  }
  
  return <Icon className="h-4 w-4" />;
}
