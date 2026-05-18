import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { WalletIcon } from 'lucide-react';
import { ComponentPropsWithoutRef } from 'react';
import Spinner from '@/components/Spinner';

type ButtonProps = ComponentPropsWithoutRef<typeof Button>;

interface AuthButtonProps extends Omit<ButtonProps, 'onClick'> {
  connectText?: string;
  disconnectText?: string;
  loadingText?: string;
  showIcon?: boolean;
  asChild?: boolean;
  children?: React.ReactNode;
  authenticatedContent?: React.ReactNode;
}

export function AuthButton({
  connectText = 'Log In',
  disconnectText = 'Disconnect',
  loadingText = 'Loading...',
  variant = 'default',
  showIcon = true,
  asChild: _asChild = false,
  className,
  children,
  authenticatedContent,
  ...props
}: AuthButtonProps) {
  const { login, logout, isAuthenticated, ready } = useAuth();

  const handleClick = () => {
    if (isAuthenticated) {
      logout();
    } else {
      login();
    }
  };

  // Show loading state
  if (!ready) {
    return (
      <Button
        variant={variant}
        disabled
        className={className}
        {...props}
      >
        <Spinner />
        <span>{loadingText}</span>
      </Button>
    );
  }

  // If authenticated and authenticatedContent is provided, show that instead
  if (isAuthenticated && authenticatedContent) {
    return <>{authenticatedContent}</>;
  }

  // If children are provided, render them with authentication state
  if (children) {
    return (
      <Button
        variant={variant}
        onClick={handleClick}
        className={className}
        {...props}
      >
        {children}
      </Button>
    );
  }

  // Default button UI
  return (
    <Button
      variant={variant}
      onClick={handleClick}
      className={className}
      {...props}
    >
      {showIcon && <WalletIcon className="h-4 w-4" />}
      <span>
        {isAuthenticated ? disconnectText : connectText}
      </span>
    </Button>
  );
}