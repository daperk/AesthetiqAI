import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useState, useEffect } from "react";
import { MembershipSubscriptionDialog } from "@/components/MembershipSubscriptionDialog";
import { CancelMembershipDialog } from "@/components/CancelMembershipDialog";
import { 
  Calendar, Crown, Gift, Wallet, Clock, Star, MessageCircle,
  CalendarPlus, Settings, Bell, CreditCard, Send
} from "lucide-react";
import type { Appointment, Membership, Reward, Client, ChatMessage } from "@/types";

export default function PatientDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedTier, setSelectedTier] = useState<any>(null);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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

  // Fetch wallet balance
  const { data: wallet, isLoading: walletLoading } = useQuery<{ balance: number }>({
    queryKey: ["/api/wallet/balance"],
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

  // Initialize chat with welcome message when component mounts
  useEffect(() => {
    if (chatMessages.length === 0) {
      setChatMessages([{
        id: "welcome",
        role: "assistant",
        content: "Hi! I'm your AI concierge. I can help you book appointments, learn about services, and answer questions. How may I assist you today?",
        timestamp: new Date()
      }]);
    }
  }, []);

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

  const handleOpenSubscriptionDialog = (tier: any) => {
    setSelectedTier(tier);
    setShowSubscriptionDialog(true);
  };

  const handleSubscriptionSuccess = () => {
    // Refresh membership data
    queryClient.invalidateQueries({ queryKey: ["/api/memberships/my-membership"] });
    queryClient.invalidateQueries({ queryKey: ["/api/clients/me"] });
  };

  const handleCancelSuccess = () => {
    // Refresh membership data
    queryClient.invalidateQueries({ queryKey: ["/api/memberships/my-membership"] });
    queryClient.invalidateQueries({ queryKey: ["/api/clients/me"] });
  };

  if (clientLoading || appointmentsLoading || membershipLoading || rewardsLoading || walletLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const nextAppointment = upcomingAppointments?.[0];
  const rewardBalance = rewards?.balance || 0;
  const walletBalance = wallet?.balance || 0;

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

        {/* Membership CTA Banner - Only show if no active membership */}
        {(!membership || membership.status !== 'active') && (
          <Card className="bg-gradient-to-r from-primary to-accent text-white mb-6 border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm" data-testid="text-membership-cta-title">
                      Become a Member
                    </h3>
                    <p className="text-xs text-white/80">
                      Save 20% on services, earn 2x points, get monthly credits
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-xl font-bold">${membershipTiers?.[0]?.monthlyPrice || '49'}<span className="text-sm">/mo</span></div>
                  </div>
                  <Button 
                    size="sm"
                    variant="secondary"
                    className="bg-white text-primary hover:bg-white/90 font-medium"
                    onClick={() => {
                      if (membershipTiers && membershipTiers.length > 0) {
                        handleOpenSubscriptionDialog(membershipTiers[0]);
                      }
                    }}
                    data-testid="button-join-membership"
                  >
                    Join Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Welcome Banner */}
        {nextAppointment && (
          <Card className="bg-gradient-to-r from-primary to-accent text-white mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold mb-2" data-testid="text-next-appointment-title">
                    Your next appointment is {new Date(nextAppointment.startTime).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })} at {new Date(nextAppointment.startTime).toLocaleTimeString([], { 
                      hour: 'numeric', 
                      minute: '2-digit', 
                      hour12: true 
                    })}
                  </h2>
                  <p className="text-primary-foreground/90 mb-4">
                    {nextAppointment.serviceName || 'Appointment'} {nextAppointment.staffName ? `with ${nextAppointment.staffName}` : ''}
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

        {/* Main Content - Responsive Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <div className="overflow-x-auto -mx-6 px-6 scrollbar-hide">
            <TabsList className="w-full sm:w-auto inline-flex">
              <TabsTrigger value="overview" className="flex-1 sm:flex-none whitespace-nowrap" data-testid="tab-overview">
                <Calendar className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="appointments" className="flex-1 sm:flex-none whitespace-nowrap" data-testid="tab-appointments">
                <CalendarPlus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Appointments</span>
              </TabsTrigger>
              <TabsTrigger value="membership" className="flex-1 sm:flex-none whitespace-nowrap" data-testid="tab-membership">
                <Crown className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Membership</span>
              </TabsTrigger>
              <TabsTrigger value="rewards" className="flex-1 sm:flex-none whitespace-nowrap" data-testid="tab-rewards">
                <Gift className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Rewards</span>
              </TabsTrigger>
            </TabsList>
          </div>

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
                          className="flex items-center justify-between p-4 border rounded-lg hover:border-primary transition-colors"
                          data-testid={`appointment-item-${appointment.id}`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="text-center bg-primary/10 rounded-lg p-2 min-w-[70px]">
                              <div className="text-sm font-bold text-primary">
                                {new Date(appointment.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(appointment.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{appointment.serviceName || 'Service'}</div>
                              <div className="text-sm text-muted-foreground">
                                {appointment.staffName ? `with ${appointment.staffName}` : 'Staff member'}
                              </div>
                            </div>
                          </div>
                          <Badge 
                            className={
                              appointment.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              appointment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }
                          >
                            {appointment.status}
                          </Badge>
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
                <div className="flex items-center justify-between">
                  <CardTitle data-testid="text-appointment-history-title">Upcoming Appointments</CardTitle>
                  <Button 
                    onClick={() => setLocation("/patient/booking")}
                    size="sm"
                    data-testid="button-book-new-appointment"
                  >
                    <CalendarPlus className="w-4 h-4 mr-2" />
                    Book Appointment
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!upcomingAppointments || upcomingAppointments.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4" data-testid="text-no-appointments">
                      No appointments scheduled
                    </p>
                    <Button 
                      onClick={() => setLocation("/patient/booking")}
                      data-testid="button-book-first-appointment-tab"
                    >
                      Book Your First Appointment
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {upcomingAppointments.map((appointment) => (
                      <div 
                        key={appointment.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:border-primary transition-colors"
                        data-testid={`appointment-${appointment.id}`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="text-center bg-primary/10 rounded-lg p-3 min-w-[80px]">
                            <div className="text-lg font-bold text-primary">
                              {new Date(appointment.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(appointment.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">
                              {appointment.serviceName || 'Service'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {appointment.staffName ? `with ${appointment.staffName}` : 'Staff member'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {appointment.locationName || 'Location'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Badge 
                            className={
                              appointment.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              appointment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }
                          >
                            {appointment.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="membership">
            <div className="space-y-6">
              {/* Current Membership Card */}
              {membership && membership.status === 'active' && (
                <Card className="border-primary">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-primary" />
                        Your Active Membership
                      </CardTitle>
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gradient-to-br from-primary to-accent rounded-lg p-6 text-white">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-xl font-bold">{membership.tierName}</div>
                          <div className="text-primary-foreground/80 text-sm">
                            Active until {membership.endDate ? new Date(membership.endDate).toLocaleDateString() : 'Ongoing'}
                          </div>
                        </div>
                        <Crown className="w-10 h-10" />
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div>
                          <div className="text-primary-foreground/80">Monthly Credits</div>
                          <div className="font-semibold text-lg">
                            ${membership.usedCredits || 0} / ${membership.monthlyCredits}
                          </div>
                        </div>
                        <div>
                          <div className="text-primary-foreground/80">Discount</div>
                          <div className="font-semibold text-lg">{membership.discount || 20}% off</div>
                        </div>
                      </div>
                      <Button 
                        variant="secondary"
                        size="sm"
                        className="w-full bg-white/10 hover:bg-white/20 text-white border-white/20"
                        onClick={() => setShowCancelDialog(true)}
                        data-testid="button-cancel-membership"
                      >
                        Cancel Membership
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Available Membership Tiers */}
              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-membership-plans-title">
                    {membership && membership.status === 'active' ? 'Upgrade or Change Your Membership' : 'Available Membership Plans'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!membershipTiers || membershipTiers.length === 0 ? (
                    <div className="text-center py-8">
                      <Crown className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No membership plans available</p>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {membershipTiers.map((tier: any) => {
                        const isActive = membership?.tierId === tier.id && membership?.status === 'active';
                        return (
                          <Card 
                            key={tier.id} 
                            className={`relative ${isActive ? 'border-primary ring-2 ring-primary' : ''}`}
                            data-testid={`membership-tier-${tier.id}`}
                          >
                            {isActive && (
                              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                <Badge className="bg-primary text-primary-foreground">Current Plan</Badge>
                              </div>
                            )}
                            <CardHeader>
                              <CardTitle className="text-lg">{tier.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <div className="text-3xl font-bold text-primary">
                                  ${tier.monthlyPrice}
                                  <span className="text-sm text-muted-foreground">/month</span>
                                </div>
                              </div>
                              
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="w-4 h-4 text-primary" />
                                  <span>${tier.monthlyCredits} monthly credits</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Star className="w-4 h-4 text-primary" />
                                  <span>{tier.discount}% discount on services</span>
                                </div>
                                {tier.pointsMultiplier > 1 && (
                                  <div className="flex items-center gap-2">
                                    <Gift className="w-4 h-4 text-primary" />
                                    <span>{tier.pointsMultiplier}x reward points</span>
                                  </div>
                                )}
                              </div>

                              {tier.description && (
                                <p className="text-sm text-muted-foreground">{tier.description}</p>
                              )}

                              <Button 
                                className="w-full"
                                variant={isActive ? "outline" : "default"}
                                disabled={isActive}
                                onClick={() => handleOpenSubscriptionDialog(tier)}
                                data-testid={`button-select-tier-${tier.id}`}
                              >
                                {isActive ? 'Current Plan' : membership ? 'Switch Plan' : 'Join Now'}
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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
                      {rewards?.rewards && rewards.rewards.length > 0 ? (
                        rewards.rewards.slice(0, 5).map((reward) => (
                          <div key={reward.id} className="flex items-center justify-between p-3 border rounded">
                            <div className="flex items-center space-x-2">
                              <div className={`w-2 h-2 rounded-full ${
                                reward.type === 'earned' ? 'bg-green-500' : 
                                reward.type === 'redeemed' ? 'bg-red-500' :
                                'bg-blue-500'
                              }`}></div>
                              <span className="text-foreground text-sm">{reward.description || reward.type}</span>
                            </div>
                            <span className={`font-medium text-sm ${
                              reward.type === 'earned' ? 'text-green-500' : 
                              reward.type === 'redeemed' ? 'text-red-500' :
                              'text-blue-500'
                            }`}>
                              {reward.type === 'earned' ? '+' : '-'}{reward.points || 0} pts
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">No reward activity yet</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Earn points by booking appointments and purchasing services
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Membership Subscription Dialog */}
      <MembershipSubscriptionDialog
        open={showSubscriptionDialog}
        onClose={() => setShowSubscriptionDialog(false)}
        tier={selectedTier}
        onSuccess={handleSubscriptionSuccess}
      />

      {/* Cancel Membership Dialog */}
      <CancelMembershipDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        membership={membership}
        onSuccess={handleCancelSuccess}
      />
    </div>
  );
}
