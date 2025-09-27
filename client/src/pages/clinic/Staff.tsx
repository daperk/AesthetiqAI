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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Plus, Search, MoreHorizontal, Calendar, DollarSign,
  Clock, UserCheck, Settings, Mail, Phone, MapPin
} from "lucide-react";
import type { Staff, User, Appointment } from "@/types";

export default function StaffPage() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  
  const [newStaff, setNewStaff] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "provider",
    title: "",
    specialties: "",
    bio: "",
    commissionRate: "",
    hourlyRate: "",
    isActive: true,
  });

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

  const createStaffMutation = useMutation({
    mutationFn: async (staffData: typeof newStaff) => {
      // First create a user account
      const userResponse = await apiRequest("POST", "/api/auth/register", {
        email: staffData.email,
        username: staffData.email,
        password: "TempPassword123!", // Temporary password
        firstName: staffData.firstName,
        lastName: staffData.lastName,
        role: "staff",
      });
      
      const user = await userResponse.json();
      
      // Then create the staff record
      const response = await apiRequest("POST", "/api/staff", {
        userId: user.user.id,
        organizationId: organization?.id,
        role: staffData.role,
        title: staffData.title,
        specialties: staffData.specialties ? staffData.specialties.split(',').map(s => s.trim()) : [],
        bio: staffData.bio,
        commissionRate: staffData.commissionRate ? parseFloat(staffData.commissionRate) : null,
        hourlyRate: staffData.hourlyRate ? parseFloat(staffData.hourlyRate) : null,
        isActive: staffData.isActive,
      });
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setIsCreateDialogOpen(false);
      setNewStaff({
        email: "",
        firstName: "",
        lastName: "",
        role: "provider",
        title: "",
        specialties: "",
        bio: "",
        commissionRate: "",
        hourlyRate: "",
        isActive: true,
      });
      toast({
        title: "Staff member added",
        description: "New staff member has been successfully added.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to add staff member",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createStaffMutation.mutate(newStaff);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewStaff(prev => ({ ...prev, [name]: value }));
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

  if (staffLoading) {
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
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-staff-title">
              Staff Management
            </h1>
            <p className="text-muted-foreground">Manage your team members and their roles</p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-staff">
                <Plus className="w-4 h-4 mr-2" />
                Add Staff Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Staff Member</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={newStaff.firstName}
                      onChange={handleInputChange}
                      placeholder="Enter first name"
                      required
                      data-testid="input-staff-first-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={newStaff.lastName}
                      onChange={handleInputChange}
                      placeholder="Enter last name"
                      required
                      data-testid="input-staff-last-name"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={newStaff.email}
                    onChange={handleInputChange}
                    placeholder="staff@example.com"
                    required
                    data-testid="input-staff-email"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={newStaff.role} onValueChange={(value) => setNewStaff(prev => ({ ...prev, role: value }))}>
                      <SelectTrigger data-testid="select-staff-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="provider">Provider</SelectItem>
                        <SelectItem value="receptionist">Receptionist</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="title">Job Title</Label>
                    <Input
                      id="title"
                      name="title"
                      value={newStaff.title}
                      onChange={handleInputChange}
                      placeholder="e.g., Senior Aesthetician"
                      data-testid="input-staff-title"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="specialties">Specialties (comma-separated)</Label>
                  <Input
                    id="specialties"
                    name="specialties"
                    value={newStaff.specialties}
                    onChange={handleInputChange}
                    placeholder="Facials, Botox, Dermal Fillers"
                    data-testid="input-staff-specialties"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                    <Input
                      id="commissionRate"
                      name="commissionRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={newStaff.commissionRate}
                      onChange={handleInputChange}
                      placeholder="15.00"
                      data-testid="input-staff-commission"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                    <Input
                      id="hourlyRate"
                      name="hourlyRate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newStaff.hourlyRate}
                      onChange={handleInputChange}
                      placeholder="25.00"
                      data-testid="input-staff-hourly-rate"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    name="bio"
                    value={newStaff.bio}
                    onChange={handleInputChange}
                    placeholder="Brief bio and qualifications"
                    data-testid="input-staff-bio"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={newStaff.isActive}
                    onCheckedChange={(checked) => setNewStaff(prev => ({ ...prev, isActive: checked }))}
                    data-testid="switch-staff-active"
                  />
                  <Label htmlFor="isActive">Active staff member</Label>
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createStaffMutation.isPending} data-testid="button-save-staff">
                    {createStaffMutation.isPending ? (
                      <div className="flex items-center space-x-2">
                        <LoadingSpinner size="sm" />
                        <span>Adding...</span>
                      </div>
                    ) : (
                      "Add Staff Member"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

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
                      {selectedStaff.title}
                    </CardTitle>
                    <p className="text-muted-foreground capitalize">{selectedStaff.role}</p>
                  </div>
                </div>
                <Button variant="outline" data-testid="button-edit-staff">
                  Edit Staff
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="space-y-6">
                <TabsList>
                  <TabsTrigger value="overview" data-testid="tab-staff-overview">Overview</TabsTrigger>
                  <TabsTrigger value="schedule" data-testid="tab-staff-schedule">Schedule</TabsTrigger>
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

                <TabsContent value="schedule">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Today's Schedule</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8">
                        <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground" data-testid="text-no-staff-schedule">
                          No appointments scheduled for today
                        </p>
                      </div>
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
