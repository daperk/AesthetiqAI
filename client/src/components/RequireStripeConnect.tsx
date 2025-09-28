import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface StripeConnectStatus {
  hasAccount: boolean;
  accountId: string | null;
  ready: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  hasExternalAccount: boolean;
  requirements: string[];
}

interface RequireStripeConnectProps {
  children: React.ReactNode;
  allowedPaths?: string[];
}

export default function RequireStripeConnect({ 
  children, 
  allowedPaths = ["/clinic/payment-setup"] 
}: RequireStripeConnectProps) {
  const { organization } = useOrganization();
  const [location, setLocation] = useLocation();

  const { data: stripeStatus, isLoading } = useQuery<StripeConnectStatus>({
    queryKey: ["/api/stripe-connect/status", organization?.id],
    enabled: !!organization?.id,
    staleTime: 10000, // 10 seconds
  });

  useEffect(() => {
    // If we're already on an allowed path, don't redirect
    if (allowedPaths.some(path => location.startsWith(path))) {
      return;
    }

    // If Stripe Connect is not ready, redirect to mandatory setup
    if (stripeStatus && (!stripeStatus.hasAccount || !stripeStatus.ready)) {
      console.log("🔒 [STRIPE-MANDATORY] Redirecting to mandatory Stripe Connect setup");
      setLocation("/clinic/payment-setup?mandatory=true");
    }
  }, [stripeStatus, location, setLocation, allowedPaths]);

  // Show loading while checking status
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If we're on payment setup path, always show it
  if (allowedPaths.some(path => location.startsWith(path))) {
    return <>{children}</>;
  }

  // If Stripe Connect is ready, show the protected content
  if (stripeStatus?.hasAccount && stripeStatus?.ready) {
    return <>{children}</>;
  }

  // Fallback: redirect to setup (this shouldn't normally be reached due to useEffect)
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}