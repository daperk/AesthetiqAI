import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import Navigation from "@/components/Navigation";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Plus, MoreHorizontal, Edit, Trash2, Clock, DollarSign, Users } from "lucide-react";
import { apiRequest } from "@/lib/api";
import type { Service } from "@shared/schema";

interface ServiceFormData {
  name: string;
  description: string;
  category: string;
  duration: number;
  price: string;
  depositRequired: boolean;
  depositAmount: string;
  requiresConsent: boolean;
  availableStaffIds: string[];
}

export default function Services() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>({
    name: "",
    description: "",
    category: "",
    duration: 60,
    price: "",
    depositRequired: false,
    depositAmount: "",
    requiresConsent: false,
    availableStaffIds: []
  });

  // Fetch services
  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ["/api/services", organization?.id],
    enabled: !!organization?.id,
    staleTime: 60000,
  });

  // Fetch staff for assignment dropdown
  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
    staleTime: 60000,
  });

  // Create service mutation
  const createMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      if (!organization?.id) {
        throw new Error("Organization ID is required but not available");
      }
      
      const serviceData = {
        ...data,
        organizationId: organization.id,
        price: data.price,
        depositAmount: data.depositRequired ? data.depositAmount : null,
        availableStaffIds: data.availableStaffIds.length > 0 ? data.availableStaffIds : null
      };
      
      const response = await apiRequest("POST", "/api/services", serviceData);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both organization-specific and general services queries
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", organization?.id] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Service created",
        description: "New service has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating service",
        description: error.message || "Failed to create service",
        variant: "destructive",
      });
    },
  });

  // Update service mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ServiceFormData }) => {
      const serviceData = {
        ...data,
        price: data.price,
        depositAmount: data.depositRequired ? data.depositAmount : null,
        availableStaffIds: data.availableStaffIds.length > 0 ? data.availableStaffIds : null
      };
      const response = await apiRequest("PUT", `/api/services/${id}`, serviceData);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both organization-specific and general services queries
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", organization?.id] });
      setEditingService(null);
      resetForm();
      toast({
        title: "Service updated",
        description: "Service has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating service",
        description: error.message || "Failed to update service",
        variant: "destructive",
      });
    },
  });

  // Delete service mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/services/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", organization?.id] });
      toast({
        title: "Service deleted",
        description: "Service has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting service",
        description: error.message || "Failed to delete service",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      duration: 60,
      price: "",
      depositRequired: false,
      depositAmount: "",
      requiresConsent: false,
      availableStaffIds: []
    });
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      category: service.category || "",
      duration: service.duration,
      price: service.price.toString(),
      depositRequired: service.depositRequired || false,
      depositAmount: service.depositAmount?.toString() || "",
      requiresConsent: service.requiresConsent || false,
      availableStaffIds: Array.isArray(service.availableStaffIds) ? service.availableStaffIds : []
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-services-title">
              Service Catalog
            </h1>
            <p className="text-muted-foreground">
              Manage your clinic's services, pricing, and availability
            </p>
          </div>
          <Dialog open={isCreateDialogOpen || !!editingService} onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setEditingService(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-service">
                <Plus className="w-4 h-4 mr-2" />
                Add Service
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle data-testid="text-service-dialog-title">
                  {editingService ? "Edit Service" : "Create New Service"}
                </DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Service Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Deluxe Facial"
                      required
                      data-testid="input-service-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                      <SelectTrigger data-testid="select-service-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="facial">Facial Treatments</SelectItem>
                        <SelectItem value="body">Body Treatments</SelectItem>
                        <SelectItem value="laser">Laser Treatments</SelectItem>
                        <SelectItem value="injectables">Injectables</SelectItem>
                        <SelectItem value="consultation">Consultations</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the service, benefits, and what's included..."
                    rows={3}
                    data-testid="textarea-service-description"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                      min="15"
                      step="15"
                      required
                      data-testid="input-service-duration"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($)</Label>
                    <Input
                      id="price"
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      required
                      data-testid="input-service-price"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depositAmount">Deposit Amount ($)</Label>
                    <Input
                      id="depositAmount"
                      type="number"
                      value={formData.depositAmount}
                      onChange={(e) => setFormData(prev => ({ ...prev, depositAmount: e.target.value }))}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      disabled={!formData.depositRequired}
                      data-testid="input-service-deposit"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="depositRequired"
                      checked={formData.depositRequired}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        depositRequired: checked,
                        depositAmount: checked ? prev.depositAmount : ""
                      }))}
                      data-testid="switch-deposit-required"
                    />
                    <Label htmlFor="depositRequired">Requires deposit payment</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="requiresConsent"
                      checked={formData.requiresConsent}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requiresConsent: checked }))}
                      data-testid="switch-requires-consent"
                    />
                    <Label htmlFor="requiresConsent">Requires consent form</Label>
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingService(null);
                      resetForm();
                    }}
                    data-testid="button-cancel-service"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-service"
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      <div className="flex items-center space-x-2">
                        <LoadingSpinner size="sm" />
                        <span>Saving...</span>
                      </div>
                    ) : (
                      editingService ? "Update Service" : "Create Service"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Services Grid */}
        <div className="grid gap-6">
          {services.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <DollarSign className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2" data-testid="text-no-services">
                  No services yet
                </h3>
                <p className="text-muted-foreground text-center mb-6">
                  Create your first service to start accepting bookings from patients.
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-service">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Service
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {services.map((service) => (
                <Card key={service.id} className="group hover:shadow-md transition-shadow" data-testid={`service-card-${service.id}`}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-medium mb-1" data-testid={`service-name-${service.id}`}>
                          {service.name}
                        </CardTitle>
                        {service.category && (
                          <Badge variant="secondary" className="text-xs" data-testid={`service-category-${service.id}`}>
                            {service.category}
                          </Badge>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`service-menu-${service.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(service)} data-testid={`edit-service-${service.id}`}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => deleteMutation.mutate(service.id)}
                            className="text-destructive"
                            data-testid={`delete-service-${service.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    {service.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2" data-testid={`service-description-${service.id}`}>
                        {service.description}
                      </p>
                    )}
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatDuration(service.duration)}
                        </div>
                        <div className="flex items-center text-sm font-medium text-foreground" data-testid={`service-price-${service.id}`}>
                          <DollarSign className="w-4 h-4 mr-1" />
                          {formatPrice(service.price)}
                        </div>
                      </div>
                      
                      {service.depositRequired && service.depositAmount && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Deposit required:</span>
                          <span className="font-medium text-primary" data-testid={`service-deposit-${service.id}`}>
                            {formatPrice(service.depositAmount)}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Staff:</span>
                        <div className="flex items-center">
                          <Users className="w-3 h-3 mr-1" />
                          <span data-testid={`service-staff-count-${service.id}`}>
                            {Array.isArray(service.availableStaffIds) ? service.availableStaffIds.length : 0} available
                          </span>
                        </div>
                      </div>
                      
                      {service.requiresConsent && (
                        <Badge variant="outline" className="w-fit" data-testid={`service-consent-${service.id}`}>
                          Consent Required
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}