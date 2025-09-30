import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { Gem, ChevronDown, Menu, X } from "lucide-react";

export default function Navigation() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setIsMobileMenuOpen(false);
  };

  const getDashboardUrl = () => {
    switch (user?.role) {
      case "super_admin":
        return "/super-admin";
      case "clinic_admin":
      case "staff":
        return "/clinic";
      case "patient":
        return "/patient";
      default:
        return "/";
    }
  };

  const isActive = (path: string) => location === path;

  return (
    <nav className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 gold-shimmer rounded-lg flex items-center justify-center">
                <Gem className="text-primary-foreground text-lg" />
              </div>
              <span className="text-2xl font-serif font-bold text-foreground">Aesthiq</span>
            </Link>
            
            <div className="hidden md:flex items-center space-x-6">
              {!user ? (
                // Marketing navigation for guests
                <>
                  <Link
                    href="/#features"
                    className={`text-muted-foreground hover:text-foreground transition-colors ${
                      isActive("/#features") ? "text-primary" : ""
                    }`}
                    data-testid="link-features"
                  >
                    Features
                  </Link>
                  <Link
                    href="/#pricing"
                    className={`text-muted-foreground hover:text-foreground transition-colors ${
                      isActive("/#pricing") ? "text-primary" : ""
                    }`}
                    data-testid="link-pricing"
                  >
                    Pricing
                  </Link>
                  <Link
                    href="/#contact"
                    className={`text-muted-foreground hover:text-foreground transition-colors ${
                      isActive("/#contact") ? "text-primary" : ""
                    }`}
                    data-testid="link-contact"
                  >
                    Contact
                  </Link>
                </>
              ) : (
                // Dashboard navigation for authenticated users
                <>
                  <Link
                    href={getDashboardUrl()}
                    className={`text-muted-foreground hover:text-foreground transition-colors ${
                      location.startsWith(getDashboardUrl()) ? "text-primary" : ""
                    }`}
                    data-testid="link-main-dashboard"
                  >
                    Dashboard
                  </Link>
                  
                  {user.role === "super_admin" && (
                    <Link
                      href="/super-admin/analytics"
                      className={`text-muted-foreground hover:text-foreground transition-colors ${
                        isActive("/super-admin/analytics") ? "text-primary" : ""
                      }`}
                      data-testid="link-analytics"
                    >
                      Analytics
                    </Link>
                  )}
                  
                  {(user.role === "clinic_admin" || user.role === "staff") && (
                    <>
                      <Link
                        href="/clinic/appointments"
                        className={`text-muted-foreground hover:text-foreground transition-colors ${
                          isActive("/clinic/appointments") ? "text-primary" : ""
                        }`}
                        data-testid="link-appointments"
                      >
                        Appointments
                      </Link>
                      <Link
                        href="/clinic/clients"
                        className={`text-muted-foreground hover:text-foreground transition-colors ${
                          isActive("/clinic/clients") ? "text-primary" : ""
                        }`}
                        data-testid="link-clients"
                      >
                        Clients
                      </Link>
                      <Link
                        href="/clinic/share-link"
                        className={`text-muted-foreground hover:text-foreground transition-colors ${
                          isActive("/clinic/share-link") ? "text-primary" : ""
                        }`}
                        data-testid="link-share"
                      >
                        Share Link
                      </Link>
                    </>
                  )}
                  
                  {user.role === "patient" && (
                    <>
                      <Link
                        href="/patient/appointments"
                        className={`text-muted-foreground hover:text-foreground transition-colors ${
                          isActive("/patient/appointments") ? "text-primary" : ""
                        }`}
                        data-testid="link-my-appointments"
                      >
                        My Appointments
                      </Link>
                      <Link
                        href="/patient/membership"
                        className={`text-muted-foreground hover:text-foreground transition-colors ${
                          isActive("/patient/membership") ? "text-primary" : ""
                        }`}
                        data-testid="link-membership"
                      >
                        Membership
                      </Link>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-primary-foreground text-sm font-medium">
                      {user.firstName?.[0] || user.username[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground" data-testid="text-username">
                      {user.firstName || user.username}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {user.role.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" data-testid="button-user-menu">
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={getDashboardUrl()} data-testid="link-dashboard">Dashboard</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" data-testid="button-sign-in">Sign In</Button>
                </Link>
                <Link href="/register">
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-start-trial">
                    Start Free Trial
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-border">
            <div className="flex flex-col space-y-4 pt-4">
              {!user ? (
                // Marketing navigation for guests
                <>
                  <Link
                    href="/#features"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="mobile-link-features"
                  >
                    Features
                  </Link>
                  <Link
                    href="/#pricing"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="mobile-link-pricing"
                  >
                    Pricing
                  </Link>
                  <Link
                    href="/#contact"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="mobile-link-contact"
                  >
                    Contact
                  </Link>
                  <Link
                    href="/login"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="mobile-link-login"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="mobile-link-register"
                  >
                    <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                      Start Free Trial
                    </Button>
                  </Link>
                </>
              ) : (
                // Dashboard navigation for authenticated users
                <>
                  <Link
                    href={getDashboardUrl()}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="mobile-link-dashboard"
                  >
                    Dashboard
                  </Link>
                  
                  {user.role === "super_admin" && (
                    <Link
                      href="/super-admin/analytics"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid="mobile-link-analytics"
                    >
                      Analytics
                    </Link>
                  )}
                  
                  {(user.role === "clinic_admin" || user.role === "staff") && (
                    <>
                      <Link
                        href="/clinic/appointments"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                        data-testid="mobile-link-appointments"
                      >
                        Appointments
                      </Link>
                      <Link
                        href="/clinic/clients"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                        data-testid="mobile-link-clients"
                      >
                        Clients
                      </Link>
                      <Link
                        href="/clinic/share-link"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                        data-testid="mobile-link-share"
                      >
                        Share Link
                      </Link>
                    </>
                  )}
                  
                  {user.role === "patient" && (
                    <>
                      <Link
                        href="/patient/appointments"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                        data-testid="mobile-link-my-appointments"
                      >
                        My Appointments
                      </Link>
                      <Link
                        href="/patient/membership"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                        data-testid="mobile-link-membership"
                      >
                        Membership
                      </Link>
                    </>
                  )}
                  
                  <button
                    onClick={handleLogout}
                    className="text-left text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="mobile-button-logout"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
