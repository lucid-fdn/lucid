"use client"

import * as React from "react"
import { Check, ChevronsUpDown, FolderKanban } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/ui/components/sidebar"
import { useWorkspace } from "@/contexts/workspace-context"
import { buildProjectSwitcherTarget, buildWorkspaceProjectsIndexUrl } from "@/lib/projects/urls"
import { useProjects, type ProjectOption } from "@/hooks/use-projects"

interface ProjectDropdownProps {
  workspaceSlug?: string | null
  workspaceId?: string | null
  collapsed?: boolean
  className?: string
}

export function ProjectDropdown({
  workspaceSlug,
  collapsed = false,
  className,
}: ProjectDropdownProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { workspace, loading, switchProject } = useWorkspace()
  const { projects, isLoadingProjects } = useProjects(workspace?.org?.id)

  if (collapsed || loading || !workspaceSlug || !workspace?.project) {
    return null
  }

  const currentProject = workspace.project
  const hasProjects = projects.length > 0

  const handleProjectSwitch = (project: ProjectOption) => {
    switchProject(project.id)
    router.push(buildProjectSwitcherTarget(workspaceSlug, project.slug, pathname))
  }

  return (
    <SidebarMenu className={className}>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <FolderKanban className="h-4 w-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{currentProject.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Current project
                </span>
              </div>
              <ChevronsUpDown className="ml-auto h-4 w-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
              Projects
            </DropdownMenuLabel>
            {isLoadingProjects ? (
              <DropdownMenuItem disabled>
                Loading projects...
              </DropdownMenuItem>
            ) : hasProjects ? (
              projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleProjectSwitch(project)}
                  className="cursor-pointer"
                >
                  <FolderKanban className="mr-2 h-4 w-4" />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate">{project.name}</span>
                    {project.is_default ? (
                      <span className="text-[10px] text-muted-foreground">Default</span>
                    ) : null}
                  </div>
                  {project.id === currentProject.id ? (
                    <Check className="ml-2 h-4 w-4" />
                  ) : null}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>
                No projects yet
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(buildWorkspaceProjectsIndexUrl(workspaceSlug) ?? '/')}>
              <FolderKanban className="mr-2 h-4 w-4" />
              Open project index
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
