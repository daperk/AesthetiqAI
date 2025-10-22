import { useState, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Gem } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function PatientLogin() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/c/:slug/login");
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    emailOrUsername: "",
    password: "",
    organizationSlug: params?.slug || "",
  });

  // Fetch location/clinic info to display
  const { data: clinicInfo, isLoading: isLoadingClinic, error: clinicError } = useQuery<{
    id: string;
    name: string;
    slug: string;
    organizationId?: string;
    organizationName?: string;
    description?: string;
    website?: string;
    whiteLabelSettings?: any;
    isLocation?: boolean;
  }>({
    queryKey: ["/api/signup-info", params?.slug],
    queryFn: () => apiRequest("GET", `/api/signup-info/${params?.slug}`).then(res => res.json()),
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

  // Use patient-specific login endpoint
  const loginMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/auth/patient-login", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Welcome back!",
        description: "You have been successfully signed in.",
      });
      setLocation("/patient"); // Redirect to patient dashboard
    },
    onError: (error: any) => {
      // Check if it's a wrong clinic error
      if (error.message?.includes("not associated with this clinic")) {
        toast({
          title: "Wrong Clinic",
          description: "Your account is not associated with this clinic. Please use your clinic's login page.",
          variant: "destructive",
        });
      } else if (error.message?.includes("This login is for patient accounts only")) {
        toast({
          title: "Wrong Login Page",
          description: "Clinic staff should use the main login page.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sign in failed",
          description: error.message || "Please check your credentials and try again.",
          variant: "destructive",
        });
      }
    },
  });

  if (!match || !params?.slug) {
    return (
      <div className="min-h-screen luxury-gradient flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-serif text-destructive">Invalid Link</CardTitle>
            <CardDescription>
              This patient login link is invalid. Please contact your clinic for a valid login link.
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
    loginMutation.mutate(formData);
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
            <CardTitle className="text-2xl font-serif text-destructive">Clinic Not Found</CardTitle>
            <CardDescription>
              We couldn't find this clinic. Please check your login link or contact your clinic.
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
          <CardTitle className="text-2xl font-serif" data-testid="text-patient-login-title">
            Patient Sign In
          </CardTitle>
          <CardDescription>
            Sign in to book appointments and manage your beauty journey at {clinicInfo?.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emailOrUsername">Email or Username</Label>
              <Input
                id="emailOrUsername"
                name="emailOrUsername"
                type="text"
                placeholder="Enter your email or username"
                value={formData.emailOrUsername}
                onChange={handleChange}
                required
                data-testid="input-email"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                data-testid="input-password"
              />
            </div>

            {/* Hidden field for clinic association */}
            <input type="hidden" name="organizationSlug" value={params?.slug || ""} />

            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={loginMutation.isPending}
              data-testid="button-sign-in"
            >
              {loginMutation.isPending ? (
                <div className="flex items-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span>Signing in...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link 
                href={`/c/${params?.slug}/register`} 
                className="text-primary hover:underline" 
                data-testid="link-register"
              >
                Join {clinicInfo?.name}
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