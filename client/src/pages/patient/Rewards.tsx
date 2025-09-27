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
  Gift, Star, Trophy, Target, Calendar, TrendingUp,
  Award, Zap, Heart, Crown, CheckCircle, Clock
} from "lucide-react";
import type { Reward } from "@/types";

interface RewardsTier {
  name: string;
  minPoints: number;
  maxPoints: number;
  color: string;
  icon: React.ReactNode;
  benefits: string[];
}

interface RedemptionOption {
  id: string;
  title: string;
  description: string;
  pointsCost: number;
  type: "discount" | "service" | "product";
  icon: React.ReactNode;
  available: boolean;
}

export default function Rewards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRedemption, setSelectedRedemption] = useState<string>("");
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const { data: rewardsData, isLoading: rewardsLoading } = useQuery<{ rewards: Reward[], balance: number }>({
    queryKey: ["/api/rewards/my-rewards"],
    staleTime: 60000,
  });

  const rewardsTiers: RewardsTier[] = [
    {
      name: "Bronze",
      minPoints: 0,
      maxPoints: 999,
      color: "bg-orange-100 text-orange-800",
      icon: <Star className="w-5 h-5" />,
      benefits: ["Earn 1 point per $1 spent (+0.5x with membership)", "Birthday bonus"]
    },
    {
      name: "Silver", 
      minPoints: 1000,
      maxPoints: 2499,
      color: "bg-gray-100 text-gray-800",
      icon: <Award className="w-5 h-5" />,
      benefits: ["Earn 1.5 points per $1 spent (+0.5x with membership)", "Priority booking", "Quarterly bonus"]
    },
    {
      name: "Gold",
      minPoints: 2500,
      maxPoints: 4999,
      color: "bg-yellow-100 text-yellow-800",
      icon: <Trophy className="w-5 h-5" />,
      benefits: ["Earn 2 points per $1 spent (+0.5x with membership)", "Exclusive events", "Monthly bonus"]
    },
    {
      name: "Platinum",
      minPoints: 5000,
      maxPoints: Infinity,
      color: "bg-purple-100 text-purple-800",
      icon: <Crown className="w-5 h-5" />,
      benefits: ["Earn 2.5 points per $1 spent (+0.5x with membership)", "VIP concierge", "Weekly perks"]
    }
  ];

  const redemptionOptions: RedemptionOption[] = [
    {
      id: "discount-10",
      title: "$10 Service Credit",
      description: "Apply $10 credit to any service",
      pointsCost: 200,
      type: "discount",
      icon: <Gift className="w-5 h-5" />,
      available: true
    },
    {
      id: "discount-25",
      title: "$25 Service Credit",
      description: "Apply $25 credit to any service",
      pointsCost: 500,
      type: "discount",
      icon: <Gift className="w-5 h-5" />,
      available: true
    },
    {
      id: "free-facial",
      title: "Complimentary Basic Facial",
      description: "60-minute rejuvenating facial treatment",
      pointsCost: 800,
      type: "service",
      icon: <Zap className="w-5 h-5" />,
      available: true
    },
    {
      id: "discount-50",
      title: "$50 Service Credit",
      description: "Apply $50 credit to any premium service",
      pointsCost: 1000,
      type: "discount",
      icon: <Gift className="w-5 h-5" />,
      available: true
    },
    {
      id: "spa-package",
      title: "Mini Spa Package",
      description: "Facial + relaxation massage combo",
      pointsCost: 1500,
      type: "service",
      icon: <Heart className="w-5 h-5" />,
      available: false
    },
    {
      id: "vip-experience",
      title: "VIP Day Experience",
      description: "Full-day luxury spa experience",
      pointsCost: 3000,
      type: "service",
      icon: <Crown className="w-5 h-5" />,
      available: true
    }
  ];

  const redeemPointsMutation = useMutation({
    mutationFn: async (redemptionData: { optionId: string, pointsCost: number }) => {
      const response = await apiRequest("POST", "/api/rewards/redeem", redemptionData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/my-rewards"] });
      setIsRedeemDialogOpen(false);
      setSelectedRedemption("");
      toast({
        title: "Points redeemed!",
        description: "Your reward has been applied to your account.",
      });
    },
    onError: () => {
      toast({
        title: "Redemption failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const handleRedeem = () => {
    const option = redemptionOptions.find(opt => opt.id === selectedRedemption);
    if (!option) return;

    redeemPointsMutation.mutate({
      optionId: option.id,
      pointsCost: option.pointsCost
    });
  };

  const getCurrentTier = () => {
    const balance = rewardsData?.balance || 0;
    return rewardsTiers.find(tier => balance >= tier.minPoints && balance <= tier.maxPoints) || rewardsTiers[0];
  };

  const getNextTier = () => {
    const currentTier = getCurrentTier();
    const currentIndex = rewardsTiers.findIndex(tier => tier.name === currentTier.name);
    return currentIndex < rewardsTiers.length - 1 ? rewardsTiers[currentIndex + 1] : null;
  };

  const getProgressToNextTier = () => {
    const balance = rewardsData?.balance || 0;
    const nextTier = getNextTier();
    if (!nextTier) return 100;
    
    const currentTier = getCurrentTier();
    const progress = ((balance - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints)) * 100;
    return Math.min(progress, 100);
  };

  if (rewardsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const currentTier = getCurrentTier();
  const nextTier = getNextTier();
  const balance = rewardsData?.balance || 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-rewards-title">
            Rewards Program
          </h1>
          <p className="text-muted-foreground">Earn points with every visit and redeem for exclusive rewards</p>
        </div>

        {/* Points Balance Card */}
        <Card className="mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-accent p-8 text-white">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold mb-2" data-testid="text-points-balance">
                  {balance.toLocaleString()} Points
                </h2>
                <p className="text-primary-foreground/80">Available for redemption</p>
              </div>
              <div className="text-right">
                <Badge className={`${currentTier.color} mb-2`}>
                  {currentTier.icon}
                  <span className="ml-1">{currentTier.name} Member</span>
                </Badge>
                <div className="text-sm text-primary-foreground/80">
                  Since joining: {new Date().getFullYear()}
                </div>
              </div>
            </div>
            
            {nextTier && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress to {nextTier.name}</span>
                  <span>{nextTier.minPoints - balance} points to go</span>
                </div>
                <Progress value={getProgressToNextTier()} className="h-2 bg-white/20" />
              </div>
            )}
          </div>
        </Card>

        <Tabs defaultValue="redeem" className="space-y-6">
          <TabsList>
            <TabsTrigger value="redeem" data-testid="tab-redeem-rewards">Redeem Rewards</TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-points-activity">Points Activity</TabsTrigger>
            <TabsTrigger value="tiers" data-testid="tab-loyalty-tiers">Loyalty Tiers</TabsTrigger>
          </TabsList>

          <TabsContent value="redeem">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold" data-testid="text-redeem-rewards-title">
                  Available Rewards
                </h3>
                <Badge variant="outline" className="text-sm">
                  {balance.toLocaleString()} points available
                </Badge>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {redemptionOptions.map((option) => {
                  const canAfford = balance >= option.pointsCost;
                  
                  return (
                    <Card 
                      key={option.id}
                      className={`cursor-pointer transition-all hover:shadow-lg ${
                        !option.available || !canAfford ? 'opacity-60' : ''
                      } ${selectedRedemption === option.id ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => {
                        if (option.available && canAfford) {
                          setSelectedRedemption(option.id);
                          setIsRedeemDialogOpen(true);
                        }
                      }}
                      data-testid={`reward-option-${option.id}`}
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            {option.icon}
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-primary">
                              {option.pointsCost} pts
                            </div>
                            {!option.available && (
                              <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                            )}
                          </div>
                        </div>
                        <CardTitle className="text-base">{option.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                          {option.description}
                        </p>
                        <Button 
                          className="w-full" 
                          disabled={!option.available || !canAfford}
                          variant={canAfford && option.available ? "default" : "outline"}
                          data-testid={`button-redeem-${option.id}`}
                        >
                          {!canAfford ? "Not enough points" : !option.available ? "Coming Soon" : "Redeem"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2" data-testid="text-recent-activity-title">
                  <Clock className="w-5 h-5" />
                  <span>Recent Points Activity</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!rewardsData?.rewards || rewardsData.rewards.length === 0 ? (
                  <div className="text-center py-8">
                    <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-no-activity">
                      No points activity yet
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Start earning points by booking appointments!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rewardsData.rewards.slice(0, 10).map((reward) => (
                      <div 
                        key={reward.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                        data-testid={`reward-activity-${reward.id}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${
                            reward.points > 0 ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <div>
                            <div className="font-medium text-foreground">{reward.reason}</div>
                            <div className="text-sm text-muted-foreground">
                              {reward.createdAt ? new Date(reward.createdAt).toLocaleDateString() : 'Unknown date'}
                            </div>
                          </div>
                        </div>
                        <div className={`font-bold ${
                          reward.points > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {reward.points > 0 ? '+' : ''}{reward.points} pts
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tiers">
            <div className="space-y-6">
              <h3 className="text-xl font-semibold" data-testid="text-loyalty-tiers-title">
                Loyalty Tiers
              </h3>
              
              <div className="grid gap-6">
                {rewardsTiers.map((tier, index) => {
                  const isCurrentTier = tier.name === currentTier.name;
                  
                  return (
                    <Card 
                      key={tier.name}
                      className={`${isCurrentTier ? 'ring-2 ring-primary' : ''}`}
                      data-testid={`loyalty-tier-${tier.name.toLowerCase()}`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${tier.color}`}>
                              {tier.icon}
                            </div>
                            <div>
                              <h4 className="text-lg font-semibold flex items-center space-x-2">
                                <span>{tier.name}</span>
                                {isCurrentTier && (
                                  <Badge className="bg-primary text-primary-foreground">Current</Badge>
                                )}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {tier.minPoints.toLocaleString()} - {
                                  tier.maxPoints === Infinity 
                                    ? '∞' 
                                    : tier.maxPoints.toLocaleString()
                                } points
                              </p>
                            </div>
                          </div>
                          
                          {isCurrentTier && (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          )}
                        </div>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                          {tier.benefits.map((benefit, benefitIndex) => (
                            <div key={benefitIndex} className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm">{benefit}</span>
                            </div>
                          ))}
                        </div>
                        
                        {balance < tier.minPoints && (
                          <div className="mt-4 p-3 bg-muted rounded-lg">
                            <div className="text-sm text-muted-foreground">
                              {tier.minPoints - balance} more points to reach {tier.name}
                            </div>
                            <Progress 
                              value={(balance / tier.minPoints) * 100} 
                              className="mt-2 h-2" 
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Redemption Dialog */}
        <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redeem Reward</DialogTitle>
            </DialogHeader>
            {selectedRedemption && (
              <>
                {(() => {
                  const option = redemptionOptions.find(opt => opt.id === selectedRedemption);
                  return option ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                          {option.icon}
                        </div>
                        <h3 className="text-lg font-semibold">{option.title}</h3>
                        <p className="text-muted-foreground">{option.description}</p>
                        <div className="text-2xl font-bold text-primary mt-4">
                          {option.pointsCost} Points
                        </div>
                      </div>
                      
                      <div className="bg-muted p-4 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span>Current Balance:</span>
                          <span className="font-medium">{balance.toLocaleString()} points</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span>After Redemption:</span>
                          <span className="font-medium">
                            {(balance - option.pointsCost).toLocaleString()} points
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleRedeem}
                          disabled={redeemPointsMutation.isPending}
                          data-testid="button-confirm-redemption"
                        >
                          {redeemPointsMutation.isPending ? (
                            <div className="flex items-center space-x-2">
                              <LoadingSpinner size="sm" />
                              <span>Redeeming...</span>
                            </div>
                          ) : (
                            "Confirm Redemption"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : null;
                })()}
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
