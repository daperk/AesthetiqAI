import { useState, useEffect } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { PaymentForm } from "./PaymentForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Clock, MapPin, User, DollarSign, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Service, Staff, Location } from "@shared/schema";

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing VITE_STRIPE_PUBLIC_KEY environment variable');
}

interface BookingData {
  serviceId: string;
  staffId: string;
  locationId: string;
  startTime: string;
  endTime: string;
  paymentType: "full" | "deposit";
  notes?: string;
}

interface BookingWithPaymentProps {
  bookingData: BookingData;
  service: Service;
  staff: Staff;
  location: Location;
  onSuccess: (appointmentId: string) => void;
  onCancel: () => void;
}

export function BookingWithPayment({
  bookingData,
  service,
  staff,
  location,
  onSuccess,
  onCancel
}: BookingWithPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [appointmentId, setAppointmentId] = useState<string>("");
  const [loadingStripe, setLoadingStripe] = useState(true);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const { toast } = useToast();

  // Determine payment amount based on service configuration
  // If paymentType is "deposit", charge ONLY the deposit amount
  // If paymentType is "full", charge the full price
  const isDepositOnly = service.paymentType === 'deposit';
  const paymentAmount = isDepositOnly ? Number(service.depositAmount || 0) : Number(service.price);
  const isDepositPayment = isDepositOnly;

  // Initialize Stripe on component mount (platform account for destination charges)
  useEffect(() => {
    console.log('🔍 [STRIPE] Initializing with platform public key (destination charge)...');
    const promise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY).then(stripe => {
      console.log('✅ [STRIPE] Stripe.js loaded successfully:', stripe ? 'SUCCESS' : 'FAILED');
      return stripe;
    }).catch(error => {
      console.error('❌ [STRIPE] Failed to load Stripe.js:', error);
      setStripeError('Failed to initialize payment system');
      return null;
    });
    
    setStripePromise(promise);
    setLoadingStripe(false);
  }, []);

  // Create payment intent after Stripe is initialized
  useEffect(() => {
    if (!loadingStripe && !stripeError) {
      createPaymentIntent();
    }
  }, [loadingStripe, stripeError]);

  const createPaymentIntent = async () => {
    try {
      setIsLoading(true);
      console.log('🔍 [PAYMENT] Creating payment intent with booking data:', bookingData);
      
      // Create appointment with payment intent
      // Note: organizationId is not needed in the request - the server derives it from the service
      const response = await apiRequest("POST", "/api/appointments/book-with-payment", {
        ...bookingData,
      });

      const data = await response.json();
      console.log('🔍 [PAYMENT] Payment intent response:', { 
        hasClientSecret: !!data.clientSecret, 
        appointmentId: data.appointmentId,
        clientSecretPreview: data.clientSecret?.substring(0, 20) + '...'
      });
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setAppointmentId(data.appointmentId);
        console.log('✅ [PAYMENT] Client secret set successfully');
      } else {
        throw new Error("Failed to create payment intent");
      }
    } catch (error: any) {
      console.error('❌ [PAYMENT] Failed to create payment intent:', error);
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to initialize payment. Please try again.",
        variant: "destructive",
      });
      onCancel();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    try {
      // Finalize appointment after successful payment
      await apiRequest("POST", "/api/appointments/finalize-payment", {
        appointmentId,
        paymentIntentId
      });
      
      onSuccess(appointmentId);
    } catch (error: any) {
      toast({
        title: "Payment Confirmation Error",
        description: "Payment was successful but there was an issue confirming your appointment. Please contact support.",
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getDuration = () => {
    const start = new Date(bookingData.startTime);
    const end = new Date(bookingData.endTime);
    const minutes = (end.getTime() - start.getTime()) / (1000 * 60);
    return `${minutes} minutes`;
  };

  if (loadingStripe || isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="text-muted-foreground">
              {loadingStripe ? 'Initializing payment system...' : 'Preparing your appointment...'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stripeError) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="py-12">
          <div className="text-center space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{stripeError}</AlertDescription>
            </Alert>
            <Button onClick={onCancel} data-testid="button-back">
              Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret || !stripePromise) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="py-12">
          <div className="text-center space-y-4">
            <p className="text-red-600">Failed to initialize payment</p>
            <Button onClick={createPaymentIntent} data-testid="button-retry">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Appointment Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Appointment Summary
          </CardTitle>
          <CardDescription>
            Please review your appointment details and complete payment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{service.name}</span>
                {isDepositOnly ? (
                  <div className="flex gap-2">
                    <Badge variant="outline">Total: ${service.price}</Badge>
                    <Badge variant="default">Deposit: ${paymentAmount}</Badge>
                  </div>
                ) : (
                  <Badge variant="outline">${service.price}</Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Provider: {staff.title || 'Staff Member'}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{location.name}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatDateTime(bookingData.startTime)}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Duration: {getDuration()}</span>
              </div>
              
              {isDepositOnly && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Deposit Payment Only
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                    Paying ${paymentAmount} deposit now. Remaining ${Number(service.price) - paymentAmount} due at appointment.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Form */}
      {clientSecret && stripePromise ? (
        <Elements 
          stripe={stripePromise} 
          options={{ 
            clientSecret,
            appearance: {
              theme: 'stripe',
            },
          }}
        >
          <PaymentForm
            amount={Number(service.price)}
            isDepositOnly={isDepositPayment || undefined}
            depositAmount={Number(service.depositAmount)}
            serviceName={service.name}
            onSuccess={handlePaymentSuccess}
            onCancel={onCancel}
          />
        </Elements>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-muted-foreground">Loading payment options...</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
