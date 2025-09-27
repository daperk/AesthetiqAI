import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

interface WhiteLabelSettings {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logo?: string;
  favicon?: string;
  portalName?: string;
  theme?: Record<string, any>;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  whiteLabelSettings?: WhiteLabelSettings;
  isActive: boolean;
}

interface BrandingContextType {
  organization: Organization | null;
  isLoading: boolean;
  error: string | null;
  applyBranding: (org: Organization) => void;
  clearBranding: () => void;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}

interface BrandingProviderProps {
  children: ReactNode;
  organizationSlug?: string;
}

export function BrandingProvider({ children, organizationSlug }: BrandingProviderProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch organization data when slug is provided
  const { data: fetchedOrg, isLoading, error: queryError } = useQuery({
    queryKey: ["/api/organizations/by-slug", organizationSlug],
    enabled: !!organizationSlug,
  });

  // Apply CSS variables for theming
  const applyCSSVariables = (whiteLabelSettings: WhiteLabelSettings) => {
    const root = document.documentElement;
    
    if (whiteLabelSettings.primaryColor) {
      root.style.setProperty("--primary", whiteLabelSettings.primaryColor);
    }
    if (whiteLabelSettings.secondaryColor) {
      root.style.setProperty("--secondary", whiteLabelSettings.secondaryColor);
    }
    if (whiteLabelSettings.accentColor) {
      root.style.setProperty("--accent", whiteLabelSettings.accentColor);
    }

    // Update document title if portal name is provided
    if (whiteLabelSettings.portalName) {
      document.title = whiteLabelSettings.portalName;
    }

    // Update favicon if provided
    if (whiteLabelSettings.favicon) {
      const favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (favicon) {
        favicon.href = whiteLabelSettings.favicon;
      }
    }
  };

  // Clear branding back to defaults
  const clearBranding = () => {
    const root = document.documentElement;
    root.style.removeProperty("--primary");
    root.style.removeProperty("--secondary");
    root.style.removeProperty("--accent");
    document.title = "Aesthiq";
    setOrganization(null);
    setError(null);
  };

  // Apply branding from organization data
  const applyBranding = (org: Organization) => {
    setOrganization(org);
    if (org.whiteLabelSettings) {
      applyCSSVariables(org.whiteLabelSettings);
    }
  };

  // Effect to handle fetched organization data
  useEffect(() => {
    if (fetchedOrg) {
      applyBranding(fetchedOrg);
    }
  }, [fetchedOrg]);

  // Effect to handle query errors
  useEffect(() => {
    if (queryError) {
      setError("Failed to load clinic branding");
    } else {
      setError(null);
    }
  }, [queryError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (organization) {
        clearBranding();
      }
    };
  }, []);

  const contextValue: BrandingContextType = {
    organization,
    isLoading,
    error,
    applyBranding,
    clearBranding,
  };

  return (
    <BrandingContext.Provider value={contextValue}>
      {children}
    </BrandingContext.Provider>
  );
}

// Hook to get branded clinic name or fallback to Aesthiq
export function useBrandedName() {
  const { organization } = useBranding();
  return organization?.whiteLabelSettings?.portalName || organization?.name || "Aesthiq";
}

// Hook to get clinic logo or fallback to Aesthiq branding
export function useBrandedLogo() {
  const { organization } = useBranding();
  return organization?.whiteLabelSettings?.logo || null;
}

// Patient-specific branding provider that fetches organization based on client record
interface PatientBrandingProviderProps {
  children: ReactNode;
}

interface ClientRecord {
  id: string;
  userId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export function PatientBrandingProvider({ children }: PatientBrandingProviderProps) {
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(null);

  // Fetch client record to get organization slug
  const { data: clientData, isLoading } = useQuery<ClientRecord | null>({
    queryKey: ["/api/clients/me"],
    enabled: true, // Always try to fetch for authenticated users
  });

  // Fetch organization data once we have the client record
  const { data: organizationData } = useQuery<Organization>({
    queryKey: ["/api/organizations", clientData?.organizationId],
    enabled: !!clientData?.organizationId,
  });

  useEffect(() => {
    if (organizationData?.slug) {
      setOrganizationSlug(organizationData.slug);
    }
  }, [organizationData]);

  if (isLoading) {
    return <div>{children}</div>; // Show content while loading
  }

  if (organizationSlug) {
    return (
      <BrandingProvider organizationSlug={organizationSlug}>
        {children}
      </BrandingProvider>
    );
  }

  // Fallback: no branding (default Aesthiq)
  return <div>{children}</div>;
}