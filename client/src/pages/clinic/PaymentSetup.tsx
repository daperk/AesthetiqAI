import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  CreditCard, ExternalLink, CheckCircle, XCircle, 
  AlertTriangle, Banknote, Shield, Clock
} from "lucide-react";

interface StripeAccountStatus {
  hasAccount: boolean;
  accountId: string | null;
  onboardingUrl: string | null;
  accountStatus: string | null;
  businessFeaturesEnabled: boolean;
  requirements: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
  };
  capabilities: {
    transfers: string;
  };
  payouts_enabled: boolean;
  charges_enabled: boolean;
  external_accounts: any[];
}

export default function PaymentSetup() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  
  // Check if this is mandatory setup
  const isMandatory = new URLSearchParams(window.location.search).get('mandatory') === 'true';
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const { data: accountStatus, isLoading, refetch } = useQuery<StripeAccountStatus>({
    queryKey: ["/api/stripe-connect/status", organization?.id],
    enabled: !!organization?.id,
    staleTime: 30000, // 30 seconds
  });

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      console.log(`🔗 [FRONTEND] Generating fresh onboarding link...`);
      const response = await apiRequest("POST", "/api/stripe-connect/refresh-onboarding", {});
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`💥 [FRONTEND] Link generation failed:`, errorData);
        throw new Error(errorData.message || "Failed to generate onboarding link");
      }
      
      const data = await response.json();
      console.log(`✅ [FRONTEND] Fresh onboarding link generated:`, data.onboardingUrl);
      return data;
    },
    onSuccess: (data) => {
      console.log(`🎉 [FRONTEND] Opening fresh onboarding link:`, data.onboardingUrl);
      window.open(data.onboardingUrl, '_blank', 'noopener,noreferrer');
      toast({
        title: "Onboarding Link Generated",
        description: "Continue your Stripe setup in the new tab."
      });
      refetch(); // Refresh status
    },
    onError: (error) => {
      console.error(`❌ [FRONTEND] Link generation error:`, error);
      toast({
        title: "Failed to Generate Link", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      console.log(`🔄 [FRONTEND] Starting Stripe Connect account creation...`);
      console.log(`📋 [FRONTEND] Organization details:`, {
        organization_id: organization?.id,
        organization_name: organization?.name,
        user_email: user?.email
      });
      
      if (!organization?.id) {
        console.error(`❌ [FRONTEND] No organization found for account creation`);
        throw new Error("No organization found");
      }
      
      const requestData = {
        organizationId: organization.id,
        email: user?.email,
        businessName: organization.name,
        businessType: "company",
        country: "US"
      };
      console.log(`📤 [FRONTEND] Sending request with data:`, requestData);
      
      const response = await apiRequest("POST", "/api/stripe-connect/create-account", requestData);
      console.log(`📥 [FRONTEND] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ [FRONTEND] API request failed:`, {
          status: response.status,
          statusText: response.statusText,
          error_data: errorData
        });
        throw new Error(`API Error: ${errorData.message || 'Unknown error'}`);
      }
      
      const data = await response.json();
      console.log(`✅ [FRONTEND] Account creation successful:`, data);
      return data;
    },
    onSuccess: (data: any) => {
      console.log(`🎉 [FRONTEND] Account creation mutation succeeded:`, data);
      queryClient.invalidateQueries({ queryKey: ["/api/stripe-connect/status"] });
      
      toast({
        title: "Account Created",
        description: "Your Stripe Express account has been created. Complete the onboarding to start accepting payments.",
      });
      // Redirect to onboarding
      if (data?.onboardingUrl) {
        console.log(`🔗 [FRONTEND] Opening onboarding URL: ${data.onboardingUrl}`);
        window.open(data.onboardingUrl, "_blank");
      } else {
        console.log(`⚠️ [FRONTEND] No onboarding URL provided in response`);
      }
    },
    onError: (error: any) => {
      console.error(`💥 [FRONTEND] Account creation failed:`, {
        error_message: error.message,
        error_type: typeof error,
        error_object: error
      });
      
      let errorMessage = "Failed to create Stripe account. Please try again.";
      let errorTitle = "Error";
      
      // Check for specific error types
      if (error.message.includes("platform-profile") || error.message.includes("PLATFORM_NOT_CONFIGURED")) {
        errorTitle = "Platform Configuration Required";
        errorMessage = "Stripe Connect platform profile needs to be configured. Please check Stripe Dashboard → Settings → Connect → Platform Profile.";
        console.error(`🚨 [FRONTEND] Platform configuration error detected`);
      } else if (error.message.includes("ACCOUNT_EXISTS")) {
        errorTitle = "Account Already Exists";
        errorMessage = "A Stripe Connect account already exists for this organization.";
        console.error(`⚠️ [FRONTEND] Account already exists error`);
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    }
  });

  const handleCreateAccount = async () => {
    setIsCreatingAccount(true);
    try {
      await createAccountMutation.mutateAsync();
    } catch (error) {
      console.error("Error creating account:", error);
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleOnboarding = () => {
    if (accountStatus?.onboardingUrl) {
      window.open(accountStatus.onboardingUrl, "_blank");
    }
  };

  const refreshStatus = () => {
    refetch();
    toast({
      title: "Status Refreshed",
      description: "Payment setup status has been updated.",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const getStatusBadge = () => {
    if (!accountStatus?.hasAccount) {
      return <Badge variant="destructive" data-testid="status-no-account">No Account</Badge>;
    }
    if (accountStatus.businessFeaturesEnabled) {
      return <Badge className="bg-green-100 text-green-800" data-testid="status-active">Active</Badge>;
    }
    if (accountStatus.payouts_enabled && accountStatus?.capabilities?.transfers === "active") {
      return <Badge className="bg-blue-100 text-blue-800" data-testid="status-pending">Pending Verification</Badge>;
    }
    return <Badge variant="secondary" data-testid="status-setup-required">Setup Required</Badge>;
  };

  const getFeatureStatus = () => {
    if (accountStatus?.businessFeaturesEnabled) {
      return {
        icon: <CheckCircle className="w-5 h-5 text-green-600" />,
        text: "Business Features Enabled",
        description: "You can now accept payments and use all business features.",
        color: "text-green-600"
      };
    }
    return {
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      text: "Business Features Disabled",
      description: "Complete payment setup to enable appointments, services, and client management.",
      color: "text-red-600"
    };
  };

  const featureStatus = getFeatureStatus();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-payment-setup-title">
            {isMandatory ? "Complete Payment Setup" : "Payment Setup"}
          </h1>
          <p className="text-muted-foreground">
            {isMandatory 
              ? "Before accessing your clinic dashboard, you must complete Stripe Connect setup to enable payments." 
              : "Set up payment processing to accept payments from your clients"
            }
          </p>
          {isMandatory && (
            <Alert className="mt-4">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                <strong>Setup Required:</strong> You must complete Stripe Connect onboarding before accessing core platform features. This enables payment processing for your clinic.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Feature Status Alert */}
        <Alert className={`mb-6 ${accountStatus?.businessFeaturesEnabled ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center space-x-3">
            {featureStatus.icon}
            <div>
              <div className={`font-medium ${featureStatus.color}`} data-testid="text-feature-status">
                {featureStatus.text}
              </div>
              <AlertDescription className="mt-1">
                {featureStatus.description}
              </AlertDescription>
            </div>
          </div>
        </Alert>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Account Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5" />
                  <span data-testid="text-account-status-title">Account Status</span>
                </CardTitle>
                {getStatusBadge()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!accountStatus?.hasAccount ? (
                <div className="text-center py-6">
                  <Banknote className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium text-foreground mb-2" data-testid="text-no-account">
                    No Payment Account
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create a Stripe Express account to start accepting payments from clients
                  </p>
                  <Button 
                    onClick={handleCreateAccount}
                    disabled={isCreatingAccount || createAccountMutation.isPending}
                    data-testid="button-create-account"
                  >
                    {isCreatingAccount || createAccountMutation.isPending ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Creating Account...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Create Payment Account
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Shield className="w-5 h-5 text-blue-600" />
                      <div>
                        <div className="font-medium text-foreground">Stripe Express Account</div>
                        <div className="text-sm text-muted-foreground" data-testid="text-account-id">
                          ID: {accountStatus.accountId}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Continue Onboarding Button for incomplete accounts */}
                  {!accountStatus.businessFeaturesEnabled && (
                    <div className="text-center py-4">
                      <Button 
                        onClick={() => generateLinkMutation.mutate()}
                        disabled={generateLinkMutation.isPending}
                        className="w-full"
                        data-testid="button-continue-onboarding"
                      >
                        {generateLinkMutation.isPending ? (
                          <>
                            <LoadingSpinner size="sm" className="mr-2" />
                            Generating Link...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Continue Stripe Onboarding
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Complete terms and verification to enable business features
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        {accountStatus.charges_enabled ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">Charges</span>
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="text-charges-status">
                        {accountStatus.charges_enabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>

                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        {accountStatus.payouts_enabled ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">Payouts</span>
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="text-payouts-status">
                        {accountStatus.payouts_enabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>

                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        {accountStatus?.capabilities?.transfers === 'active' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">Transfers</span>
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="text-transfers-status">
                        {accountStatus?.capabilities?.transfers || 'Inactive'}
                      </div>
                    </div>

                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        {accountStatus.external_accounts?.length > 0 ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">Bank Account</span>
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="text-bank-account-status">
                        {accountStatus.external_accounts?.length > 0 ? 'Connected' : 'Not Connected'}
                      </div>
                    </div>
                  </div>

                  {!accountStatus.businessFeaturesEnabled && (
                    <div className="space-y-3">
                      {accountStatus.onboardingUrl && (
                        <Button 
                          onClick={handleOnboarding}
                          className="w-full"
                          data-testid="button-complete-onboarding"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Complete Onboarding
                        </Button>
                      )}
                      
                      <Button 
                        variant="outline" 
                        onClick={refreshStatus}
                        className="w-full"
                        data-testid="button-refresh-status"
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        Refresh Status
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Requirements & Next Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span data-testid="text-requirements-title">Requirements & Next Steps</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!accountStatus?.hasAccount ? (
                <div className="space-y-3">
                  <div className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Step 1: Create Account</h4>
                    <p className="text-sm text-blue-800">
                      Create a Stripe Express account to start the payment setup process.
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 bg-gray-50 rounded-lg opacity-50">
                    <h4 className="font-medium text-gray-600 mb-2">Step 2: Complete Onboarding</h4>
                    <p className="text-sm text-gray-600">
                      Provide business information and verify your identity.
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 bg-gray-50 rounded-lg opacity-50">
                    <h4 className="font-medium text-gray-600 mb-2">Step 3: Add Bank Account</h4>
                    <p className="text-sm text-gray-600">
                      Connect a bank account to receive payments.
                    </p>
                  </div>
                </div>
              ) : accountStatus.businessFeaturesEnabled ? (
                <div className="text-center py-6">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h3 className="font-medium text-green-900 mb-2" data-testid="text-setup-complete">
                    Payment Setup Complete
                  </h3>
                  <p className="text-sm text-green-800">
                    Your payment processing is fully configured. You can now accept payments from clients.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accountStatus.requirements?.currently_due?.length > 0 && (
                    <div className="p-3 border border-red-200 bg-red-50 rounded-lg">
                      <h4 className="font-medium text-red-900 mb-2">Required Now</h4>
                      <ul className="text-sm text-red-800 space-y-1">
                        {accountStatus.requirements.currently_due.map((req, index) => (
                          <li key={index} className="flex items-center space-x-2">
                            <div className="w-1 h-1 bg-red-600 rounded-full"></div>
                            <span>{req.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {accountStatus.requirements?.eventually_due?.length > 0 && (
                    <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg">
                      <h4 className="font-medium text-yellow-900 mb-2">Required Eventually</h4>
                      <ul className="text-sm text-yellow-800 space-y-1">
                        {accountStatus.requirements.eventually_due.map((req, index) => (
                          <li key={index} className="flex items-center space-x-2">
                            <div className="w-1 h-1 bg-yellow-600 rounded-full"></div>
                            <span>{req.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(!accountStatus.requirements?.currently_due?.length && !accountStatus.requirements?.eventually_due?.length) && (
                    <div className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Verification in Progress</h4>
                      <p className="text-sm text-blue-800">
                        Stripe is processing your account information. This usually takes a few minutes to complete.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}