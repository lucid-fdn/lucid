"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import * as Icons from 'lucide-react';
import {
  projectDetailNavigation,
  replaceProjectSlug,
  type NavItem,
} from '@/config/workspace-nav';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Project Navigation Component
 * 
 * Shows project-level navigation when inside a project
 * Only visible when multiProject feature flag is enabled
 * 
 * @example
 * ```tsx
 * <ProjectNav project={currentProject} />
 * ```
 */

interface ProjectNavProps {
  project: {
    id: string;
    slug: string;
    name: string;
  };
}

export function ProjectNav({ project }: ProjectNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  // Replace [slug] placeholder with actual project slug
  const navItems = replaceProjectSlug(projectDetailNavigation, project.slug);
  
  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      {/* Project Header with Back Button */}
      <div className="border-b p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/workspace')}
          className="mb-2 w-full justify-start"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workspace
        </Button>
        
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {project.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{project.name}</p>
            <p className="text-xs text-muted-foreground">Project</p>
          </div>
        </div>
      </div>
      
      {/* Navigation Content */}
      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavItemButton
              key={item.href}
              item={item}
              isActive={pathname === item.href}
            />
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}

/**
 * Navigation Item Button (reused from WorkspaceNav)
 */
interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
}

function NavItemButton({ item, isActive }: NavItemButtonProps) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors duration-120",
        isActive
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
    </Link>
  );
}

/**
 * Navigation Icon Component
 */
function NavIcon({ name }: { name: string }) {
  const Icon = (Icons as Record<string, unknown>)[name] as React.ComponentType<{ className?: string }>;
  
  if (!Icon) {
    return null;
  }
  
  return <Icon className="h-4 w-4" />;
}
