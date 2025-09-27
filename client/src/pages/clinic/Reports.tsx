import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  TrendingUp, DollarSign, Users, Calendar as CalendarIcon,
  Download, Filter, BarChart3, PieChart, LineChart,
  Target, Crown, Clock, AlertCircle
} from "lucide-react";
import type { DashboardStats } from "@/types";

export default function Reports() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });
  const [reportType, setReportType] = useState("overview");
  const [exportFormat, setExportFormat] = useState("pdf");

  const { data: analytics, isLoading: analyticsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/analytics/dashboard", organization?.id, dateRange],
    enabled: !!organization?.id,
    staleTime: 60000,
  });

  // Mock report data
  const revenueByService = [
    { name: "Facial Treatments", revenue: 15420, appointments: 87, avgValue: 177 },
    { name: "Botox Injections", revenue: 12800, appointments: 32, avgValue: 400 },
    { name: "Dermal Fillers", revenue: 9600, appointments: 16, avgValue: 600 },
    { name: "Laser Treatments", revenue: 8900, appointments: 23, avgValue: 387 },
    { name: "Chemical Peels", revenue: 4200, appointments: 35, avgValue: 120 },
  ];

  const topPerformingProviders = [
    { name: "Dr. Sarah Johnson", revenue: 18500, appointments: 124, rating: 4.9 },
    { name: "Dr. Michael Chen", revenue: 16200, appointments: 98, rating: 4.8 },
    { name: "Lisa Rodriguez, RN", revenue: 12800, appointments: 89, rating: 4.7 },
    { name: "Amanda Williams", revenue: 8900, appointments: 67, rating: 4.6 },
  ];

  const membershipMetrics = [
    { tier: "Platinum", members: 23, revenue: 4577, retention: 96 },
    { tier: "Gold", members: 45, revenue: 6705, retention: 92 },
    { tier: "Silver", members: 67, revenue: 6633, retention: 88 },
    { tier: "Bronze", members: 89, revenue: 5251, retention: 84 },
  ];

  const handleExport = (format: string) => {
    toast({
      title: `Exporting report as ${format.toUpperCase()}`,
      description: "Your report will be downloaded shortly.",
    });
  };

  if (analyticsLoading) {
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
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-reports-title">
              Reports & Analytics
            </h1>
            <p className="text-muted-foreground">Comprehensive business insights and performance metrics</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger className="w-32" data-testid="select-export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={() => handleExport(exportFormat)} data-testid="button-export-report">
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Revenue</span>
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-total-revenue">
                ${analytics?.revenue?.month?.toLocaleString() || "50,920"}
              </div>
              <div className="text-sm text-green-500 flex items-center">
                <TrendingUp className="w-3 h-3 mr-1" />
                +18% vs last month
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Appointments</span>
                <CalendarIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-total-appointments">
                {analytics?.appointments?.month || 342}
              </div>
              <div className="text-sm text-green-500">+12% vs last month</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Avg. Appointment Value</span>
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-avg-appointment-value">
                $149
              </div>
              <div className="text-sm text-green-500">+5% vs last month</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Client Retention</span>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-client-retention">
                87%
              </div>
              <div className="text-sm text-green-500">+3% vs last month</div>
            </CardContent>
          </Card>
        </div>

        {/* Reports Tabs */}
        <Tabs value={reportType} onValueChange={setReportType} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview-report">Overview</TabsTrigger>
            <TabsTrigger value="revenue" data-testid="tab-revenue-report">Revenue</TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services-report">Services</TabsTrigger>
            <TabsTrigger value="staff" data-testid="tab-staff-report">Staff Performance</TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members-report">Memberships</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2" data-testid="text-revenue-trend-title">
                    <LineChart className="w-5 h-5" />
                    <span>Revenue Trend</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <LineChart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-revenue-chart-placeholder">
                      Revenue trend chart would be displayed here
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2" data-testid="text-appointment-breakdown-title">
                    <PieChart className="w-5 h-5" />
                    <span>Appointment Breakdown</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <PieChart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-appointment-chart-placeholder">
                      Appointment breakdown chart would be displayed here
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle data-testid="text-key-insights-title">Key Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
                        <div>
                          <div className="font-medium text-green-800">Strong Growth</div>
                          <div className="text-sm text-green-700">Revenue increased 18% compared to last month</div>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <Crown className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <div className="font-medium text-blue-800">Premium Services Popular</div>
                          <div className="text-sm text-blue-700">Botox and dermal fillers show highest profit margins</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <Clock className="w-5 h-5 text-yellow-600 mt-0.5" />
                        <div>
                          <div className="font-medium text-yellow-800">Peak Hours Identified</div>
                          <div className="text-sm text-yellow-700">Most bookings occur between 2-4 PM on weekdays</div>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                        <div>
                          <div className="font-medium text-orange-800">Opportunity Area</div>
                          <div className="text-sm text-orange-700">Weekend slots have 30% availability - consider promotions</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="revenue">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-revenue-analysis-title">Revenue Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <div className="text-center py-12">
                      <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground" data-testid="text-revenue-analysis-placeholder">
                        Detailed revenue analysis charts would be displayed here
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-4">Revenue Breakdown</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 border rounded">
                        <span className="text-sm">Services</span>
                        <span className="font-medium">$42,100</span>
                      </div>
                      <div className="flex justify-between items-center p-3 border rounded">
                        <span className="text-sm">Memberships</span>
                        <span className="font-medium">$6,820</span>
                      </div>
                      <div className="flex justify-between items-center p-3 border rounded">
                        <span className="text-sm">Products</span>
                        <span className="font-medium">$2,000</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-service-performance-title">Service Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {revenueByService.map((service, index) => (
                    <div 
                      key={service.name}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`service-performance-${index}`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{service.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {service.appointments} appointments • Avg. ${service.avgValue}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-foreground">
                          ${service.revenue.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Revenue</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-staff-performance-title">Staff Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topPerformingProviders.map((provider, index) => (
                    <div 
                      key={provider.name}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`provider-performance-${index}`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{provider.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {provider.appointments} appointments • {provider.rating}★ rating
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-foreground">
                          ${provider.revenue.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Revenue</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-membership-analysis-title">Membership Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {membershipMetrics.map((tier, index) => (
                    <div 
                      key={tier.tier}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`membership-tier-${index}`}
                    >
                      <div className="flex items-center space-x-4">
                        <Crown className="w-5 h-5 text-primary" />
                        <div>
                          <div className="font-medium text-foreground">{tier.tier} Tier</div>
                          <div className="text-sm text-muted-foreground">
                            {tier.members} members • {tier.retention}% retention
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-foreground">
                          ${tier.revenue.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Monthly Revenue</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
