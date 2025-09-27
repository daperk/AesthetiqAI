import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { PatientBrandingProvider } from "@/components/BrandingProvider";
import NotFound from "@/pages/not-found";

// Pages
import Home from "@/pages/Home";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ClinicRegister from "@/pages/auth/ClinicRegister";
import Subscribe from "@/pages/pricing/Subscribe";

// Super Admin Pages
import SuperAdminDashboard from "@/pages/super-admin/Dashboard";
import Organizations from "@/pages/super-admin/Organizations";
import Plans from "@/pages/super-admin/Plans";

// Clinic Pages
import ClinicDashboard from "@/pages/clinic/Dashboard";
import Appointments from "@/pages/clinic/Appointments";
import Clients from "@/pages/clinic/Clients";
import Memberships from "@/pages/clinic/Memberships";
import Staff from "@/pages/clinic/Staff";
import Reports from "@/pages/clinic/Reports";

// Patient Pages
import PatientDashboard from "@/pages/patient/Dashboard";
import Booking from "@/pages/patient/Booking";
import PatientMembership from "@/pages/patient/Membership";
import Rewards from "@/pages/patient/Rewards";

import LoadingSpinner from "@/components/ui/loading-spinner";

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/register/clinic/:slug" component={ClinicRegister} />
      <Route path="/subscribe" component={Subscribe} />
      
      {/* Protected Routes */}
      {user && (
        <>
          {/* Super Admin Routes */}
          {user.role === "super_admin" && (
            <>
              <Route path="/super-admin" component={SuperAdminDashboard} />
              <Route path="/super-admin/organizations" component={Organizations} />
              <Route path="/super-admin/plans" component={Plans} />
            </>
          )}
          
          {/* Clinic Routes */}
          {(user.role === "clinic_admin" || user.role === "staff") && (
            <>
              <Route path="/clinic" component={ClinicDashboard} />
              <Route path="/clinic/appointments" component={Appointments} />
              <Route path="/clinic/clients" component={Clients} />
              <Route path="/clinic/memberships" component={Memberships} />
              <Route path="/clinic/staff" component={Staff} />
              <Route path="/clinic/reports" component={Reports} />
            </>
          )}
          
          {/* Patient Routes */}
          {user.role === "patient" && (
            <PatientBrandingProvider>
              <Route path="/patient" component={PatientDashboard} />
              <Route path="/patient/booking" component={Booking} />
              <Route path="/patient/membership" component={PatientMembership} />
              <Route path="/patient/rewards" component={Rewards} />
            </PatientBrandingProvider>
          )}
        </>
      )}
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
