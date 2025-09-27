import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings, CreditCard, Users } from "lucide-react";
import type { SubscriptionPlan } from "@/types";

export default function Plans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  const [newPlan, setNewPlan] = useState({
    name: "",
    tier: "starter",
    description: "",
    monthlyPrice: "",
    yearlyPrice: "",
    maxLocations: "",
    maxStaff: "",
    maxClients: "",
    features: "[]",
    isActive: true,
  });

  const { data: plans, isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscription-plans"],
    staleTime: 5 * 60 * 1000,
  });

  const createPlanMutation = useMutation({
    mutationFn: async (planData: any) => {
      const response = await apiRequest("POST", "/api/subscription-plans", {
        ...planData,
        monthlyPrice: parseFloat(planData.monthlyPrice),
        yearlyPrice: planData.yearlyPrice ? parseFloat(planData.yearlyPrice) : null,
        maxLocations: planData.maxLocations ? parseInt(planData.maxLocations) : null,
        maxStaff: planData.maxStaff ? parseInt(planData.maxStaff) : null,
        maxClients: planData.maxClients ? parseInt(planData.maxClients) : null,
        features: JSON.parse(planData.features || "[]"),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription-plans"] });
      setIsCreateDialogOpen(false);
      setNewPlan({
        name: "",
        tier: "starter",
        description: "",
        monthlyPrice: "",
        yearlyPrice: "",
        maxLocations: "",
        maxStaff: "",
        maxClients: "",
        features: "[]",
        isActive: true,
      });
      toast({
        title: "Plan created",
        description: "New subscription plan has been successfully created.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create plan",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPlanMutation.mutate(newPlan);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewPlan(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setNewPlan(prev => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (checked: boolean) => {
    setNewPlan(prev => ({ ...prev, isActive: checked }));
  };

  if (isLoading) {
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-plans-title">
              Subscription Plans
            </h1>
            <p className="text-muted-foreground">Manage platform pricing and features</p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-plan">
                <Plus className="w-4 h-4 mr-2" />
                Create Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Plan</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Plan Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={newPlan.name}
                      onChange={handleInputChange}
                      placeholder="Enter plan name"
                      required
                      data-testid="input-plan-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="tier">Tier</Label>
                    <Select value={newPlan.tier} onValueChange={(value) => handleSelectChange("tier", value)}>
                      <SelectTrigger data-testid="select-plan-tier">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                        <SelectItem value="medical_chain">Medical Chain</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={newPlan.description}
                    onChange={handleInputChange}
                    placeholder="Plan description"
                    data-testid="input-plan-description"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthlyPrice">Monthly Price ($)</Label>
                    <Input
                      id="monthlyPrice"
                      name="monthlyPrice"
                      type="number"
                      step="0.01"
                      value={newPlan.monthlyPrice}
                      onChange={handleInputChange}
                      placeholder="29.99"
                      required
                      data-testid="input-monthly-price"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="yearlyPrice">Yearly Price ($)</Label>
                    <Input
                      id="yearlyPrice"
                      name="yearlyPrice"
                      type="number"
                      step="0.01"
                      value={newPlan.yearlyPrice}
                      onChange={handleInputChange}
                      placeholder="299.99"
                      data-testid="input-yearly-price"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxLocations">Max Locations</Label>
                    <Input
                      id="maxLocations"
                      name="maxLocations"
                      type="number"
                      value={newPlan.maxLocations}
                      onChange={handleInputChange}
                      placeholder="1"
                      data-testid="input-max-locations"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxStaff">Max Staff</Label>
                    <Input
                      id="maxStaff"
                      name="maxStaff"
                      type="number"
                      value={newPlan.maxStaff}
                      onChange={handleInputChange}
                      placeholder="5"
                      data-testid="input-max-staff"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxClients">Max Clients</Label>
                    <Input
                      id="maxClients"
                      name="maxClients"
                      type="number"
                      value={newPlan.maxClients}
                      onChange={handleInputChange}
                      placeholder="100"
                      data-testid="input-max-clients"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="features">Features (JSON)</Label>
                  <Textarea
                    id="features"
                    name="features"
                    value={newPlan.features}
                    onChange={handleInputChange}
                    placeholder='["Basic scheduling", "Client management"]'
                    data-testid="input-plan-features"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={newPlan.isActive}
                    onCheckedChange={handleSwitchChange}
                    data-testid="switch-plan-active"
                  />
                  <Label htmlFor="isActive">Active Plan</Label>
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createPlanMutation.isPending} data-testid="button-save-plan">
                    {createPlanMutation.isPending ? (
                      <div className="flex items-center space-x-2">
                        <LoadingSpinner size="sm" />
                        <span>Creating...</span>
                      </div>
                    ) : (
                      "Create Plan"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Plans Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {plans?.length === 0 ? (
            <div className="col-span-3 text-center py-8">
              <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground" data-testid="text-no-plans">
                No subscription plans found
              </p>
            </div>
          ) : (
            plans?.map((plan) => (
              <Card key={plan.id} className="relative" data-testid={`plan-card-${plan.tier}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg" data-testid={`text-plan-name-${plan.tier}`}>
                        {plan.name}
                      </CardTitle>
                      <Badge 
                        variant={plan.isActive ? "default" : "secondary"}
                        className="mt-1"
                      >
                        {plan.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" data-testid={`button-edit-plan-${plan.tier}`}>
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="text-2xl font-bold" data-testid={`text-plan-price-${plan.tier}`}>
                        ${plan.monthlyPrice}
                        <span className="text-sm font-normal text-muted-foreground">/month</span>
                      </div>
                      {plan.yearlyPrice && (
                        <div className="text-sm text-muted-foreground">
                          ${plan.yearlyPrice}/year
                        </div>
                      )}
                    </div>
                    
                    {plan.description && (
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Max Locations:</span>
                        <span className="font-medium">
                          {plan.maxLocations || "Unlimited"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Max Staff:</span>
                        <span className="font-medium">
                          {plan.maxStaff || "Unlimited"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Max Clients:</span>
                        <span className="font-medium">
                          {plan.maxClients || "Unlimited"}
                        </span>
                      </div>
                    </div>
                    
                    {plan.features && Array.isArray(plan.features) && (
                      <div>
                        <div className="text-sm font-medium mb-2">Features:</div>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {(plan.features as string[]).map((feature, index) => (
                            <li key={index}>• {feature}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Add-ons Section */}
        <Card className="mt-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle data-testid="text-addons-title">Add-ons Marketplace</CardTitle>
              <Button data-testid="button-create-addon">
                <Plus className="w-4 h-4 mr-2" />
                Add Add-on
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg" data-testid="addon-item-sms">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">SMS Credits</h4>
                  <Badge>$29/mo</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">1000 SMS messages per month</p>
                <div className="text-xs text-muted-foreground">0 subscribers</div>
              </div>
              
              <div className="p-4 border rounded-lg" data-testid="addon-item-storage">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Extra Storage</h4>
                  <Badge>$19/mo</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">100GB additional storage</p>
                <div className="text-xs text-muted-foreground">0 subscribers</div>
              </div>
              
              <div className="p-4 border rounded-lg" data-testid="addon-item-analytics">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Advanced Analytics</h4>
                  <Badge>$49/mo</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Detailed reporting and insights</p>
                <div className="text-xs text-muted-foreground">0 subscribers</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
