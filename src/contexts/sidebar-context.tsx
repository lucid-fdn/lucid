'use client';

import React from 'react';

interface SidebarContextValue {
  defaultOpen: boolean;
}

const SidebarContext = React.createContext<SidebarContextValue>({ defaultOpen: true });

export function SidebarProvider({ 
  children, 
  defaultOpen 
}: { 
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  return (
    <SidebarContext.Provider value={{ defaultOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarDefault() {
  return React.useContext(SidebarContext);
}
