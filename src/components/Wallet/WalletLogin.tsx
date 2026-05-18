import { useWallet } from './WalletProvider';
import { AuthButton } from "@/components/ui/auth-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/primitives/radix/tooltip'
import { shortenAddress } from '@/utils/address';
import { useSidebar } from "@/ui/components/sidebar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  WalletIcon,
} from '@heroicons/react/24/outline';
import Image from 'next/image';

export const WalletLogin = () => {
  const { isMobile, state: _state } = useSidebar();
  const {
    isConnected,
    evmWallet,
    solanaWallet,
    disconnect,
  } = useWallet();

  // Determine chain icon and name
  let chainIcon = '';
  let chainName = '';
  let shortAddr = '';

  if (evmWallet) {
    chainIcon = '/logos/icon/ethereum.svg';
    chainName = 'Ethereum';
    shortAddr = shortenAddress(evmWallet.address);
  } else if (solanaWallet) {
    chainIcon = '/logos/icon/solana.svg';
    chainName = 'Solana';
    shortAddr = shortenAddress(solanaWallet.address);
  }

  const connectedContent = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          className="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground h-12"
          data-slot="sidebar-menu-button"
          data-sidebar="menu-button"
          data-size="lg"
        >
          <Avatar className="cursor-pointer mr-1 h-9 w-9 relative overflow-visible">
            <AvatarImage className="rounded-lg" src="/logos/icon/userlogo.svg" alt="User Avatar" />
            <AvatarFallback className="rounded-lg">CN</AvatarFallback>
            {chainIcon && (
              <Image
                src={chainIcon}
                alt="chain"
                width={16}
                height={16}
                className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-white/10 translate-x-1/3 translate-y-1/3"
              />
            )}
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate text-sm font-medium">{shortAddr}</span>
            <span className="truncate text-xs text-zinc-500">{chainName}</span>
          </div>
          <ChevronDownIcon className="ml-1 h-5 w-5" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuItem
          onClick={disconnect}
          className="cursor-pointer"
        >
          <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
          <span>Disconnect</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-full">
          <AuthButton
            variant="outline"
            className="w-full"
            authenticatedContent={connectedContent}
          >
            <WalletIcon className="mr-2 h-4 w-4" />
            <span>Log In</span>
          </AuthButton>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isConnected ? 'Connected' : 'Log In'}</p>
      </TooltipContent>
    </Tooltip>
  );
};
