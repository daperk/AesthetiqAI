import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ClinicNav from "@/components/ClinicNav";
import StaffForm from "@/components/clinic/StaffForm";
import StaffAvailability from "@/components/clinic/StaffAvailability";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePaymentRequired } from "@/hooks/usePaymentRequired";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { 
  Users, Plus, Search, MoreHorizontal, Calendar, DollarSign,
  Clock, UserCheck, Settings, Mail, Phone, MapPin, Shield,
  Edit2, Trash2, UserX, Eye, Scissors
} from "lucide-react";
import type { Staff, Appointment, Service } from "@/types";

export default function StaffPage() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Enforce payment setup requirement
  const { isLoading: paymentLoading, hasAccess } = usePaymentRequired();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [isStaffFormOpen, setIsStaffFormOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");

  const { data: staff, isLoading: staffLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff", organization?.id],
    enabled: !!organization?.id,
    staleTime: 30000,
  });

  const { data: staffAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", "staff", selectedStaff?.id],
    enabled: !!selectedStaff?.id,
    staleTime: 30000,
  });

  const { data: staffServices } = useQuery<Service[]>({
    queryKey: ["/api/staff/services", selectedStaff?.id],
    enabled: !!selectedStaff?.id,
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const response = await apiRequest("DELETE", `/api/staff/${staffId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setSelectedStaff(null);
      toast({
        title: "Staff member deleted",
        description: "The staff member has been successfully removed.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete staff member",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleStaffStatusMutation = useMutation({
    mutationFn: async ({ staffId, isActive }: { staffId: string; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/staff/${staffId}`, {
        isActive,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: "Status updated",
        description: "Staff member status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update status",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateStaff = () => {
    setEditingStaff(null);
    setFormMode("create");
    setIsStaffFormOpen(true);
  };

  const handleEditStaff = (staffMember: Staff) => {
    setEditingStaff(staffMember);
    setFormMode("edit");
    setIsStaffFormOpen(true);
  };

  const handleDeleteStaff = (staffId: string) => {
    if (confirm("Are you sure you want to delete this staff member?")) {
      deleteStaffMutation.mutate(staffId);
    }
  };

  const filteredStaff = staff?.filter(member => {
    const matchesSearch = !searchTerm || 
      member.title?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === "all" || member.role === filterRole;
    
    return matchesSearch && matchesRole;
  }) || [];

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-blue-100 text-blue-800";
      case "provider":
        return "bg-green-100 text-green-800";
      case "receptionist":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStaffInitials = (member: Staff) => {
    // This would come from the user relation in a real app
    return "SM"; // Placeholder
  };

  // Show loading while checking payment status or loading staff
  if (staffLoading || paymentLoading) {
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
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-staff-title">
            Staff Management
          </h1>
          <p className="text-muted-foreground mb-4">Manage your team members and their roles</p>
          <ClinicNav />
        </div>

        {/* Actions */}
        <div className="mb-6 flex gap-3">
          <Button onClick={handleCreateStaff} data-testid="button-add-staff">
            <Plus className="w-4 h-4 mr-2" />
            Add Staff Member
          </Button>
          
          <Link href="/clinic/staff-roles">
            <Button variant="outline" data-testid="button-manage-roles">
              <Shield className="w-4 h-4 mr-2" />
              Manage Roles
            </Button>
          </Link>
        </div>
        
        {/* Staff Form Modal */}
        <StaffForm
          open={isStaffFormOpen}
          onOpenChange={setIsStaffFormOpen}
          staff={editingStaff}
          mode={formMode}
        />

        {/* Stats */}
        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Staff</span>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-total-staff">
                {staff?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">
                {staff?.filter(s => s.isActive).length || 0} active
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Providers</span>
                <UserCheck className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-total-providers">
                {staff?.filter(s => s.role === "provider").length || 0}
              </div>
              <div className="text-sm text-green-500">Available</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Avg. Commission</span>
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-avg-commission">
                {staff?.length ? Math.round(
                  staff.filter(s => s.commissionRate).reduce((sum, s) => sum + (parseFloat(s.commissionRate?.toString() || "0")), 0) / 
                  staff.filter(s => s.commissionRate).length
                ) : 0}%
              </div>
              <div className="text-sm text-muted-foreground">per service</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Online Now</span>
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-online-staff">
                {Math.floor((staff?.filter(s => s.isActive).length || 0) * 0.8)}
              </div>
              <div className="text-sm text-green-500">Working</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-staff"
                />
              </div>
              
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-40" data-testid="select-role-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="provider">Provider</SelectItem>
                  <SelectItem value="receptionist">Receptionist</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Staff List */}
        {selectedStaff ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Button variant="outline" onClick={() => setSelectedStaff(null)} data-testid="button-back-to-staff-list">
                    ← Back to Staff
                  </Button>
                  <div>
                    <CardTitle data-testid="text-staff-detail-title">
                      {selectedStaff.title || "Staff Member"}
                    </CardTitle>
                    <p className="text-muted-foreground capitalize">{selectedStaff.role}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => handleEditStaff(selectedStaff)}
                    data-testid="button-edit-staff"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid="button-staff-menu">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => toggleStaffStatusMutation.mutate({
                          staffId: selectedStaff.id,
                          isActive: !selectedStaff.isActive
                        })}
                      >
                        {selectedStaff.isActive ? (
                          <>
                            <UserX className="w-4 h-4 mr-2" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-4 h-4 mr-2" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteStaff(selectedStaff.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Staff
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="space-y-6">
                <TabsList>
                  <TabsTrigger value="overview" data-testid="tab-staff-overview">Overview</TabsTrigger>
                  <TabsTrigger value="availability" data-testid="tab-staff-availability">Availability</TabsTrigger>
                  <TabsTrigger value="services" data-testid="tab-staff-services">Services</TabsTrigger>
                  <TabsTrigger value="performance" data-testid="tab-staff-performance">Performance</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Staff Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Job Title</div>
                          <div className="font-medium">{selectedStaff.title || "Not specified"}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Specialties</div>
                          <div className="font-medium">
                            {selectedStaff.specialties && Array.isArray(selectedStaff.specialties) 
                              ? (selectedStaff.specialties as string[]).join(", ") 
                              : "No specialties listed"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Bio</div>
                          <div className="font-medium">{selectedStaff.bio || "No bio provided"}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Can Book Online</div>
                          <Badge variant={selectedStaff.canBookOnline ? "default" : "secondary"}>
                            {selectedStaff.canBookOnline ? "Yes" : "No"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Compensation</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Commission Rate:</span>
                            <span className="font-medium">{selectedStaff.commissionRate || 0}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Commission Type:</span>
                            <span className="font-medium capitalize">{selectedStaff.commissionType || "percentage"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Hourly Rate:</span>
                            <span className="font-medium">${selectedStaff.hourlyRate || "0.00"}/hour</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge variant={selectedStaff.isActive ? "default" : "secondary"}>
                              {selectedStaff.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="availability">
                  <StaffAvailability
                    staff={selectedStaff}
                    organizationId={organization?.id || ""}
                    editable={true}
                  />
                </TabsContent>

                <TabsContent value="services">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Assigned Services</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {staffServices && staffServices.length > 0 ? (
                        <div className="grid gap-2">
                          {staffServices.map((service) => (
                            <div
                              key={service.id}
                              className="flex items-center justify-between p-3 border rounded-lg"
                            >
                              <div>
                                <div className="font-medium">{service.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {service.duration} min · ${service.price || "0.00"}
                                </div>
                              </div>
                              <Badge variant="outline">{service.category || "General"}</Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Scissors className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground" data-testid="text-no-services">
                            No services assigned yet
                          </p>
                          <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => handleEditStaff(selectedStaff)}
                          >
                            Assign Services
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="performance">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Performance Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8">
                        <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground" data-testid="text-no-performance-data">
                          Performance data will be available here
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
              <CardTitle data-testid="text-staff-list-title">
                Staff Members ({filteredStaff.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredStaff.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground" data-testid="text-no-staff">
                    {searchTerm ? "No staff members match your search" : "No staff members found"}
                  </p>
                  {!searchTerm && (
                    <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-first-staff">
                      Add Your First Staff Member
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredStaff.map((member) => (
                    <div 
                      key={member.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedStaff(member)}
                      data-testid={`staff-item-${member.id}`}
                    >
                      <div className="flex items-center space-x-4">
                        <Avatar>
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {getStaffInitials(member)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-foreground">
                            {member.title}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {member.specialties && Array.isArray(member.specialties) && (member.specialties as string[]).length > 0
                              ? (member.specialties as string[]).join(", ")
                              : "No specialties"}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <Badge className={getRoleColor(member.role)}>
                            {member.role}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {member.commissionRate ? `${member.commissionRate}% commission` : "No commission"}
                          </div>
                        </div>
                        
                        <Badge variant={member.isActive ? "default" : "secondary"}>
                          {member.isActive ? "Active" : "Inactive"}
                        </Badge>
                        
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle menu actions
                          }}
                          data-testid={`button-staff-menu-${member.id}`}
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
