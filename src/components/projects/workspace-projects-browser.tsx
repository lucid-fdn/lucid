"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  FolderKanban,
  LayoutGrid,
  List,
  Settings,
  Plus,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  EmptyState,
  PageHeader,
  PageShell,
  SearchToolbar,
  ViewSwitcher,
} from "@/components/page"
import { LogoIcon } from "@/components/ui/logo-icon"
import { CanvasGridSurface } from "@/components/ui/canvas-grid-surface"
import { EngineIcon } from "@/components/icons/engine-icon"
import { cn } from "@/lib/utils"
import { ProjectCardShell } from "@/components/projects/project-card-shell"
import {
  buildProjectAgentsPath,
  buildProjectOverviewPath,
  buildProjectSettingsPath,
} from "@/lib/projects/urls"
import type { ProjectSummary } from "@/lib/db/projects"

type ViewMode = "grid" | "list"

export interface ProjectBrowserProject extends ProjectSummary {
  channelSlugs: string[]
  integrationSlugs: string[]
  engines: string[]
  totalAgents: number
  liveAgents: number
}

interface WorkspaceProjectsBrowserProps {
  workspaceSlug: string
  projects: ProjectBrowserProject[]
}

export function WorkspaceProjectsBrowser({
  workspaceSlug,
  projects: initialProjects,
}: WorkspaceProjectsBrowserProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [projects, setProjects] = React.useState(initialProjects)

  React.useEffect(() => {
    setProjects(initialProjects)
  }, [initialProjects])

  const filteredProjects = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return projects

    return projects.filter((project) =>
      project.name.toLowerCase().includes(q) ||
      project.slug.toLowerCase().includes(q) ||
      (project.description ?? "").toLowerCase().includes(q),
    )
  }, [projects, searchQuery])

  const newProjectAction = (
    <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 rounded-xl px-4">
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => router.push(`/${workspaceSlug}/new`)}>
                <FolderKanban className="mr-2 h-4 w-4" />
                New project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/${workspaceSlug}/new?view=templates`)}>
                <Sparkles className="mr-2 h-4 w-4" />
                Browse templates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
  )

  return (
    <PageShell contentClassName="gap-6 px-6 py-6">
      <PageHeader
        className="rounded-2xl border border-b border-border/70 bg-card/40 px-5 py-4"
        title="Projects"
        description={`${filteredProjects.length} ${filteredProjects.length === 1 ? 'project' : 'projects'} in this workspace. Projects organize agents, teams, workflows, apps, and proof.`}
        actions={newProjectAction}
      />

      <SearchToolbar
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder="Search projects..."
        trailing={
          <ViewSwitcher<ViewMode>
            value={viewMode}
            onValueChange={setViewMode}
            options={[
              { value: 'grid', icon: LayoutGrid, label: 'Grid' },
              { value: 'list', icon: List, label: 'List' },
            ]}
          />
        }
      />

        {filteredProjects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title={projects.length === 0 ? "No projects yet" : "No matching projects"}
            description={projects.length === 0
              ? "Create your first project to organize agents, teams, workflows, apps, and proof."
              : "Try a different search term or clear the current filter."}
            action={projects.length === 0 ? newProjectAction : null}
          />
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                workspaceSlug={workspaceSlug}
                project={project}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/80">
            {filteredProjects.map((project, index) => (
              <ProjectListRow
                key={project.id}
                workspaceSlug={workspaceSlug}
                project={project}
                isLast={index === filteredProjects.length - 1}
              />
            ))}
          </div>
        )}
    </PageShell>
  )
}

function ProjectCard({
  workspaceSlug,
  project,
}: {
  workspaceSlug: string
  project: ProjectBrowserProject
}) {
  const router = useRouter()
  const projectHref = buildProjectOverviewPath(workspaceSlug, project.slug)

  return (
    <ProjectCardShell
      title={project.name}
      role="link"
      tabIndex={0}
      onClick={() => router.push(projectHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          router.push(projectHref)
        }
      }}
      className="cursor-pointer"
      menu={
        <>
          <DropdownMenuItem
            onClick={() => router.push(projectHref)}
          >
            <FolderKanban className="mr-2 h-4 w-4" />
            Open project
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(buildProjectAgentsPath(workspaceSlug, project.slug))}
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Open agents
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => router.push(buildProjectSettingsPath(workspaceSlug, project.slug))}
          >
            <Settings className="mr-2 h-4 w-4" />
            Project settings
          </DropdownMenuItem>
        </>
      }
      background={
        <>
          <CanvasGridSurface rounded />
          <div className="absolute inset-x-0 top-0 z-[1] h-[70%] bg-gradient-to-b from-background/95 via-background/55 to-transparent" />
        </>
      }
    >
      <ProjectPreviewContent project={project} />
    </ProjectCardShell>
  )
}

function ProjectPreviewContent({ project }: { project: ProjectBrowserProject }) {
  const slots = getAppSlots(project)

  return (
    <div className="relative z-10 flex min-h-[140px] flex-col justify-between pt-2">
      <div className="flex flex-1 items-center justify-center pt-3">
        {slots.length > 0 ? (
          <div className={cn("grid w-fit gap-[10px]", getPreviewGridClass(slots.length))}>
            {slots.map((slot) =>
              slot.type === "icon" ? (
                <div
                  key={slot.slug}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background/95 shadow-sm transition-colors group-hover:bg-accent/50 dark:border-white/10"
                >
                  <LogoIcon slug={slot.slug} size={18} className="h-[18px] w-[18px] object-contain" />
                </div>
              ) : (
                <div
                  key={slot.label}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background/95 text-xs font-medium text-muted-foreground shadow-sm dark:border-white/10"
                >
                  {slot.label}
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="grid w-fit grid-cols-3 gap-[10px]">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background/95 text-muted-foreground shadow-sm dark:border-white/10"
              >
                <FolderKanban className="h-4 w-4" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", getProjectHealthTone(project).dot)} />
          <span className={cn("capitalize", getProjectHealthTone(project).text)}>
            {getProjectHealthTone(project).label}
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span className={cn("truncate", getProjectHealthTone(project).text)}>
            {project.liveAgents}/{project.totalAgents} agents live
          </span>
        </div>
        <ProjectEngineFooter engines={project.engines} />
      </div>
    </div>
  )
}

function ProjectListRow({
  workspaceSlug,
  project,
  isLast,
}: {
  workspaceSlug: string
  project: ProjectBrowserProject
  isLast: boolean
}) {
  return (
    <Link
      href={buildProjectOverviewPath(workspaceSlug, project.slug)}
      className={cn(
        "flex items-center gap-4 px-4 py-4 transition-colors hover:bg-accent/20",
        !isLast && "border-b border-border/60",
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-background">
        <FolderKanban className="h-4 w-4 text-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
        </div>
      </div>

      <div className="hidden items-center gap-2 md:flex">
        {getAppSlots(project).slice(0, 4).map((slot) =>
          slot.type === "icon" ? (
            <div
              key={slot.slug}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-background"
            >
              <LogoIcon slug={slot.slug} size={14} className="h-[14px] w-[14px] object-contain" />
            </div>
          ) : (
            <div
              key={slot.label}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-background text-[11px] font-medium text-muted-foreground"
            >
              {slot.label}
            </div>
          ),
        )}
      </div>

      <div className="hidden items-center gap-3 xl:flex">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className={cn("h-2 w-2 rounded-full", getProjectHealthTone(project).dot)} />
          <span className={cn("capitalize", getProjectHealthTone(project).text)}>
            {getProjectHealthTone(project).label}
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span className={cn("truncate", getProjectHealthTone(project).text)}>
            {project.liveAgents}/{project.totalAgents} agents live
          </span>
        </div>
        <ProjectEngineFooter engines={project.engines} />
      </div>
    </Link>
  )
}

function getPreviewGridClass(slotCount: number) {
  if (slotCount <= 3) return "grid-cols-3"
  if (slotCount <= 6) return "grid-cols-4"
  return "grid-cols-4"
}

type AppSlot =
  | { type: "icon"; slug: string }
  | { type: "more"; label: string }

function getAppSlots(project: ProjectBrowserProject): AppSlot[] {
  const orderedSlugs = [...project.channelSlugs, ...project.integrationSlugs]

  if (orderedSlugs.length <= 8) {
    return orderedSlugs.map((slug) => ({ type: "icon", slug }))
  }

  return [
    ...orderedSlugs.slice(0, 7).map((slug) => ({ type: "icon" as const, slug })),
    { type: "more" as const, label: `+${orderedSlugs.length - 7}` },
  ]
}

function ProjectEngineFooter({ engines }: { engines: string[] }) {
  const engine = engines[0]
  if (!engine) return null

  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md">
      <EngineIcon
        engine={engine}
        size={18}
        className="h-[18px] w-[18px] [&_img]:h-[18px] [&_img]:w-[18px] [&_svg]:h-[18px] [&_svg]:w-[18px]"
      />
    </div>
  )
}

function getProjectHealthTone(project: ProjectBrowserProject) {
  if (project.totalAgents === 0) {
    return {
      label: "setup",
      dot: "bg-muted-foreground/60",
      text: "text-muted-foreground",
    }
  }

  if (project.liveAgents === project.totalAgents) {
    return {
      label: "live",
      dot: "bg-emerald-400",
      text: "text-muted-foreground",
    }
  }

  return {
    label: "crashed",
    dot: "bg-red-400",
    text: "text-red-400",
  }
}
