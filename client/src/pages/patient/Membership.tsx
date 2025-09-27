import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Crown, CreditCard, Calendar, Gift, TrendingUp, Check, 
  Star, ArrowRight, Sparkles, Heart, Zap
} from "lucide-react";
import type { Membership } from "@/types";

interface MembershipTier {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  benefits: string[];
  discountPercentage: number;
  monthlyCredits: number;
  color: string;
  icon: React.ReactNode;
  popular?: boolean;
}

export default function PatientMembership() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);

  const { data: currentMembership, isLoading: membershipLoading } = useQuery<Membership>({
    queryKey: ["/api/memberships/my-membership"],
    staleTime: 60000,
  });

  const membershipTiers: MembershipTier[] = [
    {
      id: "bronze",
      name: "Bronze",
      monthlyPrice: 59,
      yearlyPrice: 590,
      benefits: [
        "5% discount on all services",
        "Priority booking",
        "Birthday month gift",
        "Members-only events",
      ],
      discountPercentage: 5,
      monthlyCredits: 50,
      color: "bg-orange-100 text-orange-800 border-orange-200",
      icon: <Heart className="w-5 h-5" />
    },
    {
      id: "silver",
      name: "Silver",
      monthlyPrice: 99,
      yearlyPrice: 990,
      benefits: [
        "10% discount on all services",
        "Complimentary consultation monthly",
        "Member events & workshops",
        "Flexible appointment changes",
        "Express service lane"
      ],
      discountPercentage: 10,
      monthlyCredits: 100,
      color: "bg-gray-100 text-gray-800 border-gray-200",
      icon: <Star className="w-5 h-5" />
    },
    {
      id: "gold",
      name: "Gold",
      monthlyPrice: 149,
      yearlyPrice: 1490,
      benefits: [
        "15% discount on all services",
        "Monthly complimentary add-on service",
        "VIP customer support",
        "Early access to new treatments",
        "Quarterly spa day experience",
        "Guest privileges for friends"
      ],
      discountPercentage: 15,
      monthlyCredits: 150,
      color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      icon: <Crown className="w-5 h-5" />,
      popular: true
    },
    {
      id: "platinum",
      name: "Platinum",
      monthlyPrice: 199,
      yearlyPrice: 1990,
      benefits: [
        "20% discount on all services",
        "Unlimited complimentary consultations",
        "Dedicated VIP coordinator",
        "Exclusive platinum-only treatments",
        "Monthly luxury spa package",
        "Concierge booking service",
        "Access to exclusive events"
      ],
      discountPercentage: 20,
      monthlyCredits: 200,
      color: "bg-purple-100 text-purple-800 border-purple-200",
      icon: <Sparkles className="w-5 h-5" />
    }
  ];

  const upgradeMembershipMutation = useMutation({
    mutationFn: async (tierData: { tierId: string, billingCycle: string }) => {
      const response = await apiRequest("POST", "/api/memberships/upgrade", tierData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memberships/my-membership"] });
      setIsUpgradeDialogOpen(false);
      toast({
        title: "Membership upgraded!",
        description: "Your new membership benefits are now active.",
      });
    },
    onError: () => {
      toast({
        title: "Upgrade failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const handleUpgrade = () => {
    if (!selectedPlan) return;
    
    upgradeMembershipMutation.mutate({
      tierId: selectedPlan,
      billingCycle
    });
  };

  const getCurrentTier = () => {
    if (!currentMembership) return null;
    return membershipTiers.find(tier => tier.name.toLowerCase() === currentMembership.tierName.toLowerCase());
  };

  const currentTier = getCurrentTier();
  const creditsUsedPercentage = currentMembership 
    ? (parseFloat(currentMembership.usedCredits?.toString() || "0") / parseFloat(currentMembership.monthlyCredits?.toString() || "1")) * 100
    : 0;

  if (membershipLoading) {
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
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-membership-title">
            Your Membership
          </h1>
          <p className="text-muted-foreground">Manage your membership and explore upgrade options</p>
        </div>

        <Tabs defaultValue="current" className="space-y-6">
          <TabsList>
            <TabsTrigger value="current" data-testid="tab-current-membership">Current Membership</TabsTrigger>
            <TabsTrigger value="upgrade" data-testid="tab-upgrade-options">Upgrade Options</TabsTrigger>
            <TabsTrigger value="benefits" data-testid="tab-benefits">Benefits Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="current">
            {currentMembership ? (
              <div className="space-y-6">
                {/* Current Membership Card */}
                <Card className="overflow-hidden">
                  <div className="bg-gradient-to-br from-primary to-accent p-6 text-white">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        {currentTier?.icon}
                        <div>
                          <h2 className="text-2xl font-serif font-bold" data-testid="text-current-tier-name">
                            {currentMembership.tierName} Membership
                          </h2>
                          <p className="text-primary-foreground/80">
                            Active since {new Date(currentMembership.startDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">${currentMembership.monthlyFee}</div>
                        <div className="text-sm text-primary-foreground/80">per month</div>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-primary-foreground/80 text-sm">Monthly Credits</div>
                        <div className="text-xl font-bold">
                          ${currentMembership.monthlyCredits}
                        </div>
                      </div>
                      <div>
                        <div className="text-primary-foreground/80 text-sm">Discount</div>
                        <div className="text-xl font-bold">
                          {currentTier?.discountPercentage || 0}%
                        </div>
                      </div>
                      <div>
                        <div className="text-primary-foreground/80 text-sm">Status</div>
                        <div className="text-xl font-bold capitalize">
                          {currentMembership.status}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Usage Overview */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2" data-testid="text-credits-usage-title">
                        <CreditCard className="w-5 h-5" />
                        <span>Credits Usage</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm">
                          <span>Used this month</span>
                          <span className="font-medium">
                            ${currentMembership.usedCredits || 0} / ${currentMembership.monthlyCredits}
                          </span>
                        </div>
                        <Progress value={creditsUsedPercentage} className="h-2" />
                        <div className="text-xs text-muted-foreground">
                          {creditsUsedPercentage < 80 
                            ? `You have $${parseFloat(currentMembership.monthlyCredits?.toString() || "0") - parseFloat(currentMembership.usedCredits?.toString() || "0")} remaining this month`
                            : "You're close to your monthly limit"
                          }
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2" data-testid="text-next-billing-title">
                        <Calendar className="w-5 h-5" />
                        <span>Next Billing</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-2xl font-bold">
                          {currentMembership.endDate 
                            ? new Date(currentMembership.endDate).toLocaleDateString()
                            : "Ongoing"
                          }
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {currentMembership.autoRenew 
                            ? "Auto-renewal enabled"
                            : "Auto-renewal disabled"
                          }
                        </p>
                        <Button variant="outline" size="sm" className="mt-2" data-testid="button-manage-billing">
                          Manage Billing
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Current Benefits */}
                <Card>
                  <CardHeader>
                    <CardTitle data-testid="text-current-benefits-title">Your Current Benefits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {currentTier?.benefits.map((benefit, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span className="text-sm">{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Crown className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2" data-testid="text-no-membership-title">
                    No Active Membership
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Join our membership program to enjoy exclusive benefits and savings
                  </p>
                  <Button onClick={() => setIsUpgradeDialogOpen(true)} data-testid="button-join-membership">
                    Explore Membership Plans
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="upgrade">
            <div className="space-y-6">
              {/* Billing Toggle */}
              <Card>
                <CardContent className="p-4">
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

              {/* Membership Tiers */}
              <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-6">
                {membershipTiers.map((tier) => {
                  const isCurrentTier = currentTier?.id === tier.id;
                  const price = billingCycle === 'yearly' ? tier.yearlyPrice / 12 : tier.monthlyPrice;
                  
                  return (
                    <Card 
                      key={tier.id}
                      className={`relative cursor-pointer transition-all hover:shadow-lg ${
                        tier.popular ? 'ring-2 ring-primary' : ''
                      } ${selectedPlan === tier.id ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedPlan(tier.id)}
                      data-testid={`membership-tier-${tier.id}`}
                    >
                      {tier.popular && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                          <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                        </div>
                      )}
                      
                      <CardHeader className="text-center">
                        <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${tier.color}`}>
                          {tier.icon}
                        </div>
                        <CardTitle className="text-lg">{tier.name}</CardTitle>
                        <div className="space-y-1">
                          <div className="text-2xl font-bold">
                            ${Math.round(price)}
                            <span className="text-sm font-normal text-muted-foreground">/month</span>
                          </div>
                          {billingCycle === 'yearly' && (
                            <div className="text-xs text-muted-foreground">
                              Billed ${tier.yearlyPrice} annually
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      
                      <CardContent>
                        <div className="space-y-3 mb-6">
                          {tier.benefits.slice(0, 4).map((benefit, index) => (
                            <div key={index} className="flex items-start space-x-2">
                              <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-muted-foreground">{benefit}</span>
                            </div>
                          ))}
                          {tier.benefits.length > 4 && (
                            <div className="text-xs text-primary">
                              +{tier.benefits.length - 4} more benefits
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Monthly Credits:</span>
                            <span className="font-medium">${tier.monthlyCredits}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Discount:</span>
                            <span className="font-medium">{tier.discountPercentage}%</span>
                          </div>
                        </div>
                        
                        <Button 
                          className="w-full" 
                          variant={isCurrentTier ? "outline" : selectedPlan === tier.id ? "default" : "outline"}
                          disabled={isCurrentTier}
                          data-testid={`button-select-${tier.id}`}
                        >
                          {isCurrentTier ? "Current Plan" : selectedPlan === tier.id ? "Selected" : "Select Plan"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {selectedPlan && (
                <div className="flex justify-center">
                  <Dialog open={isUpgradeDialogOpen} onOpenChange={setIsUpgradeDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="lg" className="px-8" data-testid="button-upgrade-membership">
                        {currentMembership ? "Upgrade Membership" : "Join Membership"}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {currentMembership ? "Upgrade Membership" : "Join Membership"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {selectedPlan && (
                          <>
                            <div className="text-center">
                              <h3 className="text-lg font-semibold">
                                {membershipTiers.find(t => t.id === selectedPlan)?.name} Plan
                              </h3>
                              <p className="text-2xl font-bold text-primary">
                                ${billingCycle === 'yearly' 
                                  ? Math.round((membershipTiers.find(t => t.id === selectedPlan)?.yearlyPrice || 0) / 12)
                                  : membershipTiers.find(t => t.id === selectedPlan)?.monthlyPrice
                                }/month
                              </p>
                            </div>
                            
                            <div className="flex justify-end space-x-2">
                              <Button variant="outline" onClick={() => setIsUpgradeDialogOpen(false)}>
                                Cancel
                              </Button>
                              <Button 
                                onClick={handleUpgrade}
                                disabled={upgradeMembershipMutation.isPending}
                                data-testid="button-confirm-upgrade"
                              >
                                {upgradeMembershipMutation.isPending ? (
                                  <div className="flex items-center space-x-2">
                                    <LoadingSpinner size="sm" />
                                    <span>Processing...</span>
                                  </div>
                                ) : (
                                  "Confirm Upgrade"
                                )}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="benefits">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2" data-testid="text-membership-benefits-title">
                    <Gift className="w-5 h-5" />
                    <span>Membership Benefits</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">Exclusive Discounts</h4>
                        <p className="text-sm text-muted-foreground">
                          Save 5-20% on all services based on your membership tier
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">Priority Booking</h4>
                        <p className="text-sm text-muted-foreground">
                          Get first access to appointment slots and express service
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <Gift className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">Monthly Credits</h4>
                        <p className="text-sm text-muted-foreground">
                          Receive monthly service credits that roll over
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-member-perks-title">VIP Member Perks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Birthday month special gifts</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Exclusive member-only events</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Early access to new treatments</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Complimentary consultations</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Guest privileges for friends</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Dedicated VIP support</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
