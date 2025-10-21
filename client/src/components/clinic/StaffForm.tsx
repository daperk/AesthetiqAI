import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { apiRequest } from "@/lib/api";
import { X } from "lucide-react";
import type { Staff, Service, StaffRole } from "@/types";

const staffFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["admin", "provider", "receptionist"]),
  roleId: z.string().optional(),
  title: z.string().min(1, "Job title is required"),
  specialties: z.array(z.string()).optional(),
  bio: z.string().optional(),
  commissionRate: z.coerce.number().min(0).max(100).optional(),
  commissionType: z.enum(["percentage", "fixed"]).optional(),
  hourlyRate: z.coerce.number().min(0).optional(),
  canBookOnline: z.boolean().default(true),
  isActive: z.boolean().default(true),
  serviceIds: z.array(z.string()).optional(),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

interface StaffFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: Staff | null;
  mode?: "create" | "edit";
}

export default function StaffForm({
  open,
  onOpenChange,
  staff,
  mode = "create",
}: StaffFormProps) {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [specialtyInput, setSpecialtyInput] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);

  // Fetch services
  const { data: services } = useQuery<Service[]>({
    queryKey: ["/api/services", organization?.id],
    enabled: !!organization?.id,
  });

  // Fetch staff roles
  const { data: staffRoles } = useQuery<StaffRole[]>({
    queryKey: ["/api/staff/roles", organization?.id],
    enabled: !!organization?.id,
  });

  // Fetch current staff services if editing
  const { data: staffServices } = useQuery<Service[]>({
    queryKey: ["/api/staff/services", staff?.id],
    enabled: !!staff?.id && mode === "edit",
  });

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "provider",
      title: "",
      specialties: [],
      bio: "",
      commissionRate: 15,
      commissionType: "percentage",
      hourlyRate: 0,
      canBookOnline: true,
      isActive: true,
      serviceIds: [],
    },
  });

  // Update form when staff data changes
  useEffect(() => {
    if (staff && mode === "edit") {
      // Parse staff user data (this would come from a joined query in a real app)
      form.reset({
        email: staff.email || "",
        firstName: staff.firstName || "",
        lastName: staff.lastName || "",
        role: staff.role,
        roleId: staff.roleId || undefined,
        title: staff.title || "",
        specialties: Array.isArray(staff.specialties) ? staff.specialties as string[] : [],
        bio: staff.bio || "",
        commissionRate: staff.commissionRate ? parseFloat(staff.commissionRate.toString()) : 15,
        commissionType: staff.commissionType || "percentage",
        hourlyRate: staff.hourlyRate ? parseFloat(staff.hourlyRate.toString()) : 0,
        canBookOnline: staff.canBookOnline ?? true,
        isActive: staff.isActive ?? true,
        serviceIds: [],
      });
      
      if (Array.isArray(staff.specialties)) {
        setSpecialties(staff.specialties as string[]);
      }
    }
  }, [staff, mode, form]);

  useEffect(() => {
    if (staffServices) {
      setSelectedServices(staffServices.map(s => s.id));
      form.setValue("serviceIds", staffServices.map(s => s.id));
    }
  }, [staffServices, form]);

  const createStaffMutation = useMutation({
    mutationFn: async (data: StaffFormValues) => {
      // Use the new staff invitation endpoint
      const response = await apiRequest("POST", "/api/staff/invite", {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        title: data.title,
        commissionRate: data.commissionRate,
        commissionType: data.commissionType,
        hourlyRate: data.hourlyRate,
        serviceIds: data.serviceIds || [],
      });
      
      return await response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      
      // Show appropriate message based on email status
      const emailSent = result.emailStatus?.sent;
      const invitationInfo = result.invitation;
      
      if (emailSent) {
        toast({
          title: "Staff member invited successfully",
          description: `An invitation email has been sent to ${result.staff.email}.`,
        });
      } else {
        // If email failed but staff was created, show credentials
        toast({
          title: "Staff member created",
          description: (
            <div className="space-y-2">
              <p>Staff member was created successfully, but the invitation email could not be sent.</p>
              <p className="font-mono text-sm">
                Email: {invitationInfo.sentTo}<br/>
                Password: {invitationInfo.temporaryPassword}
              </p>
              <p className="text-xs text-muted-foreground">Please share these credentials manually.</p>
            </div>
          ) as any,
          duration: 10000, // Show for longer since it contains important info
        });
      }
      
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to invite staff member",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateStaffMutation = useMutation({
    mutationFn: async (data: StaffFormValues) => {
      if (!staff?.id) throw new Error("Staff ID is required");
      
      // Update staff record
      const response = await apiRequest("PUT", `/api/staff/${staff.id}`, {
        role: data.role,
        roleId: data.roleId === "none" ? null : data.roleId,
        title: data.title,
        specialties: data.specialties || [],
        bio: data.bio,
        commissionRate: data.commissionRate,
        commissionType: data.commissionType,
        hourlyRate: data.hourlyRate,
        canBookOnline: data.canBookOnline,
        isActive: data.isActive,
      });
      
      const updatedStaff = await response.json();
      
      // Update service assignments
      // First, get current services
      const currentServicesResponse = await fetch(`/api/staff/services/${staff.id}`);
      const currentServices = await currentServicesResponse.json();
      const currentServiceIds = currentServices.map((s: Service) => s.id);
      
      // Remove services that are no longer selected
      for (const serviceId of currentServiceIds) {
        if (!data.serviceIds?.includes(serviceId)) {
          await apiRequest("DELETE", `/api/staff/services/${staff.id}/${serviceId}`);
        }
      }
      
      // Add new services
      for (const serviceId of (data.serviceIds || [])) {
        if (!currentServiceIds.includes(serviceId)) {
          await apiRequest("POST", "/api/staff/services", {
            staffId: staff.id,
            serviceId,
          });
        }
      }
      
      return updatedStaff;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/services"] });
      toast({
        title: "Staff member updated",
        description: "The staff member has been successfully updated.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update staff member",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StaffFormValues) => {
    data.specialties = specialties;
    data.serviceIds = selectedServices;
    
    if (mode === "create") {
      createStaffMutation.mutate(data);
    } else {
      updateStaffMutation.mutate(data);
    }
  };

  const handleAddSpecialty = () => {
    if (specialtyInput.trim() && !specialties.includes(specialtyInput.trim())) {
      setSpecialties([...specialties, specialtyInput.trim()]);
      setSpecialtyInput("");
    }
  };

  const handleRemoveSpecialty = (specialty: string) => {
    setSpecialties(specialties.filter(s => s !== specialty));
  };

  const toggleService = (serviceId: string) => {
    setSelectedServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add New Staff Member" : "Edit Staff Member"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new staff member account for your clinic."
              : "Update staff member information and permissions."}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Personal Information</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="John" data-testid="input-staff-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Doe" data-testid="input-staff-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {mode === "create" && (
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="staff@example.com" data-testid="input-staff-email" />
                      </FormControl>
                      <FormDescription>
                        A temporary password will be sent to this email
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            
            {/* Role and Position */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Role & Position</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-staff-role">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="provider">Provider</SelectItem>
                          <SelectItem value="receptionist">Receptionist</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-custom-role">
                            <SelectValue placeholder="Select custom role (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {staffRoles?.map(role => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Assign a custom role with specific permissions
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Senior Aesthetician" data-testid="input-staff-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Specialties */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Specialties</h3>
              
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={specialtyInput}
                    onChange={(e) => setSpecialtyInput(e.target.value)}
                    placeholder="Add a specialty (e.g., Botox, Facials)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSpecialty();
                      }
                    }}
                    data-testid="input-staff-specialty"
                  />
                  <Button
                    type="button"
                    onClick={handleAddSpecialty}
                    variant="outline"
                    data-testid="button-add-specialty"
                  >
                    Add
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {specialties.map((specialty) => (
                    <Badge key={specialty} variant="secondary">
                      {specialty}
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialty(specialty)}
                        className="ml-1 hover:text-destructive"
                        data-testid={`button-remove-specialty-${specialty}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Services */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Services</h3>
              <FormDescription>
                Select which services this staff member can perform
              </FormDescription>
              
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {services?.map((service) => (
                  <div key={service.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={service.id}
                      checked={selectedServices.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                      data-testid={`checkbox-service-${service.id}`}
                    />
                    <label
                      htmlFor={service.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {service.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Compensation */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Compensation</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="commissionRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="15.00"
                          data-testid="input-staff-commission"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Rate ($)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="25.00"
                          data-testid="input-staff-hourly"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            {/* Bio */}
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Brief bio and qualifications"
                      className="min-h-[100px]"
                      data-testid="input-staff-bio"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Settings</h3>
              
              <FormField
                control={form.control}
                name="canBookOnline"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Can Book Online</FormLabel>
                      <FormDescription>
                        Allow clients to book appointments with this staff member online
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-can-book-online"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Active staff members can log in and appear in schedules
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-staff-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            
            {/* Actions */}
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createStaffMutation.isPending || updateStaffMutation.isPending}
                data-testid="button-save-staff"
              >
                {createStaffMutation.isPending || updateStaffMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    {mode === "create" ? "Creating..." : "Updating..."}
                  </>
                ) : (
                  mode === "create" ? "Create Staff Member" : "Update Staff Member"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}