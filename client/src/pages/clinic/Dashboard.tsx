import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  DollarSign, Calendar, Users, Crown, TrendingUp, 
  Plus, Bell, Brain, Gift, CalendarPlus, UserPlus, Scissors, MapPin
} from "lucide-react";
import type { DashboardStats, Appointment, AiInsight, Location } from "@/types";

export default function ClinicDashboard() {
  const { user } = useAuth();
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

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/analytics/dashboard", organization?.id],
    enabled: !!organization?.id,
    staleTime: 60000, // 1 minute
  });

  const { data: todayAppointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", organization?.id, "today"],
    enabled: !!organization?.id,
    staleTime: 30000, // 30 seconds
  });

  const { data: aiInsights, isLoading: insightsLoading } = useQuery<AiInsight[]>({
    queryKey: ["/api/ai-insights", organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60000, // 5 minutes
  });

  const { data: recentActivities, isLoading: activitiesLoading } = useQuery({
    queryKey: ["/api/activities/recent", organization?.id],
    enabled: !!organization?.id,
    staleTime: 30000, // 30 seconds
  });

  const { data: staffAvailability, isLoading: staffLoading } = useQuery({
    queryKey: ["/api/staff/availability", organization?.id],
    enabled: !!organization?.id,
    staleTime: 60000, // 1 minute
  });

  // Determine if user can add more locations
  // Guard against null/undefined/0 maxLocations
  const canAddLocation = !!setupStatus && 
    setupStatus.maxLocations != null && 
    setupStatus.maxLocations > 0 && 
    (locations?.length ?? 0) < setupStatus.maxLocations;

  if (statsLoading || appointmentsLoading || insightsLoading || activitiesLoading || staffLoading) {
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
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-6">
            <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
              <Link href="/clinic">
                <Button
                  variant={location === "/clinic" ? "default" : "ghost"}
                  size="sm"
                  className="relative"
                  data-testid="tab-overview"
                >
                  Overview
                </Button>
              </Link>
              <Link href="/clinic/appointments">
                <Button
                  variant={location === "/clinic/appointments" ? "default" : "ghost"}
                  size="sm"
                  className="relative"
                  data-testid="tab-appointments"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Appointments
                </Button>
              </Link>
              <Link href="/clinic/clients">
                <Button
                  variant={location === "/clinic/clients" ? "default" : "ghost"}
                  size="sm"
                  className="relative"
                  data-testid="tab-clients"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Clients
                </Button>
              </Link>
              <Link href="/clinic/services">
                <Button
                  variant={location === "/clinic/services" ? "default" : "ghost"}
                  size="sm"
                  className="relative"
                  data-testid="tab-services"
                >
                  <Scissors className="w-4 h-4 mr-2" />
                  Services
                </Button>
              </Link>
              <Link href="/clinic/memberships">
                <Button
                  variant={location === "/clinic/memberships" ? "default" : "ghost"}
                  size="sm"
                  className="relative"
                  data-testid="tab-memberships"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Memberships
                </Button>
              </Link>
              <Link href="/clinic/staff">
                <Button
                  variant={location === "/clinic/staff" ? "default" : "ghost"}
                  size="sm"
                  className="relative"
                  data-testid="tab-staff"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Staff
                </Button>
              </Link>
              <Link href="/clinic/reports">
                <Button
                  variant={location === "/clinic/reports" ? "default" : "ghost"}
                  size="sm"
                  className="relative"
                  data-testid="tab-reports"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Reports
                </Button>
              </Link>
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
                      <span className="text-sm text-muted-foreground">Appointments Today</span>
                      <Calendar className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-today-appointments">
                      {stats?.appointments?.today || todayAppointments?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">{todayAppointments ? todayAppointments.length - (stats?.appointments?.today || 0) : 0} remaining</div>
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

              {/* Main Content Area */}
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Today's Schedule */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle data-testid="text-todays-schedule-title">Today's Schedule</CardTitle>
                        <Button size="sm" data-testid="button-new-appointment">
                          <Plus className="w-4 h-4 mr-2" />
                          New Appointment
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {!todayAppointments || todayAppointments.length === 0 ? (
                          <div className="text-center py-8">
                            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground" data-testid="text-no-appointments">
                              No appointments scheduled for today
                            </p>
                          </div>
                        ) : (
                          todayAppointments
                            .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                            .map((appointment: any) => {
                              const startTime = new Date(appointment.startTime);
                              const timeStr = startTime.toLocaleTimeString('en-US', { 
                                hour: '2-digit', 
                                minute: '2-digit',
                                hour12: true 
                              }).split(' ');
                              
                              return (
                                <div key={appointment.id} className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg" data-testid={`appointment-item-${appointment.id}`}>
                                  <div className="text-center">
                                    <div className="text-sm font-medium text-foreground">{timeStr[0]}</div>
                                    <div className="text-xs text-muted-foreground">{timeStr[1]}</div>
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-medium text-foreground">Appointment</div>
                                    <div className="text-sm text-muted-foreground">Client</div>
                                  </div>
                                  <div className="text-sm text-muted-foreground">Staff</div>
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
                        <CardTitle className="text-base" data-testid="text-ai-suggestions-title">AI Growth Suggestions</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        {!aiInsights || aiInsights.length === 0 ? (
                          <p className="text-muted-foreground" data-testid="text-no-ai-insights">
                            No AI insights available yet. Insights will appear as your clinic builds data.
                          </p>
                        ) : (
                          aiInsights.map((insight: any) => (
                            <div key={insight.id} className="p-3 bg-muted/30 rounded border" data-testid={`ai-insight-${insight.type}`}>
                              <div className="font-medium text-foreground mb-1">{insight.title}</div>
                              <div className="text-muted-foreground">{insight.description}</div>
                            </div>
                          ))
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
                        {(!todayAppointments || todayAppointments.length === 0) && (
                          <Button variant="outline" className="w-full justify-start" data-testid="button-schedule-appointments">
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Schedule First Appointment
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
                        
                        {(stats?.revenue?.today || 0) === 0 && (todayAppointments?.length || 0) > 0 && (
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
                        {((todayAppointments?.length || 0) > 0 || (stats?.clients?.total || 0) >= 5) && (
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
      </div>
    </div>
  );
}
