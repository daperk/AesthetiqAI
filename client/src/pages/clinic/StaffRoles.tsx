import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ClinicNav from "@/components/ClinicNav";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePaymentRequired } from "@/hooks/usePaymentRequired";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, Plus, Edit2, Trash2, AlertCircle, Settings, 
  Calendar, Users, CreditCard, Scissors, Mail, Copy 
} from "lucide-react";
import type { StaffRole } from "@/types";

interface Permission {
  key: string;
  label: string;
  description: string;
}

interface PermissionCategory {
  name: string;
  icon: React.ReactNode;
  permissions: Permission[];
}

const permissionCategories: PermissionCategory[] = [
  {
    name: "Appointments",
    icon: <Calendar className="w-4 h-4" />,
    permissions: [
      { key: "appointments.view", label: "View Appointments", description: "Can view appointment calendar" },
      { key: "appointments.create", label: "Create Appointments", description: "Can book new appointments" },
      { key: "appointments.edit", label: "Edit Appointments", description: "Can modify existing appointments" },
      { key: "appointments.cancel", label: "Cancel Appointments", description: "Can cancel appointments" },
    ],
  },
  {
    name: "Clients",
    icon: <Users className="w-4 h-4" />,
    permissions: [
      { key: "clients.view", label: "View Clients", description: "Can view client information" },
      { key: "clients.create", label: "Create Clients", description: "Can add new clients" },
      { key: "clients.edit", label: "Edit Clients", description: "Can modify client information" },
      { key: "clients.delete", label: "Delete Clients", description: "Can remove clients from system" },
    ],
  },
  {
    name: "Payments",
    icon: <CreditCard className="w-4 h-4" />,
    permissions: [
      { key: "payments.process", label: "Process Payments", description: "Can process transactions" },
      { key: "payments.refund", label: "Issue Refunds", description: "Can refund payments" },
      { key: "payments.viewReports", label: "View Reports", description: "Can access financial reports" },
      { key: "payments.editPricing", label: "Edit Pricing", description: "Can modify service prices" },
    ],
  },
  {
    name: "Services",
    icon: <Scissors className="w-4 h-4" />,
    permissions: [
      { key: "services.view", label: "View Services", description: "Can view service menu" },
      { key: "services.create", label: "Create Services", description: "Can add new services" },
      { key: "services.edit", label: "Edit Services", description: "Can modify service details" },
      { key: "services.setPricing", label: "Set Pricing", description: "Can set service prices" },
    ],
  },
  {
    name: "Marketing",
    icon: <Mail className="w-4 h-4" />,
    permissions: [
      { key: "marketing.sendCampaigns", label: "Send Campaigns", description: "Can send marketing emails/SMS" },
      { key: "marketing.viewAnalytics", label: "View Analytics", description: "Can access marketing analytics" },
      { key: "marketing.manageTemplates", label: "Manage Templates", description: "Can create/edit templates" },
      { key: "marketing.exportData", label: "Export Data", description: "Can export client data" },
    ],
  },
  {
    name: "Settings",
    icon: <Settings className="w-4 h-4" />,
    permissions: [
      { key: "settings.view", label: "View Settings", description: "Can view clinic settings" },
      { key: "settings.edit", label: "Edit Settings", description: "Can modify clinic settings" },
      { key: "settings.manageStaff", label: "Manage Staff", description: "Can manage staff accounts" },
      { key: "settings.manageRoles", label: "Manage Roles", description: "Can create/edit roles" },
    ],
  },
];

const defaultRoleTemplates = [
  {
    name: "Manager",
    description: "Full access to all features except financial settings",
    permissions: {
      "appointments.view": true,
      "appointments.create": true,
      "appointments.edit": true,
      "appointments.cancel": true,
      "clients.view": true,
      "clients.create": true,
      "clients.edit": true,
      "payments.process": true,
      "payments.viewReports": true,
      "services.view": true,
      "services.edit": true,
      "marketing.sendCampaigns": true,
      "marketing.viewAnalytics": true,
      "settings.view": true,
      "settings.manageStaff": true,
    },
  },
  {
    name: "Service Provider",
    description: "Can manage appointments and view client information",
    permissions: {
      "appointments.view": true,
      "appointments.create": true,
      "appointments.edit": true,
      "clients.view": true,
      "services.view": true,
    },
  },
  {
    name: "Receptionist",
    description: "Can manage appointments and clients but not financial data",
    permissions: {
      "appointments.view": true,
      "appointments.create": true,
      "appointments.edit": true,
      "appointments.cancel": true,
      "clients.view": true,
      "clients.create": true,
      "clients.edit": true,
      "services.view": true,
    },
  },
  {
    name: "Marketing Specialist",
    description: "Focus on marketing and client engagement",
    permissions: {
      "clients.view": true,
      "marketing.sendCampaigns": true,
      "marketing.viewAnalytics": true,
      "marketing.manageTemplates": true,
      "marketing.exportData": true,
    },
  },
];

export default function StaffRolesPage() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { isLoading: paymentLoading, hasAccess } = usePaymentRequired();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<Record<string, boolean>>({});
  const [editRoleName, setEditRoleName] = useState("");
  const [editRolePermissions, setEditRolePermissions] = useState<Record<string, boolean>>({});

  const { data: staffRoles, isLoading: rolesLoading } = useQuery<StaffRole[]>({
    queryKey: ["/api/staff/roles", organization?.id],
    enabled: !!organization?.id,
  });

  const createRoleMutation = useMutation({
    mutationFn: async (data: { name: string; permissions: Record<string, boolean> }) => {
      const response = await apiRequest("POST", "/api/staff/roles", {
        organizationId: organization?.id,
        name: data.name,
        permissions: data.permissions,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/roles"] });
      setIsCreateDialogOpen(false);
      setNewRoleName("");
      setNewRolePermissions({});
      toast({
        title: "Role created",
        description: "The new role has been successfully created.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create role",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; permissions: Record<string, boolean> }) => {
      const response = await apiRequest("PUT", `/api/staff/roles/${data.id}`, {
        name: data.name,
        permissions: data.permissions,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/roles"] });
      setIsEditDialogOpen(false);
      setSelectedRole(null);
      toast({
        title: "Role updated",
        description: "The role has been successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update role",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const response = await apiRequest("DELETE", `/api/staff/roles/${roleId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/roles"] });
      toast({
        title: "Role deleted",
        description: "The role has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete role",
        description: "This role may be in use by staff members.",
        variant: "destructive",
      });
    },
  });

  const initializeDefaultRolesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/staff/roles/initialize/${organization?.id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/roles"] });
      toast({
        title: "Default roles created",
        description: "Default role templates have been added to your organization.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create default roles",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateRole = () => {
    if (!newRoleName.trim()) {
      toast({
        title: "Role name required",
        description: "Please enter a name for the new role.",
        variant: "destructive",
      });
      return;
    }
    createRoleMutation.mutate({ name: newRoleName, permissions: newRolePermissions });
  };

  const handleUpdateRole = () => {
    if (!selectedRole || !editRoleName.trim()) return;
    updateRoleMutation.mutate({
      id: selectedRole.id,
      name: editRoleName,
      permissions: editRolePermissions,
    });
  };

  const handleEditRole = (role: StaffRole) => {
    setSelectedRole(role);
    setEditRoleName(role.name);
    setEditRolePermissions(role.permissions as Record<string, boolean> || {});
    setIsEditDialogOpen(true);
  };

  const handleApplyTemplate = (template: typeof defaultRoleTemplates[0]) => {
    setNewRoleName(template.name);
    setNewRolePermissions(template.permissions);
    toast({
      title: "Template applied",
      description: `"${template.name}" template has been applied. You can customize it further.`,
    });
  };

  const togglePermission = (permissionKey: string, isEdit: boolean = false) => {
    if (isEdit) {
      setEditRolePermissions(prev => ({
        ...prev,
        [permissionKey]: !prev[permissionKey],
      }));
    } else {
      setNewRolePermissions(prev => ({
        ...prev,
        [permissionKey]: !prev[permissionKey],
      }));
    }
  };

  const getPermissionCount = (permissions: Record<string, boolean>) => {
    return Object.values(permissions).filter(Boolean).length;
  };

  if (rolesLoading || paymentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-roles-title">
            Staff Roles & Permissions
          </h1>
          <p className="text-muted-foreground mb-4">
            Create custom roles with specific permissions for your staff members
          </p>
          <ClinicNav />
        </div>

        {/* Quick Actions */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-role">
                <Plus className="w-4 h-4 mr-2" />
                Create Custom Role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Role</DialogTitle>
                <DialogDescription>
                  Define a custom role with specific permissions for your staff
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Role Name */}
                <div className="space-y-2">
                  <Label htmlFor="roleName">Role Name</Label>
                  <Input
                    id="roleName"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g., Senior Therapist"
                    data-testid="input-role-name"
                  />
                </div>

                {/* Templates */}
                <div className="space-y-2">
                  <Label>Start from a template (optional)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {defaultRoleTemplates.map((template) => (
                      <Button
                        key={template.name}
                        variant="outline"
                        size="sm"
                        onClick={() => handleApplyTemplate(template)}
                        data-testid={`button-template-${template.name}`}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        {template.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Permissions */}
                <div className="space-y-4">
                  <Label>Permissions</Label>
                  {permissionCategories.map((category) => (
                    <Card key={category.name}>
                      <CardHeader className="py-3">
                        <div className="flex items-center space-x-2">
                          {category.icon}
                          <CardTitle className="text-sm">{category.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0">
                        {category.permissions.map((permission) => (
                          <div
                            key={permission.key}
                            className="flex items-center space-x-2 py-1"
                          >
                            <Checkbox
                              id={permission.key}
                              checked={newRolePermissions[permission.key] || false}
                              onCheckedChange={() => togglePermission(permission.key)}
                              data-testid={`checkbox-permission-${permission.key}`}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={permission.key}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {permission.label}
                              </label>
                              <p className="text-xs text-muted-foreground">
                                {permission.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel-create"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateRole}
                    disabled={createRoleMutation.isPending}
                    data-testid="button-save-role"
                  >
                    {createRoleMutation.isPending ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Creating...
                      </>
                    ) : (
                      "Create Role"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {(!staffRoles || staffRoles.length === 0) && (
            <Button
              variant="outline"
              onClick={() => initializeDefaultRolesMutation.mutate()}
              disabled={initializeDefaultRolesMutation.isPending}
              data-testid="button-init-defaults"
            >
              {initializeDefaultRolesMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Add Default Role Templates
                </>
              )}
            </Button>
          )}
        </div>

        {/* Existing Roles */}
        <Card>
          <CardHeader>
            <CardTitle data-testid="text-existing-roles-title">Existing Roles</CardTitle>
            <CardDescription>
              Manage custom roles and their permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!staffRoles || staffRoles.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4" data-testid="text-no-roles">
                  No custom roles created yet
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create custom roles to define specific permissions for different staff positions
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {staffRoles.map((role) => (
                  <div
                    key={role.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`role-item-${role.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <Shield className="w-4 h-4 text-primary" />
                        <h3 className="font-medium">{role.name}</h3>
                        <Badge variant="secondary">
                          {getPermissionCount(role.permissions as Record<string, boolean> || {})} permissions
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(role.permissions as Record<string, boolean> || {})
                          .filter(([_, hasPermission]) => hasPermission)
                          .slice(0, 5)
                          .map(([key]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key.split('.')[1]}
                            </Badge>
                          ))}
                        {Object.entries(role.permissions as Record<string, boolean> || {})
                          .filter(([_, hasPermission]) => hasPermission).length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{Object.entries(role.permissions as Record<string, boolean> || {})
                              .filter(([_, hasPermission]) => hasPermission).length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRole(role)}
                        data-testid={`button-edit-role-${role.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteRoleMutation.mutate(role.id)}
                        data-testid={`button-delete-role-${role.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Role Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
              <DialogDescription>
                Modify the permissions for this role
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Role Name */}
              <div className="space-y-2">
                <Label htmlFor="editRoleName">Role Name</Label>
                <Input
                  id="editRoleName"
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  placeholder="e.g., Senior Therapist"
                  data-testid="input-edit-role-name"
                />
              </div>

              {/* Permissions */}
              <div className="space-y-4">
                <Label>Permissions</Label>
                {permissionCategories.map((category) => (
                  <Card key={category.name}>
                    <CardHeader className="py-3">
                      <div className="flex items-center space-x-2">
                        {category.icon}
                        <CardTitle className="text-sm">{category.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {category.permissions.map((permission) => (
                        <div
                          key={permission.key}
                          className="flex items-center space-x-2 py-1"
                        >
                          <Checkbox
                            id={`edit-${permission.key}`}
                            checked={editRolePermissions[permission.key] || false}
                            onCheckedChange={() => togglePermission(permission.key, true)}
                            data-testid={`checkbox-edit-permission-${permission.key}`}
                          />
                          <div className="flex-1">
                            <label
                              htmlFor={`edit-${permission.key}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {permission.label}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {permission.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateRole}
                  disabled={updateRoleMutation.isPending}
                  data-testid="button-update-role"
                >
                  {updateRoleMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Updating...
                    </>
                  ) : (
                    "Update Role"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Info Alert */}
        <Alert className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>About Staff Roles</AlertTitle>
          <AlertDescription>
            Custom roles allow you to create specific permission sets for different positions in your clinic.
            Each staff member can be assigned a system role (Admin, Provider, Receptionist) and optionally
            a custom role for more granular permission control.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}