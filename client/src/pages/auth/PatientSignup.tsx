import { useState, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Gem } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useQuery } from "@tanstack/react-query";

export default function PatientSignup() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/c/:slug");
  const { register, isRegisterPending } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "patient",
    organizationSlug: params?.slug || "",
  });

  // Fetch clinic info to display
  const { data: clinicInfo, isLoading: isLoadingClinic, error: clinicError } = useQuery<{
    id: string;
    name: string;
    slug: string;
    description?: string;
    website?: string;
    whiteLabelSettings?: any;
  }>({
    queryKey: ["/api/organizations/by-slug", params?.slug],
    enabled: !!params?.slug,
    retry: false, // Don't retry on 404
  });

  useEffect(() => {
    if (params?.slug) {
      setFormData(prev => ({
        ...prev,
        organizationSlug: params.slug
      }));
    }
  }, [params?.slug]);

  if (!match || !params?.slug) {
    return (
      <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-serif text-destructive">Invalid Link</CardTitle>
            <CardDescription>
              This patient signup link is invalid. Please contact your clinic for a valid invitation link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className="block w-full">
              <Button className="w-full">Return to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await register(formData);
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

  if (isLoadingClinic) {
    return (
      <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Show error if clinic not found
  if (clinicError || !clinicInfo) {
    return (
      <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-serif text-destructive">Invalid Link</CardTitle>
            <CardDescription>
              This patient signup link is invalid. Please contact your clinic for a valid invitation link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className="block w-full">
              <Button className="w-full">Return to Home</Button>
            </Link>
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
            <div className="w-10 h-10 gold-shimmer rounded-lg flex items-center justify-center">
              <Gem className="text-primary-foreground text-lg" />
            </div>
            <span className="text-2xl font-serif font-bold text-foreground">
              {clinicInfo?.name || "Beauty Clinic"}
            </span>
          </div>
          <CardTitle className="text-2xl font-serif" data-testid="text-patient-signup-title">
            Join {clinicInfo?.name || "Our Clinic"}
          </CardTitle>
          <CardDescription>
            Create your account to book appointments and manage your beauty journey.
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

            {/* Hidden fields for clinic association */}
            <input type="hidden" name="role" value="patient" />
            <input type="hidden" name="organizationSlug" value={params.slug} />

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
                "Join Clinic"
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
              Powered by <span className="font-semibold">Aesthiq</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}