import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { 
  Check, Crown, ArrowRight, Shield, Headset,
  CreditCard, Calendar, Users, Sparkles, MapPin, TrendingUp
} from "lucide-react";
import type { SubscriptionPlan } from "@/types";

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing VITE_STRIPE_PUBLIC_KEY environment variable');
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

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

  const activePlans = plans?.filter(p => p.isActive) || [];

  const createSubscriptionMutation = useMutation({
    mutationFn: async (data: { planId: string, billingCycle: string }) => {
      const plan = activePlans.find(p => p.tier === data.planId);
      if (!plan) throw new Error("Plan not found");

      const priceId = data.billingCycle === "yearly" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
      const response = await apiRequest("POST", "/api/subscriptions/create", {
        priceId,
        trialDays: 30
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

  if (!user) {
    setLocation("/login");
    return null;
  }

  const selectedPlan = activePlans.find(plan => plan.tier === selectedPlanId);

  const handleProceedToCheckout = () => {
    if (!selectedPlanId) return;
    createSubscriptionMutation.mutate({ planId: selectedPlanId, billingCycle });
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
      
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl lg:text-6xl font-serif font-bold text-foreground mb-6" data-testid="text-subscribe-title">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Choose the plan that fits your practice. Start with a 30-day free trial, no credit card required.
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
            <Card className="max-w-md mx-auto mb-16">
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
                    <Badge className="bg-green-100 text-green-800">Save 17%</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pricing Cards */}
            <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
              {activePlans.map((plan) => {
                const isEnterprise = plan.tier === 'enterprise';
                const price = billingCycle === 'yearly' && plan.yearlyPrice 
                  ? Math.round(parseFloat(plan.yearlyPrice.toString()) / 12)
                  : parseFloat(plan.monthlyPrice.toString());
                const savings = billingCycle === 'yearly' && plan.yearlyPrice 
                  ? calculateYearlySavings(parseFloat(plan.monthlyPrice.toString()), parseFloat(plan.yearlyPrice.toString()))
                  : 0;

                const commissionRate = plan.limits && typeof plan.limits === 'object' && 'platformCommissionRate' in plan.limits 
                  ? (plan.limits as any).platformCommissionRate 
                  : null;

                const planFeatures = plan.features && Array.isArray(plan.features) 
                  ? (plan.features as string[]) 
                  : [];

                return (
                  <Card 
                    key={plan.id}
                    className={`relative cursor-pointer transition-all hover:shadow-xl ${
                      isEnterprise ? 'border-2 border-primary scale-105' : ''
                    } ${selectedPlanId === plan.tier ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setSelectedPlanId(plan.tier)}
                    data-testid={`plan-card-${plan.tier}`}
                  >
                    {isEnterprise && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground px-4 py-1">
                          <Crown className="w-3 h-3 mr-1 inline" />
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className="text-center pb-6">
                      <div className={`w-16 h-16 ${isEnterprise ? 'bg-primary' : 'bg-primary/10'} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                        {isEnterprise ? (
                          <Sparkles className="w-8 h-8 text-primary-foreground" />
                        ) : (
                          <Users className="w-8 h-8 text-primary" />
                        )}
                      </div>
                      
                      <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                      
                      <div className="space-y-2">
                        <div className="text-5xl font-bold">
                          ${Math.round(price)}
                          <span className="text-lg font-normal text-muted-foreground">/mo</span>
                        </div>
                        {billingCycle === 'yearly' && plan.yearlyPrice && (
                          <div className="text-sm text-muted-foreground">
                            Billed ${plan.yearlyPrice} annually
                            {savings > 0 && (
                              <Badge className="ml-2 bg-green-100 text-green-800">
                                Save {savings}%
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Commission Rate Badge */}
                      {commissionRate && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex items-center justify-center space-x-2">
                            <TrendingUp className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {commissionRate}% platform commission
                            </span>
                          </div>
                        </div>
                      )}
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                      {/* Features List */}
                      <div className="space-y-3">
                        {planFeatures.map((feature, index) => (
                          <div key={index} className="flex items-start space-x-3">
                            <div className="flex-shrink-0 w-5 h-5 bg-primary rounded-full flex items-center justify-center mt-0.5">
                              <Check className="w-3 h-3 text-primary-foreground" />
                            </div>
                            <span className="text-sm">{feature}</span>
                          </div>
                        ))}
                      </div>

                      {/* Select/Selected Button */}
                      <div className="pt-4">
                        {selectedPlanId === plan.tier ? (
                          <Badge className="w-full text-center py-3 bg-primary text-primary-foreground" data-testid={`badge-selected-${plan.tier}`}>
                            <Check className="w-4 h-4 mr-1 inline" />
                            Selected
                          </Badge>
                        ) : (
                          <Button 
                            className={`w-full ${isEnterprise ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
                            variant={isEnterprise ? "default" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPlanId(plan.tier);
                            }}
                            data-testid={`button-select-${plan.tier}`}
                          >
                            Select {plan.name}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Add-ons Section */}
            <div className="max-w-5xl mx-auto mb-16">
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MapPin className="w-5 h-5 mr-2 text-primary" />
                    Additional Locations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold mb-1">Expand to multiple locations</p>
                      <p className="text-sm text-muted-foreground">
                        Each plan includes 1 location. Add more as your business grows.
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary">$60</div>
                      <div className="text-sm text-muted-foreground">per location/month</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Proceed to Checkout */}
            {selectedPlanId && selectedPlan && !showCheckout && (
              <div className="max-w-2xl mx-auto mb-16">
                <Card className="border-2 border-primary shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">Selected: {selectedPlan.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {billingCycle === "yearly" ? "Annual" : "Monthly"} billing - 
                          ${billingCycle === "yearly" ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice}
                          {billingCycle === "yearly" ? "/year" : "/month"}
                        </p>
                      </div>
                      <Button
                        onClick={handleProceedToCheckout}
                        disabled={createSubscriptionMutation.isPending}
                        className="bg-primary text-primary-foreground"
                        data-testid="button-proceed-to-checkout"
                        size="lg"
                      >
                        {createSubscriptionMutation.isPending ? (
                          <div className="flex items-center space-x-2">
                            <LoadingSpinner size="sm" />
                            <span>Processing...</span>
                          </div>
                        ) : (
                          <>
                            Continue to Checkout
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Trust Indicators */}
            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-3 gap-8 text-center">
                <div>
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">30-Day Free Trial</h3>
                  <p className="text-muted-foreground">No credit card required to start</p>
                </div>
                
                <div>
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Headset className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Priority Support</h3>
                  <p className="text-muted-foreground">Dedicated team ready to help you succeed</p>
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
                  Questions about pricing? <a href="#contact" className="text-primary hover:underline font-medium">Contact our sales team</a>
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
