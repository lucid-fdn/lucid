"use client"

import {
  Activity,
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  FlaskConical,
  GitBranch,
  Inbox,
  LayoutDashboard,
  MonitorCheck,
  PackageCheck,
  PlayCircle,
  Plug,
  ServerCog,
  Shield,
  BookOpen,
  MessageSquare,
  Stethoscope,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/ui/components/sidebar"
import { NavItem } from "./nav-item"
import { NavSection } from "./nav-section"

export type MissionControlSidebarLinks = {
  overview?: string | null
  activity?: string | null
  replay?: string | null
  browser?: string | null
  agentOps?: string | null
  routines?: string | null
  knowledge?: string | null
  conversations?: string | null
  integrations?: string | null
  commerce?: string | null
  proofReceipts?: string | null
  system?: string | null
  spend?: string | null
  work?: string | null
  inbox?: string | null
  doctor?: string | null
  proposedChanges?: string | null
  experiments?: string | null
  dagTemplates?: string | null
  templates?: string | null
}

export function MissionControlContextSidebar({
  onBack,
  links,
}: {
  onBack?: () => void
  links: MissionControlSidebarLinks
}) {
  if (!links.overview) return null

  return (
    <>
      <SidebarGroup className="pb-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onBack}
              tooltip="Back to primary menu"
              className="h-9 justify-start gap-2 px-2"
            >
                <ChevronLeft className="h-4 w-4" />
              <span className="flex-1 truncate text-center text-sm font-medium text-foreground">
                Mission Control
              </span>
              <span aria-hidden="true" className="h-4 w-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup className="pt-1">
        <SidebarMenu>
          <NavItem href={links.overview} icon={LayoutDashboard} label="Overview" />
        </SidebarMenu>
      </SidebarGroup>

      <NavSection title="Monitor" defaultOpen>
        {links.activity ? <NavItem href={links.activity} icon={Activity} label="Activity" /> : null}
        {links.conversations ? <NavItem href={links.conversations} icon={MessageSquare} label="Conversations" /> : null}
        {links.spend ? <NavItem href={links.spend} icon={DollarSign} label="Spend" /> : null}
      </NavSection>

      <NavSection title="Operate" defaultOpen>
        {links.work ? <NavItem href={links.work} icon={BriefcaseBusiness} label="Work Queue" /> : null}
        {links.routines ? <NavItem href={links.routines} icon={CalendarClock} label="Routines" /> : null}
        {links.agentOps ? <NavItem href={links.agentOps} icon={ClipboardCheck} label="Agent Ops" /> : null}
        {links.inbox ? <NavItem href={links.inbox} icon={Inbox} label="Needs Human" /> : null}
        {links.templates ? <NavItem href={links.templates} icon={PackageCheck} label="Templates" /> : null}
        {links.browser ? <NavItem href={links.browser} icon={MonitorCheck} label="Browser Operator" /> : null}
        {links.integrations ? <NavItem href={links.integrations} icon={Plug} label="Integrations" /> : null}
        {links.commerce ? <NavItem href={links.commerce} icon={CreditCard} label="Commerce" /> : null}
      </NavSection>

      <NavSection title="Debug" defaultOpen>
        {links.replay ? <NavItem href={links.replay} icon={PlayCircle} label="Replay" /> : null}
        {links.doctor ? <NavItem href={links.doctor} icon={Stethoscope} label="Lucid Doctor" /> : null}
        {links.system ? <NavItem href={links.system} icon={ServerCog} label="System" /> : null}
        {links.proofReceipts ? <NavItem href={links.proofReceipts} icon={Shield} label="Proof Receipts" /> : null}
      </NavSection>

      <NavSection title="Advanced" defaultOpen={false}>
        {links.knowledge ? <NavItem href={links.knowledge} icon={BookOpen} label="Knowledge" /> : null}
        {links.proposedChanges ? <NavItem href={links.proposedChanges} icon={GitBranch} label="Proposed Changes" /> : null}
        {links.experiments ? <NavItem href={links.experiments} icon={FlaskConical} label="Experiments" /> : null}
        {links.dagTemplates ? <NavItem href={links.dagTemplates} icon={GitBranch} label="Workflow Templates" /> : null}
      </NavSection>
    </>
  )
}
