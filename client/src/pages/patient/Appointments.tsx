import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import AppointmentDetailsDialog from "@/components/AppointmentDetailsDialog";
import { Calendar, CalendarPlus, Clock, User, MapPin, Phone } from "lucide-react";
import type { Appointment, Client } from "@/types";
import { useState } from "react";

const formatTimeInTimezone = (dateString: string, timezone: string = 'America/New_York') => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    timeZone: timezone,
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
};

const formatDateInTimezone = (dateString: string, timezone: string = 'America/New_York', options: Intl.DateTimeFormatOptions = {}) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    timeZone: timezone,
    ...options
  });
};

export default function PatientAppointments() {
  const [, setLocation] = useLocation();
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const { data: client, isLoading: clientLoading } = useQuery<Client>({
    queryKey: ["/api/clients/me"],
    staleTime: 5 * 60000,
  });

  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/upcoming"],
    staleTime: 30000,
  });

  const { data: organization } = useQuery<any>({
    queryKey: ["/api/organizations", client?.organizationId],
    queryFn: async () => {
      if (!client?.organizationId) return null;
      const response = await fetch(`/api/organizations/${client.organizationId}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch organization");
      return response.json();
    },
    enabled: !!client?.organizationId,
    staleTime: 5 * 60000,
  });

  const isLoading = clientLoading || appointmentsLoading;

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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-appointments-title">
              My Appointments
            </h1>
            <p className="text-muted-foreground">View and manage your upcoming appointments</p>
          </div>
          <Button 
            onClick={() => setLocation("/patient/booking")}
            data-testid="button-book-new-appointment"
          >
            <CalendarPlus className="w-4 h-4 mr-2" />
            Book Appointment
          </Button>
        </div>

        {/* Appointments List */}
        <div className="space-y-6">
          {/* Upcoming Appointments */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-upcoming-section-title">Upcoming Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              {!appointments || appointments.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2" data-testid="text-no-appointments">
                    No upcoming appointments
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Book your first appointment to get started with your beauty and wellness journey
                  </p>
                  <Button 
                    onClick={() => setLocation("/patient/booking")}
                    data-testid="button-book-first"
                  >
                    <CalendarPlus className="w-4 h-4 mr-2" />
                    Book Your First Appointment
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {appointments.map((appointment) => (
                    <div 
                      key={appointment.id}
                      className="border rounded-lg p-6 hover:shadow-md transition-shadow"
                      data-testid={`appointment-card-${appointment.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-3 flex-1">
                          {/* Date and Time */}
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2 text-foreground">
                              <Calendar className="w-5 h-5 text-primary" />
                              <span className="font-medium">
                                {formatDateInTimezone(appointment.startTime, appointment.timezone || 'America/New_York', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 text-muted-foreground">
                              <Clock className="w-5 h-5" />
                              <span>
                                {formatTimeInTimezone(appointment.startTime, appointment.timezone || 'America/New_York')}
                              </span>
                            </div>
                          </div>

                          {/* Service Info */}
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground" data-testid={`text-service-${appointment.id}`}>
                              {appointment.serviceName || 'Service'}
                            </h3>
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                              <User className="w-4 h-4" />
                              <span>{appointment.staffName || 'Provider'}</span>
                            </div>
                            {appointment.locationName && (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                <MapPin className="w-4 h-4" />
                                <span>{appointment.locationName}</span>
                              </div>
                            )}
                          </div>

                          {/* Notes */}
                          {appointment.notes && (
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium">Notes:</span> {appointment.notes}
                            </p>
                          )}
                        </div>

                        {/* Status Badge */}
                        <Badge 
                          className={`${
                            appointment.status === 'confirmed' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                          data-testid={`badge-status-${appointment.id}`}
                        >
                          {appointment.status ? appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1) : 'Pending'}
                        </Badge>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-3 mt-4 pt-4 border-t">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedAppointment(appointment);
                            setDetailsDialogOpen(true);
                          }}
                          data-testid={`button-view-details-${appointment.id}`}
                        >
                          View Details
                        </Button>
                        {organization?.phone && (
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => window.location.href = `tel:${organization.phone}`}
                            data-testid={`button-call-clinic-${appointment.id}`}
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            Call to Request Changes
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past Appointments */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-past-section-title">Past Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground" data-testid="text-no-past-appointments">
                  No past appointments yet
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AppointmentDetailsDialog 
        appointment={selectedAppointment}
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
      />
    </div>
  );
}
