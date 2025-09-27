import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useOrganization } from "@/hooks/useOrganization";

interface StripeAccountStatus {
  hasAccount: boolean;
  accountId: string | null;
  businessFeaturesEnabled: boolean;
  payouts_enabled: boolean;
  capabilities: {
    transfers: string;
  };
  external_accounts: any[];
}

/**
 * Hook that enforces payment setup requirement for business features.
 * Redirects to payment setup page if businessFeaturesEnabled is false.
 * 
 * @param bypass - Skip the redirect (used on payment setup page itself)
 * @returns object with loading state and feature enabled status
 */
export function usePaymentRequired(bypass: boolean = false) {
  const { organization } = useOrganization();
  const [, setLocation] = useLocation();

  const { data: accountStatus, isLoading } = useQuery<StripeAccountStatus>({
    queryKey: ["/api/stripe/account/status", organization?.id],
    enabled: !!organization?.id,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const businessFeaturesEnabled = accountStatus?.businessFeaturesEnabled || false;

  useEffect(() => {
    // Don't redirect if:
    // 1. Still loading
    // 2. Bypass is enabled (payment setup page)
    // 3. Business features are already enabled
    // 4. No organization (shouldn't happen for clinic users)
    if (isLoading || bypass || businessFeaturesEnabled || !organization?.id) {
      return;
    }

    // Redirect to payment setup if business features are not enabled
    console.log("Business features not enabled, redirecting to payment setup");
    setLocation("/clinic/payment-setup");
  }, [isLoading, bypass, businessFeaturesEnabled, organization?.id, setLocation]);

  return {
    isLoading,
    businessFeaturesEnabled,
    accountStatus,
    // Only allow access if features are enabled or bypass is true
    hasAccess: businessFeaturesEnabled || bypass
  };
}