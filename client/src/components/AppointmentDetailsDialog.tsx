import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, MapPin, Scissors, Timer, CheckCircle, DollarSign, FileText } from "lucide-react";
import type { Appointment } from "@/types";

interface AppointmentDetailsDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AppointmentDetailsDialog({ 
  appointment, 
  open, 
  onOpenChange 
}: AppointmentDetailsDialogProps) {
  if (!appointment) {
    return null;
  }

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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'canceled':
        return 'bg-red-100 text-red-800';
      case 'no_show':
        return 'bg-orange-100 text-orange-800';
      case 'in_progress':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const formatStatus = (status: string) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const calculateDuration = () => {
    if (!appointment.startTime || !appointment.endTime) return null;
    const start = new Date(appointment.startTime);
    const end = new Date(appointment.endTime);
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.round(durationMs / 60000);
    return durationMinutes;
  };

  const duration = calculateDuration();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-appointment-details">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">Appointment Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Service */}
          <div className="flex items-start space-x-3">
            <Scissors className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Service</p>
              <p className="text-base font-semibold text-foreground" data-testid="text-service-name">
                {appointment.serviceName || 'Service'}
              </p>
            </div>
          </div>

          {/* Provider */}
          <div className="flex items-start space-x-3">
            <User className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Provider</p>
              <p className="text-base text-foreground" data-testid="text-provider-name">
                {appointment.staffName || 'Provider'}
              </p>
            </div>
          </div>

          {/* Location */}
          {appointment.locationName && (
            <div className="flex items-start space-x-3">
              <MapPin className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Location</p>
                <p className="text-base text-foreground" data-testid="text-location-name">
                  {appointment.locationName}
                </p>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="flex items-start space-x-3">
            <Calendar className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Date</p>
              <p className="text-base text-foreground" data-testid="text-appointment-date">
                {formatDateInTimezone(appointment.startTime, appointment.timezone || 'America/New_York', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-start space-x-3">
            <Clock className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Time</p>
              <p className="text-base text-foreground" data-testid="text-appointment-time">
                {formatTimeInTimezone(appointment.startTime, appointment.timezone || 'America/New_York')} - {appointment.endTime ? formatTimeInTimezone(appointment.endTime, appointment.timezone || 'America/New_York') : 'N/A'}
              </p>
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-start space-x-3">
            <Timer className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Duration</p>
              <p className="text-base text-foreground" data-testid="text-appointment-duration">
                {appointment.endTime ? Math.round((new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime()) / (1000 * 60)) : 'N/A'} minutes
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge 
                className={getStatusBadgeClass(appointment.status || 'pending')}
                data-testid="badge-appointment-status"
              >
                {formatStatus(appointment.status || 'pending')}
              </Badge>
            </div>
          </div>

          {/* Price */}
          {appointment.totalAmount && (
            <div className="flex items-start space-x-3">
              <DollarSign className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Price</p>
                <p className="text-base font-semibold text-foreground" data-testid="text-appointment-price">
                  ${parseFloat(appointment.totalAmount).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          {appointment.notes && (
            <div className="flex items-start space-x-3">
              <FileText className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-base text-foreground" data-testid="text-appointment-notes">
                  {appointment.notes}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
