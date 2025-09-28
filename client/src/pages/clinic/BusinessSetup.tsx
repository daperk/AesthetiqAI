import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, Circle, CreditCard, Calendar, Gift, Sparkles, ArrowRight, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";

interface BusinessSetupStatus {
  stripeConnected: boolean;
  hasServices: boolean;
  hasMemberships: boolean;
  hasRewards: boolean;
  hasPatients: boolean;
  allComplete: boolean;
}

const serviceFormSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  description: z.string().min(1, "Description is required"),
  price: z.string().min(1, "Price is required"),
  duration: z.string().min(1, "Duration is required"),
  category: z.string().min(1, "Category is required")
});

const membershipFormSchema = z.object({
  name: z.string().min(1, "Membership name is required"),
  description: z.string().min(1, "Description is required"),
  monthlyPrice: z.string().min(1, "Monthly price is required"),
  yearlyPrice: z.string().optional()
});

const rewardFormSchema = z.object({
  name: z.string().min(1, "Reward name is required"),
  description: z.string().min(1, "Description is required"),
  pointsCost: z.string().min(1, "Points cost is required"),
  category: z.string().min(1, "Category is required")
});

const patientInviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional()
});

type ServiceFormData = z.infer<typeof serviceFormSchema>;
type MembershipFormData = z.infer<typeof membershipFormSchema>;
type RewardFormData = z.infer<typeof rewardFormSchema>;
type PatientInviteData = z.infer<typeof patientInviteSchema>;

export default function BusinessSetup() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Forms
  const serviceForm = useForm<ServiceFormData>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      duration: "60",
      category: "facial"
    }
  });

  const membershipForm = useForm<MembershipFormData>({
    resolver: zodResolver(membershipFormSchema),
    defaultValues: {
      name: "",
      description: "",
      monthlyPrice: "",
      yearlyPrice: "",
      benefits: [],
      discountPercentage: 0
    }
  });

  const rewardForm = useForm<RewardFormData>({
    resolver: zodResolver(rewardFormSchema),
    defaultValues: {
      name: "",
      description: "",
      pointsCost: "",
      category: "discount"
    }
  });

  const patientInviteForm = useForm<PatientInviteData>({
    resolver: zodResolver(patientInviteSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: ""
    }
  });

  // Check setup status
  const { data: setupStatus, isLoading: statusLoading } = useQuery<BusinessSetupStatus>({
    queryKey: ['/api/clinic/setup-status'],
  });

  // Set current step based on setup status
  useEffect(() => {
    if (setupStatus) {
      if (!setupStatus.stripeConnected) {
        setCurrentStep(1);
      } else if (!setupStatus.hasServices) {
        setCurrentStep(2);
      } else if (!setupStatus.hasMemberships) {
        setCurrentStep(3);
      } else if (!setupStatus.hasRewards) {
        setCurrentStep(4);
      } else if (!setupStatus.hasPatients) {
        setCurrentStep(5);
      } else if (setupStatus.allComplete) {
        // Setup complete, redirect to dashboard
        setLocation('/clinic');
      }
    }
  }, [setupStatus, setLocation]);

  // Stripe Connect mutations
  const createStripeAccount = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/stripe-connect/create-account", "POST");
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Stripe account created successfully!" });
      if (data.onboardingUrl) {
        window.open(data.onboardingUrl, '_blank');
      }
      // Force refresh setup status after short delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create Stripe account",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  // Service mutation
  const createService = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      const serviceData = {
        name: data.name,
        description: data.description,
        price: parseFloat(data.price),
        duration: parseInt(data.duration),
        category: data.category
      };
      const response = await apiRequest("/api/services", "POST", serviceData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Service created successfully!" });
      serviceForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      setCurrentStep(3);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create service",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  // Membership mutation
  const createMembership = useMutation({
    mutationFn: async (data: MembershipFormData) => {
      const membershipData = {
        name: data.name,
        description: data.description,
        monthlyPrice: parseFloat(data.monthlyPrice),
        yearlyPrice: data.yearlyPrice ? parseFloat(data.yearlyPrice) : undefined,
        benefits: [
          "Priority booking",
          "Exclusive member pricing", 
          "Monthly consultation included"
        ],
        discountPercentage: 10
      };
      const response = await apiRequest("/api/memberships", "POST", membershipData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Membership plan created successfully!" });
      membershipForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      setCurrentStep(4);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create membership",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  // Patient invitation mutation
  const invitePatient = useMutation({
    mutationFn: async (data: PatientInviteData) => {
      const response = await apiRequest("/api/patients/invite", "POST", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Patient invitation sent successfully!" });
      patientInviteForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      // Complete setup and redirect to dashboard
      toast({
        title: "Business setup complete!",
        description: "Welcome to Aesthiq. Your clinic is ready to accept bookings."
      });
      setTimeout(() => setLocation('/clinic'), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  // Reward mutation
  const createReward = useMutation({
    mutationFn: async (data: RewardFormData) => {
      const rewardData = {
        name: data.name,
        description: data.description,
        pointsCost: parseInt(data.pointsCost),
        category: data.category
      };
      const response = await apiRequest("/api/rewards", "POST", rewardData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Reward program created successfully!" });
      rewardForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/setup-status'] });
      setCurrentStep(5);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create reward",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading setup status...</p>
        </div>
      </div>
    );
  }

  const steps = [
    {
      number: 1,
      title: "Payment Setup",
      description: "Connect Stripe for payment processing",
      icon: CreditCard,
      complete: setupStatus?.stripeConnected || false
    },
    {
      number: 2,
      title: "First Service",
      description: "Create your first beauty service",
      icon: Calendar,
      complete: setupStatus?.hasServices || false
    },
    {
      number: 3,
      title: "Membership Plan",
      description: "Set up membership tiers",
      icon: Sparkles,
      complete: setupStatus?.hasMemberships || false
    },
    {
      number: 4,
      title: "Rewards Program",
      description: "Create customer rewards",
      icon: Gift,
      complete: setupStatus?.hasRewards || false
    },
    {
      number: 5,
      title: "Invite Patients",
      description: "Send your first patient invitation",
      icon: Users,
      complete: setupStatus?.hasPatients || false
    }
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary mb-2">Complete Your Business Setup</h1>
        <p className="text-muted-foreground">
          Let's get your clinic ready to accept bookings. Complete all steps to unlock your dashboard.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex justify-between mb-8">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.number;
          const isComplete = step.complete;
          
          return (
            <div key={step.number} className="flex flex-col items-center flex-1">
              <div className={`
                flex items-center justify-center w-12 h-12 rounded-full border-2 mb-2
                ${isComplete ? 'bg-green-500 border-green-500 text-white' : 
                  isActive ? 'bg-primary border-primary text-white' : 
                  'bg-background border-muted-foreground text-muted-foreground'}
              `}>
                {isComplete ? (
                  <CheckCircle className="w-6 h-6" />
                ) : (
                  <Icon className="w-6 h-6" />
                )}
              </div>
              <div className="text-center">
                <div className={`font-medium text-sm ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {step.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {step.description}
                </div>
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground absolute translate-x-16" />
              )}
            </div>
          );
        })}
      </div>

      <Separator className="mb-8" />

      {/* Step 1: Stripe Connect Setup */}
      {currentStep === 1 && (
        <Card data-testid="card-stripe-setup">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Processing Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                <strong>Required:</strong> Connect your Stripe account to accept payments from clients. 
                This enables appointment bookings, membership subscriptions, and reward redemptions.
              </AlertDescription>
            </Alert>
            
            <div className="text-center py-6">
              <Button
                onClick={() => createStripeAccount.mutate()}
                disabled={createStripeAccount.isPending}
                size="lg"
                data-testid="button-create-stripe-account"
              >
                {createStripeAccount.isPending ? "Creating Account..." : "Connect Stripe Account"}
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                You'll be redirected to Stripe to complete the setup process
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: First Service */}
      {currentStep === 2 && (
        <Card data-testid="card-service-setup">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Create Your First Service
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...serviceForm}>
              <form onSubmit={serviceForm.handleSubmit((data) => createService.mutate(data))} className="space-y-4">
                <FormField
                  control={serviceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Botox Treatment" {...field} data-testid="input-service-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={serviceForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Describe your service..." {...field} data-testid="input-service-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={serviceForm.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="299.00" {...field} data-testid="input-service-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={serviceForm.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (minutes)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="60" {...field} data-testid="input-service-duration" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={serviceForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-service-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="facial">Facial</SelectItem>
                            <SelectItem value="botox">Botox</SelectItem>
                            <SelectItem value="filler">Filler</SelectItem>
                            <SelectItem value="laser">Laser Treatment</SelectItem>
                            <SelectItem value="chemical_peel">Chemical Peel</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={createService.isPending} data-testid="button-create-service">
                  {createService.isPending ? "Creating Service..." : "Create Service"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Membership Plan */}
      {currentStep === 3 && (
        <Card data-testid="card-membership-setup">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Create Your First Membership Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...membershipForm}>
              <form onSubmit={membershipForm.handleSubmit((data) => createMembership.mutate(data))} className="space-y-4">
                <FormField
                  control={membershipForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Membership Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Premium Membership" {...field} data-testid="input-membership-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={membershipForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Describe membership benefits..." {...field} data-testid="input-membership-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={membershipForm.control}
                    name="monthlyPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Price ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="99.00" {...field} data-testid="input-membership-monthly-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={membershipForm.control}
                    name="yearlyPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Yearly Price (Optional)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="999.00" {...field} data-testid="input-membership-yearly-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={createMembership.isPending} data-testid="button-create-membership">
                  {createMembership.isPending ? "Creating Membership..." : "Create Membership Plan"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Rewards Program */}
      {currentStep === 4 && (
        <Card data-testid="card-rewards-setup">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Create Your First Reward
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...rewardForm}>
              <form onSubmit={rewardForm.handleSubmit((data) => createReward.mutate(data))} className="space-y-4">
                <FormField
                  control={rewardForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reward Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 10% Off Next Service" {...field} data-testid="input-reward-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={rewardForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Describe the reward..." {...field} data-testid="input-reward-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={rewardForm.control}
                    name="pointsCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Points Cost</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="500" {...field} data-testid="input-reward-points" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={rewardForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-reward-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="discount">Discount</SelectItem>
                            <SelectItem value="free_service">Free Service</SelectItem>
                            <SelectItem value="product">Product</SelectItem>
                            <SelectItem value="upgrade">Upgrade</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={createReward.isPending} data-testid="button-create-reward">
                  {createReward.isPending ? "Creating Reward..." : "Create Reward Program"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Patient Invitation */}
      {currentStep === 5 && (
        <Card data-testid="card-patient-invite-setup">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Invite Your First Patient
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="mb-6">
              <AlertDescription>
                <strong>Final Step:</strong> Invite your first patient to complete your clinic setup. 
                Patients can only access your clinic through your unique invitation link - this ensures 
                complete privacy and security for your practice.
              </AlertDescription>
            </Alert>

            <Form {...patientInviteForm}>
              <form onSubmit={patientInviteForm.handleSubmit((data) => invitePatient.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={patientInviteForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Sarah" {...field} data-testid="input-patient-first-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={patientInviteForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Johnson" {...field} data-testid="input-patient-last-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={patientInviteForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="sarah@example.com" {...field} data-testid="input-patient-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={patientInviteForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number (Optional)</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-patient-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">📧 What happens next?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Patient receives an email invitation with your clinic's unique link</li>
                    <li>• They can register using /c/[your-clinic-slug] for secure access</li>
                    <li>• Once registered, your business setup will be complete</li>
                  </ul>
                </div>

                <Button type="submit" disabled={invitePatient.isPending} size="lg" className="w-full" data-testid="button-invite-patient">
                  {invitePatient.isPending ? "Sending Invitation..." : "Send Invitation & Complete Setup"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}