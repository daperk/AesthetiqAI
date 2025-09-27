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
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
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
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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

  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments", organization?.id, selectedDate.toISOString().split('T')[0]],
    queryFn: async () => {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const url = `/api/appointments?organizationId=${organization?.id}&startDate=${dateStr}&endDate=${dateStr}`;
      const response = await fetch(url, {
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

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients", organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60000,
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff", organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60000,
  });

  const { data: services } = useQuery<Service[]>({
    queryKey: ["/api/services", organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60000,
  });

  const { data: locations } = useQuery<any[]>({
    queryKey: ["/api/locations", organization?.id],
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


  if (appointmentsLoading) {
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
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-appointments-title">
              Appointments
            </h1>
            <p className="text-muted-foreground">Manage your clinic's appointment schedule</p>
          </div>
          
          <div className="flex items-center space-x-4">
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
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                className="rounded-md border"
                data-testid="calendar-picker"
              />
            </CardContent>
          </Card>

          {/* Appointments List */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle data-testid="text-appointments-list-title">
                    Appointments for {selectedDate.toLocaleDateString()}
                  </CardTitle>
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
                    {filteredAppointments.map((appointment) => (
                      <div 
                        key={appointment.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        data-testid={`appointment-item-${appointment.id}`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="text-center">
                            <div className="text-sm font-medium text-foreground">
                              {new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {Math.round((new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime()) / (1000 * 60))} min
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-foreground">Service Name</div>
                            <div className="text-sm text-muted-foreground">Client Name</div>
                            <div className="text-xs text-muted-foreground">Provider Name</div>
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
                    ))}
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
