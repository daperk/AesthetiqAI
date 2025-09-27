import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { 
  Check, Crown, ArrowRight, Shield, Headset, Zap,
  CreditCard, Calendar, Users, Building2, Sparkles
} from "lucide-react";
import type { SubscriptionPlan } from "@/types";

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface PlanFeatures {
  [key: string]: {
    icon: React.ReactNode;
    popular?: boolean;
    highlight?: string;
  };
}

const planFeatures: PlanFeatures = {
  starter: {
    icon: <Building2 className="w-5 h-5" />,
    highlight: "Perfect for solo practitioners"
  },
  professional: {
    icon: <Users className="w-5 h-5" />,
    highlight: "Great for growing practices"
  },
  business: {
    icon: <Crown className="w-5 h-5" />,
    popular: true,
    highlight: "Most popular choice"
  },
  enterprise: {
    icon: <Sparkles className="w-5 h-5" />,
    highlight: "Advanced features included"
  },
  medical_chain: {
    icon: <Zap className="w-5 h-5" />,
    highlight: "Unlimited scalability"
  }
};

function CheckoutForm({ selectedPlan, billingCycle }: { selectedPlan: SubscriptionPlan | null, billingCycle: "monthly" | "yearly" }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !selectedPlan) return;

    setIsProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/clinic`,
        },
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Subscription Activated!",
          description: "Welcome to Aesthiq. Your subscription is now active.",
        });
        setLocation("/clinic");
      }
    } catch (error) {
      toast({
        title: "Payment Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!selectedPlan) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-muted/30 p-4 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{selectedPlan.name}</h3>
            <p className="text-sm text-muted-foreground">
              {billingCycle === "yearly" ? "Annual" : "Monthly"} billing
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">
              ${billingCycle === "yearly" 
                ? selectedPlan.yearlyPrice 
                : selectedPlan.monthlyPrice}
            </div>
            <div className="text-sm text-muted-foreground">
              {billingCycle === "yearly" ? "per year" : "per month"}
            </div>
          </div>
        </div>
      </div>

      <PaymentElement />

      <Button 
        type="submit" 
        disabled={!stripe || isProcessing}
        className="w-full bg-primary text-primary-foreground"
        data-testid="button-complete-subscription"
      >
        {isProcessing ? (
          <div className="flex items-center space-x-2">
            <LoadingSpinner size="sm" />
            <span>Processing...</span>
          </div>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Complete Subscription
          </>
        )}
      </Button>

      <div className="text-xs text-muted-foreground text-center">
        <p>By subscribing, you agree to our Terms of Service and Privacy Policy.</p>
        <p className="mt-1">You can cancel anytime from your account settings.</p>
      </div>
    </form>
  );
}

export default function Subscribe() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [clientSecret, setClientSecret] = useState<string>("");
  const [showCheckout, setShowCheckout] = useState(false);

  // Get plan from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const planFromUrl = urlParams.get('plan');
    if (planFromUrl && planFromUrl !== selectedPlanId) {
      setSelectedPlanId(planFromUrl);
    }
  }, [selectedPlanId]);

  const { data: plans, isLoading: plansLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscription-plans"],
    staleTime: 5 * 60000,
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async (data: { planId: string, billingCycle: string }) => {
      const plan = plans?.find(p => p.tier === data.planId);
      if (!plan) throw new Error("Plan not found");

      const priceId = data.billingCycle === "yearly" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
      const response = await apiRequest("POST", "/api/subscriptions/create", {
        priceId,
        trialDays: 14
      });
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setShowCheckout(true);
    },
    onError: () => {
      toast({
        title: "Failed to create subscription",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  // Redirect if not logged in
  if (!user) {
    setLocation("/login");
    return null;
  }

  const selectedPlan = plans?.find(plan => plan.tier === selectedPlanId);

  const handlePlanSelect = (planId: string) => {
    setSelectedPlanId(planId);
    createSubscriptionMutation.mutate({ planId, billingCycle });
  };

  const calculateYearlySavings = (monthlyPrice: number, yearlyPrice: number) => {
    if (!yearlyPrice) return 0;
    const annualMonthly = monthlyPrice * 12;
    return Math.round(((annualMonthly - yearlyPrice) / annualMonthly) * 100);
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-serif font-bold text-foreground mb-6" data-testid="text-subscribe-title">
            Choose Your Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Start your 14-day free trial and transform your beauty practice with Aesthiq's AI-powered platform.
          </p>
        </div>

        {showCheckout && clientSecret ? (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Complete Your Subscription</CardTitle>
              </CardHeader>
              <CardContent>
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <CheckoutForm selectedPlan={selectedPlan || null} billingCycle={billingCycle} />
                </Elements>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* Billing Toggle */}
            <Card className="max-w-md mx-auto mb-12">
              <CardContent className="p-6">
                <div className="flex items-center justify-center space-x-4">
                  <span className={`text-sm ${billingCycle === 'monthly' ? 'font-medium' : 'text-muted-foreground'}`}>
                    Monthly
                  </span>
                  <button
                    onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      billingCycle === 'yearly' ? 'bg-primary' : 'bg-muted'
                    }`}
                    data-testid="toggle-billing-cycle"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-sm ${billingCycle === 'yearly' ? 'font-medium' : 'text-muted-foreground'}`}>
                    Yearly
                  </span>
                  {billingCycle === 'yearly' && (
                    <Badge className="bg-green-100 text-green-800">Save up to 17%</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pricing Cards */}
            <div className="grid lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto mb-12">
              {plans?.map((plan) => {
                const features = planFeatures[plan.tier] || { icon: <Building2 className="w-5 h-5" /> };
                const price = billingCycle === 'yearly' && plan.yearlyPrice 
                  ? Math.round(parseFloat(plan.yearlyPrice.toString()) / 12)
                  : parseFloat(plan.monthlyPrice.toString());
                const savings = billingCycle === 'yearly' && plan.yearlyPrice 
                  ? calculateYearlySavings(parseFloat(plan.monthlyPrice.toString()), parseFloat(plan.yearlyPrice.toString()))
                  : 0;

                return (
                  <Card 
                    key={plan.id}
                    className={`relative cursor-pointer transition-all hover:shadow-lg ${
                      features.popular ? 'ring-2 ring-primary scale-105' : ''
                    } ${selectedPlanId === plan.tier ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setSelectedPlanId(plan.tier)}
                    data-testid={`plan-card-${plan.tier}`}
                  >
                    {features.popular && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                      </div>
                    )}
                    
                    <CardHeader className="text-center">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-3">
                        {features.icon}
                      </div>
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      {features.highlight && (
                        <p className="text-xs text-muted-foreground">{features.highlight}</p>
                      )}
                      <div className="space-y-1">
                        <div className="text-3xl font-bold">
                          ${Math.round(price)}
                          <span className="text-sm font-normal text-muted-foreground">/month</span>
                        </div>
                        {billingCycle === 'yearly' && plan.yearlyPrice && (
                          <div className="text-xs text-muted-foreground">
                            Billed ${plan.yearlyPrice} annually
                            {savings > 0 && (
                              <Badge className="ml-2 bg-green-100 text-green-800">
                                Save {savings}%
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center space-x-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span className="text-sm">
                            {plan.maxLocations ? `Up to ${plan.maxLocations} locations` : "Unlimited locations"}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span className="text-sm">
                            {plan.maxStaff ? `Up to ${plan.maxStaff} staff` : "Unlimited staff"}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span className="text-sm">
                            {plan.maxClients ? `Up to ${plan.maxClients} clients` : "Unlimited clients"}
                          </span>
                        </div>
                        
                        {plan.features && Array.isArray(plan.features) && (
                          <>
                            {(plan.features as string[]).slice(0, 2).map((feature, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <Check className="w-4 h-4 text-green-500" />
                                <span className="text-sm">{feature}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                      
                      <Button 
                        className={`w-full ${features.popular ? 'bg-primary text-primary-foreground' : ''}`}
                        variant={features.popular ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlanSelect(plan.tier);
                        }}
                        disabled={createSubscriptionMutation.isPending}
                        data-testid={`button-select-${plan.tier}`}
                      >
                        {createSubscriptionMutation.isPending && selectedPlanId === plan.tier ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            Start Free Trial
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Trust Indicators */}
            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-3 gap-8 text-center">
                <div>
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">14-Day Free Trial</h3>
                  <p className="text-muted-foreground">No credit card required to start your trial</p>
                </div>
                
                <div>
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Headset className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">24/7 Support</h3>
                  <p className="text-muted-foreground">Dedicated support team ready to help</p>
                </div>
                
                <div>
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Secure & Compliant</h3>
                  <p className="text-muted-foreground">HIPAA compliant with enterprise security</p>
                </div>
              </div>
              
              <div className="text-center mt-12">
                <p className="text-muted-foreground">
                  Questions about our pricing? <a href="#contact" className="text-primary hover:underline">Contact our sales team</a>
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
