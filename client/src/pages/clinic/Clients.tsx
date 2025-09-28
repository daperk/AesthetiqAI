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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePaymentRequired } from "@/hooks/usePaymentRequired";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Plus, Search, Filter, MoreHorizontal, Phone, Mail,
  Calendar, DollarSign, Crown, Gift, MapPin
} from "lucide-react";
import type { Client, Appointment, Membership, Transaction } from "@/types";

export default function Clients() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Enforce payment setup requirement
  const { isLoading: paymentLoading, hasAccess } = usePaymentRequired();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  const [newClient, setNewClient] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    notes: "",
  });

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients", organization?.id],
    queryFn: () => fetch("/api/clients").then(res => res.json()),
    enabled: !!organization?.id,
    staleTime: 30000,
  });

  const { data: clientAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", "client", selectedClient?.id],
    enabled: !!selectedClient?.id,
    staleTime: 30000,
  });

  const createClientMutation = useMutation({
    mutationFn: async (clientData: typeof newClient) => {
      const response = await apiRequest("POST", "/api/clients", {
        ...clientData,
        // organizationId is now auto-inferred by backend
        dateOfBirth: clientData.dateOfBirth ? clientData.dateOfBirth : undefined,
        address: clientData.address ? { street: clientData.address } : undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both general and organization-specific client queries
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", organization?.id] });
      setIsCreateDialogOpen(false);
      setNewClient({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        dateOfBirth: "",
        address: "",
        notes: "",
      });
      toast({
        title: "Client created",
        description: "New client has been successfully added.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create client",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createClientMutation.mutate(newClient);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewClient(prev => ({ ...prev, [name]: value }));
  };

  const filteredClients = clients?.filter(client => {
    const matchesSearch = !searchTerm || 
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone?.includes(searchTerm);
    
    const matchesFilter = filterStatus === "all" || 
      (filterStatus === "active" && client.isActive) ||
      (filterStatus === "inactive" && !client.isActive);
    
    return matchesSearch && matchesFilter;
  }) || [];

  const getClientInitials = (client: Client) => {
    return `${client.firstName[0] || ''}${client.lastName[0] || ''}`.toUpperCase();
  };

  // Show loading while checking payment status or loading clients
  if (clientsLoading || paymentLoading) {
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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-clients-title">
              Clients
            </h1>
            <p className="text-muted-foreground">Manage your client relationships and information</p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-client">
                <Plus className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Client</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={newClient.firstName}
                      onChange={handleInputChange}
                      placeholder="Enter first name"
                      required
                      data-testid="input-first-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={newClient.lastName}
                      onChange={handleInputChange}
                      placeholder="Enter last name"
                      required
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={newClient.email}
                      onChange={handleInputChange}
                      placeholder="client@example.com"
                      data-testid="input-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      value={newClient.phone}
                      onChange={handleInputChange}
                      placeholder="(555) 123-4567"
                      data-testid="input-phone"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      name="dateOfBirth"
                      type="date"
                      value={newClient.dateOfBirth}
                      onChange={handleInputChange}
                      data-testid="input-date-of-birth"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      name="address"
                      value={newClient.address}
                      onChange={handleInputChange}
                      placeholder="Street address"
                      data-testid="input-address"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={newClient.notes}
                    onChange={handleInputChange}
                    placeholder="Additional notes about the client"
                    data-testid="input-notes"
                  />
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createClientMutation.isPending} data-testid="button-save-client">
                    {createClientMutation.isPending ? (
                      <div className="flex items-center space-x-2">
                        <LoadingSpinner size="sm" />
                        <span>Adding...</span>
                      </div>
                    ) : (
                      "Add Client"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-clients"
                />
              </div>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Client List */}
        {selectedClient ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Button variant="outline" onClick={() => setSelectedClient(null)} data-testid="button-back-to-list">
                    ← Back to List
                  </Button>
                  <div>
                    <CardTitle data-testid="text-client-detail-title">
                      {selectedClient.firstName} {selectedClient.lastName}
                    </CardTitle>
                    <p className="text-muted-foreground">{selectedClient.email}</p>
                  </div>
                </div>
                <Button variant="outline" data-testid="button-edit-client">
                  Edit Client
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="space-y-6">
                <TabsList>
                  <TabsTrigger value="overview" data-testid="tab-client-overview">Overview</TabsTrigger>
                  <TabsTrigger value="appointments" data-testid="tab-client-appointments">Appointments</TabsTrigger>
                  <TabsTrigger value="membership" data-testid="tab-client-membership">Membership</TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-client-history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Contact Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center space-x-3">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span>{selectedClient.email || "No email provided"}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{selectedClient.phone || "No phone provided"}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span>Address information</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Client Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Spent:</span>
                            <span className="font-medium">${selectedClient.totalSpent || "0.00"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Visit:</span>
                            <span className="font-medium">
                              {selectedClient.lastVisit ? new Date(selectedClient.lastVisit).toLocaleDateString() : "Never"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Member Since:</span>
                            <span className="font-medium">
                              {selectedClient.createdAt ? new Date(selectedClient.createdAt).toLocaleDateString() : "Unknown"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge variant={selectedClient.isActive ? "default" : "secondary"}>
                              {selectedClient.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="appointments">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Appointment History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!clientAppointments || clientAppointments.length === 0 ? (
                        <div className="text-center py-8">
                          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground" data-testid="text-no-client-appointments">
                            No appointments found for this client
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {clientAppointments.map((appointment) => (
                            <div 
                              key={appointment.id}
                              className="flex items-center justify-between p-4 border rounded-lg"
                              data-testid={`client-appointment-${appointment.id}`}
                            >
                              <div>
                                <div className="font-medium">Service Name</div>
                                <div className="text-sm text-muted-foreground">
                                  {new Date(appointment.startTime).toLocaleDateString()} at {new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              <Badge>{appointment.status || "scheduled"}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="membership">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Membership Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8">
                        <Crown className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground" data-testid="text-no-membership">
                          No active membership
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="history">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Transaction History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8">
                        <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground" data-testid="text-no-transactions">
                          No transaction history available
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle data-testid="text-client-list-title">
                  All Clients ({filteredClients.length})
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{clients?.filter(c => c.isActive).length} Active</Badge>
                  <Badge variant="outline">{clients?.filter(c => !c.isActive).length} Inactive</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredClients.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground" data-testid="text-no-clients">
                    {searchTerm ? "No clients match your search" : "No clients found"}
                  </p>
                  {!searchTerm && (
                    <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-client">
                      Add Your First Client
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredClients.map((client) => (
                    <div 
                      key={client.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedClient(client)}
                      data-testid={`client-item-${client.id}`}
                    >
                      <div className="flex items-center space-x-4">
                        <Avatar>
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {getClientInitials(client)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-foreground">
                            {client.firstName} {client.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {client.email} • {client.phone}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Member since {client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "Unknown"}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">${client.totalSpent || "0.00"}</div>
                          <div className="text-xs text-muted-foreground">Total spent</div>
                        </div>
                        <Badge variant={client.isActive ? "default" : "secondary"}>
                          {client.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle menu actions
                          }}
                          data-testid={`button-client-menu-${client.id}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
