import { ReactNode, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface RequireBusinessSetupProps {
  children: ReactNode;
}

interface BusinessSetupStatus {
  stripeConnected: boolean;
  hasServices: boolean;
  hasMemberships: boolean;
  hasRewards: boolean;
  hasPatients: boolean;
  allComplete: boolean;
}

export function RequireBusinessSetup({ children }: RequireBusinessSetupProps) {
  const [location, setLocation] = useLocation();

  // Check business setup status
  const { data: setupStatus, isLoading } = useQuery<BusinessSetupStatus>({
    queryKey: ['/api/clinic/setup-status'],
  });

  useEffect(() => {
    if (!isLoading && setupStatus && !setupStatus.allComplete) {
      // If not on setup page and setup is incomplete, redirect to setup wizard
      if (!location.startsWith('/clinic/setup')) {
        setLocation('/clinic/setup');
      }
    }
  }, [setupStatus, isLoading, location, setLocation]);

  // Show loading while checking setup status
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking business setup...</p>
        </div>
      </div>
    );
  }

  // If setup is incomplete and we're not on setup page, redirect
  if (setupStatus && !setupStatus.allComplete && !location.startsWith('/clinic/setup')) {
    return null; // Redirect will happen in useEffect
  }

  // If setup is complete or we're on setup page, show content
  return <>{children}</>;
}