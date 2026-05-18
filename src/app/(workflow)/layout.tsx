'use client';

import { WorkflowProviders } from './providers';

export default function WorkflowRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkflowProviders>{children}</WorkflowProviders>;
}
