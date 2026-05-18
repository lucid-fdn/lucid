'use client';

import React from 'react';
import { SidebarProvider } from '@/ui/components/sidebar';
import { UnifiedNavbar } from '@/components/navigation';
import { WorkspaceSidebar } from '@/components/navigation/workspace-sidebar';
import dynamic from 'next/dynamic';

const SettingsModal = dynamic(() => import('@/components/settings/settings-modal').then(mod => ({ default: mod.SettingsModal })), { ssr: false });
const SettingsContent = dynamic(() => import('@/components/settings/settings-content').then(mod => ({ default: mod.SettingsContent })), { ssr: false });
import { useSidebarDefault } from '@/contexts/sidebar-context';

interface WorkflowsClientLayoutProps {
  children: React.ReactNode;
  userWorkspaces: Array<{
    id: string;
    slug: string;
    name: string;
    type: string;
    role: string;
    logo_url?: string;
    member_count?: number;
    plan_name?: string;
  }>;
  currentWorkspaceSlug: string;
}

export function WorkflowsClientLayout({
  children,
  userWorkspaces,
  currentWorkspaceSlug,
}: WorkflowsClientLayoutProps) {
  const [showSettings, setShowSettings] = React.useState(false);
  const [currentTab, setCurrentTab] = React.useState('profile');
  const { defaultOpen } = useSidebarDefault();

  const handleSettingsClick = React.useCallback((tab?: string) => {
    setCurrentTab(tab || 'profile');
    setShowSettings(true);
  }, []);
  
  // Find current workspace
  const currentWorkspace = userWorkspaces.find((w) => w.slug === currentWorkspaceSlug);

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
        <UnifiedNavbar
          variant="studio"
          onSettingsClick={handleSettingsClick}
          workspaceSlug={currentWorkspaceSlug}
          userWorkspaces={userWorkspaces}
        />
        <div className="flex flex-1">
          <WorkspaceSidebar
            className="mt-14 h-[calc(100vh-3.5rem)]"
            onSettingsClick={handleSettingsClick}
            userWorkspaces={userWorkspaces}
            currentWorkspaceSlug={currentWorkspaceSlug}
          />
          <div className="flex h-full flex-col pt-14 w-full">
            <div className="flex flex-1 flex-col gap-4 overflow-x-hidden">
              {children}
            </div>
          </div>
        </div>

        <SettingsModal
          open={showSettings}
          onOpenChange={setShowSettings}
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          workspaceName={currentWorkspace?.name}
          userRole={currentWorkspace?.role}
        >
          <SettingsContent
            currentTab={currentTab}
            userWorkspaces={userWorkspaces}
          />
        </SettingsModal>
      </SidebarProvider>
  );
}
