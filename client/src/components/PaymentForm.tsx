import { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CreditCard, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PaymentFormProps {
  amount: number;
  isDepositOnly?: boolean;
  depositAmount?: number;
  serviceName: string;
  onSuccess: (paymentIntentId: string) => void;
  onCancel?: () => void;
}

export function PaymentForm({
  amount,
  isDepositOnly = false,
  depositAmount,
  serviceName,
  onSuccess,
  onCancel
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  const paymentAmount = isDepositOnly ? (depositAmount || 0) : amount;
  const remainingBalance = isDepositOnly ? amount - (depositAmount || 0) : 0;

  // Track when Payment Element is ready
  const handleReady = () => {
    setIsReady(true);
  };

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
          return_url: `${window.location.origin}/appointments`,
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
          title: "Payment Successful",
          description: `Payment of $${paymentAmount.toFixed(2)} completed successfully!`,
        });
        onSuccess(paymentIntent.id);
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
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Details
        </CardTitle>
        <CardDescription>
          {isDepositOnly ? "Deposit payment" : "Full payment"} for {serviceName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment Summary */}
        <div className="space-y-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Service:</span>
            <span className="text-sm">{serviceName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Price:</span>
            <span className="text-sm">${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center font-semibold text-lg border-t pt-2">
            <span className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              {isDepositOnly ? "Deposit Due:" : "Amount Due:"}
            </span>
            <span>${paymentAmount.toFixed(2)}</span>
          </div>
          {isDepositOnly && remainingBalance > 0 && (
            <div className="text-sm text-muted-foreground">
              Remaining balance: ${remainingBalance.toFixed(2)} (due at appointment)
            </div>
          )}
        </div>

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 border rounded-lg">
            <PaymentElement 
              options={{
                layout: "tabs",
              }}
              onReady={handleReady}
            />
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            {onCancel && (
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
            )}
            <Button
              type="submit"
              disabled={!stripe || !isReady || isLoading}
              className="flex-1"
              data-testid="button-submit-payment"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Pay $${paymentAmount.toFixed(2)}`
              )}
            </Button>
          </div>
        </form>

        {isDepositOnly && (
          <div className="text-xs text-muted-foreground text-center">
            The remaining balance will be charged at your appointment.
          </div>
        )}
      </CardContent>
    </Card>
  );
}