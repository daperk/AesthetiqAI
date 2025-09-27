import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon, Clock, User, MapPin, CreditCard,
  ChevronRight, Check, ArrowLeft, Star, DollarSign
} from "lucide-react";
import type { Service, Staff, Location, BookingAvailability } from "@/types";

interface BookingStep {
  id: string;
  title: string;
  completed: boolean;
}

export default function Booking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Staff | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [paymentType, setPaymentType] = useState<"full" | "deposit">("full");
  const [notes, setNotes] = useState("");

  const steps: BookingStep[] = [
    { id: "location", title: "Choose Location", completed: !!selectedLocation },
    { id: "service", title: "Select Service", completed: !!selectedService },
    { id: "provider", title: "Choose Provider", completed: !!selectedProvider },
    { id: "datetime", title: "Date & Time", completed: !!selectedDate && !!selectedTime },
    { id: "payment", title: "Payment", completed: !!paymentType },
    { id: "confirm", title: "Confirm", completed: false }
  ];

  const { data: locations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    staleTime: 5 * 60000,
  });

  const { data: services } = useQuery<Service[]>({
    queryKey: ["/api/services", selectedLocation],
    enabled: !!selectedLocation,
    staleTime: 5 * 60000,
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff", selectedLocation, selectedService?.id],
    enabled: !!selectedLocation && !!selectedService,
    staleTime: 5 * 60000,
  });

  const { data: availability } = useQuery<BookingAvailability>({
    queryKey: ["/api/availability", selectedProvider?.id, selectedDate?.toISOString()],
    enabled: !!selectedProvider && !!selectedDate,
    staleTime: 30000,
  });

  const bookAppointmentMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      const response = await apiRequest("POST", "/api/appointments", bookingData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Appointment booked!",
        description: "Your appointment has been successfully scheduled.",
      });
      // Reset form
      setCurrentStep(0);
      setSelectedLocation("");
      setSelectedService(null);
      setSelectedProvider(null);
      setSelectedDate(undefined);
      setSelectedTime("");
      setNotes("");
    },
    onError: () => {
      toast({
        title: "Booking failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleConfirmBooking = () => {
    if (!selectedService || !selectedProvider || !selectedDate || !selectedTime) {
      toast({
        title: "Incomplete booking",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const [hours, minutes] = selectedTime.split(':');
    const startTime = new Date(selectedDate);
    startTime.setHours(parseInt(hours), parseInt(minutes));
    
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + selectedService.duration);

    bookAppointmentMutation.mutate({
      serviceId: selectedService.id,
      staffId: selectedProvider.id,
      locationId: selectedLocation,
      startTime,
      endTime,
      notes,
      paymentType
    });
  };

  const getCurrentStepContent = () => {
    switch (currentStep) {
      case 0: // Location
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" data-testid="text-location-step-title">Choose Location</h3>
            <div className="grid gap-4">
              {locations?.map((location) => (
                <Card 
                  key={location.id}
                  className={`cursor-pointer transition-colors ${selectedLocation === location.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedLocation(location.id)}
                  data-testid={`location-option-${location.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <MapPin className="w-5 h-5 text-primary" />
                        <div>
                          <div className="font-medium">{location.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {location.phone}
                          </div>
                        </div>
                      </div>
                      {selectedLocation === location.id && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 1: // Service
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" data-testid="text-service-step-title">Select Service</h3>
            <div className="grid gap-4">
              {services?.map((service) => (
                <Card 
                  key={service.id}
                  className={`cursor-pointer transition-colors ${selectedService?.id === service.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedService(service)}
                  data-testid={`service-option-${service.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{service.name}</div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {service.description}
                        </div>
                        <div className="flex items-center space-x-4 text-sm">
                          <span className="flex items-center text-muted-foreground">
                            <Clock className="w-4 h-4 mr-1" />
                            {service.duration} min
                          </span>
                          <span className="flex items-center text-muted-foreground">
                            <DollarSign className="w-4 h-4 mr-1" />
                            ${service.price}
                          </span>
                        </div>
                      </div>
                      {selectedService?.id === service.id && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 2: // Provider
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" data-testid="text-provider-step-title">Choose Provider</h3>
            <div className="grid gap-4">
              {staff?.map((provider) => (
                <Card 
                  key={provider.id}
                  className={`cursor-pointer transition-colors ${selectedProvider?.id === provider.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedProvider(provider)}
                  data-testid={`provider-option-${provider.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{provider.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {provider.specialties && Array.isArray(provider.specialties) 
                              ? (provider.specialties as string[]).join(", ")
                              : "Specialist"}
                          </div>
                          <div className="flex items-center mt-1">
                            <Star className="w-4 h-4 text-yellow-500 fill-current" />
                            <span className="text-sm text-muted-foreground ml-1">4.9</span>
                          </div>
                        </div>
                      </div>
                      {selectedProvider?.id === provider.id && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 3: // Date & Time
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold" data-testid="text-datetime-step-title">Select Date & Time</h3>
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-2 block">Choose Date</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date() || date.getDay() === 0} // Disable past dates and Sundays
                  className="rounded-md border"
                  data-testid="calendar-date-picker"
                />
              </div>
              
              {selectedDate && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Available Times</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {availability?.slots?.map((slot) => (
                      <Button
                        key={slot.time}
                        variant={selectedTime === slot.time ? "default" : "outline"}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className="justify-center"
                        data-testid={`time-slot-${slot.time}`}
                      >
                        {slot.time}
                      </Button>
                    )) || (
                      // Default time slots if no availability data
                      <>
                        {["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"].map((time) => (
                          <Button
                            key={time}
                            variant={selectedTime === time ? "default" : "outline"}
                            onClick={() => setSelectedTime(time)}
                            className="justify-center"
                            data-testid={`time-slot-${time}`}
                          >
                            {time}
                          </Button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 4: // Payment
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold" data-testid="text-payment-step-title">Payment Options</h3>
            
            <RadioGroup value={paymentType} onValueChange={(value: "full" | "deposit") => setPaymentType(value)}>
              <Card className={`cursor-pointer ${paymentType === "full" ? "ring-2 ring-primary" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="full" id="full" />
                    <Label htmlFor="full" className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Pay Full Amount</div>
                          <div className="text-sm text-muted-foreground">Complete payment now</div>
                        </div>
                        <div className="text-lg font-bold">${selectedService?.price || 0}</div>
                      </div>
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {selectedService?.depositRequired && (
                <Card className={`cursor-pointer ${paymentType === "deposit" ? "ring-2 ring-primary" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="deposit" id="deposit" />
                      <Label htmlFor="deposit" className="flex-1 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">Pay Deposit</div>
                            <div className="text-sm text-muted-foreground">Remaining balance due at appointment</div>
                          </div>
                          <div className="text-lg font-bold">${selectedService?.depositAmount || 0}</div>
                        </div>
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              )}
            </RadioGroup>

            <div className="space-y-2">
              <Label htmlFor="notes">Special Requests (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requests or notes for your appointment..."
                data-testid="input-booking-notes"
              />
            </div>
          </div>
        );

      case 5: // Confirm
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold" data-testid="text-confirm-step-title">Confirm Your Booking</h3>
            
            <Card>
              <CardHeader>
                <CardTitle>Appointment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service:</span>
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="font-medium">{selectedProvider?.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{selectedDate?.toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time:</span>
                  <span className="font-medium">{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{selectedService?.duration} minutes</span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>
                      ${paymentType === "deposit" 
                        ? selectedService?.depositAmount || 0
                        : selectedService?.price || 0}
                    </span>
                  </div>
                  {paymentType === "deposit" && (
                    <div className="text-sm text-muted-foreground mt-1">
                      Remaining ${(Number(selectedService?.price) || 0) - (Number(selectedService?.depositAmount) || 0)} due at appointment
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Special Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-booking-title">
            Book Your Appointment
          </h1>
          <p className="text-muted-foreground">Schedule your next beauty and wellness experience</p>
        </div>

        {/* Progress Steps */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center" data-testid={`step-${step.id}`}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    index === currentStep 
                      ? 'bg-primary text-primary-foreground' 
                      : step.completed 
                        ? 'bg-green-500 text-white' 
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {step.completed ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className={`ml-2 text-sm ${
                    index === currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}>
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground mx-4" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step Content */}
        <Card className="mb-8">
          <CardContent className="p-6">
            {getCurrentStepContent()}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={handlePrevious}
            disabled={currentStep === 0}
            data-testid="button-previous-step"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <div className="flex items-center space-x-4">
            {currentStep === steps.length - 1 ? (
              <Button 
                onClick={handleConfirmBooking}
                disabled={bookAppointmentMutation.isPending}
                className="bg-primary text-primary-foreground"
                data-testid="button-confirm-booking"
              >
                {bookAppointmentMutation.isPending ? (
                  <div className="flex items-center space-x-2">
                    <LoadingSpinner size="sm" />
                    <span>Booking...</span>
                  </div>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Confirm Booking
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={handleNext}
                disabled={!steps[currentStep].completed}
                data-testid="button-next-step"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
