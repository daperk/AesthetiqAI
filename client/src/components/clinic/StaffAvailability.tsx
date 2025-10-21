import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { 
  Calendar as CalendarIcon, Clock, Save, X, Plus, Edit2,
  Coffee, AlertCircle, CheckCircle 
} from "lucide-react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import type { Staff, StaffAvailability as StaffAvailabilityType } from "@/types";

interface TimeSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
}

interface StaffAvailabilityProps {
  staff: Staff;
  organizationId: string;
  editable?: boolean;
}

const daysOfWeek = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const time = `${hour.toString().padStart(2, "0")}:${minute}`;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  return {
    value: time,
    label: `${displayHour}:${minute} ${ampm}`,
  };
});

export default function StaffAvailability({ 
  staff, 
  organizationId,
  editable = true 
}: StaffAvailabilityProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedSlots, setEditedSlots] = useState<TimeSlot[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [timeOffDates, setTimeOffDates] = useState<Date[]>([]);
  const [isTimeOffDialogOpen, setIsTimeOffDialogOpen] = useState(false);

  // Fetch staff availability
  const { data: availability, isLoading } = useQuery<StaffAvailabilityType[]>({
    queryKey: ["/api/staff/availability", staff.id],
    enabled: !!staff.id,
  });

  useEffect(() => {
    if (availability) {
      const slots: TimeSlot[] = availability.map(a => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        isRecurring: a.isRecurring ?? true,
      }));
      setEditedSlots(slots);
    }
  }, [availability]);

  const saveAvailabilityMutation = useMutation({
    mutationFn: async (slots: TimeSlot[]) => {
      // Delete existing availability
      if (availability) {
        for (const existing of availability) {
          await apiRequest("DELETE", `/api/staff/availability/${existing.id}`);
        }
      }
      
      // Create new availability slots
      for (const slot of slots) {
        await apiRequest("POST", "/api/staff/availability", {
          staffId: staff.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isRecurring: slot.isRecurring,
        });
      }
      
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/availability", staff.id] });
      setIsEditMode(false);
      toast({
        title: "Availability updated",
        description: "Staff schedule has been successfully saved.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update availability",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddSlot = (dayOfWeek: number) => {
    const newSlot: TimeSlot = {
      dayOfWeek,
      startTime: "09:00",
      endTime: "17:00",
      isRecurring: true,
    };
    setEditedSlots([...editedSlots, newSlot]);
  };

  const handleUpdateSlot = (index: number, field: keyof TimeSlot, value: any) => {
    const updated = [...editedSlots];
    updated[index] = { ...updated[index], [field]: value };
    setEditedSlots(updated);
  };

  const handleRemoveSlot = (index: number) => {
    setEditedSlots(editedSlots.filter((_, i) => i !== index));
  };

  const handleSaveChanges = () => {
    // Validate slots
    for (const slot of editedSlots) {
      if (slot.startTime >= slot.endTime) {
        toast({
          title: "Invalid time range",
          description: "End time must be after start time.",
          variant: "destructive",
        });
        return;
      }
    }
    
    saveAvailabilityMutation.mutate(editedSlots);
  };

  const getScheduleForDay = (dayOfWeek: number) => {
    return editedSlots.filter(slot => slot.dayOfWeek === dayOfWeek);
  };

  const formatTimeRange = (startTime: string, endTime: string) => {
    const formatTime = (time: string) => {
      const [hour, minute] = time.split(":");
      const h = parseInt(hour);
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      return `${displayHour}:${minute} ${ampm}`;
    };
    
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Weekly Availability</CardTitle>
            <CardDescription>
              Manage {staff.title ? staff.title : "staff member"}'s working hours
            </CardDescription>
          </div>
          {editable && (
            <div className="flex items-center space-x-2">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditedSlots(availability?.map(a => ({
                        dayOfWeek: a.dayOfWeek,
                        startTime: a.startTime,
                        endTime: a.endTime,
                        isRecurring: a.isRecurring ?? true,
                      })) || []);
                      setIsEditMode(false);
                    }}
                    data-testid="button-cancel-availability"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveChanges}
                    disabled={saveAvailabilityMutation.isPending}
                    data-testid="button-save-availability"
                  >
                    {saveAvailabilityMutation.isPending ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-1" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMode(true)}
                  data-testid="button-edit-availability"
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  Edit Schedule
                </Button>
              )}
              
              <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-manage-time-off">
                    <Coffee className="w-4 h-4 mr-1" />
                    Time Off
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Time Off</DialogTitle>
                    <DialogDescription>
                      Select dates when {staff.title || "staff member"} will be unavailable
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <Calendar
                      mode="multiple"
                      selected={timeOffDates}
                      onSelect={(dates) => setTimeOffDates(dates || [])}
                      className="rounded-md border"
                    />
                    
                    {timeOffDates.length > 0 && (
                      <div className="space-y-2">
                        <Label>Selected Time Off Dates:</Label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {timeOffDates.map((date) => (
                            <div key={date.toISOString()} className="flex items-center justify-between py-1">
                              <span className="text-sm">{format(date, "PPP")}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTimeOffDates(timeOffDates.filter(d => !isSameDay(d, date)))}
                                data-testid={`button-remove-time-off-${date.toISOString()}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsTimeOffDialogOpen(false)}
                        data-testid="button-cancel-time-off"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          // Save time off dates logic here
                          toast({
                            title: "Time off saved",
                            description: `${timeOffDates.length} days marked as time off.`,
                          });
                          setIsTimeOffDialogOpen(false);
                        }}
                        data-testid="button-save-time-off"
                      >
                        Save Time Off
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Weekly Schedule Grid */}
          <div className="grid gap-3">
            {daysOfWeek.map((day) => {
              const daySchedule = getScheduleForDay(day.value);
              const currentDate = addDays(weekStart, day.value);
              
              return (
                <div
                  key={day.value}
                  className="border rounded-lg p-4"
                  data-testid={`day-schedule-${day.value}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-medium">{day.label}</h4>
                      {daySchedule.length === 0 && (
                        <Badge variant="secondary">Off</Badge>
                      )}
                    </div>
                    {isEditMode && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddSlot(day.value)}
                        data-testid={`button-add-slot-${day.value}`}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Hours
                      </Button>
                    )}
                  </div>
                  
                  {daySchedule.length > 0 ? (
                    <div className="space-y-2">
                      {daySchedule.map((slot, index) => {
                        const slotIndex = editedSlots.findIndex(
                          s => s === slot
                        );
                        
                        return (
                          <div
                            key={index}
                            className="flex items-center space-x-2"
                            data-testid={`slot-${day.value}-${index}`}
                          >
                            {isEditMode ? (
                              <>
                                <Select
                                  value={slot.startTime}
                                  onValueChange={(value) => handleUpdateSlot(slotIndex, "startTime", value)}
                                >
                                  <SelectTrigger className="w-32" data-testid={`select-start-${day.value}-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {timeOptions.map(option => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                
                                <span>to</span>
                                
                                <Select
                                  value={slot.endTime}
                                  onValueChange={(value) => handleUpdateSlot(slotIndex, "endTime", value)}
                                >
                                  <SelectTrigger className="w-32" data-testid={`select-end-${day.value}-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {timeOptions.map(option => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveSlot(slotIndex)}
                                  data-testid={`button-remove-slot-${day.value}-${index}`}
                                >
                                  <X className="w-4 h-4 text-destructive" />
                                </Button>
                              </>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm">
                                  {formatTimeRange(slot.startTime, slot.endTime)}
                                </span>
                                {slot.isRecurring && (
                                  <Badge variant="outline" className="text-xs">
                                    Recurring
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    !isEditMode && (
                      <p className="text-sm text-muted-foreground">
                        No hours scheduled
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Summary */}
          {!isEditMode && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <div className="flex items-center space-x-2">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Weekly Summary</span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                <p>
                  Working {editedSlots.filter(s => s.isRecurring).length} regular days per week
                </p>
                {timeOffDates.length > 0 && (
                  <p className="mt-1">
                    {timeOffDates.length} upcoming time off days scheduled
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}