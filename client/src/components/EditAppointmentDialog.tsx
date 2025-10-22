import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Save } from "lucide-react";
import type { Appointment, Client, Staff, Service } from "@/types";

interface EditAppointmentDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Zod schema for appointment validation
const appointmentSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  serviceId: z.string().min(1, "Service is required"),
  staffId: z.string().min(1, "Provider is required"),
  locationId: z.string().min(1, "Location is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  status: z.enum(["pending", "scheduled", "confirmed", "in_progress", "completed", "canceled", "no_show"]),
  notes: z.string().optional(),
}).refine((data) => {
  // Validate that end time is after start time
  if (data.startTime && data.endTime) {
    return new Date(data.endTime) > new Date(data.startTime);
  }
  return true;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

// Helper function to convert UTC timestamp to local datetime-local format
const toLocalDatetimeString = (date: string | Date | null | undefined): string => {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function EditAppointmentDialog({
  appointment,
  open,
  onOpenChange,
  onSuccess,
}: EditAppointmentDialogProps) {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dropdown data
  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: !!organization?.id && open,
  });

  const { data: services } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    enabled: !!organization?.id && open,
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
    enabled: !!organization?.id && open,
  });

  const { data: locations } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    enabled: !!organization?.id && open,
  });

  // Initialize form
  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      clientId: "",
      serviceId: "",
      staffId: "",
      locationId: "",
      startTime: "",
      endTime: "",
      status: "scheduled",
      notes: "",
    },
  });

  // Pre-populate form when appointment changes
  useEffect(() => {
    if (appointment && open) {
      form.reset({
        clientId: (appointment as any).clientId || "",
        serviceId: (appointment as any).serviceId || "",
        staffId: (appointment as any).staffId || "",
        locationId: (appointment as any).locationId || "",
        startTime: toLocalDatetimeString((appointment as any).startTime),
        endTime: toLocalDatetimeString((appointment as any).endTime),
        status: (appointment as any).status || "scheduled",
        notes: (appointment as any).notes || "",
      });
    }
  }, [appointment, open, form]);

  // Update appointment mutation
  const updateAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentFormData) => {
      if (!(appointment as any)?.id) throw new Error("No appointment ID");
      
      const response = await apiRequest("PATCH", `/api/appointments/${(appointment as any).id}`, {
        clientId: data.clientId,
        serviceId: data.serviceId,
        staffId: data.staffId,
        locationId: data.locationId,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        status: data.status,
        notes: data.notes || "",
      });
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate appointments cache
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      
      // Show success toast
      toast({
        title: "Appointment updated",
        description: "The appointment has been successfully updated.",
      });
      
      // Call onSuccess callback
      onSuccess?.();
      
      // Close dialog
      onOpenChange(false);
    },
    onError: (error: any) => {
      const isConflict = error.message?.includes('409') || error.message?.includes('conflict');
      toast({
        title: isConflict ? "Time slot conflict" : "Failed to update appointment",
        description: isConflict 
          ? "This time slot is already booked. Please choose a different time."
          : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AppointmentFormData) => {
    updateAppointmentMutation.mutate(data);
  };

  const handleCancel = () => {
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Appointment</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Client Field */}
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-client">
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.firstName} {client.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location Field */}
              <FormField
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-location">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations?.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Service Field */}
            <FormField
              control={form.control}
              name="serviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-service">
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {services?.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} - ${service.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Staff/Provider Field */}
            <FormField
              control={form.control}
              name="staffId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider/Staff *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-staff">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {staff?.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* Start Time Field */}
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time *</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-edit-start-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* End Time Field */}
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time *</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-edit-end-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status Field */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="canceled">Canceled</SelectItem>
                      <SelectItem value="no_show">No Show</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes Field */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional notes or requirements"
                      {...field}
                      data-testid="input-edit-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={updateAppointmentMutation.isPending}
                data-testid="button-edit-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateAppointmentMutation.isPending}
                data-testid="button-edit-save"
              >
                {updateAppointmentMutation.isPending ? (
                  <div className="flex items-center space-x-2">
                    <LoadingSpinner size="sm" />
                    <span>Saving...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </div>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
