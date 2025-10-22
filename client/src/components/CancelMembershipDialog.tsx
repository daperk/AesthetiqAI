import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Loader2, AlertTriangle, Gift, DollarSign, Heart, X } from "lucide-react";

interface Membership {
  id: string;
  tierName: string;
  monthlyFee?: number;
  discount?: number;
  monthlyCredits?: number;
}

interface CancelMembershipDialogProps {
  open: boolean;
  onClose: () => void;
  membership: Membership | null;
  onSuccess: () => void;
}

const CANCELLATION_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "switching_provider", label: "Switching to another provider" },
  { value: "service_quality", label: "Not satisfied with service quality" },
  { value: "moving", label: "Moving away" },
  { value: "other", label: "Other reason" },
];

export function CancelMembershipDialog({
  open,
  onClose,
  membership,
  onSuccess
}: CancelMembershipDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedReason, setSelectedReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedReason("");
      setIsProcessing(false);
    }
  }, [open]);

  if (!membership) return null;

  const handleCancel = async () => {
    setIsProcessing(true);
    
    try {
      await apiRequest("POST", "/api/memberships/cancel", {
        membershipId: membership.id,
        reason: selectedReason
      });

      toast({
        title: "Membership Cancelled",
        description: "Your membership has been cancelled. You'll have access until the end of your billing period.",
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: "Cancellation Failed",
        description: error.message || "Failed to cancel membership. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
        </div>
        <h3 className="text-xl font-semibold">Are you sure you want to cancel?</h3>
        <p className="text-muted-foreground">
          You'll lose all these exclusive benefits:
        </p>
      </div>

      <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="pt-6 space-y-3">
          {membership.monthlyCredits && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">${membership.monthlyCredits} Monthly Credits</div>
                <div className="text-sm text-muted-foreground">Worth ${membership.monthlyCredits} every month</div>
              </div>
            </div>
          )}
          
          {membership.discount && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Gift className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">{membership.discount}% Discount on All Services</div>
                <div className="text-sm text-muted-foreground">Save on every visit</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold">Priority Booking & Exclusive Events</div>
              <div className="text-sm text-muted-foreground">VIP treatment every time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1"
          data-testid="button-keep-membership-step1"
        >
          Keep Membership
        </Button>
        <Button
          variant="destructive"
          onClick={() => setStep(2)}
          className="flex-1"
          data-testid="button-continue-cancel-step1"
        >
          Continue Cancellation
        </Button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto">
          <Heart className="w-8 h-8 text-blue-600" />
        </div>
        <h3 className="text-xl font-semibold">We'd hate to see you go!</h3>
        <p className="text-muted-foreground">
          How about a special offer just for you?
        </p>
      </div>

      <Card className="border-2 border-primary">
        <CardContent className="pt-6 space-y-4">
          <div className="text-center">
            <div className="inline-block px-4 py-2 bg-primary/10 rounded-full mb-3">
              <span className="text-2xl font-bold text-primary">20% OFF</span>
            </div>
            <h4 className="font-semibold text-lg mb-2">Special Retention Offer</h4>
            <p className="text-sm text-muted-foreground">
              Get 20% off your next 3 months if you stay with us
            </p>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>Regular Price:</span>
              <span className="line-through">${membership.monthlyFee?.toFixed(2)}/month</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-primary">
              <span>Special Price:</span>
              <span>${((membership.monthlyFee || 0) * 0.8).toFixed(2)}/month</span>
            </div>
            <p className="text-xs text-muted-foreground">For the next 3 months</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1"
          data-testid="button-keep-membership-step2"
        >
          Accept Offer & Stay
        </Button>
        <Button
          variant="destructive"
          onClick={() => setStep(3)}
          className="flex-1"
          data-testid="button-continue-cancel-step2"
        >
          No Thanks, Cancel
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
          <X className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-xl font-semibold">Final Step: Tell us why</h3>
        <p className="text-muted-foreground">
          Your feedback helps us improve our service
        </p>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Reason for cancelling:</Label>
        <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
          <div className="space-y-2">
            {CANCELLATION_REASONS.map((reason) => (
              <div 
                key={reason.value}
                className="flex items-center space-x-3 p-3 border rounded-lg hover:border-primary transition-colors cursor-pointer"
                onClick={() => setSelectedReason(reason.value)}
              >
                <RadioGroupItem value={reason.value} id={reason.value} data-testid={`radio-reason-${reason.value}`} />
                <Label htmlFor={reason.value} className="cursor-pointer flex-1">
                  {reason.label}
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>
      </div>

      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Note:</strong> Your membership will remain active until the end of your current billing period. You can reactivate anytime.
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1"
          disabled={isProcessing}
          data-testid="button-keep-membership-step3"
        >
          Keep Membership
        </Button>
        <Button
          variant="destructive"
          onClick={handleCancel}
          className="flex-1"
          disabled={!selectedReason || isProcessing}
          data-testid="button-confirm-cancel-step3"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cancelling...
            </>
          ) : (
            "Confirm Cancellation"
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="cancel-membership-dialog">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Cancel Membership"}
            {step === 2 && "Special Offer for You"}
            {step === 3 && "Final Confirmation"}
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3
          </DialogDescription>
        </DialogHeader>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </DialogContent>
    </Dialog>
  );
}
