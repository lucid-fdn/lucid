"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  ArrowRightOnRectangleIcon,
  BuildingOffice2Icon,
  CheckIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

import { useAuth } from "@/contexts/auth-context";
import { useProfile } from "@/contexts/profile-context";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingRedirect } from "@/components/loading-redirect";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useLimit, UpgradeCard } from "@/components/access-control";
import { isWeb3Enabled } from "@/lib/auth/client-config";
import { getEmbeddedWallets, getExternalWallets } from "@/lib/user/user-helpers";
import type { PrivyUser } from "@/lib/user/user-types";
import { shortenAddress } from "@/utils/address";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Privy LinkedWallet has variable shape
function getWalletIcon(wallet: any) {
  if (wallet.walletClientType === "metamask" || wallet.walletClient === "metamask") return "/logos/icon/metamask.svg";
  if (wallet.walletClientType === "phantom" || wallet.walletClient === "phantom") return "/logos/icon/phantom.svg";
  if (wallet.walletClientType === "coinbase_wallet" || wallet.walletClient === "coinbase") return "/logos/icon/coinbase.svg";
  if (wallet.walletClientType === "rainbow" || wallet.walletClient === "rainbow") return "/logos/icon/rainbow.svg";
  if (wallet.chainType === "solana" || wallet.chainId?.includes("solana")) return "/logos/icon/solana.svg";
  if (wallet.chainType === "ethereum" || wallet.chainId?.startsWith("eip155:")) return "/logos/icon/ethereum.svg";
  if (wallet.chainType === "bitcoin" || wallet.chainId?.includes("bitcoin")) return "/logos/icon/bitcoin.svg";
  return "/logos/icon/wallet.svg";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Privy LinkedWallet has variable shape
function getWalletLabel(wallet: any) {
  if (wallet.chainType === "solana" || wallet.chainId?.includes("solana")) return "Solana";
  if (wallet.chainType === "ethereum" || wallet.chainId?.startsWith("eip155:")) return "Ethereum";
  if (wallet.chainType === "bitcoin" || wallet.chainId?.includes("bitcoin")) return "Bitcoin";
  return "Wallet";
}

function WalletMenuSection() {
  const { user: privyUser, connectWallet } = usePrivy();
  const { copy } = useCopyToClipboard();

  const embeddedWallets = getEmbeddedWallets(privyUser as unknown as PrivyUser);
  const externalWallets = getExternalWallets(privyUser as unknown as PrivyUser);

  return (
    <>
      <DropdownMenuSeparator />
      {embeddedWallets.length > 0 && (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Wallets created by Lucid
          </DropdownMenuLabel>
          {embeddedWallets.map((wallet, index) => (
            <DropdownMenuItem
              key={`embedded-${wallet.address}-${index}`}
              onClick={() => copy(wallet.address, "Address copied!")}
              className="cursor-pointer"
            >
              <Image src={getWalletIcon(wallet)} alt={getWalletLabel(wallet)} width={16} height={16} className="mr-2 h-4 w-4" />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-mono">{shortenAddress(wallet.address)}</span>
              </div>
              <DocumentDuplicateIcon className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      )}
      {externalWallets.length > 0 && (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Wallets you connected
          </DropdownMenuLabel>
          {externalWallets.map((wallet, index) => (
            <DropdownMenuItem
              key={`external-${wallet.address}-${index}`}
              onClick={() => copy(wallet.address, "Address copied!")}
              className="cursor-pointer"
            >
              <Image src={getWalletIcon(wallet)} alt={getWalletLabel(wallet)} width={16} height={16} className="mr-2 h-4 w-4" />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-mono">{shortenAddress(wallet.address)}</span>
              </div>
              <DocumentDuplicateIcon className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      )}
      <DropdownMenuItem onClick={() => connectWallet()} className="cursor-pointer">
        <PlusIcon className="mr-2 h-4 w-4" />
        <span>Connect Wallet</span>
      </DropdownMenuItem>
    </>
  );
}

function ThemeMenuItem() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = !mounted || theme === "dark";

  return (
    <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")} className="cursor-pointer">
      {isDark ? <SunIcon className="mr-2 h-4 w-4" /> : <MoonIcon className="mr-2 h-4 w-4" />}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </DropdownMenuItem>
  );
}

interface NavUserMenuProps {
  onSettingsClick?: (tab?: string) => void;
  userWorkspaces?: Array<{
    id: string
    slug: string
    name: string
    type: string
    role: string
    logo_url?: string
    member_count?: number
    plan_name?: string
  }>;
  currentWorkspaceSlug?: string | null;
}

export function NavUserMenu({
  onSettingsClick,
  userWorkspaces = [],
  currentWorkspaceSlug,
}: NavUserMenuProps = {}) {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { profile, loading: _loading } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const [showUpgradeCard, setShowUpgradeCard] = useState(false);

  const hasData = isAuthenticated && user;
  const currentWorkspace = userWorkspaces.find((item) => item.slug === currentWorkspaceSlug) || userWorkspaces[0];
  const workspaceCount = userWorkspaces.length;
  const { allowed: canAddWorkspace, limit: workspaceLimit } = useLimit("maxWorkspaces", workspaceCount);

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleLogout = async () => {
    try {
      setSigningOut(true);
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
      setSigningOut(false);
    }
  };

  const handleAddWorkspace = () => {
    if (!canAddWorkspace) {
      setShowUpgradeCard(true);
      return;
    }
    router.push("/onboarding/workspace/new");
  };

  const handleWorkspaceSwitch = (workspaceSlug: string) => {
    if (workspaceSlug === currentWorkspaceSlug) return;
    router.push(`/${workspaceSlug}/dashboard`);
  };

  if (signingOut) return <LoadingRedirect message="Signing out..." />;

  const displayName = profile?.name || user?.name || "User";
  const displayEmail = profile?.email || user?.email || "";
  const displayAvatar = profile?.avatar_url || user?.avatar_url;

  if (!hasData) {
    return (
      <Button variant="ghost" className="relative h-10 w-10 rounded-full" disabled>
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 animate-pulse">
            <div className="h-4 w-4 rounded-full bg-muted" />
          </AvatarFallback>
        </Avatar>
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:ring-2 hover:ring-primary/20 transition-all">
            <Avatar className="h-10 w-10">
              <AvatarImage src={displayAvatar} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-primary">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{displayName}</p>
              <p className="text-xs leading-none text-muted-foreground">{displayEmail}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onSettingsClick?.("profile")} className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSettingsClick?.()} className="cursor-pointer">
            <Cog6ToothIcon className="mr-2 h-4 w-4" />
            <span>Account settings</span>
          </DropdownMenuItem>

          {currentWorkspace ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {userWorkspaces.map((item) => {
                const itemAvatar = item.type === "personal" && !item.logo_url
                  ? displayAvatar
                  : item.logo_url;
                const isCurrent = item.slug === currentWorkspaceSlug;
                const itemPlan = item.plan_name || "Free";
                const itemMemberCount = item.member_count || 1;

                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => handleWorkspaceSwitch(item.slug)}
                    className="cursor-pointer px-2 py-1.5"
                  >
                    <div className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
                      <Avatar className="h-8 w-8 rounded-lg">
                        {itemAvatar ? <AvatarImage src={itemAvatar} alt={item.name} /> : null}
                        <AvatarFallback className="rounded-lg">
                          {item.name?.[0]?.toUpperCase() || "W"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-none">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {itemPlan} · {itemMemberCount} {itemMemberCount === 1 ? "member" : "members"}
                        </p>
                      </div>
                      {isCurrent ? <CheckIcon className="h-4 w-4 shrink-0" /> : null}
                    </div>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem onClick={() => onSettingsClick?.("workspace")} className="cursor-pointer">
                <BuildingOffice2Icon className="mr-2 h-4 w-4" />
                <span>Workspace settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddWorkspace} className="cursor-pointer">
                <PlusIcon className="mr-2 h-4 w-4" />
                <span>Add workspace</span>
              </DropdownMenuItem>
            </>
          ) : null}

          {isWeb3Enabled() && <WalletMenuSection />}

          <DropdownMenuSeparator />
          <ThemeMenuItem />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          >
            <ArrowRightOnRectangleIcon className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showUpgradeCard} onOpenChange={setShowUpgradeCard}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-[500px]">
          <VisuallyHidden>
            <DialogTitle>Upgrade Required</DialogTitle>
          </VisuallyHidden>
          <UpgradeCard
            feature="Additional Workspaces"
            requiredPlan="pro"
            benefits={[
              `Create up to ${workspaceLimit === Infinity ? "unlimited" : workspaceLimit} workspaces`,
              "Advanced team collaboration",
              "Priority email support",
              "Advanced analytics",
            ]}
            disabled={true}
            disabledMessage="Coming Soon"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
