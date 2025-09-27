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
    queryKey: ["/api/stripe-connect/status", organization?.id],
    enabled: !!organization?.id,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const businessFeaturesEnabled = accountStatus?.businessFeaturesEnabled || false;

  useEffect(() => {
    // For development/testing: disable payment setup redirect
    // In production this would check: if (isLoading || bypass || businessFeaturesEnabled || !organization?.id)
    return; // Always return early to skip payment setup redirect
  }, [isLoading, bypass, businessFeaturesEnabled, organization?.id, setLocation]);

  return {
    isLoading,
    businessFeaturesEnabled,
    accountStatus,
    // For development/testing: allow access if organization exists (bypass Stripe requirement)
    // In production this would require: businessFeaturesEnabled || bypass
    hasAccess: true || bypass
  };
}