import { useState, useEffect } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Loader2, Crown, CreditCard, Star, Gift, Check, DollarSign } from "lucide-react";

const stripeKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_51QahdjA0YLTsXoNLrKJYCBKHgRPRQLdXD6J0Qz2g3aPWXW4WlEcLLnP8Srf9A2DrhU9NzF3gM3KZ5yG8bMf8BTWW00TqxPCOzx';

const stripePromise = loadStripe(stripeKey);

interface MembershipTier {
  id: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  monthlyCredits?: number;
  discount?: number;
  pointsMultiplier?: number;
  benefits?: string[];
}

interface MembershipSubscriptionDialogProps {
  open: boolean;
  onClose: () => void;
  tier: MembershipTier | null;
  onSuccess: () => void;
}

function PaymentStep({ 
  clientSecret, 
  tier, 
  billingCycle,
  onSuccess,
  onCancel 
}: { 
  clientSecret: string; 
  tier: MembershipTier;
  billingCycle: 'monthly' | 'yearly';
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  // Convert prices to numbers in case they come from DB as strings
  const monthlyPrice = Number(tier.monthlyPrice) || 0;
  const yearlyPrice = Number(tier.yearlyPrice) || monthlyPrice * 12;
  const price = billingCycle === 'yearly' ? yearlyPrice / 12 : monthlyPrice;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !isReady) {
      toast({
        title: "Payment System Not Ready",
        description: "Please wait for the payment form to load completely.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/patient`,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message || "An error occurred during payment");
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        toast({
          title: "Subscription Activated!",
          description: `Welcome to ${tier.name}! Your membership is now active.`,
        });
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred");
      toast({
        title: "Payment Error",
        description: err.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg">
        <PaymentElement 
          options={{
            layout: "tabs",
          }}
          onReady={() => setIsReady(true)}
          onLoadError={(error) => {
            console.error('Payment element load error:', error);
            setErrorMessage('Payment form failed to load. Please refresh and try again.');
          }}
        />
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
          disabled={isLoading}
          data-testid="button-cancel-payment"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !isReady || isLoading}
          className="flex-1"
          data-testid="button-confirm-payment"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Subscribe for $${price.toFixed(2)}/mo`
          )}
        </Button>
      </div>
    </form>
  );
}

export function MembershipSubscriptionDialog({
  open,
  onClose,
  tier,
  onSuccess
}: MembershipSubscriptionDialogProps) {
  const { toast } = useToast();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [requiresPayment, setRequiresPayment] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setBillingCycle('monthly');
      setClientSecret(null);
      setRequiresPayment(false);
      setIsProcessing(false);
    }
  }, [open]);

  if (!tier) return null;

  // Convert prices to numbers in case they come from DB as strings
  const monthlyPrice = Number(tier.monthlyPrice) || 0;
  const yearlyPrice = Number(tier.yearlyPrice) || monthlyPrice * 12;
  const yearlySavings = (monthlyPrice * 12) - yearlyPrice;
  const displayPrice = billingCycle === 'yearly' ? yearlyPrice / 12 : monthlyPrice;

  const handleSubscribe = async () => {
    setIsProcessing(true);
    
    try {
      const response = await apiRequest("POST", "/api/memberships/upgrade", {
        tierId: tier.id,
        billingCycle
      });

      const data = await response.json();

      if (data.requiresPayment && data.clientSecret) {
        // Payment required - show Stripe payment form
        setClientSecret(data.clientSecret);
        setRequiresPayment(true);
      } else {
        // Free membership (development only) or no payment required
        toast({
          title: "Membership Activated!",
          description: `Welcome to ${tier.name}! Your membership is now active.`,
        });
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      toast({
        title: "Subscription Failed",
        description: error.message || "Failed to start subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = () => {
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="membership-subscription-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Crown className="w-6 h-6 text-primary" />
            {tier.name} Membership
          </DialogTitle>
          <DialogDescription>
            {tier.description || "Unlock exclusive benefits and savings"}
          </DialogDescription>
        </DialogHeader>

        {!clientSecret ? (
          <div className="space-y-6">
            {/* Billing Cycle Selection */}
            <Card>
              <CardContent className="pt-6">
                <Label className="text-base font-semibold mb-4 block">Choose Billing Cycle</Label>
                <RadioGroup value={billingCycle} onValueChange={(value: 'monthly' | 'yearly') => setBillingCycle(value)}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 border rounded-lg hover:border-primary transition-colors cursor-pointer"
                         onClick={() => setBillingCycle('monthly')}>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="monthly" id="monthly" data-testid="radio-monthly" />
                        <Label htmlFor="monthly" className="cursor-pointer">
                          <div className="font-semibold">Monthly</div>
                          <div className="text-sm text-muted-foreground">Billed monthly</div>
                        </Label>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">${monthlyPrice.toFixed(2)}</div>
                        <div className="text-sm text-muted-foreground">per month</div>
                      </div>
                    </div>

                    {tier.yearlyPrice && (
                      <div className="flex items-center justify-between p-4 border rounded-lg hover:border-primary transition-colors cursor-pointer relative"
                           onClick={() => setBillingCycle('yearly')}>
                        {yearlySavings > 0 && (
                          <Badge className="absolute -top-2 -right-2 bg-green-500">
                            Save ${yearlySavings.toFixed(2)}/year
                          </Badge>
                        )}
                        <div className="flex items-center space-x-3">
                          <RadioGroupItem value="yearly" id="yearly" data-testid="radio-yearly" />
                          <Label htmlFor="yearly" className="cursor-pointer">
                            <div className="font-semibold">Yearly</div>
                            <div className="text-sm text-muted-foreground">Billed annually</div>
                          </Label>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">${(yearlyPrice / 12).toFixed(2)}</div>
                          <div className="text-sm text-muted-foreground">per month</div>
                          <div className="text-xs text-green-600">${yearlyPrice.toFixed(2)}/year</div>
                        </div>
                      </div>
                    )}
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Benefits Summary */}
            <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Star className="w-5 h-5 text-primary" />
                  Membership Benefits
                </h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {tier.monthlyCredits && (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm">${tier.monthlyCredits} monthly credits</span>
                    </div>
                  )}
                  {tier.discount && (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm">{tier.discount}% discount on all services</span>
                    </div>
                  )}
                  {tier.pointsMultiplier && tier.pointsMultiplier > 1 && (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm">{tier.pointsMultiplier}x reward points on purchases</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">Priority booking access</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">Exclusive member events</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">Cancel anytime</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pricing Summary */}
            <div className="p-4 bg-muted/30 rounded-lg space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Subscription Price:</span>
                <span className="text-sm">${displayPrice.toFixed(2)}/month</span>
              </div>
              {billingCycle === 'yearly' && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Billed:</span>
                  <span className="text-sm">${yearlyPrice.toFixed(2)}/year</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-semibold">Total Due Today:</span>
                <span className="font-bold text-lg text-primary">
                  ${billingCycle === 'yearly' ? yearlyPrice.toFixed(2) : monthlyPrice.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isProcessing}
                data-testid="button-cancel-subscription"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubscribe}
                className="flex-1"
                disabled={isProcessing}
                data-testid="button-start-subscription"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Subscribe Now
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-muted/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Subscribing to:</span>
                <span className="font-semibold">{tier.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Amount:</span>
                <span className="font-bold text-lg text-primary">
                  ${displayPrice.toFixed(2)}/month
                </span>
              </div>
              {billingCycle === 'yearly' && (
                <div className="text-sm text-muted-foreground mt-1">
                  Billed annually at ${yearlyPrice.toFixed(2)}
                </div>
              )}
            </div>

            <Elements 
              stripe={stripePromise} 
              options={{ 
                clientSecret,
                appearance: {
                  theme: 'stripe',
                },
              }}
            >
              <PaymentStep
                clientSecret={clientSecret}
                tier={tier}
                billingCycle={billingCycle}
                onSuccess={handlePaymentSuccess}
                onCancel={onClose}
              />
            </Elements>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
