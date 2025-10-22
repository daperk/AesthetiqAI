import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import LoadingSpinner from "@/components/ui/loading-spinner";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Settings2, Mail, MessageSquare, Bell, Palette, Globe, 
  CreditCard, Shield, Building, Users, Plus, Edit, Trash2,
  Save, RefreshCw
} from "lucide-react";

interface Location {
  id: string;
  organizationId: string;
  name: string;
  businessHours?: {
    [key: string]: { open: string; close: string } | null;
  };
}

interface MessageTemplate {
  id: string;
  name: string;
  type: "sms" | "email";
  subject?: string;
  content: string;
  variables: string[];
  isDefault: boolean;
  category: string;
}

type DayBusinessHours = {
  open: string;
  close: string;
  isClosed: boolean;
};

export default function Settings() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("general");
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  // Business hours state for each day
  const [businessHours, setBusinessHours] = useState<Record<string, DayBusinessHours>>({
    monday: { open: "09:00", close: "18:00", isClosed: false },
    tuesday: { open: "09:00", close: "18:00", isClosed: false },
    wednesday: { open: "09:00", close: "18:00", isClosed: false },
    thursday: { open: "09:00", close: "18:00", isClosed: false },
    friday: { open: "09:00", close: "18:00", isClosed: false },
    saturday: { open: "09:00", close: "18:00", isClosed: false },
    sunday: { open: "09:00", close: "18:00", isClosed: true },
  });

  // Fetch locations
  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: !!organization?.id,
  });

  // Get primary location (first location for now)
  const primaryLocation = locations?.[0];

  // Initialize business hours from location data
  useEffect(() => {
    if (primaryLocation?.businessHours) {
      const updatedHours: Record<string, DayBusinessHours> = {};
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      
      days.forEach(day => {
        const dayHours = primaryLocation.businessHours?.[day];
        if (dayHours === null || dayHours === undefined) {
          updatedHours[day] = { open: "09:00", close: "18:00", isClosed: true };
        } else {
          updatedHours[day] = {
            open: dayHours.open || "09:00",
            close: dayHours.close || "18:00",
            isClosed: false
          };
        }
      });
      
      setBusinessHours(updatedHours);
    }
  }, [primaryLocation]);

  // Fetch message templates
  const { data: templates, isLoading: templatesLoading } = useQuery<MessageTemplate[]>({
    queryKey: [`/api/message-templates/${organization?.id}`],
    enabled: !!organization?.id,
  });

  // Initialize default templates
  const initializeTemplatesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/message-templates/${organization?.id}/initialize`,
        {}
      );
      if (!response.ok) throw new Error("Failed to initialize templates");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/message-templates/${organization?.id}`] });
      toast({
        title: "Templates initialized",
        description: "Default message templates have been created.",
      });
    },
  });

  // Update organization settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "PUT",
        `/api/organizations/${organization?.id}`,
        data
      );
      if (!response.ok) throw new Error("Failed to update settings");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({
        title: "Settings updated",
        description: "Your organization settings have been saved.",
      });
    },
  });

  // Save business hours mutation
  const saveBusinessHoursMutation = useMutation({
    mutationFn: async () => {
      if (!primaryLocation) throw new Error("No location found");

      // Transform state into API format (null for closed days)
      const formattedHours: Record<string, { open: string; close: string } | null> = {};
      Object.keys(businessHours).forEach(day => {
        const dayHours = businessHours[day];
        formattedHours[day] = dayHours.isClosed ? null : {
          open: dayHours.open,
          close: dayHours.close
        };
      });

      const response = await apiRequest(
        "PUT",
        `/api/locations/${primaryLocation.id}`,
        { businessHours: formattedHours }
      );
      if (!response.ok) throw new Error("Failed to save business hours");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({
        title: "Business hours saved",
        description: "Your business hours have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving business hours",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handler to update business hours for a specific day
  const updateDayHours = (day: string, field: 'open' | 'close' | 'isClosed', value: string | boolean) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }));
  };

  if (!organization) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-7xl mx-auto px-6 py-12">
          <Alert>
            <AlertDescription>Loading organization settings...</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization settings and configurations
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="general" data-testid="tab-general">
              <Building className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates">
              <Mail className="w-4 h-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="billing" data-testid="tab-billing">
              <CreditCard className="w-4 h-4 mr-2" />
              Billing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Information</CardTitle>
                <CardDescription>
                  Basic information about your organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      value={organization.name}
                      disabled
                      data-testid="input-org-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-email">Contact Email</Label>
                    <Input
                      id="org-email"
                      type="email"
                      placeholder={organization.email || "contact@example.com"}
                      data-testid="input-org-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-phone">Phone Number</Label>
                  <Input
                    id="org-phone"
                    type="tel"
                    placeholder={organization.phone || "+1 (555) 123-4567"}
                    data-testid="input-org-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-address">Address</Label>
                  <Textarea
                    id="org-address"
                    placeholder="Enter your business address"
                    rows={3}
                    data-testid="textarea-org-address"
                  />
                </div>
                <Button
                  onClick={() => updateSettingsMutation.mutate({})}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-general"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Business Hours</CardTitle>
                <CardDescription>
                  Set your regular business operating hours
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {locationsLoading ? (
                  <div className="flex justify-center py-4">
                    <LoadingSpinner />
                  </div>
                ) : !primaryLocation ? (
                  <Alert>
                    <AlertDescription>No location found. Please create a location first.</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => {
                      const dayKey = day.toLowerCase();
                      const dayHours = businessHours[dayKey];
                      
                      return (
                        <div key={day} className="flex items-center justify-between">
                          <Label className="w-24">{day}</Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              type="time"
                              value={dayHours.open}
                              onChange={(e) => updateDayHours(dayKey, 'open', e.target.value)}
                              disabled={dayHours.isClosed}
                              className="w-32"
                              data-testid={`input-${dayKey}-open`}
                            />
                            <span>to</span>
                            <Input
                              type="time"
                              value={dayHours.close}
                              onChange={(e) => updateDayHours(dayKey, 'close', e.target.value)}
                              disabled={dayHours.isClosed}
                              className="w-32"
                              data-testid={`input-${dayKey}-close`}
                            />
                            <Switch
                              checked={dayHours.isClosed}
                              onCheckedChange={(checked) => updateDayHours(dayKey, 'isClosed', checked)}
                              data-testid={`switch-${dayKey}-closed`}
                            />
                            <span className="text-sm text-muted-foreground">Closed</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-4 border-t">
                      <Button
                        onClick={() => saveBusinessHoursMutation.mutate()}
                        disabled={saveBusinessHoursMutation.isPending}
                        data-testid="button-save-business-hours"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {saveBusinessHoursMutation.isPending ? "Saving..." : "Save Business Hours"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Message Templates</CardTitle>
                <CardDescription>
                  Customize SMS and email templates for automated communications
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!templates || templates.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No templates found</h3>
                    <p className="text-muted-foreground mb-4">
                      Initialize default templates to get started
                    </p>
                    <Button
                      onClick={() => initializeTemplatesMutation.mutate()}
                      disabled={initializeTemplatesMutation.isPending}
                      data-testid="button-initialize-templates"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Initialize Default Templates
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-medium">Available Templates</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => initializeTemplatesMutation.mutate()}
                        data-testid="button-reset-templates"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reset to Defaults
                      </Button>
                    </div>
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="border rounded-lg p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium">{template.name}</h4>
                            <Badge variant={template.type === "sms" ? "secondary" : "default"}>
                              {template.type.toUpperCase()}
                            </Badge>
                            <Badge variant="outline">{template.category}</Badge>
                            {template.isDefault && (
                              <Badge variant="outline">Default</Badge>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingTemplate(template.id)}
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              data-testid={`button-delete-template-${template.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        {template.subject && (
                          <p className="text-sm text-muted-foreground">
                            <strong>Subject:</strong> {template.subject}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {template.content.substring(0, 150)}
                          {template.content.length > 150 && "..."}
                        </p>
                        {template.variables.length > 0 && (
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-muted-foreground">Variables:</span>
                            {template.variables.map((variable) => (
                              <Badge key={variable} variant="secondary" className="text-xs">
                                {`{{${variable}}}`}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Configure how and when notifications are sent
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Appointment Reminders</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reminder-24h">24 hours before appointment</Label>
                      <Switch id="reminder-24h" defaultChecked data-testid="switch-reminder-24h" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reminder-2h">2 hours before appointment</Label>
                      <Switch id="reminder-2h" defaultChecked data-testid="switch-reminder-2h" />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Marketing Communications</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="marketing-birthday">Birthday greetings</Label>
                      <Switch id="marketing-birthday" defaultChecked data-testid="switch-marketing-birthday" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="marketing-membership">Membership renewals</Label>
                      <Switch id="marketing-membership" defaultChecked data-testid="switch-marketing-membership" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="marketing-promotions">Promotional campaigns</Label>
                      <Switch id="marketing-promotions" data-testid="switch-marketing-promotions" />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Delivery Channels</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="channel-sms">SMS Notifications</Label>
                      <Switch id="channel-sms" defaultChecked data-testid="switch-channel-sms" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="channel-email">Email Notifications</Label>
                      <Switch id="channel-email" defaultChecked data-testid="switch-channel-email" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="channel-push">Push Notifications</Label>
                      <Switch id="channel-push" data-testid="switch-channel-push" />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => updateSettingsMutation.mutate({})}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-notifications"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Subscription & Billing</CardTitle>
                <CardDescription>
                  Manage your subscription plan and billing information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Current Plan</h3>
                    <p className="text-sm text-muted-foreground">
                      {organization.subscriptionPlan || "Professional"} Plan
                    </p>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Billing Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Next billing date</Label>
                      <p className="text-sm font-medium">January 1, 2025</p>
                    </div>
                    <div>
                      <Label className="text-xs">Monthly amount</Label>
                      <p className="text-sm font-medium">
                        ${organization.subscriptionPlan === "Enterprise" ? "149" : "79"}/month
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button variant="outline" data-testid="button-manage-billing">
                    Manage Billing
                  </Button>
                  <Button variant="outline" data-testid="button-upgrade-plan">
                    Upgrade Plan
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>
                  Manage your payment methods for subscriptions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">•••• •••• •••• 4242</p>
                        <p className="text-sm text-muted-foreground">Expires 12/25</p>
                      </div>
                    </div>
                    <Badge variant="secondary">Default</Badge>
                  </div>
                  <Button variant="outline" className="w-full" data-testid="button-add-payment">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Payment Method
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}