import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, Circle, CreditCard, Calendar, Gift, Sparkles, ArrowRight, Users, Crown } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Load Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);

interface BusinessSetupStatus {
  stripeConnected: boolean;
  hasSubscription: boolean;
  hasServices: boolean;
  hasMemberships: boolean;
  hasRewards: boolean;
  hasPatients: boolean;
  allComplete: boolean;
}

const serviceFormSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  description: z.string().min(1, "Description is required"),
  price: z.string().min(1, "Price is required"),
  duration: z.string().min(1, "Duration is required"),
  category: z.string().min(1, "Category is required")
});

const membershipFormSchema = z.object({
  name: z.string().min(1, "Membership name is required"),
  description: z.string().min(1, "Description is required"),
  monthlyPrice: z.string().min(1, "Monthly price is required"),
  yearlyPrice: z.string().optional()
});

const rewardFormSchema = z.object({
  name: z.string().min(1, "Reward name is required"),
  description: z.string().min(1, "Description is required"),
  pointsCost: z.string().min(1, "Points cost is required"),
  category: z.string().min(1, "Category is required")
});

const patientInviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional()
});

type ServiceFormData = z.infer<typeof serviceFormSchema>;
type MembershipFormData = z.infer<typeof membershipFormSchema>;
type RewardFormData = z.infer<typeof rewardFormSchema>;
type PatientInviteData = z.infer<typeof patientInviteSchema>;

// Payment Form Component
interface PaymentFormProps {
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  planName: string;
  price: number;
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

function PaymentForm({ planId, billingCycle, planName, price, onSuccess, onCancel, isProcessing }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: "Payment Setup Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (setupIntent?.payment_method) {
        onSuccess(setupIntent.payment_method as string);
      }
    } catch (error) {
      toast({
        title: "Payment Setup Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-2 border-blue-200 bg-blue-50">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-blue-800">Add Payment Method</CardTitle>
        <p className="text-blue-700">
          Secure your subscription to <strong>{planName}</strong> at ${price}/{billingCycle === 'monthly' ? 'month' : 'year'}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="p-4 border border-gray-200 rounded-lg bg-white">
            <PaymentElement />
          </div>
          
          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading || isProcessing}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!stripe || isLoading || isProcessing}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isLoading || isProcessing ? "Processing..." : `Subscribe to ${planName}`}
            </Button>
          </div>
        </form>
        
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>🔒 Your payment information is secure and encrypted</p>
          <p>30-day free trial • Cancel anytime</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BusinessSetup() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Subscription and payment states
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>("");

  // Check for success parameter from Stripe redirect
  const urlParams = new URLSearchParams(window.location.search);
  const isStripeSuccess = urlParams.get('success') === 'true';

  // Forms
  const serviceForm = useForm<ServiceFormData>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      duration: "60",
      category: "facial"
    }
  });

  const membershipForm = useForm<MembershipFormData>({
    resolver: zodResolver(membershipFormSchema),
    defaultValues: {
      name: "",
      description: "",
      monthlyPrice: "",
      yearlyPrice: ""
    }
  });

  const rewardForm = useForm<RewardFormData>({
    resolver: zodResolver(rewardFormSchema),
    defaultValues: {
      name: "",
      description: "",
      pointsCost: "",
      category: "discount"
    }
  });

  const patientInviteForm = useForm<PatientInviteData>({
    resolver: zodResolver(patientInviteSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: ""
    }
  });

  // Check setup status
  const { data: setupStatus, isLoading: statusLoading } = useQuery<BusinessSetupStatus>({
    queryKey: ['/api/clinic/setup-status'],
  });

  // Get organization for shareable link
  const { data: organization } = useQuery<{ id: string; name: string; slug: string }>({
    queryKey: ['/api/organization'],
  });

  // Get subscription plans
  const { data: subscriptionPlans } = useQuery<Array<{
    id: string;
    name: string;
    tier: string;
    description: string;
    monthlyPrice: number;
    yearlyPrice: number;
    features: string[];
  }>>({
    queryKey: ['/api/subscription-plans'],
  });

  // Get membership tiers (clinic's membership plans for patients)
  const { data: membershipTiers } = useQuery<Array<{
    id: string;
    name: string;
    description: string;
    monthlyPrice: number;
    yearlyPrice: number | null;
    benefits: string[];
    isActive: boolean;
  }>>({
    queryKey: ['/api/membership-tiers'],
  });

  // Get reward options (clinic's reward catalog)
  const { data: rewardOptions } = useQuery<Array<{
    id: string;
    name: string;
    description: string;
    pointsCost: number;
    discountValue: number | null;
    category: string;
    isActive: boolean;
  }>>({
    queryKey: ['/api/reward-options'],
  });


  // Handle successful Stripe Connect redirect
  useEffect(() => {
    if (isStripeSuccess) {
      toast({
        title: "Payment Setup Complete!",
        description: "Your Stripe Connect account has been successfully configured.",
      });
      
      // Refresh setup status to get updated Stripe connection
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      
      // Clean up URL parameters
      window.history.replaceState({}, '', '/clinic/setup');
    }
  }, [isStripeSuccess, toast, queryClient]);

  // Set current step based on setup status
  useEffect(() => {
    if (setupStatus) {
      if (!setupStatus.stripeConnected) {
        setCurrentStep(1);
      } else if (!setupStatus.hasSubscription) {
        setCurrentStep(2);
      } else if (!setupStatus.hasServices) {
        setCurrentStep(3);
      } else if (!setupStatus.hasMemberships) {
        setCurrentStep(4);
      } else if (!setupStatus.hasRewards) {
        setCurrentStep(5);
      } else if (!setupStatus.hasPatients) {
        setCurrentStep(6);
      } else {
        // All complete, redirect to dashboard
        setLocation("/clinic");
      }
    }
  }, [setupStatus, setLocation]);

  // Create service mutation
  const createService = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      if (!organization?.id) {
        throw new Error("Organization not found");
      }
      
      const response = await apiRequest("POST", "/api/services", {
        organizationId: organization.id,
        name: data.name,
        description: data.description,
        price: data.price, // Keep as string
        duration: parseInt(data.duration),
        category: data.category,
        isActive: true
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      toast({
        title: "Service created!",
        description: "Your first service has been added successfully.",
      });
      serviceForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create service",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create membership mutation
  const createMembership = useMutation({
    mutationFn: async (data: MembershipFormData) => {
      const response = await apiRequest("POST", "/api/membership-tiers", {
        name: data.name,
        description: data.description,
        monthlyPrice: parseFloat(data.monthlyPrice),
        yearlyPrice: data.yearlyPrice ? parseFloat(data.yearlyPrice) : null,
        isActive: true
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/membership-tiers'] });
      toast({
        title: "Membership plan created!",
        description: "Your membership plan has been added successfully.",
      });
      membershipForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create membership",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create setup intent for payment method collection
  const createSetupIntent = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/setup-intent", {});
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setShowPaymentForm(true);
    },
    onError: () => {
      toast({
        title: "Setup failed",
        description: "There was an error setting up payment. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Subscribe to plan mutation with payment method
  const subscribeToPlan = useMutation({
    mutationFn: async (data: { planId: string; billingCycle: 'monthly' | 'yearly'; paymentMethodId?: string }) => {
      const response = await apiRequest("POST", "/api/subscription/subscribe", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organization'] });
      setShowPaymentForm(false);
      setClientSecret("");
      toast({
        title: "Subscription activated!",
        description: "Welcome to Aesthiq! Your subscription is now active.",
      });
      setSelectedPlan('');
    },
    onError: (error: any) => {
      toast({
        title: "Failed to activate subscription",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create reward option mutation
  const createReward = useMutation({
    mutationFn: async (data: RewardFormData) => {
      const pointsCost = parseInt(data.pointsCost);
      const discountValue = data.category === 'discount' ? (pointsCost / 10) : undefined;
      
      const response = await apiRequest("POST", "/api/reward-options", {
        name: data.name,
        description: data.description,
        pointsCost: pointsCost,
        discountValue: discountValue,
        category: data.category,
        isActive: true
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/reward-options'] });
      toast({
        title: "Reward created!",
        description: "Your reward option has been added successfully.",
      });
      rewardForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create reward",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create Stripe Connect account mutation
  const createStripeAccount = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe-connect/create-account", {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.onboardingUrl) {
        window.open(data.onboardingUrl, '_blank', 'noopener,noreferrer');
        toast({
          title: "Stripe account created!",
          description: "Complete your setup in the new tab.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create Stripe account",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Invite patient mutation
  const invitePatient = useMutation({
    mutationFn: async (data: PatientInviteData) => {
      const response = await apiRequest("POST", "/api/patients/invite", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      toast({
        title: "Patient invited!",
        description: "Invitation email has been sent successfully.",
      });
      patientInviteForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading setup status...</p>
        </div>
      </div>
    );
  }

  if (!setupStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Failed to load setup status</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const steps = [
    {
      number: 1,
      title: "Payment Setup",
      description: "Connect your Stripe account",
      icon: <CreditCard className="h-5 w-5" />,
      completed: setupStatus?.stripeConnected || false
    },
    {
      number: 2,
      title: "Choose Plan",
      description: "Select your subscription plan",
      icon: <Crown className="h-5 w-5" />,
      completed: setupStatus?.hasSubscription || false
    },
    {
      number: 3,
      title: "First Service",
      description: "Add your first treatment",
      icon: <Sparkles className="h-5 w-5" />,
      completed: setupStatus?.hasServices || false
    },
    {
      number: 4,
      title: "Membership Plan",
      description: "Create a membership offering",
      icon: <Calendar className="h-5 w-5" />,
      completed: setupStatus?.hasMemberships || false
    },
    {
      number: 5,
      title: "Rewards Program",
      description: "Set up patient rewards",
      icon: <Gift className="h-5 w-5" />,
      completed: setupStatus?.hasRewards || false
    },
    {
      number: 6,
      title: "Patient Invitation",
      description: "Invite your first patient",
      icon: <Users className="h-5 w-5" />,
      completed: setupStatus?.hasPatients || false
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Complete Your Business Setup
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Let's get your clinic ready to serve patients. Follow these 5 simple steps to unlock the full potential of your practice.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex-1">
                <div className="flex items-center">
                  <div className={`
                    flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all
                    ${step.completed 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : currentStep === step.number
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                    }
                  `}>
                    {step.completed ? (
                      <CheckCircle className="h-6 w-6" />
                    ) : (
                      <span className="text-sm font-semibold">{step.number}</span>
                    )}
                  </div>
                  
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-4 ${
                      step.completed ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
                
                <div className="mt-3 text-center">
                  <p className={`text-sm font-medium ${
                    currentStep === step.number ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Current Step Display */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                {steps[currentStep - 1]?.icon}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Step {currentStep}: {steps[currentStep - 1]?.title}
                </h2>
                <p className="text-gray-600">
                  {steps[currentStep - 1]?.description}
                </p>
              </div>
            </div>
          </div>

          {/* Step 1: Payment Setup */}
          {currentStep === 1 && (
            <div className="text-center py-12">
              {setupStatus?.stripeConnected ? (
                <>
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Payment Setup Complete!
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Your Stripe Connect account has been successfully configured.
                  </p>
                  <Button
                    onClick={() => setCurrentStep(2)}
                    size="lg"
                    className="px-8"
                    data-testid="button-continue-to-subscription"
                  >
                    Continue to Plan Selection <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <CreditCard className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Set Up Payment Processing
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Connect your Stripe account to start accepting payments from your patients.
                  </p>
                  <Button
                    onClick={() => createStripeAccount.mutate()}
                    disabled={createStripeAccount.isPending}
                    size="lg"
                    className="px-8"
                    data-testid="button-setup-payments"
                  >
                    {createStripeAccount.isPending ? "Setting up..." : "Set Up Payments"}
                    <CreditCard className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 2: Subscription Plan Selection */}
          {currentStep === 2 && (
            <Card className="border-2 border-yellow-200 bg-yellow-50">
              <CardHeader className="text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Crown className="h-8 w-8 text-yellow-600" />
                  <CardTitle className="text-2xl text-yellow-800">Choose Your Plan</CardTitle>
                </div>
                <p className="text-yellow-700">
                  Select a subscription plan to unlock Aesthiq's powerful features for your clinic.
                </p>
                
                {/* Billing Cycle Toggle */}
                <div className="flex items-center justify-center gap-4 mt-6">
                  <span className={`text-sm ${billingCycle === 'monthly' ? 'font-semibold text-yellow-800' : 'text-yellow-600'}`}>
                    Monthly
                  </span>
                  <button
                    onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${billingCycle === 'yearly' ? 'bg-yellow-600' : 'bg-gray-300'}`}
                    data-testid="toggle-billing-cycle"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className={`text-sm ${billingCycle === 'yearly' ? 'font-semibold text-yellow-800' : 'text-yellow-600'}`}>
                    Yearly <Badge variant="secondary" className="ml-1 text-xs">Save 20%</Badge>
                  </span>
                </div>
              </CardHeader>
              
              <CardContent>
                {subscriptionPlans ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {subscriptionPlans.map((plan) => {
                      const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
                      const isPopular = plan.tier === 'business';
                      const isSelected = selectedPlan === plan.id;
                      
                      return (
                        <div
                          key={plan.id}
                          onClick={() => setSelectedPlan(plan.id)}
                          className={`relative cursor-pointer rounded-lg border-2 p-6 transition-all hover:shadow-lg ${
                            isSelected
                              ? 'border-yellow-600 bg-yellow-50 shadow-md'
                              : isPopular
                              ? 'border-yellow-400 bg-white'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          data-testid={`plan-card-${plan.tier}`}
                        >
                          {isPopular && (
                            <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-yellow-600 text-white">
                              Most Popular
                            </Badge>
                          )}
                          
                          <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
                            
                            <div className="mt-4">
                              <span className="text-3xl font-bold text-gray-900">${price}</span>
                              <span className="text-gray-600">/{billingCycle === 'monthly' ? 'month' : 'year'}</span>
                              {billingCycle === 'yearly' && (
                                <div className="text-sm text-green-600 mt-1">
                                  Save ${(plan.monthlyPrice * 12 - plan.yearlyPrice).toFixed(0)}/year
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-6">
                            <h4 className="text-sm font-medium text-gray-900 mb-3">Features include:</h4>
                            <ul className="space-y-2">
                              {plan.features.slice(0, 4).map((feature, index) => (
                                <li key={index} className="flex items-center text-sm text-gray-600">
                                  <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                                  {feature}
                                </li>
                              ))}
                              {plan.features.length > 4 && (
                                <li className="text-sm text-gray-500 italic">
                                  + {plan.features.length - 4} more features
                                </li>
                              )}
                            </ul>
                          </div>
                          
                          <div className="mt-6">
                            <div className={`w-full h-10 rounded-md border-2 transition-colors flex items-center justify-center ${
                              isSelected
                                ? 'border-yellow-600 bg-yellow-600 text-white'
                                : 'border-gray-300 text-gray-700 hover:border-gray-400'
                            }`}>
                              {isSelected ? (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Selected
                                </>
                              ) : (
                                'Select Plan'
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-500">Loading subscription plans...</div>
                  </div>
                )}
                
                {selectedPlan && (
                  <div className="mt-8 text-center">
                    <Button
                      onClick={() => createSetupIntent.mutate()}
                      disabled={createSetupIntent.isPending}
                      size="lg"
                      className="px-8 bg-yellow-600 hover:bg-yellow-700"
                      data-testid="button-activate-subscription"
                    >
                      {createSetupIntent.isPending ? "Setting up..." : `Add Payment & Subscribe`}
                    </Button>
                    <p className="text-sm text-gray-600 mt-2">
                      30-day free trial • Add payment method to activate subscription
                    </p>
                  </div>
                )}
                
                {/* Payment Form Modal */}
                {showPaymentForm && clientSecret && selectedPlan && (
                  <div className="mt-8">
                    <Elements stripe={stripePromise} options={{ clientSecret }}>
                      <PaymentForm
                        planId={selectedPlan}
                        billingCycle={billingCycle}
                        planName={subscriptionPlans?.find(p => p.id === selectedPlan)?.name || ''}
                        price={billingCycle === 'monthly' 
                          ? subscriptionPlans?.find(p => p.id === selectedPlan)?.monthlyPrice || 0
                          : subscriptionPlans?.find(p => p.id === selectedPlan)?.yearlyPrice || 0}
                        onSuccess={(paymentMethodId) => {
                          subscribeToPlan.mutate({
                            planId: selectedPlan,
                            billingCycle,
                            paymentMethodId
                          });
                        }}
                        onCancel={() => {
                          setShowPaymentForm(false);
                          setClientSecret("");
                        }}
                        isProcessing={subscribeToPlan.isPending}
                      />
                    </Elements>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Create First Service */}
          {currentStep === 3 && (
            <Form {...serviceForm}>
              <form onSubmit={serviceForm.handleSubmit((data) => createService.mutate(data))} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={serviceForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Signature Facial" {...field} data-testid="input-service-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={serviceForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-service-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="facial">Facial Treatment</SelectItem>
                            <SelectItem value="body">Body Treatment</SelectItem>
                            <SelectItem value="wellness">Wellness Service</SelectItem>
                            <SelectItem value="consultation">Consultation</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={serviceForm.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price ($)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="150" {...field} data-testid="input-service-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={serviceForm.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (minutes)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-service-duration">
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="45">45 minutes</SelectItem>
                            <SelectItem value="60">60 minutes</SelectItem>
                            <SelectItem value="90">90 minutes</SelectItem>
                            <SelectItem value="120">120 minutes</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={serviceForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe your service, benefits, and what makes it special..."
                          className="min-h-[100px]"
                          {...field}
                          data-testid="textarea-service-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  disabled={createService.isPending}
                  size="lg" 
                  className="w-full"
                  data-testid="button-create-service"
                >
                  {createService.isPending ? "Creating Service..." : "Create Your First Service"}
                </Button>
              </form>
            </Form>
          )}

          {/* Step 4: Create Membership Plan */}
          {currentStep === 4 && (
            <div className="space-y-8">
              {/* Display existing membership plans */}
              {membershipTiers && membershipTiers.length > 0 && (
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-xl text-green-800 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Your Membership Plans
                    </CardTitle>
                    <p className="text-green-700">You've created {membershipTiers.length} membership plan{membershipTiers.length !== 1 ? 's' : ''} for your patients</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      {membershipTiers.map((tier) => (
                        <div key={tier.id} className="bg-white p-4 rounded-lg border border-green-200">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-gray-900">{tier.name}</h4>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              tier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {tier.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{tier.description}</p>
                          <div className="text-sm font-medium text-gray-900">
                            ${tier.monthlyPrice}/month
                            {tier.yearlyPrice && (
                              <span className="text-gray-600 ml-2">
                                • ${tier.yearlyPrice}/year
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Create new membership plan form */}
              <Form {...membershipForm}>
                <form onSubmit={membershipForm.handleSubmit((data) => createMembership.mutate(data))} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={membershipForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Membership Plan Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Premium Wellness Plan" {...field} data-testid="input-membership-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={membershipForm.control}
                      name="monthlyPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monthly Price ($)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="99" {...field} data-testid="input-membership-monthly-price" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={membershipForm.control}
                      name="yearlyPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Yearly Price ($ - Optional)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="999" {...field} data-testid="input-membership-yearly-price" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={membershipForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe the benefits, perks, and value of this membership plan..."
                            className="min-h-[100px]"
                            {...field}
                            data-testid="textarea-membership-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    disabled={createMembership.isPending}
                    size="lg" 
                    className="w-full"
                    data-testid="button-create-membership"
                  >
                    {createMembership.isPending ? "Creating Membership Plan..." : "Create Membership Plan"}
                  </Button>
                </form>
              </Form>
            </div>
          )}

          {/* Step 5: Create Reward Options */}
          {currentStep === 5 && (
            <div className="space-y-8">
              {/* Display existing reward options */}
              {rewardOptions && rewardOptions.length > 0 && (
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-xl text-green-800 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Your Reward Options
                    </CardTitle>
                    <p className="text-green-700">You've created {rewardOptions.length} reward option{rewardOptions.length !== 1 ? 's' : ''} for your patients</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      {rewardOptions.map((option) => (
                        <div key={option.id} className="bg-white p-4 rounded-lg border border-green-200">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-gray-900">{option.name}</h4>
                            <Badge variant="outline">{option.pointsCost} pts</Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{option.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500 capitalize">{option.category}</span>
                            {option.discountValue && (
                              <span className="text-sm font-medium text-green-700">
                                ${option.discountValue} off
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Create new reward option form */}
              <Form {...rewardForm}>
                <form onSubmit={rewardForm.handleSubmit((data) => createReward.mutate(data))} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={rewardForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reward Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., $50 Off Any Service" {...field} data-testid="input-reward-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={rewardForm.control}
                      name="pointsCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Points Required</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="500" {...field} data-testid="input-reward-points" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={rewardForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reward Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-reward-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="discount">Discount</SelectItem>
                              <SelectItem value="service">Free Service</SelectItem>
                              <SelectItem value="product">Product</SelectItem>
                              <SelectItem value="perk">Special Perk</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={rewardForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reward Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe what customers get when they redeem this reward..."
                            className="min-h-[80px]"
                            {...field}
                            data-testid="textarea-reward-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    disabled={createReward.isPending}
                    size="lg" 
                    className="w-full"
                    data-testid="button-create-reward"
                  >
                    {createReward.isPending ? "Creating Reward..." : "Create Reward Option"}
                  </Button>
                </form>
              </Form>
            </div>
          )}

          {/* Step 6 and beyond - Coming Soon */}
          {currentStep > 5 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🚧</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Step {currentStep} Coming Soon
              </h3>
              <p className="text-gray-600 mb-6">
                This step is being built. For now, you can continue to your dashboard.
              </p>
              <Button
                onClick={() => setLocation("/clinic")}
                size="lg"
                className="px-8"
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}