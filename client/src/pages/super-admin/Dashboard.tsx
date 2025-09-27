import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { 
  TrendingUp, TrendingDown, Building2, Users, DollarSign, 
  CreditCard, Settings, Plus, MoreHorizontal, CheckCircle 
} from "lucide-react";
import type { PlatformStats, Organization } from "@/types";

export default function SuperAdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/analytics/platform"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: organizations, isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    staleTime: 5 * 60 * 1000,
  });

  if (statsLoading || orgsLoading) {
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-dashboard-title">
                Aesthiq HQ
              </h1>
              <p className="text-muted-foreground">Platform Administration Dashboard</p>
            </div>
            <div className="flex items-center space-x-4">
              <Select defaultValue="30">
                <SelectTrigger className="w-40" data-testid="select-timeframe">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
              <Button data-testid="button-export-data">Export Data</Button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Monthly Recurring Revenue</span>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-mrr">
                ${stats?.mrr?.toLocaleString() || "47,850"}
              </div>
              <div className="text-sm text-green-500">+12.5% from last month</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Active Organizations</span>
                <Building2 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-active-orgs">
                {stats?.activeOrganizations || organizations?.length || 142}
              </div>
              <div className="text-sm text-green-500">+8 new this month</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Churn Rate</span>
                <TrendingDown className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-churn-rate">
                {stats?.churnRate?.toFixed(1) || "2.1"}%
              </div>
              <div className="text-sm text-green-500">-0.5% improvement</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Trial Conversions</span>
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-trial-conversions">
                {stats?.trialConversions || 68}%
              </div>
              <div className="text-sm text-green-500">+5% this month</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="organizations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
            <TabsTrigger value="plans" data-testid="tab-plans">Plans</TabsTrigger>
            <TabsTrigger value="billing" data-testid="tab-billing">Billing</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="organizations">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle data-testid="text-org-management-title">Organization Management</CardTitle>
                  <Button data-testid="button-add-organization">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Organization
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {organizations?.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground" data-testid="text-no-organizations">
                        No organizations found
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Sample organization entries */}
                      <div className="flex items-center justify-between p-4 border rounded-lg" data-testid="org-item-luxe-spa">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">Luxe Beauty Spa</div>
                            <div className="text-sm text-muted-foreground">Business Plan • 2 locations</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">$299/mo</div>
                            <div className="text-xs text-muted-foreground">68% usage</div>
                          </div>
                          <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
                          <Button variant="ghost" size="sm" data-testid="button-org-menu">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 border rounded-lg" data-testid="org-item-medspa-elite">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">MedSpa Elite</div>
                            <div className="text-sm text-muted-foreground">Enterprise • 5 locations</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">Trial</div>
                            <div className="text-xs text-muted-foreground">Day 8/14</div>
                          </div>
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Trial</Badge>
                          <Button variant="ghost" size="sm" data-testid="button-org-menu-2">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle data-testid="text-plan-management-title">Subscription Plans</CardTitle>
                  <Button data-testid="button-add-plan">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Plan
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg" data-testid="plan-item-business">
                    <div>
                      <div className="font-medium text-foreground">Business Plan</div>
                      <div className="text-sm text-muted-foreground">$299/month • Up to 3 locations</div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-sm font-medium text-foreground">47 subscribers</div>
                      <Button variant="ghost" size="sm" data-testid="button-edit-plan">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg" data-testid="plan-item-enterprise">
                    <div>
                      <div className="font-medium text-foreground">Enterprise Plan</div>
                      <div className="text-sm text-muted-foreground">$599/month • Up to 10 locations</div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-sm font-medium text-foreground">23 subscribers</div>
                      <Button variant="ghost" size="sm" data-testid="button-edit-plan-2">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-billing-overview-title">Billing Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-foreground mb-4">Payment Methods</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-3">
                          <CreditCard className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">Stripe Connect</div>
                            <div className="text-xs text-muted-foreground">Processing payments</div>
                          </div>
                        </div>
                        <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-foreground mb-4">Revenue Breakdown</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subscription Revenue:</span>
                        <span className="font-medium" data-testid="text-subscription-revenue">$42,100</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Processing Fees:</span>
                        <span className="font-medium" data-testid="text-processing-fees">$5,750</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="font-medium">Total MRR:</span>
                        <span className="font-bold" data-testid="text-total-mrr">$47,850</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-analytics-title">Platform Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground" data-testid="text-analytics-placeholder">
                    Advanced analytics charts and insights would be displayed here
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
