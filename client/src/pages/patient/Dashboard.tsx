import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { 
  Calendar, Crown, Gift, Wallet, Clock, Star, MessageCircle,
  CalendarPlus, Settings, Bell, CreditCard, Send
} from "lucide-react";
import type { Appointment, Membership, Reward, Client, ChatMessage } from "@/types";

export default function PatientDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm here to help you with bookings and questions. How can I assist you today?",
      timestamp: new Date()
    }
  ]);

  const { data: client, isLoading: clientLoading } = useQuery<Client>({
    queryKey: ["/api/clients/me"],
    staleTime: 5 * 60000,
  });

  const { data: upcomingAppointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/upcoming"],
    staleTime: 30000,
  });

  const { data: membership, isLoading: membershipLoading } = useQuery<Membership>({
    queryKey: ["/api/memberships/my-membership"],
    staleTime: 60000,
  });

  const { data: rewards, isLoading: rewardsLoading } = useQuery<{ rewards: Reward[], balance: number }>({
    queryKey: ["/api/rewards/my-rewards"],
    staleTime: 60000,
  });

  // Fetch services and membership tiers for chat context
  const { data: services } = useQuery<any[]>({
    queryKey: ["/api/services"],
    staleTime: 5 * 60000,
  });

  const { data: membershipTiers } = useQuery<any[]>({
    queryKey: ["/api/membership-tiers"],
    staleTime: 5 * 60000,
  });

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatMessage,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatMessage("");

    try {
      // Send to AI concierge with enhanced context
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: chatMessage,
          context: {
            clientName: user?.firstName,
            membershipStatus: membership?.tierName || "No membership",
            rewardPoints: rewards?.balance || 0,
            availableServices: services?.map(s => ({
              name: s.name,
              description: s.description,
              duration: s.duration,
              price: s.price
            })) || [],
            availableMemberships: membershipTiers?.map(t => ({
              name: t.name,
              monthlyPrice: t.monthlyPrice,
              monthlyCredits: t.monthlyCredits,
              discount: t.discount
            })) || []
          }
        })
      });

      const data = await response.json();
      
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast({
        title: "Chat Error",
        description: "Unable to send message. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (clientLoading || appointmentsLoading || membershipLoading || rewardsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const nextAppointment = upcomingAppointments?.[0];
  const rewardBalance = rewards?.balance || 0;
  const walletBalance = 125; // This would come from API

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-patient-dashboard-title">
                Welcome back, {user?.firstName || user?.username}!
              </h1>
              <p className="text-muted-foreground">Your beauty and wellness journey continues</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" data-testid="button-notifications">
                <Bell className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" data-testid="button-settings">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Welcome Banner */}
        {nextAppointment && (
          <Card className="bg-gradient-to-r from-primary to-accent text-white mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold mb-2" data-testid="text-next-appointment-title">
                    Your next appointment is tomorrow at 2:00 PM
                  </h2>
                  <p className="text-primary-foreground/90 mb-4">
                    Deluxe Facial with Dr. Sarah Johnson
                  </p>
                  <div className="flex items-center space-x-4">
                    <Button variant="secondary" size="sm" data-testid="button-view-appointment">
                      View Details
                    </Button>
                    <Button variant="outline" size="sm" className="border-white text-white hover:bg-white hover:text-primary" data-testid="button-reschedule">
                      Reschedule
                    </Button>
                  </div>
                </div>
                <Calendar className="w-16 h-16 text-primary-foreground/60" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Gift className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-primary mb-1" data-testid="text-reward-points">
                {rewardBalance.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Reward Points</div>
              <div className="text-xs text-green-500 mt-1">+150 this month</div>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Crown className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-primary mb-1" data-testid="text-membership-tier">
                {membership?.tierName || "No Membership"}
              </div>
              <div className="text-sm text-muted-foreground">Membership Tier</div>
              <div className="text-xs text-muted-foreground mt-1">
                {membership ? "20% off services" : "Join to save"}
              </div>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-primary mb-1" data-testid="text-wallet-balance">
                ${walletBalance}
              </div>
              <div className="text-sm text-muted-foreground">Wallet Balance</div>
              <div className="text-xs text-blue-500 mt-1">Ready to use</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="appointments" data-testid="tab-appointments">Appointments</TabsTrigger>
            <TabsTrigger value="membership" data-testid="tab-membership">Membership</TabsTrigger>
            <TabsTrigger value="rewards" data-testid="tab-rewards">Rewards</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Upcoming Appointments */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2" data-testid="text-upcoming-appointments-title">
                      <Calendar className="w-5 h-5" />
                      <span>Upcoming Appointments</span>
                    </CardTitle>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setLocation("/patient/booking")}
                      data-testid="button-book-appointment"
                    >
                      <CalendarPlus className="w-4 h-4 mr-2" />
                      Book New
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!upcomingAppointments || upcomingAppointments.length === 0 ? (
                    <div className="text-center py-8">
                      <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground mb-4" data-testid="text-no-upcoming-appointments">
                        No upcoming appointments
                      </p>
                      <Button 
                        onClick={() => setLocation("/patient/booking")}
                        data-testid="button-book-first-appointment"
                      >
                        Book Your First Appointment
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {upcomingAppointments.slice(0, 3).map((appointment) => (
                        <div 
                          key={appointment.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                          data-testid={`appointment-item-${appointment.id}`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="text-center">
                              <div className="text-sm font-medium text-foreground">
                                {new Date(appointment.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-foreground">Service Name</div>
                              <div className="text-sm text-muted-foreground">Provider Name</div>
                            </div>
                          </div>
                          <Badge className="bg-green-100 text-green-800">Confirmed</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AI Concierge Chat */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2" data-testid="text-ai-concierge-title">
                    <MessageCircle className="w-5 h-5" />
                    <span>AI Concierge</span>
                    <Badge className="bg-green-100 text-green-800 ml-2">Online</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-h-64 overflow-y-auto mb-4">
                    {chatMessages.map((message) => (
                      <div 
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        data-testid={`chat-message-${message.id}`}
                      >
                        <div className="flex items-start space-x-3 max-w-xs">
                          {message.role === 'assistant' && (
                            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                              <MessageCircle className="w-3 h-3 text-primary-foreground" />
                            </div>
                          )}
                          <div className={`rounded-lg p-3 ${
                            message.role === 'user' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted'
                          }`}>
                            <p className="text-sm">{message.content}</p>
                          </div>
                          {message.role === 'user' && (
                            <Avatar className="w-6 h-6 flex-shrink-0">
                              <AvatarFallback className="text-xs">
                                {user?.firstName?.[0] || user?.username[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input
                      placeholder="Type your message..."
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      data-testid="input-chat-message"
                    />
                    <Button onClick={handleSendMessage} size="sm" data-testid="button-send-message">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appointments">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-appointment-history-title">Appointment History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground" data-testid="text-appointment-history-placeholder">
                    Your appointment history will appear here
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="membership">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-membership-details-title">Membership Details</CardTitle>
              </CardHeader>
              <CardContent>
                {membership ? (
                  <div className="space-y-6">
                    {/* Membership Card */}
                    <div className="bg-gradient-to-br from-primary to-accent rounded-lg p-6 text-white">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-lg font-semibold">{membership.tierName} Membership</div>
                          <div className="text-primary-foreground/80 text-sm">
                            Active until {membership.endDate ? new Date(membership.endDate).toLocaleDateString() : 'Ongoing'}
                          </div>
                        </div>
                        <Crown className="w-8 h-8" />
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-primary-foreground/80">Monthly Credit</div>
                          <div className="font-semibold">
                            ${membership.usedCredits || 0} / ${membership.monthlyCredits}
                          </div>
                        </div>
                        <div>
                          <div className="text-primary-foreground/80">Benefits</div>
                          <div className="font-semibold">Premium perks included</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Crown className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4" data-testid="text-no-membership">
                      You don't have an active membership
                    </p>
                    <Button 
                      onClick={() => setLocation("/patient/membership")}
                      data-testid="button-explore-memberships"
                    >
                      Explore Membership Plans
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rewards">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-rewards-activity-title">Rewards Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Points Balance */}
                  <div className="text-center p-6 bg-muted/30 rounded-lg">
                    <Gift className="w-12 h-12 text-primary mx-auto mb-4" />
                    <div className="text-3xl font-bold text-primary mb-2" data-testid="text-rewards-balance">
                      {rewardBalance.toLocaleString()} Points
                    </div>
                    <p className="text-muted-foreground mb-4">Available for redemption</p>
                    <Button 
                      onClick={() => setLocation("/patient/rewards")}
                      data-testid="button-redeem-points"
                    >
                      Redeem Points
                    </Button>
                  </div>

                  {/* Recent Activity */}
                  <div>
                    <h4 className="font-medium text-foreground mb-3">Recent Activity</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-foreground text-sm">Facial appointment</span>
                        </div>
                        <span className="text-green-500 font-medium text-sm">+50 pts</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span className="text-foreground text-sm">Referral bonus</span>
                        </div>
                        <span className="text-blue-500 font-medium text-sm">+100 pts</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span className="text-foreground text-sm">Redeemed discount</span>
                        </div>
                        <span className="text-red-500 font-medium text-sm">-200 pts</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
