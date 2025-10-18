import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ClinicNav from "@/components/ClinicNav";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Gift, Star, Trophy, TrendingUp, Users, Plus,
  Award, Crown, CheckCircle, DollarSign, Target
} from "lucide-react";

interface RewardActivity {
  id: string;
  clientName: string;
  points: number;
  reason: string;
  createdAt: string;
}

interface RewardOption {
  id: string;
  organizationId?: string;
  name: string;
  description: string;
  pointsCost: number;
  discountValue?: string | number;
  category: string;
  stripeProductId?: string;
  stripePriceId?: string;
  isActive: boolean;
  sortOrder?: number;
  createdAt?: string;
}

interface RewardStats {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  activeMembers: number;
  averageBalance: number;
}

export default function Rewards() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();
  const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
  const [isAwardPointsOpen, setIsAwardPointsOpen] = useState(false);
  
  // Reward option form state
  const [optionName, setOptionName] = useState("");
  const [optionDescription, setOptionDescription] = useState("");
  const [optionPointsCost, setOptionPointsCost] = useState("");
  const [optionCategory, setOptionCategory] = useState("");

  const { data: statsData, isLoading: statsLoading } = useQuery<RewardStats>({
    queryKey: ["/api/rewards/stats", organization?.id],
    enabled: !!organization?.id,
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<RewardActivity[]>({
    queryKey: ["/api/rewards/recent-activity", organization?.id],
    enabled: !!organization?.id,
  });

  const { data: rewardOptions, isLoading: optionsLoading, error: optionsError } = useQuery<RewardOption[]>({
    queryKey: ["/api/reward-options"],
    queryFn: async () => {
      const res = await fetch("/api/reward-options", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const data = await res.json();
      return data;
    },
    enabled: !!organization?.id,
  });

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/clients", organization?.id],
    enabled: !!organization?.id,
  });

  // Mutation for creating reward option
  const createRewardOption = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/reward-options", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reward-options"] });
      toast({
        title: "Reward option created",
        description: "The reward option has been added successfully.",
      });
      setIsAddOptionOpen(false);
      // Reset form
      setOptionName("");
      setOptionDescription("");
      setOptionPointsCost("");
      setOptionCategory("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create reward option",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateRewardOption = () => {
    if (!optionName || !optionPointsCost || !optionCategory) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    createRewardOption.mutate({
      name: optionName,
      description: optionDescription || "",
      pointsCost: parseInt(optionPointsCost),
      discountValue: null,
      category: optionCategory,
      isActive: true,
    });
  };

  const isLoading = orgLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const stats = statsData || {
    totalPointsIssued: 0,
    totalPointsRedeemed: 0,
    activeMembers: 0,
    averageBalance: 0,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-page-title">
            Rewards Program
          </h1>
          <p className="text-muted-foreground mb-4">
            Manage your rewards program, track activity, and keep patients engaged
          </p>
          <ClinicNav />
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Points Issued</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-points-issued">
                {stats.totalPointsIssued.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Total lifetime points</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Points Redeemed</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-points-redeemed">
                {stats.totalPointsRedeemed.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Customer rewards claimed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-members">
                {stats.activeMembers}
              </div>
              <p className="text-xs text-muted-foreground">With reward points</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Balance</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-avg-balance">
                {Math.round(stats.averageBalance).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Points per customer</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="activity" className="space-y-6">
          <TabsList>
            <TabsTrigger value="activity" data-testid="tab-activity">
              Recent Activity
            </TabsTrigger>
            <TabsTrigger value="options" data-testid="tab-options">
              Reward Options
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Recent Activity Tab */}
          <TabsContent value="activity" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Recent Points Activity</h2>
                <p className="text-sm text-muted-foreground">Track all reward transactions</p>
              </div>
              <Dialog open={isAwardPointsOpen} onOpenChange={setIsAwardPointsOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-award-points">
                    <Plus className="w-4 h-4 mr-2" />
                    Award Points
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Award Points to Client</DialogTitle>
                    <DialogDescription>
                      Manually award loyalty points to a client
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Client</Label>
                      <Select>
                        <SelectTrigger data-testid="select-client">
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients?.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.firstName} {client.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Points</Label>
                      <Input
                        type="number"
                        placeholder="100"
                        data-testid="input-points"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Textarea
                        placeholder="e.g., Birthday bonus, Referral reward, Special promotion"
                        data-testid="input-reason"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsAwardPointsOpen(false)} data-testid="button-cancel">
                      Cancel
                    </Button>
                    <Button data-testid="button-confirm-award">
                      Award Points
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                {activityLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : recentActivity && recentActivity.length > 0 ? (
                  <div className="divide-y">
                    {recentActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center justify-between p-4 hover:bg-muted/50"
                        data-testid={`activity-${activity.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Star className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{activity.clientName}</p>
                            <p className="text-sm text-muted-foreground">{activity.reason}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-primary">
                            {activity.points > 0 ? "+" : ""}{activity.points} pts
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(activity.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Star className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No reward activity yet</p>
                    <p className="text-sm text-muted-foreground">
                      Points will appear here when clients earn or redeem rewards
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reward Options Tab */}
          <TabsContent value="options" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Reward Redemption Options</h2>
                <p className="text-sm text-muted-foreground">Manage what clients can redeem with their points</p>
              </div>
              <Dialog open={isAddOptionOpen} onOpenChange={setIsAddOptionOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-option">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Option
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Reward Option</DialogTitle>
                    <DialogDescription>
                      Add a new reward that clients can redeem with their points
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        placeholder="e.g., $10 Off Next Service"
                        value={optionName}
                        onChange={(e) => setOptionName(e.target.value)}
                        data-testid="input-reward-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Describe the reward benefit"
                        value={optionDescription}
                        onChange={(e) => setOptionDescription(e.target.value)}
                        data-testid="input-reward-description"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Points Required</Label>
                        <Input
                          type="number"
                          placeholder="500"
                          value={optionPointsCost}
                          onChange={(e) => setOptionPointsCost(e.target.value)}
                          data-testid="input-points-cost"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={optionCategory} onValueChange={setOptionCategory}>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="discount">Discount</SelectItem>
                            <SelectItem value="service">Free Service</SelectItem>
                            <SelectItem value="product">Product</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsAddOptionOpen(false)} data-testid="button-cancel-option">
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreateRewardOption}
                      disabled={createRewardOption.isPending}
                      data-testid="button-save-option"
                    >
                      {createRewardOption.isPending ? "Saving..." : "Save Option"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {optionsLoading ? (
                <div className="col-span-full flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : rewardOptions && rewardOptions.length > 0 ? (
                rewardOptions.map((option) => (
                  <Card key={option.id} data-testid={`option-${option.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Gift className="h-5 w-5 text-primary" />
                          <CardTitle className="text-lg">{option.name}</CardTitle>
                        </div>
                        <Badge variant={option.isActive ? "default" : "secondary"}>
                          {option.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <CardDescription>{option.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span className="font-semibold">{option.pointsCost} points</span>
                        </div>
                        <Badge variant="outline">{option.category}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Gift className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-2">No reward options yet</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create redemption options for your clients to use their points
                    </p>
                    <Button onClick={() => setIsAddOptionOpen(true)} data-testid="button-create-first-option">
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Option
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Rewards Program Settings</CardTitle>
                <CardDescription>Configure how your rewards program works</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Points Earning Rate</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      defaultValue="1"
                      className="w-20"
                      data-testid="input-earn-rate"
                    />
                    <span className="text-sm text-muted-foreground">points per $1 spent</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Membership Bonus Multiplier</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue="0.5"
                      className="w-20"
                      data-testid="input-bonus-multiplier"
                    />
                    <span className="text-sm text-muted-foreground">additional multiplier for members</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Points Expiration</Label>
                  <Select defaultValue="12">
                    <SelectTrigger data-testid="select-expiration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never expire</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                      <SelectItem value="24">24 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button data-testid="button-save-settings">
                  Save Settings
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reward Tiers</CardTitle>
                <CardDescription>Point thresholds for loyalty tiers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Bronze", min: 0, max: 999, icon: Star, color: "text-orange-600" },
                    { name: "Silver", min: 1000, max: 2499, icon: Award, color: "text-gray-600" },
                    { name: "Gold", min: 2500, max: 4999, icon: Trophy, color: "text-yellow-600" },
                    { name: "Platinum", min: 5000, max: null, icon: Crown, color: "text-purple-600" },
                  ].map((tier) => {
                    const Icon = tier.icon;
                    return (
                      <div key={tier.name} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Icon className={`h-6 w-6 ${tier.color}`} />
                          <div>
                            <p className="font-semibold">{tier.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {tier.min.toLocaleString()} - {tier.max ? tier.max.toLocaleString() : "∞"} points
                            </p>
                          </div>
                        </div>
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
