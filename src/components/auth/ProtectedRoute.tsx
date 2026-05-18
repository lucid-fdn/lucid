import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Spinner from '@/components/Spinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallbackUrl?: string;
}

export function ProtectedRoute({
  children,
  fallbackUrl = '/'
}: ProtectedRouteProps) {
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.push(fallbackUrl);
    }
  }, [ready, isAuthenticated, router, fallbackUrl]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
