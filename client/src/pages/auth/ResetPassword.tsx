import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [, params] = useRoute("/reset-password/:token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/auth/reset-password", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Password Reset Successful",
        description: "Your password has been reset. You can now log in with your new password.",
      });
      
      // Redirect based on user role
      if (data?.user?.role === "patient" && data?.user?.organizationSlug) {
        setLocation(`/c/${data.user.organizationSlug}/patient/login`);
      } else {
        setLocation("/login");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Password Reset Failed",
        description: error.message || "Invalid or expired reset token. Please request a new password reset.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast({
        title: "Invalid Password",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both password fields match.",
        variant: "destructive",
      });
      return;
    }

    if (!params?.token) {
      toast({
        title: "Invalid Link",
        description: "This password reset link is invalid.",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate({
      token: params.token,
      newPassword,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
            Reset Your Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                data-testid="input-new-password"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                data-testid="input-confirm-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
              disabled={resetPasswordMutation.isPending}
              data-testid="button-reset-password"
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting Password...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <a href="/login" className="text-amber-600 hover:text-amber-700" data-testid="link-back-to-login">
              Back to Login
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
