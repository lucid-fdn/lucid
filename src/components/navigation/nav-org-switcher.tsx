"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronUpDownIcon, PlusIcon } from "@heroicons/react/24/outline";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useWorkspace } from "@/contexts/workspace-context";

interface Organization {
  id: string;
  slug: string;
  name: string;
  logo_url?: string;
}

export function NavOrgSwitcher() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { workspace, switchOrg } = useWorkspace();
  const [open, setOpen] = useState(false);

  // Fetch user's organizations
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["organizations", "user"],
    queryFn: async () => {
      const response = await fetch("/api/organizations/user", {
        credentials: "include",
      });
      if (!response.ok) {
        // Return empty array if endpoint doesn't exist or unauthorized
        if (response.status === 401 || response.status === 404) return [];
        throw new Error("Failed to fetch organizations");
      }
      return response.json();
    },
    enabled: isAuthenticated,
    staleTime: 60_000, // 1 minute
    retry: false, // Don't retry failed requests (prevents 404 spam)
  });

  if (!isAuthenticated || organizations.length === 0) {
    return null;
  }

  const currentOrg = (workspace?.org ? {
    id: workspace.org.id,
    slug: workspace.org.slug,
    name: workspace.org.name,
    logo_url: undefined
  } : organizations[0]) as Organization;

  const handleSelectOrg = (orgId: string) => {
    switchOrg(orgId); // Updates global workspace context
    setOpen(false);
  };

  const handleCreateOrg = () => {
    router.push("/onboarding/workspace/new?create=1");
    setOpen(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="h-10 justify-between gap-2 px-2 hover:bg-accent"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6">
              <AvatarImage src={currentOrg.logo_url} alt={currentOrg.name} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {getInitials(currentOrg.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium max-w-[120px]">
              {currentOrg.name}
            </span>
          </div>
          <ChevronUpDownIcon className="h-4 w-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-2" align="start">
        <div className="space-y-1">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSelectOrg(org.id)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent transition-colors duration-120",
                currentOrg.id === org.id && "bg-accent"
              )}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={org.logo_url} alt={org.name} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials(org.name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate flex-1 text-left">{org.name}</span>
              {currentOrg.id === org.id && (
                <CheckIcon className="h-4 w-4 text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
        <Separator className="my-2" />
        <button
          onClick={handleCreateOrg}
          className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent transition-colors duration-120"
        >
          <div className="h-6 w-6 rounded-md border border-dashed border-muted-foreground/50 flex items-center justify-center">
            <PlusIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-left">Create organization</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
