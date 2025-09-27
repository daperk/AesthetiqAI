import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Organization } from "@/types";

export function useOrganization() {
  const { user } = useAuth();

  const {
    data: organization,
    isLoading,
    error
  } = useQuery<Organization | null>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId && user.role !== "super_admin",
    retry: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    organization: organization || null,
    isLoading,
    error,
  };
}
