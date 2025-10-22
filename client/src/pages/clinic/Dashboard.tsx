import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ClinicNav from "@/components/ClinicNav";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  DollarSign, Calendar, Users, Crown, TrendingUp, 
  Plus, Bell, Brain, Gift, CalendarPlus, UserPlus, Scissors, MapPin,
  Sparkles, Lock, ArrowUpRight, Zap, Target, ChartBar, LogOut, User, Settings
} from "lucide-react";
import type { DashboardStats, Appointment, AiInsight, Location } from "@/types";

export default function ClinicDashboard() {
  const { user, logout } = useAuth();
  const { organization } = useOrganization();
  const [location, setLocation] = useLocation();
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  // Fetch locations for this organization
  const { data: locations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    staleTime: 5 * 60000, // 5 minutes
  });

  // Fetch setup status to know subscription limits
  const { data: setupStatus } = useQuery<{
    maxLocations: number;
    requiresLocations: boolean;
  }>({
    queryKey: ["/api/clinic/setup-status"],
    staleTime: 5 * 60000, // 5 minutes
  });

  // Fetch organization details with subscription plan
  const { data: orgDetails } = useQuery<any>({
    queryKey: [`/api/organizations/${organization?.id}`],
    enabled: !!organization?.id,
    staleTime: 5 * 60000, // 5 minutes
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: [`/api/analytics/dashboard/${organization?.id}`],
    enabled: !!organization?.id,
    staleTime: 60000, // 1 minute
  });

  // Fetch today's appointments
  const { data: todaysAppointments, isLoading: todaysLoading } = useQuery<Appointment[]>({
    queryKey: [`/api/appointments`, organization?.id, 'today'],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const params = new URLSearchParams({
        organizationId: organization?.id || '',
        startDate: todayStr,
        endDate: todayStr
      });
      const response = await fetch(`/api/appointments?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const data = await response.json();
      return data.filter((apt: any) => apt.status !== 'cancelled');
    },
    enabled: !!organization?.id,
    staleTime: 30000,
  });

  // Fetch upcoming appointments (next 14 days)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);
  
  const { data: upcomingAppointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: [`/api/appointments`, organization?.id, endDate.toISOString().split('T')[0]],
    queryFn: async () => {
      const params = new URLSearchParams({
        organizationId: organization?.id || '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });
      const response = await fetch(`/api/appointments?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const data = await response.json();
      // Filter to only show non-cancelled appointments
      return data.filter((apt: any) => apt.status !== 'cancelled');
    },
    enabled: !!organization?.id,
    staleTime: 30000, // 30 seconds
  });

  // Check subscription tier
  const subscriptionPlan = orgDetails?.subscriptionPlan;
  const isEnterpriseTier = subscriptionPlan?.name === 'Enterprise' || 
                           subscriptionPlan?.tier === 'enterprise';
  const isProfessionalTier = subscriptionPlan?.name === 'Professional' || 
                             subscriptionPlan?.tier === 'professional';

  // Only fetch AI insights for Enterprise tier
  const { 
    data: aiInsights, 
    isLoading: insightsLoading, 
    error: aiInsightsError 
  } = useQuery<AiInsight[]>({
    queryKey: [`/api/ai-insights/${organization?.id}`],
    enabled: !!organization?.id && isEnterpriseTier, // Only fetch if Enterprise
    staleTime: 5 * 60000, // 5 minutes
    retry: false // Don't retry if forbidden
  });

  const { data: recentActivities, isLoading: activitiesLoading } = useQuery({
    queryKey: [`/api/activities/recent/${organization?.id}`],
    enabled: !!organization?.id,
    staleTime: 30000, // 30 seconds
  });

  const { data: staffAvailability, isLoading: staffLoading } = useQuery({
    queryKey: [`/api/staff/availability/${organization?.id}`],
    enabled: !!organization?.id,
    staleTime: 60000, // 1 minute
  });

  // Determine if user can add more locations
  // Guard against null/undefined/0 maxLocations
  const canAddLocation = !!setupStatus && 
    setupStatus.maxLocations != null && 
    setupStatus.maxLocations > 0 && 
    (locations?.length ?? 0) < setupStatus.maxLocations;

  if (statsLoading || appointmentsLoading || todaysLoading || insightsLoading || activitiesLoading || staffLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-dashboard-title">
                {organization?.name || "Clinic Dashboard"}
              </h1>
              <p className="text-muted-foreground">Welcome back, {user?.firstName || user?.username}</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Smart Location Selector */}
              {locations && locations.length > 1 ? (
                // Multiple locations: Show dropdown
                <Select 
                  value={selectedLocationId || locations[0]?.id} 
                  onValueChange={setSelectedLocationId}
                >
                  <SelectTrigger className="w-48" data-testid="select-location">
                    <MapPin className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : locations && locations.length === 1 ? (
                // Single location: Just display it
                <div className="flex items-center px-3 py-2 rounded-md bg-muted text-sm" data-testid="text-single-location">
                  <MapPin className="w-4 h-4 mr-2" />
                  {locations[0].name}
                </div>
              ) : locations && locations.length === 0 ? (
                // No locations: Show empty state
                <div className="flex items-center px-3 py-2 rounded-md bg-muted/50 text-sm text-muted-foreground" data-testid="text-no-locations">
                  <MapPin className="w-4 h-4 mr-2" />
                  {setupStatus?.maxLocations && setupStatus.maxLocations > 0 
                    ? "No locations yet" 
                    : "Your plan doesn't include locations"}
                </div>
              ) : null}
              
              {/* Show Add Location button if under tier limit */}
              {canAddLocation && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setLocation("/clinic/setup")}
                  data-testid="button-add-location"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Location
                </Button>
              )}
              
              <Button variant="outline" size="sm" data-testid="button-notifications">
                <Bell className="w-4 h-4" />
              </Button>
              
              {/* User Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-user-menu">
                    <User className="w-4 h-4 mr-2" />
                    {user?.firstName || user?.username || "Account"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/clinic/settings")}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/clinic/profile")}>
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()} className="text-red-600" data-testid="button-sign-out">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Navigation Tabs - Responsive */}
          <div className="mt-6">
            <ClinicNav />
          </div>
        </div>

        <div className="mt-6 space-y-6">
              {/* Quick Stats */}
              <div className="grid lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Today's Revenue</span>
                      <DollarSign className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-today-revenue">
                      ${stats?.revenue?.today?.toLocaleString() || "0"}
                    </div>
                    <div className="text-sm text-muted-foreground">From completed appointments</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Upcoming Appointments</span>
                      <Calendar className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-upcoming-appointments">
                      {upcomingAppointments?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Next 14 days</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Active Members</span>
                      <Crown className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-active-members">
                      {stats?.memberships?.active || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Active subscriptions</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Staff Online</span>
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-staff-online">
                      {staffAvailability?.online || stats?.staff?.online || 0}/{staffAvailability?.total || stats?.staff?.total || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Available now</div>
                  </CardContent>
                </Card>
              </div>

              {/* Today's Appointments - Small Overview */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle data-testid="text-today-schedule-title">Today's Appointments</CardTitle>
                    <Button size="sm" onClick={() => setLocation("/clinic/appointments")} data-testid="button-view-all-appointments">
                      View All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {!todaysAppointments || todaysAppointments.length === 0 ? (
                      <div className="text-center py-6">
                        <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm" data-testid="text-no-today-appointments">
                          No appointments scheduled for today
                        </p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {todaysAppointments
                          .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                          .map((appointment: any) => {
                            const dateObj = new Date(appointment.startTime);
                            const timezone = appointment.locationTimezone || 'America/New_York';
                            
                            const timeStr = dateObj.toLocaleTimeString('en-US', {
                              timeZone: timezone,
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            });
                            
                            return (
                              <div key={appointment.id} className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg" data-testid={`today-appointment-${appointment.id}`}>
                                <div className="text-center min-w-[60px]">
                                  <div className="text-sm font-medium text-foreground">{timeStr}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-foreground text-sm truncate">{appointment.serviceName || 'Service'}</div>
                                  <div className="text-xs text-muted-foreground truncate">{appointment.clientName || 'Client'}</div>
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Main Content Area */}
              <div className="grid lg:grid-cols-3 gap-8">
                {/* All Upcoming Appointments */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle data-testid="text-upcoming-schedule-title">All Upcoming Appointments</CardTitle>
                        <Button size="sm" data-testid="button-new-appointment">
                          <Plus className="w-4 h-4 mr-2" />
                          New Appointment
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {!upcomingAppointments || upcomingAppointments.length === 0 ? (
                          <div className="text-center py-8">
                            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground" data-testid="text-no-appointments">
                              No upcoming appointments
                            </p>
                          </div>
                        ) : (
                          upcomingAppointments
                            .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                            .slice(0, 10) // Show first 10
                            .map((appointment: any) => {
                              // API now returns UTC ISO strings (e.g., "2025-10-25T16:00:00.000Z")
                              const dateObj = new Date(appointment.startTime);
                              const timezone = appointment.locationTimezone || 'America/New_York';
                              
                              // Format date and time in clinic's timezone
                              const dateStr = dateObj.toLocaleDateString('en-US', { 
                                timeZone: timezone,
                                month: 'short',
                                day: 'numeric'
                              });
                              
                              const timeStr = dateObj.toLocaleTimeString('en-US', {
                                timeZone: timezone,
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              });
                              
                              return (
                                <div key={appointment.id} className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg" data-testid={`appointment-item-${appointment.id}`}>
                                  <div className="text-center min-w-[80px]">
                                    <div className="text-xs text-muted-foreground mb-1">{dateStr}</div>
                                    <div className="text-sm font-medium text-foreground">{timeStr}</div>
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-medium text-foreground">{appointment.serviceName || 'Service'}</div>
                                    <div className="text-sm text-muted-foreground">{appointment.clientName || 'Client'}</div>
                                  </div>
                                  <div className="text-sm text-muted-foreground">{appointment.staffName || 'Staff'}</div>
                                  <div className="flex items-center space-x-2">
                                    <Badge className={`${
                                      appointment.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                      appointment.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                      appointment.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                                      'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {appointment.status || 'Scheduled'}
                                    </Badge>
                                    <Button variant="ghost" size="sm" data-testid="button-appointment-menu">
                                      <Bell className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Sidebar Widgets */}
                <div className="space-y-6">
                  {/* AI Suggestions */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center space-x-2">
                        <Brain className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base" data-testid="text-ai-suggestions-title">
                          AI Growth Suggestions
                          {isEnterpriseTier && (
                            <Badge className="ml-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
                              <Sparkles className="w-3 h-3 mr-1" />
                              Enterprise
                            </Badge>
                          )}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        {!isEnterpriseTier ? (
                          // Show upgrade prompt for non-Enterprise tiers
                          <div className="space-y-3">
                            <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                              <div className="flex items-center mb-3">
                                <Lock className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-2" />
                                <span className="font-semibold text-purple-900 dark:text-purple-100">
                                  Unlock AI-Powered Insights
                                </span>
                              </div>
                              <p className="text-purple-700 dark:text-purple-300 mb-3">
                                Upgrade to Enterprise to get AI-powered business intelligence:
                              </p>
                              <ul className="space-y-2 mb-4">
                                <li className="flex items-start">
                                  <Target className="w-4 h-4 text-purple-600 dark:text-purple-400 mr-2 mt-0.5 flex-shrink-0" />
                                  <span className="text-purple-700 dark:text-purple-300 text-xs">
                                    Customer retention predictions and churn prevention
                                  </span>
                                </li>
                                <li className="flex items-start">
                                  <ChartBar className="w-4 h-4 text-purple-600 dark:text-purple-400 mr-2 mt-0.5 flex-shrink-0" />
                                  <span className="text-purple-700 dark:text-purple-300 text-xs">
                                    Pricing optimization and revenue forecasting
                                  </span>
                                </li>
                                <li className="flex items-start">
                                  <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400 mr-2 mt-0.5 flex-shrink-0" />
                                  <span className="text-purple-700 dark:text-purple-300 text-xs">
                                    Personalized upsell and cross-sell recommendations
                                  </span>
                                </li>
                                <li className="flex items-start">
                                  <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400 mr-2 mt-0.5 flex-shrink-0" />
                                  <span className="text-purple-700 dark:text-purple-300 text-xs">
                                    Marketing campaign ideas based on your data
                                  </span>
                                </li>
                              </ul>
                              <Button 
                                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                                onClick={() => setLocation("/pricing")}
                                data-testid="button-upgrade-to-enterprise"
                              >
                                <Sparkles className="w-4 h-4 mr-2" />
                                Upgrade to Enterprise
                                <ArrowUpRight className="w-4 h-4 ml-1" />
                              </Button>
                              {isProfessionalTier && (
                                <p className="text-xs text-center text-purple-600 dark:text-purple-400 mt-2">
                                  Currently on Professional • $149/month for Enterprise
                                </p>
                              )}
                            </div>
                          </div>
                        ) : !aiInsights || aiInsights.length === 0 ? (
                          // Enterprise tier but no insights yet
                          <div className="space-y-3">
                            <div className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 rounded-lg">
                              <div className="flex items-center mb-2">
                                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 mr-2" />
                                <span className="font-medium text-purple-900 dark:text-purple-100">
                                  AI Analysis Initializing
                                </span>
                              </div>
                              <p className="text-purple-700 dark:text-purple-300 text-xs">
                                Our AI is analyzing your business data. Insights will appear here as we gather more information about your clinic's patterns.
                              </p>
                            </div>
                          </div>
                        ) : (
                          // Enterprise tier with AI insights
                          <>
                            {aiInsights.slice(0, 3).map((insight: any) => {
                              const priorityColors = {
                                high: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20',
                                medium: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20',
                                low: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                              };
                              
                              const priorityTextColors = {
                                high: 'text-red-600 dark:text-red-400',
                                medium: 'text-yellow-600 dark:text-yellow-400',
                                low: 'text-green-600 dark:text-green-400'
                              };
                              
                              const typeIcons = {
                                retention: Users,
                                upsell: TrendingUp,
                                pricing: DollarSign,
                                optimization: Zap,
                                marketing: Target,
                                revenue: DollarSign,
                                growth: ChartBar,
                                recommendation: Brain,
                                opportunity: Sparkles
                              };
                              
                              const IconComponent = typeIcons[insight.type as keyof typeof typeIcons] || Brain;
                              
                              return (
                                <div 
                                  key={insight.id} 
                                  className={`p-3 rounded-lg border ${priorityColors[insight.priority as keyof typeof priorityColors] || 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/20'}`}
                                  data-testid={`ai-insight-${insight.type}`}
                                >
                                  <div className="flex items-start space-x-2">
                                    <IconComponent className={`w-4 h-4 mt-0.5 flex-shrink-0 ${priorityTextColors[insight.priority as keyof typeof priorityTextColors] || 'text-gray-600'}`} />
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="font-medium text-foreground text-sm">
                                          {insight.title}
                                        </div>
                                        {insight.priority === 'high' && (
                                          <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                            High
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-muted-foreground text-xs leading-relaxed">
                                        {insight.description}
                                      </div>
                                      {insight.metrics && Object.keys(insight.metrics).length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {Object.entries(insight.metrics).slice(0, 2).map(([key, value]: [string, any]) => (
                                            <Badge key={key} variant="secondary" className="text-xs">
                                              {key.replace(/_/g, ' ')}: {
                                                typeof value === 'number' 
                                                  ? key.includes('revenue') || key.includes('loss') 
                                                    ? `$${value.toLocaleString()}` 
                                                    : value.toLocaleString()
                                                  : value
                                              }
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {aiInsights.length > 3 && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full"
                                onClick={() => setLocation("/clinic/analytics")}
                                data-testid="button-view-all-insights"
                              >
                                View All {aiInsights.length} Insights
                                <ArrowUpRight className="w-3 h-3 ml-1" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Activities */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base" data-testid="text-recent-activities-title">Recent Activities</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        {!recentActivities || recentActivities.length === 0 ? (
                          <p className="text-muted-foreground" data-testid="text-no-activities">
                            No recent activities. Activities will appear as clients book appointments and interact with your clinic.
                          </p>
                        ) : (
                          recentActivities.map((activity: any) => (
                            <div key={activity.id} className="flex items-center space-x-3" data-testid={`activity-${activity.type}`}>
                              <div className={`w-2 h-2 rounded-full ${
                                activity.color === 'green' ? 'bg-green-500' :
                                activity.color === 'blue' ? 'bg-blue-500' :
                                activity.color === 'yellow' ? 'bg-yellow-500' : 'bg-gray-500'
                              }`}></div>
                              <div>
                                <div className="text-foreground">{activity.title}</div>
                                <div className="text-muted-foreground">{activity.description}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base" data-testid="text-quick-actions-title">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {/* Dynamic Quick Actions Based on Real Data */}
                        {(!todaysAppointments || todaysAppointments.length === 0) && (
                          <Button variant="outline" className="w-full justify-start" onClick={() => setLocation("/clinic/appointments")} data-testid="button-schedule-appointments">
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Schedule Today's Appointments
                          </Button>
                        )}
                        
                        {(stats?.clients?.total || 0) < 5 && (
                          <Button variant="outline" className="w-full justify-start" data-testid="button-add-client">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Add Client
                          </Button>
                        )}
                        
                        {(stats?.memberships?.active || 0) === 0 && (stats?.clients?.total || 0) > 2 && (
                          <Button variant="outline" className="w-full justify-start" data-testid="button-promote-memberships">
                            <Crown className="w-4 h-4 mr-2" />
                            Promote Memberships
                          </Button>
                        )}
                        
                        {(stats?.revenue?.today || 0) === 0 && (upcomingAppointments?.length || 0) > 0 && (
                          <Button variant="outline" className="w-full justify-start" data-testid="button-process-payments">
                            <DollarSign className="w-4 h-4 mr-2" />
                            Process Payments
                          </Button>
                        )}
                        
                        {(staffAvailability?.online || 0) === 0 && (
                          <Button variant="outline" className="w-full justify-start" data-testid="button-contact-staff">
                            <Users className="w-4 h-4 mr-2" />
                            Contact Staff
                          </Button>
                        )}
                        
                        {/* Default actions when data conditions are met */}
                        {((upcomingAppointments?.length || 0) > 0 || (stats?.clients?.total || 0) >= 5) && (
                          <Button variant="outline" className="w-full justify-start" data-testid="button-send-rewards">
                            <Gift className="w-4 h-4 mr-2" />
                            Send Rewards
                          </Button>
                        )}
                        
                        {((stats?.revenue?.today || 0) > 0 || (stats?.clients?.total || 0) >= 3) && (
                          <Button variant="outline" className="w-full justify-start" data-testid="button-view-analytics">
                            <TrendingUp className="w-4 h-4 mr-2" />
                            View Analytics
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
        </div>
      </div>
    );
  }
