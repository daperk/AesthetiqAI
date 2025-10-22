import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ClinicNav from "@/components/ClinicNav";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePaymentRequired } from "@/hooks/usePaymentRequired";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Crown, Plus, Search, MoreHorizontal, Users, DollarSign,
  Calendar, Gift, TrendingUp, Settings, CreditCard
} from "lucide-react";
import type { Membership, Client } from "@/types";

interface MembershipTier {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  benefits: string[];
  discountPercentage?: number;
  monthlyCredits?: number;
  color: string;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  isActive: boolean;
  autoRenew: boolean;
  sortOrder: number;
  createdAt: Date;
}

export default function Memberships() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Enforce payment setup requirement
  const { isLoading: paymentLoading, hasAccess } = usePaymentRequired();
  
  const [activeTab, setActiveTab] = useState("tiers");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateTierDialogOpen, setIsCreateTierDialogOpen] = useState(false);
  const [isEditTierDialogOpen, setIsEditTierDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);
  
  const [newTier, setNewTier] = useState({
    name: "",
    monthlyPrice: "",
    yearlyPrice: "",
    discountPercentage: "",
    monthlyCredits: "",
    benefits: "",
    color: "gold",
    autoRenew: true,
  });

  // Fetch membership tiers from API
  const { data: membershipTiers = [], isLoading: tiersLoading } = useQuery({
    queryKey: ["/api/membership-tiers", organization?.id],
    queryFn: () => fetch("/api/membership-tiers").then(res => res.json()),
    enabled: !!organization?.id,
    staleTime: 60000,
  });

  const { data: memberships, isLoading: membershipsLoading } = useQuery<Membership[]>({
    queryKey: ["/api/memberships"],
    enabled: !!organization?.id,
    staleTime: 30000,
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients", organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60000,
  });

  const createTierMutation = useMutation({
    mutationFn: async (tierData: typeof newTier) => {
      // This would create a new membership tier
      const response = await apiRequest("POST", "/api/membership-tiers", {
        ...tierData,
        organizationId: organization?.id,
        monthlyPrice: tierData.monthlyPrice,
        yearlyPrice: tierData.yearlyPrice || null,
        discountPercentage: tierData.discountPercentage,
        monthlyCredits: tierData.monthlyCredits,
        benefits: tierData.benefits.split(',').map(b => b.trim()),
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both general and organization-specific queries
      queryClient.invalidateQueries({ queryKey: ["/api/membership-tiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/membership-tiers", organization?.id] });
      setIsCreateTierDialogOpen(false);
      setNewTier({
        name: "",
        monthlyPrice: "",
        yearlyPrice: "",
        discountPercentage: "",
        monthlyCredits: "",
        benefits: "",
        color: "gold",
        autoRenew: true,
      });
      toast({
        title: "Membership tier created",
        description: "New membership tier has been successfully created.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create tier",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update tier mutation
  const updateTierMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!editingTier) throw new Error("No tier selected for editing");
      
      const response = await apiRequest("PUT", `/api/membership-tiers/${editingTier.id}`, {
        name: formData.get("tierName"),
        monthlyPrice: formData.get("monthlyPrice"),
        discountPercentage: formData.get("discountPercentage"),
        monthlyCredits: formData.get("monthlyCredits"),
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both general and organization-specific queries
      queryClient.invalidateQueries({ queryKey: ["/api/membership-tiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/membership-tiers", organization?.id] });
      setIsEditTierDialogOpen(false);
      setEditingTier(null);
      toast({
        title: "Tier updated",
        description: "Membership tier has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update tier",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTierMutation.mutate(newTier);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewTier(prev => ({ ...prev, [name]: value }));
  };

  const filteredMemberships = memberships
    ?.filter(membership => {
      if (searchTerm && !membership.tierName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      if (statusFilter === "all") return true;
      if (statusFilter === "active") return membership.status === "active";
      if (statusFilter === "pending") return membership.status === "suspended";
      if (statusFilter === "inactive") return membership.status !== "active" && membership.status !== "suspended";
      
      return true;
    })
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()) || [];

  const getMembershipStats = () => {
    const totalMembers = memberships?.length || 0;
    const activeMembers = memberships?.filter(m => m.status === "active").length || 0;
    const pendingMembers = memberships?.filter(m => m.status === "suspended").length || 0;
    const totalMRR = memberships?.reduce((sum, m) => 
      m.status === "active" ? sum + parseFloat(m.monthlyFee.toString()) : sum, 0) || 0;
    
    return { totalMembers, activeMembers, pendingMembers, totalMRR };
  };

  // Show loading while checking payment status or loading data
  if (membershipsLoading || tiersLoading || paymentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Block access if payment setup is not complete (will redirect to payment setup)
  if (!hasAccess) {
    return null;
  }

  const stats = getMembershipStats();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-memberships-title">
            Memberships
          </h1>
          <p className="text-muted-foreground mb-4">Manage membership tiers and subscriber relationships</p>
          <ClinicNav />
        </div>


        {/* Stats Cards */}
        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Members</span>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-total-members">
                {stats.totalMembers}
              </div>
              <div className="text-sm text-muted-foreground">{stats.activeMembers} active • {stats.pendingMembers} pending</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Monthly Revenue</span>
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-membership-mrr">
                ${stats.totalMRR.toLocaleString()}
              </div>
              <div className="text-sm text-green-500">+12% this month</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Avg. Tier Value</span>
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-avg-tier-value">
                ${stats.totalMembers > 0 ? Math.round(stats.totalMRR / stats.totalMembers) : 0}
              </div>
              <div className="text-sm text-muted-foreground">per member</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Retention Rate</span>
                <Crown className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-retention-rate">
                94%
              </div>
              <div className="text-sm text-green-500">+2% improvement</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="tiers" data-testid="tab-membership-tiers">Membership Tiers</TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-active-members">Members</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-membership-analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="tiers">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-serif font-semibold" data-testid="text-membership-tiers-title">
                Membership Tiers
              </h2>
              <Dialog open={isCreateTierDialogOpen} onOpenChange={setIsCreateTierDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-tier">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Tier
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Membership Tier</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Tier Name</Label>
                        <Input
                          id="name"
                          name="name"
                          value={newTier.name}
                          onChange={handleInputChange}
                          placeholder="e.g., VIP Gold"
                          required
                          data-testid="input-tier-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="monthlyPrice">Monthly Price ($)</Label>
                        <Input
                          id="monthlyPrice"
                          name="monthlyPrice"
                          type="number"
                          step="0.01"
                          value={newTier.monthlyPrice}
                          onChange={handleInputChange}
                          placeholder="99.00"
                          required
                          data-testid="input-monthly-price"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="yearlyPrice">Yearly Price ($) - Optional</Label>
                        <Input
                          id="yearlyPrice"
                          name="yearlyPrice"
                          type="number"
                          step="0.01"
                          value={newTier.yearlyPrice}
                          onChange={handleInputChange}
                          placeholder="990.00"
                          data-testid="input-yearly-price"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="discountPercentage">Discount (%)</Label>
                        <Input
                          id="discountPercentage"
                          name="discountPercentage"
                          type="number"
                          min="0"
                          max="100"
                          value={newTier.discountPercentage}
                          onChange={handleInputChange}
                          placeholder="10"
                          data-testid="input-discount-percentage"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="monthlyCredits">Monthly Credits ($)</Label>
                        <Input
                          id="monthlyCredits"
                          name="monthlyCredits"
                          type="number"
                          step="0.01"
                          value={newTier.monthlyCredits}
                          onChange={handleInputChange}
                          placeholder="100.00"
                          data-testid="input-monthly-credits"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="benefits">Benefits (comma-separated)</Label>
                      <Textarea
                        id="benefits"
                        name="benefits"
                        value={newTier.benefits}
                        onChange={handleInputChange}
                        placeholder="10% discount, Priority booking, Monthly gift"
                        data-testid="input-benefits"
                      />
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="autoRenew"
                        checked={newTier.autoRenew}
                        onCheckedChange={(checked) => setNewTier(prev => ({ ...prev, autoRenew: checked }))}
                        data-testid="switch-auto-renew"
                      />
                      <Label htmlFor="autoRenew">Auto-renewal enabled by default</Label>
                    </div>
                    
                    <div className="flex justify-end space-x-2">
                      <Button type="button" variant="outline" onClick={() => setIsCreateTierDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createTierMutation.isPending} data-testid="button-save-tier">
                        {createTierMutation.isPending ? (
                          <div className="flex items-center space-x-2">
                            <LoadingSpinner size="sm" />
                            <span>Creating...</span>
                          </div>
                        ) : (
                          "Create Tier"
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Edit Tier Dialog */}
            <Dialog open={isEditTierDialogOpen} onOpenChange={setIsEditTierDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Membership Tier</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (editingTier) {
                    const formData = new FormData(e.target as HTMLFormElement);
                    updateTierMutation.mutate(formData);
                  }
                }} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-tier-name">Tier Name</Label>
                    <Input
                      id="edit-tier-name"
                      name="tierName"
                      placeholder="e.g., Gold, Platinum"
                      defaultValue={editingTier?.name || ""}
                      data-testid="input-tier-name"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-monthly-price">Monthly Price ($)</Label>
                      <Input
                        id="edit-monthly-price"
                        name="monthlyPrice"
                        type="number"
                        placeholder="149"
                        min="0"
                        step="0.01"
                        defaultValue={editingTier?.monthlyPrice?.toString() || ""}
                        data-testid="input-monthly-price"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-discount">Discount (%)</Label>
                      <Input
                        id="edit-discount"
                        name="discountPercentage"
                        type="number"
                        placeholder="10"
                        min="0"
                        max="100"
                        defaultValue={editingTier?.discountPercentage?.toString() || ""}
                        data-testid="input-discount-percentage"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-monthly-credits">Monthly Credits ($)</Label>
                    <Input
                      id="edit-monthly-credits"
                      name="monthlyCredits"
                      type="number"
                      placeholder="50"
                      min="0"
                      defaultValue={editingTier?.monthlyCredits?.toString() || ""}
                      data-testid="input-monthly-credits"
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsEditTierDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateTierMutation.isPending} data-testid="button-update-tier">
                      {updateTierMutation.isPending ? "Updating..." : "Update Tier"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-6">
              {membershipTiers.map((tier: MembershipTier) => (
                <Card key={tier.id} className="relative" data-testid={`membership-tier-${tier.name.toLowerCase()}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{tier.name}</CardTitle>
                        <Badge className={tier.color}>
                          {tier.discountPercentage}% discount
                        </Badge>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setEditingTier(tier);
                          setIsEditTierDialogOpen(true);
                        }}
                        data-testid={`button-edit-tier-${tier.name.toLowerCase()}`}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="text-2xl font-bold">${tier.monthlyPrice}</div>
                        <div className="text-sm text-muted-foreground">per month</div>
                      </div>
                      
                      <div>
                        <div className="text-sm font-medium mb-2">Benefits:</div>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {tier.benefits?.map((benefit: string, index: number) => (
                            <li key={index}>• {benefit}</li>
                          ))}
                        </ul>
                      </div>
                      
                      <div className="pt-4 border-t">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Monthly Credits:</span>
                          <span className="font-medium">${tier.monthlyCredits}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-muted-foreground">Subscribers:</span>
                          <span className="font-medium">
                            {memberships?.filter(m => m.tierName === tier.name && m.status === "active").length || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <CardTitle data-testid="text-active-members-title">All Members</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                      data-testid="input-search-members"
                    />
                  </div>
                </div>
                <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="all" data-testid="filter-all">
                      All ({memberships?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="active" data-testid="filter-active">
                      Active ({memberships?.filter(m => m.status === "active").length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="pending" data-testid="filter-pending">
                      Pending ({memberships?.filter(m => m.status === "suspended").length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="inactive" data-testid="filter-inactive">
                      Inactive ({memberships?.filter(m => m.status !== "active" && m.status !== "suspended").length || 0})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                {filteredMemberships.length === 0 ? (
                  <div className="text-center py-8">
                    <Crown className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-no-members">
                      {searchTerm 
                        ? "No members match your search" 
                        : statusFilter === "all" 
                        ? "No members found" 
                        : `No ${statusFilter} members found`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredMemberships.map((membership) => (
                      <div 
                        key={membership.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        data-testid={`member-item-${membership.id}`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <Crown className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">Client Name</div>
                            <div className="text-sm text-muted-foreground">
                              {membership.tierName} • Joined {new Date(membership.startDate).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">${membership.monthlyFee}/month</div>
                            <div className="text-xs text-muted-foreground">
                              ${membership.usedCredits || 0} of ${membership.monthlyCredits} used
                            </div>
                          </div>
                          
                          <Badge 
                            className={
                              membership.status === "active" 
                                ? "bg-green-100 text-green-800" 
                                : membership.status === "suspended"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                            }
                            data-testid={`badge-status-${membership.id}`}
                          >
                            {membership.status === "active" 
                              ? "Active" 
                              : membership.status === "suspended"
                              ? "Pending Payment"
                              : "Inactive"}
                          </Badge>
                          
                          <Button variant="ghost" size="sm" data-testid={`button-member-menu-${membership.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-revenue-breakdown-title">Revenue Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {membershipTiers.map((tier: MembershipTier) => {
                      const tierMembers = memberships?.filter(m => m.tierName === tier.name && m.status === "active").length || 0;
                      const tierRevenue = tierMembers * tier.monthlyPrice;
                      
                      return (
                        <div key={tier.id} className="flex items-center justify-between p-3 border rounded">
                          <div className="flex items-center space-x-3">
                            <Badge className={tier.color}>{tier.name}</Badge>
                            <span className="text-sm text-muted-foreground">{tierMembers} members</span>
                          </div>
                          <div className="text-sm font-medium">${tierRevenue.toLocaleString()}/month</div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-membership-trends-title">Membership Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-trends-placeholder">
                      Membership trend charts would be displayed here
                    </p>
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
