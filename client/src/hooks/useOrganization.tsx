import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Organization } from "@/types";

export function useOrganization() {
  const { user } = useAuth();

  // For clinic_admin and staff, get organization through staff endpoint
  const {
    data: organization,
    isLoading,
    error
  } = useQuery<Organization | null>({
    queryKey: ["/api/organizations/my-organization"],
    enabled: !!user && (user.role === "clinic_admin" || user.role === "staff"),
    retry: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    organization: organization || null,
    isLoading,
    error,
  };
}
