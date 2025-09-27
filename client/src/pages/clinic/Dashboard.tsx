import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
  Plus, Bell, Brain, Gift, CalendarPlus, UserPlus, Scissors
} from "lucide-react";
import type { DashboardStats, Appointment, AiInsight } from "@/types";

export default function ClinicDashboard() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [location] = useLocation();

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

  if (statsLoading || appointmentsLoading || insightsLoading) {
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
              <Select defaultValue="downtown">
                <SelectTrigger className="w-40" data-testid="select-location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="downtown">Downtown Location</SelectItem>
                  <SelectItem value="uptown">Uptown Branch</SelectItem>
                </SelectContent>
              </Select>
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
                      ${stats?.revenue?.today?.toLocaleString() || "3,450"}
                    </div>
                    <div className="text-sm text-green-500">+15% vs yesterday</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Appointments Today</span>
                      <Calendar className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-today-appointments">
                      {stats?.appointments?.today || todayAppointments?.length || 18}
                    </div>
                    <div className="text-sm text-muted-foreground">3 remaining</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Active Members</span>
                      <Crown className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-active-members">
                      {stats?.clients?.active || 142}
                    </div>
                    <div className="text-sm text-green-500">+5 new this week</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Staff Online</span>
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-staff-online">
                      {stats?.staff?.online || 6}/{stats?.staff?.total || 8}
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
                          <>
                            {/* Sample appointment entries */}
                            <div className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg" data-testid="appointment-item-1">
                              <div className="text-center">
                                <div className="text-sm font-medium text-foreground">10:00</div>
                                <div className="text-xs text-muted-foreground">AM</div>
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-foreground">Deluxe Facial</div>
                                <div className="text-sm text-muted-foreground">Jessica Martinez</div>
                              </div>
                              <div className="text-sm text-muted-foreground">Dr. Smith</div>
                              <div className="flex items-center space-x-2">
                                <Badge className="bg-green-100 text-green-800">Confirmed</Badge>
                                <Button variant="ghost" size="sm" data-testid="button-appointment-menu">
                                  <Bell className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg" data-testid="appointment-item-2">
                              <div className="text-center">
                                <div className="text-sm font-medium text-foreground">11:30</div>
                                <div className="text-xs text-muted-foreground">AM</div>
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-foreground">Botox Consultation</div>
                                <div className="text-sm text-muted-foreground">Michael Chen</div>
                              </div>
                              <div className="text-sm text-muted-foreground">Dr. Johnson</div>
                              <div className="flex items-center space-x-2">
                                <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>
                                <Button variant="ghost" size="sm" data-testid="button-appointment-menu-2">
                                  <Bell className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg" data-testid="appointment-item-3">
                              <div className="text-center">
                                <div className="text-sm font-medium text-foreground">2:00</div>
                                <div className="text-xs text-muted-foreground">PM</div>
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-foreground">Laser Treatment</div>
                                <div className="text-sm text-muted-foreground">Amanda Wilson</div>
                              </div>
                              <div className="text-sm text-muted-foreground">Dr. Smith</div>
                              <div className="flex items-center space-x-2">
                                <Badge variant="secondary" className="bg-gray-100 text-gray-800">Upcoming</Badge>
                                <Button variant="ghost" size="sm" data-testid="button-appointment-menu-3">
                                  <Bell className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </>
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
                            No AI insights available
                          </p>
                        ) : (
                          <>
                            <div className="p-3 bg-muted/30 rounded border" data-testid="ai-insight-upsell">
                              <div className="font-medium text-foreground mb-1">Upsell Opportunity</div>
                              <div className="text-muted-foreground">Jessica M. books monthly facials - suggest VIP membership for 20% savings</div>
                            </div>
                            <div className="p-3 bg-muted/30 rounded border" data-testid="ai-insight-retention">
                              <div className="font-medium text-foreground mb-1">Retention Alert</div>
                              <div className="text-muted-foreground">3 clients haven't booked in 60+ days - send reactivation campaign</div>
                            </div>
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
                        <div className="flex items-center space-x-3" data-testid="activity-new-member">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <div>
                            <div className="text-foreground">New member signup</div>
                            <div className="text-muted-foreground">Emma Thompson - Gold Plan</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3" data-testid="activity-payment">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <div>
                            <div className="text-foreground">Payment received</div>
                            <div className="text-muted-foreground">$450 - Laser package</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3" data-testid="activity-reschedule">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                          <div>
                            <div className="text-foreground">Appointment rescheduled</div>
                            <div className="text-muted-foreground">Marcus J. - Tomorrow 3PM</div>
                          </div>
                        </div>
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
                        <Button variant="outline" className="w-full justify-start" data-testid="button-add-client">
                          <UserPlus className="w-4 h-4 mr-2" />
                          Add Client
                        </Button>
                        <Button variant="outline" className="w-full justify-start" data-testid="button-block-time">
                          <CalendarPlus className="w-4 h-4 mr-2" />
                          Block Time
                        </Button>
                        <Button variant="outline" className="w-full justify-start" data-testid="button-send-rewards">
                          <Gift className="w-4 h-4 mr-2" />
                          Send Rewards
                        </Button>
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
