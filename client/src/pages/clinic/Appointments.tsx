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
import LoadingSpinner from "@/components/ui/loading-spinner";
import ClinicNav from "@/components/ClinicNav";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePaymentRequired } from "@/hooks/usePaymentRequired";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon, Clock, User, MapPin, Plus, Search,
  Filter, MoreHorizontal, CheckCircle, XCircle, AlertCircle
} from "lucide-react";
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

  // Fetch all upcoming appointments (next 30 days) OR specific date
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);

  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments", organization?.id, selectedDate ? getLocalDateString(selectedDate) : 'all-upcoming'],
    queryFn: async () => {
      let startDateStr, endDateStr;
      
      if (selectedDate) {
        // Specific date selected - use local date without UTC conversion
        startDateStr = getLocalDateString(selectedDate);
        endDateStr = getLocalDateString(selectedDate);
      } else {
        // Show all upcoming (next 30 days) - use local dates
        const today = new Date();
        startDateStr = getLocalDateString(today);
        endDateStr = getLocalDateString(endDate);
      }
      
      const params = new URLSearchParams({
        organizationId: organization?.id || '',
        startDate: startDateStr,
        endDate: endDateStr
      });
      const response = await fetch(`/api/appointments?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }
      
      const data = await response.json();
      // Filter to only show non-cancelled appointments
      return data.filter((apt: any) => apt.status !== 'cancelled');
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

  const filteredAppointments = appointments?.filter(appointment => {
    if (!searchTerm) return true;
    // This would normally search through client names, services, etc.
    return appointment.notes?.toLowerCase().includes(searchTerm.toLowerCase());
  }) || [];


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
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search appointments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-appointments"
                />
              </div>
              <Button variant="outline" size="sm" data-testid="button-filter">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
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
                      {!selectedDate 
                        ? "All Upcoming Appointments"
                        : selectedDate.toDateString() === new Date().toDateString()
                        ? "Today's Appointments"
                        : `Appointments for ${selectedDate.toLocaleDateString()}`
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
                        View all upcoming appointments
                      </Button>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {filteredAppointments.length} appointments
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {filteredAppointments.length === 0 ? (
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
                  <div className="space-y-4">
                    {filteredAppointments.map((appointment) => {
                      return (
                        <div 
                          key={appointment.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          data-testid={`appointment-item-${appointment.id}`}
                        >
                          <div className="flex items-center space-x-4">
                            <div className="text-center min-w-[100px]">
                              <div className="text-xs text-muted-foreground mb-1">
                                {(() => {
                                  const dateObj = new Date(appointment.startTime);
                                  const timezone = (appointment as any).locationTimezone || 'America/New_York';
                                  return dateObj.toLocaleDateString('en-US', { 
                                    timeZone: timezone,
                                    month: 'short',
                                    day: 'numeric'
                                  });
                                })()}
                              </div>
                              <div className="text-sm font-medium text-foreground">
                                {(() => {
                                  const dateObj = new Date(appointment.startTime);
                                  const timezone = (appointment as any).locationTimezone || 'America/New_York';
                                  return dateObj.toLocaleTimeString('en-US', {
                                    timeZone: timezone,
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  });
                                })()}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {Math.round((new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime()) / (1000 * 60))} min
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-foreground">{(appointment as any).serviceName || 'Service'}</div>
                              <div className="text-sm text-muted-foreground">{(appointment as any).clientName || 'Client'}</div>
                              <div className="text-xs text-muted-foreground">{(appointment as any).staffName || 'Staff'}</div>
                            </div>
                          </div>
                        
                        <div className="flex items-center space-x-3">
                          <Badge className={getStatusColor(appointment.status || "scheduled")}>
                            <div className="flex items-center space-x-1">
                              {getStatusIcon(appointment.status || "scheduled")}
                              <span className="capitalize">{appointment.status || "scheduled"}</span>
                            </div>
                          </Badge>
                          
                          <Button variant="ghost" size="sm" data-testid={`button-appointment-menu-${appointment.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
