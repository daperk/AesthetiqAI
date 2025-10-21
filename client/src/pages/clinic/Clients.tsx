import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ClinicNav from "@/components/ClinicNav";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePaymentRequired } from "@/hooks/usePaymentRequired";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Plus, Search, Filter, MoreHorizontal, Phone, Mail,
  Calendar, DollarSign, Crown, Gift, MapPin, CreditCard,
  Edit, Trash2, Power
} from "lucide-react";
import type { Client, Appointment, Membership, Transaction } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  
  const [newClient, setNewClient] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    notes: "",
  });

  const [editClient, setEditClient] = useState({
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

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: typeof editClient }) => {
      const response = await apiRequest("PATCH", `/api/clients/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", organization?.id] });
      setIsEditDialogOpen(false);
      toast({
        title: "Client updated",
        description: "Client information has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update client",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/clients/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", organization?.id] });
      setIsDeleteDialogOpen(false);
      toast({
        title: "Client deleted",
        description: "Client has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete client",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleClientStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string, isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/clients/${id}/status`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", organization?.id] });
      toast({
        title: "Client status updated",
        description: "Client status has been successfully changed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update status",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (clientData: typeof newClient) => {
      // Use the invitation endpoint to create both user and client
      const response = await apiRequest("POST", "/api/patients/invite", {
        ...clientData,
        dateOfBirth: clientData.dateOfBirth ? clientData.dateOfBirth : undefined,
        address: clientData.address ? { street: clientData.address } : undefined,
      });
      return response.json();
    },
    onSuccess: (result) => {
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
      
      // Show appropriate message based on email status
      if (result.emailStatus?.sent) {
        toast({
          title: "Client invited successfully",
          description: `An invitation email has been sent to ${result.patient?.email || result.invitation?.sentTo}.`,
        });
      } else if (result.invitation) {
        // If email failed but patient was created, show credentials
        toast({
          title: "Client created",
          description: (
            <div className="space-y-2">
              <p>Client was created successfully, but the invitation email could not be sent.</p>
              <p className="font-mono text-sm">
                Email: {result.invitation.sentTo}<br/>
                Password: {result.invitation.temporaryPassword}
              </p>
              <p className="text-xs text-muted-foreground">Please share these credentials manually.</p>
            </div>
          ) as any,
          duration: 10000, // Show for longer since it contains important info
        });
      } else {
        toast({
          title: "Client created",
          description: "New client has been successfully added.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to invite client",
        description: error.message || "Please try again.",
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

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditClient(prev => ({ ...prev, [name]: value }));
  };

  const handleEditClient = (client: Client) => {
    setClientToEdit(client);
    setEditClient({
      firstName: client.firstName || "",
      lastName: client.lastName || "",
      email: client.email || "",
      phone: client.phone || "",
      dateOfBirth: client.dateOfBirth || "",
      address: client.address || "",
      notes: client.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClient = (client: Client) => {
    setClientToDelete(client);
    setIsDeleteDialogOpen(true);
  };

  const handleToggleStatus = (client: Client) => {
    toggleClientStatusMutation.mutate({ 
      id: client.id, 
      isActive: !client.isActive 
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientToEdit) {
      updateClientMutation.mutate({ 
        id: clientToEdit.id, 
        data: editClient 
      });
    }
  };

  const confirmDelete = () => {
    if (clientToDelete) {
      deleteClientMutation.mutate(clientToDelete.id);
    }
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
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-clients-title">
            Clients
          </h1>
          <p className="text-muted-foreground mb-4">Manage your client relationships and information</p>
          <ClinicNav />
        </div>

        {/* Actions */}
        <div className="mb-6">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-client">
                <Plus className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Invite New Client</DialogTitle>
                <DialogDescription>
                  Enter the client's information. They will receive an invitation email with login credentials.
                </DialogDescription>
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
                        <span>Inviting...</span>
                      </div>
                    ) : (
                      "Send Invitation"
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
                          <div className="font-medium text-foreground truncate">
                            {client.firstName} {client.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {client.email} • {client.phone}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Member since {client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "Unknown"}
                          </div>
                          {client.stripeCustomerId && (
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs bg-green-50 border-green-200">
                                <CreditCard className="h-3 w-3 mr-1" />
                                Stripe Connected
                              </Badge>
                            </div>
                          )}
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-client-menu-${client.id}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClient(client);
                              }}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit Client
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStatus(client);
                              }}
                            >
                              <Power className="w-4 h-4 mr-2" />
                              {client.isActive ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClient(client);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Client
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Edit Client Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Client</DialogTitle>
              <DialogDescription>
                Update the client's information
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">First Name *</Label>
                  <Input
                    id="edit-firstName"
                    name="firstName"
                    value={editClient.firstName}
                    onChange={handleEditInputChange}
                    required
                    data-testid="input-edit-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">Last Name *</Label>
                  <Input
                    id="edit-lastName"
                    name="lastName"
                    value={editClient.lastName}
                    onChange={handleEditInputChange}
                    required
                    data-testid="input-edit-last-name"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email *</Label>
                  <Input
                    id="edit-email"
                    name="email"
                    type="email"
                    value={editClient.email}
                    onChange={handleEditInputChange}
                    required
                    data-testid="input-edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    name="phone"
                    value={editClient.phone}
                    onChange={handleEditInputChange}
                    placeholder="(555) 123-4567"
                    data-testid="input-edit-phone"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-dateOfBirth">Date of Birth</Label>
                  <Input
                    id="edit-dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={editClient.dateOfBirth}
                    onChange={handleEditInputChange}
                    data-testid="input-edit-date-of-birth"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-address">Address</Label>
                  <Input
                    id="edit-address"
                    name="address"
                    value={editClient.address}
                    onChange={handleEditInputChange}
                    placeholder="Street address"
                    data-testid="input-edit-address"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  name="notes"
                  value={editClient.notes}
                  onChange={handleEditInputChange}
                  placeholder="Additional notes about the client"
                  data-testid="input-edit-notes"
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateClientMutation.isPending} data-testid="button-save-edit">
                  {updateClientMutation.isPending ? (
                    <div className="flex items-center space-x-2">
                      <LoadingSpinner size="sm" />
                      <span>Saving...</span>
                    </div>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Client</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{clientToDelete?.firstName} {clientToDelete?.lastName}</strong>? 
                This action cannot be undone. All associated data including appointments, memberships, and transaction history will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteClientMutation.isPending ? (
                  <div className="flex items-center space-x-2">
                    <LoadingSpinner size="sm" />
                    <span>Deleting...</span>
                  </div>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
