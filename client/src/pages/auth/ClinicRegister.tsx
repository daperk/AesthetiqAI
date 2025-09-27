import { useState, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { BrandingProvider, useBranding, useBrandedName, useBrandedLogo } from "@/components/BrandingProvider";
import { Gem, Loader2, AlertCircle } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ClinicRegisterFormProps {
  organizationSlug: string;
}

function ClinicRegisterForm({ organizationSlug }: ClinicRegisterFormProps) {
  const [, setLocation] = useLocation();
  const { register, isRegisterPending } = useAuth();
  const { organization, isLoading: brandingLoading, error: brandingError } = useBranding();
  const brandedName = useBrandedName();
  const brandedLogo = useBrandedLogo();
  
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Include organizationSlug in registration data
      await register({
        ...formData,
        role: "patient", // Enforced for clinic registration
        organizationSlug
      });
      setLocation("/patient"); // Redirect to patient dashboard
    } catch (error) {
      // Error is handled by the useAuth hook
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  if (brandingLoading) {
    return (
      <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center space-y-4">
              <LoadingSpinner size="lg" />
              <p className="text-muted-foreground">Loading clinic information...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (brandingError || !organization) {
    return (
      <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {brandingError || "Clinic not found. Please check the URL and try again."}
              </AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            {brandedLogo ? (
              <img src={brandedLogo} alt={`${brandedName} logo`} className="w-10 h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 gold-shimmer rounded-lg flex items-center justify-center">
                <Gem className="text-primary-foreground text-lg" />
              </div>
            )}
            <span className="text-2xl font-serif font-bold text-foreground">{brandedName}</span>
          </div>
          <CardTitle className="text-2xl font-serif" data-testid="text-clinic-register-title">
            Join {organization.name}
          </CardTitle>
          <CardDescription>
            Create your patient account to book appointments and manage your treatments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  placeholder="First name"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  placeholder="Last name"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  data-testid="input-last-name"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                required
                data-testid="input-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                placeholder="Choose a username"
                value={formData.username}
                onChange={handleChange}
                required
                data-testid="input-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="Your phone number"
                value={formData.phone}
                onChange={handleChange}
                data-testid="input-phone"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Create a password"
                value={formData.password}
                onChange={handleChange}
                required
                data-testid="input-password"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isRegisterPending}
              data-testid="button-create-account"
            >
              {isRegisterPending ? (
                <div className="flex items-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span>Creating Account...</span>
                </div>
              ) : (
                "Create Patient Account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                Sign in
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              By creating an account, you agree to receive communications from {organization.name}.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClinicRegister() {
  const [match, params] = useRoute("/register/clinic/:slug");
  const organizationSlug = params?.slug;

  if (!match || !organizationSlug) {
    return (
      <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Invalid clinic registration URL. Please check the link and try again.
              </AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <BrandingProvider organizationSlug={organizationSlug}>
      <ClinicRegisterForm organizationSlug={organizationSlug} />
    </BrandingProvider>
  );
}