import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ClinicNav from "@/components/ClinicNav";
import EditAppointmentDialog from "@/components/EditAppointmentDialog";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePaymentRequired } from "@/hooks/usePaymentRequired";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon, Clock, User, MapPin, Plus, Search,
  Filter, MoreHorizontal, CheckCircle, XCircle, AlertCircle,
  Edit, UserX, CheckCheck, Archive, ArchiveRestore, ChevronDown, ChevronRight
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu";
import type { Appointment, Client, Staff, Service } from "@/types";

export default function Appointments() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Enforce payment setup requirement
  const { isLoading: paymentLoading, hasAccess } = usePaymentRequired();
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined); // undefined = show all upcoming
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    upcoming: true,
    completed: false,
    canceled: false,
    archived: false
  });
  
  const [newAppointment, setNewAppointment] = useState({
    clientId: "",
    staffId: "",
    serviceId: "",
    locationId: "",
    startTime: "",
    endTime: "",
    notes: "",
  });

  // Helper to get date string without UTC conversion (preserves local date)
  const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Calculate date range based on view mode
  const getDateRange = () => {
    const today = new Date();
    let startDate: Date, endDate: Date;

    if (selectedDate) {
      // If a specific date is selected, use it
      startDate = new Date(selectedDate);
      endDate = new Date(selectedDate);
    } else {
      // Use view mode to determine range
      switch (viewMode) {
        case "day":
          // Show today only
          startDate = new Date(today);
          endDate = new Date(today);
          break;
        case "week":
          // Show current week (Sunday to Saturday)
          startDate = new Date(today);
          startDate.setDate(today.getDate() - today.getDay()); // Go to Sunday
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6); // Go to Saturday
          break;
        case "month":
          // Show current month
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        default:
          // Default to next 30 days
          startDate = new Date(today);
          endDate = new Date(today);
          endDate.setDate(today.getDate() + 30);
      }
    }

    return {
      startDate: getLocalDateString(startDate),
      endDate: getLocalDateString(endDate)
    };
  };

  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments", organization?.id, selectedDate ? getLocalDateString(selectedDate) : viewMode, searchTerm, statusFilter, includeArchived],
    queryFn: async () => {
      const { startDate: startDateStr, endDate: endDateStr } = getDateRange();
      
      const params = new URLSearchParams({
        organizationId: organization?.id || '',
        startDate: startDateStr,
        endDate: endDateStr
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }
      if (statusFilter.length > 0) {
        params.append('status', statusFilter.join(','));
      }
      if (includeArchived) {
        params.append('includeArchived', 'true');
      }

      const response = await fetch(`/api/appointments?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }
      
      return response.json();
    },
    enabled: !!organization?.id,
    staleTime: 30000,
  });

  const { data: clients, refetch: refetchClients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: !!organization?.id,
    staleTime: 0, // Always refetch to show newly created patients immediately
    gcTime: 0, // Don't cache results
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
    enabled: !!organization?.id,
    staleTime: 5 * 60000,
  });

  const { data: services } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    enabled: !!organization?.id,
    staleTime: 5 * 60000,
  });

  const { data: locations } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    enabled: !!organization?.id,
    staleTime: 5 * 60000,
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (appointmentData: typeof newAppointment) => {
      const response = await apiRequest("POST", "/api/appointments", {
        ...appointmentData,
        organizationId: organization?.id,
        locationId: appointmentData.locationId,
        startTime: new Date(appointmentData.startTime),
        endTime: new Date(appointmentData.endTime),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments", organization?.id] });
      setIsCreateDialogOpen(false);
      setNewAppointment({
        clientId: "",
        staffId: "",
        serviceId: "",
        locationId: "",
        startTime: "",
        endTime: "",
        notes: "",
      });
      toast({
        title: "Appointment created",
        description: "New appointment has been successfully scheduled.",
      });
    },
    onError: (error: any) => {
      const isConflict = error.message?.includes('409') || error.message?.includes('conflict');
      toast({
        title: isConflict ? "Time slot conflict" : "Failed to create appointment",
        description: isConflict 
          ? "This time slot is already booked. Please choose a different time."
          : "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update appointment status mutation
  const updateAppointmentStatusMutation = useMutation({
    mutationFn: async ({ appointmentId, status }: { appointmentId: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${appointmentId}`, { status });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["appointments", organization?.id] });
      const statusLabel = variables.status === 'canceled' ? 'canceled' : 
                          variables.status === 'completed' ? 'completed' :
                          variables.status === 'no_show' ? 'marked as no-show' : 'updated';
      toast({
        title: "Appointment updated",
        description: `Appointment has been ${statusLabel}.`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to update appointment",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Archive appointment mutation
  const archiveAppointmentMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await apiRequest("PATCH", `/api/appointments/${appointmentId}/archive`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments", organization?.id] });
      toast({
        title: "Appointment archived",
        description: "The appointment has been archived.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to archive appointment",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Unarchive appointment mutation
  const unarchiveAppointmentMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await apiRequest("PATCH", `/api/appointments/${appointmentId}/unarchive`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments", organization?.id] });
      toast({
        title: "Appointment unarchived",
        description: "The appointment has been restored.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to unarchive appointment",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAppointmentMutation.mutate(newAppointment);
  };

  const handleInputChange = (field: string, value: string) => {
    setNewAppointment(prev => ({ ...prev, [field]: value }));
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsCreateDialogOpen(open);
    // Refetch clients when dialog opens to show newly created patients
    if (open) {
      refetchClients();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "scheduled":
        return "bg-blue-100 text-blue-800";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "canceled":
        return "bg-red-100 text-red-800";
      case "no_show":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
      case "completed":
        return <CheckCircle className="w-4 h-4" />;
      case "canceled":
      case "no_show":
        return <XCircle className="w-4 h-4" />;
      case "in_progress":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  // Group appointments by category
  const groupedAppointments = {
    upcoming: appointments?.filter(apt => 
      !apt.archived && ['pending', 'scheduled', 'confirmed', 'in_progress'].includes(apt.status || '')
    ) || [],
    completed: appointments?.filter(apt => 
      !apt.archived && apt.status === 'completed'
    ) || [],
    canceled: appointments?.filter(apt => 
      !apt.archived && apt.status === 'canceled'
    ) || [],
    archived: appointments?.filter(apt => apt.archived) || []
  };

  const totalAppointments = Object.values(groupedAppointments).reduce((sum, group) => sum + group.length, 0);

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  // Render appointment card
  const renderAppointmentCard = (appointment: Appointment) => (
    <div 
      key={appointment.id}
      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
      data-testid={`appointment-item-${appointment.id}`}
    >
      <div className="flex items-center space-x-4">
        <div className="text-center min-w-[100px]">
          <div className="text-xs text-muted-foreground mb-1">
            {new Date(appointment.startTime!).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })}
          </div>
          <div className="text-sm font-medium text-foreground">
            {new Date(appointment.startTime!).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            {Math.round((new Date(appointment.endTime!).getTime() - new Date(appointment.startTime!).getTime()) / (1000 * 60))} min
          </div>
        </div>
        <div className="flex-1">
          <div className="font-medium text-foreground">{appointment.serviceName || 'Service'}</div>
          <div className="text-sm text-muted-foreground">{appointment.clientName || 'Client'}</div>
          <div className="text-xs text-muted-foreground">{appointment.staffName || 'Staff'}</div>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        <Badge className={getStatusColor(appointment.status || "scheduled")}>
          <div className="flex items-center space-x-1">
            {getStatusIcon(appointment.status || "scheduled")}
            <span className="capitalize">{appointment.status?.replace('_', ' ') || "scheduled"}</span>
          </div>
        </Badge>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid={`button-appointment-menu-${appointment.id}`}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => {
                setAppointmentToEdit(appointment);
                setEditDialogOpen(true);
              }}
              data-testid={`menu-edit-${appointment.id}`}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            
            {appointment.status !== 'completed' && !appointment.archived && (
              <DropdownMenuItem 
                onClick={() => updateAppointmentStatusMutation.mutate({ 
                  appointmentId: appointment.id!, 
                  status: 'completed' 
                })}
                data-testid={`menu-complete-${appointment.id}`}
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                Mark as Complete
              </DropdownMenuItem>
            )}
            
            {appointment.status !== 'no_show' && !appointment.archived && (
              <DropdownMenuItem 
                onClick={() => updateAppointmentStatusMutation.mutate({ 
                  appointmentId: appointment.id!, 
                  status: 'no_show' 
                })}
                data-testid={`menu-noshow-${appointment.id}`}
              >
                <UserX className="w-4 h-4 mr-2" />
                Mark as No-Show
              </DropdownMenuItem>
            )}
            
            {appointment.status !== 'canceled' && !appointment.archived && (
              <DropdownMenuItem 
                onClick={() => updateAppointmentStatusMutation.mutate({ 
                  appointmentId: appointment.id!, 
                  status: 'canceled' 
                })}
                data-testid={`menu-cancel-${appointment.id}`}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
            
            {!appointment.archived ? (
              <DropdownMenuItem 
                onClick={() => archiveAppointmentMutation.mutate(appointment.id!)}
                data-testid={`menu-archive-${appointment.id}`}
              >
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem 
                onClick={() => unarchiveAppointmentMutation.mutate(appointment.id!)}
                data-testid={`menu-unarchive-${appointment.id}`}
              >
                <ArchiveRestore className="w-4 h-4 mr-2" />
                Unarchive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  // Show loading while checking payment status or loading appointments
  if (appointmentsLoading || paymentLoading) {
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
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-appointments-title">
            Appointments
          </h1>
          <p className="text-muted-foreground mb-4">Manage your clinic's appointment schedule</p>
          <div className="mt-4">
            <ClinicNav />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <Select value={viewMode} onValueChange={(value: "day" | "week" | "month") => setViewMode(value)}>
            <SelectTrigger className="w-32" data-testid="select-view-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day View</SelectItem>
              <SelectItem value="week">Week View</SelectItem>
              <SelectItem value="month">Month View</SelectItem>
            </SelectContent>
          </Select>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-appointment">
                  <Plus className="w-4 h-4 mr-2" />
                  New Appointment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Schedule New Appointment</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client">Client</Label>
                      <Select value={newAppointment.clientId} onValueChange={(value) => handleInputChange("clientId", value)}>
                        <SelectTrigger data-testid="select-client">
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients?.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.firstName} {client.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Select value={newAppointment.locationId} onValueChange={(value) => handleInputChange("locationId", value)}>
                        <SelectTrigger data-testid="select-location">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations?.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="service">Service</Label>
                    <Select value={newAppointment.serviceId} onValueChange={(value) => handleInputChange("serviceId", value)}>
                      <SelectTrigger data-testid="select-service">
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services?.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name} - ${service.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="staff">Provider</Label>
                    <Select value={newAppointment.staffId} onValueChange={(value) => handleInputChange("staffId", value)}>
                      <SelectTrigger data-testid="select-staff">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff?.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startTime">Start Time</Label>
                      <Input
                        id="startTime"
                        type="datetime-local"
                        value={newAppointment.startTime}
                        onChange={(e) => handleInputChange("startTime", e.target.value)}
                        required
                        data-testid="input-start-time"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="endTime">End Time</Label>
                      <Input
                        id="endTime"
                        type="datetime-local"
                        value={newAppointment.endTime}
                        onChange={(e) => handleInputChange("endTime", e.target.value)}
                        required
                        data-testid="input-end-time"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newAppointment.notes}
                      onChange={(e) => handleInputChange("notes", e.target.value)}
                      placeholder="Additional notes or requirements"
                      data-testid="input-notes"
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createAppointmentMutation.isPending} data-testid="button-save-appointment">
                      {createAppointmentMutation.isPending ? (
                        <div className="flex items-center space-x-2">
                          <LoadingSpinner size="sm" />
                          <span>Scheduling...</span>
                        </div>
                      ) : (
                        "Schedule Appointment"
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
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by client, provider, service, or notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-appointments"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="filter-status">
                    <Filter className="w-4 h-4 mr-2" />
                    Status {statusFilter.length > 0 && `(${statusFilter.length})`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuCheckboxItem
                    checked={statusFilter.includes('scheduled')}
                    onCheckedChange={(checked) => {
                      setStatusFilter(prev => 
                        checked ? [...prev, 'scheduled'] : prev.filter(s => s !== 'scheduled')
                      );
                    }}
                    data-testid="checkbox-filter-scheduled"
                  >
                    Scheduled
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={statusFilter.includes('confirmed')}
                    onCheckedChange={(checked) => {
                      setStatusFilter(prev => 
                        checked ? [...prev, 'confirmed'] : prev.filter(s => s !== 'confirmed')
                      );
                    }}
                    data-testid="checkbox-filter-confirmed"
                  >
                    Confirmed
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={statusFilter.includes('in_progress')}
                    onCheckedChange={(checked) => {
                      setStatusFilter(prev => 
                        checked ? [...prev, 'in_progress'] : prev.filter(s => s !== 'in_progress')
                      );
                    }}
                    data-testid="checkbox-filter-in-progress"
                  >
                    In Progress
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={statusFilter.includes('completed')}
                    onCheckedChange={(checked) => {
                      setStatusFilter(prev => 
                        checked ? [...prev, 'completed'] : prev.filter(s => s !== 'completed')
                      );
                    }}
                    data-testid="checkbox-filter-completed"
                  >
                    Completed
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={statusFilter.includes('canceled')}
                    onCheckedChange={(checked) => {
                      setStatusFilter(prev => 
                        checked ? [...prev, 'canceled'] : prev.filter(s => s !== 'canceled')
                      );
                    }}
                    data-testid="checkbox-filter-canceled"
                  >
                    Canceled
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={statusFilter.includes('no_show')}
                    onCheckedChange={(checked) => {
                      setStatusFilter(prev => 
                        checked ? [...prev, 'no_show'] : prev.filter(s => s !== 'no_show')
                      );
                    }}
                    data-testid="checkbox-filter-no-show"
                  >
                    No Show
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setStatusFilter([])} data-testid="button-clear-status-filter">
                    Clear Filter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="include-archived" 
                  checked={includeArchived}
                  onCheckedChange={(checked) => setIncludeArchived(checked as boolean)}
                  data-testid="checkbox-include-archived"
                />
                <Label htmlFor="include-archived" className="text-sm cursor-pointer">
                  Show archived
                </Label>
              </div>
              
              {/* Clear Filters Button */}
              {(searchTerm || statusFilter.length > 0 || includeArchived) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter([]);
                    setIncludeArchived(false);
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Calendar and Appointments */}
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Calendar Sidebar */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Calendar</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="w-full overflow-x-auto">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="rounded-md border w-full"
                  classNames={{
                    months: "w-full",
                    month: "w-full space-y-2",
                    table: "w-full border-collapse",
                    head_row: "flex w-full",
                    head_cell: "text-muted-foreground rounded-md w-full font-normal text-[0.8rem] flex-1",
                    row: "flex w-full mt-1",
                    cell: "text-center text-sm relative flex-1 p-0",
                    day: "h-8 w-full p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                    day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    day_hidden: "invisible",
                  }}
                  data-testid="calendar-picker"
                />
              </div>
            </CardContent>
          </Card>

          {/* Appointments List */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle data-testid="text-appointments-list-title">
                      {selectedDate 
                        ? selectedDate.toDateString() === new Date().toDateString()
                          ? "Today's Appointments"
                          : `Appointments for ${selectedDate.toLocaleDateString()}`
                        : viewMode === "day"
                        ? "Today's Appointments"
                        : viewMode === "week"
                        ? "This Week's Appointments"
                        : viewMode === "month"
                        ? "This Month's Appointments"
                        : "All Upcoming Appointments"
                      }
                    </CardTitle>
                    {selectedDate && (
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="px-0 h-auto text-xs"
                        onClick={() => setSelectedDate(undefined)}
                        data-testid="button-clear-date-filter"
                      >
                        Back to {viewMode} view
                      </Button>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {totalAppointments} appointments
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {totalAppointments === 0 ? (
                  <div className="text-center py-8">
                    <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-no-appointments">
                      No appointments scheduled for this date
                    </p>
                    <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-appointment">
                      Schedule First Appointment
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Upcoming Appointments */}
                    {groupedAppointments.upcoming.length > 0 && (
                      <Collapsible open={openGroups.upcoming} onOpenChange={() => toggleGroup('upcoming')}>
                        <div className="flex items-center justify-between mb-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="flex items-center space-x-2 p-0 h-auto hover:bg-transparent" data-testid="button-toggle-upcoming">
                              {openGroups.upcoming ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <h3 className="text-lg font-semibold">Upcoming</h3>
                              <Badge variant="secondary" data-testid="badge-upcoming-count">{groupedAppointments.upcoming.length}</Badge>
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent className="space-y-3">
                          {groupedAppointments.upcoming.map(renderAppointmentCard)}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Completed Appointments */}
                    {groupedAppointments.completed.length > 0 && (
                      <Collapsible open={openGroups.completed} onOpenChange={() => toggleGroup('completed')}>
                        <div className="flex items-center justify-between mb-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="flex items-center space-x-2 p-0 h-auto hover:bg-transparent" data-testid="button-toggle-completed">
                              {openGroups.completed ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <h3 className="text-lg font-semibold">Completed</h3>
                              <Badge variant="secondary" data-testid="badge-completed-count">{groupedAppointments.completed.length}</Badge>
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent className="space-y-3">
                          {groupedAppointments.completed.map(renderAppointmentCard)}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Canceled Appointments */}
                    {groupedAppointments.canceled.length > 0 && (
                      <Collapsible open={openGroups.canceled} onOpenChange={() => toggleGroup('canceled')}>
                        <div className="flex items-center justify-between mb-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="flex items-center space-x-2 p-0 h-auto hover:bg-transparent" data-testid="button-toggle-canceled">
                              {openGroups.canceled ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <h3 className="text-lg font-semibold">Canceled</h3>
                              <Badge variant="secondary" data-testid="badge-canceled-count">{groupedAppointments.canceled.length}</Badge>
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent className="space-y-3">
                          {groupedAppointments.canceled.map(renderAppointmentCard)}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Archived Appointments */}
                    {groupedAppointments.archived.length > 0 && (
                      <Collapsible open={openGroups.archived} onOpenChange={() => toggleGroup('archived')}>
                        <div className="flex items-center justify-between mb-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="flex items-center space-x-2 p-0 h-auto hover:bg-transparent" data-testid="button-toggle-archived">
                              {openGroups.archived ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <h3 className="text-lg font-semibold">Archived</h3>
                              <Badge variant="secondary" data-testid="badge-archived-count">{groupedAppointments.archived.length}</Badge>
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent className="space-y-3">
                          {groupedAppointments.archived.map(renderAppointmentCard)}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <EditAppointmentDialog 
        appointment={appointmentToEdit}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
          toast({
            title: "Success",
            description: "Appointment updated successfully",
          });
        }}
      />
    </div>
  );
}
