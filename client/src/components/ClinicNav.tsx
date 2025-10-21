import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, Calendar, Users, Scissors, Crown, 
  UserPlus, TrendingUp, Share2, Gift, Settings2
} from "lucide-react";

export default function ClinicNav() {
  const [location] = useLocation();

  return (
    <div className="overflow-x-auto -mx-6 px-6 scrollbar-hide">
      <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit min-w-full sm:min-w-0">
        <Link href="/clinic">
          <Button
            variant={location === "/clinic" || location === "/clinic/dashboard" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-overview"
          >
            <LayoutDashboard className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Overview</span>
          </Button>
        </Link>
        <Link href="/clinic/appointments">
          <Button
            variant={location === "/clinic/appointments" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-appointments"
          >
            <Calendar className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Appointments</span>
          </Button>
        </Link>
        <Link href="/clinic/memberships">
          <Button
            variant={location === "/clinic/memberships" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-memberships"
          >
            <Crown className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Memberships</span>
          </Button>
        </Link>
        <Link href="/clinic/rewards">
          <Button
            variant={location === "/clinic/rewards" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-rewards"
          >
            <Gift className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Rewards</span>
          </Button>
        </Link>
        <Link href="/clinic/share-link">
          <Button
            variant={location === "/clinic/share-link" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-share-link"
          >
            <Share2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Share Link</span>
          </Button>
        </Link>
        <Link href="/clinic/clients">
          <Button
            variant={location === "/clinic/clients" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-clients"
          >
            <Users className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Clients</span>
          </Button>
        </Link>
        <Link href="/clinic/services">
          <Button
            variant={location === "/clinic/services" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-services"
          >
            <Scissors className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Services</span>
          </Button>
        </Link>
        <Link href="/clinic/staff">
          <Button
            variant={location === "/clinic/staff" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-staff"
          >
            <UserPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Staff</span>
          </Button>
        </Link>
        <Link href="/clinic/reports">
          <Button
            variant={location === "/clinic/reports" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-reports"
          >
            <TrendingUp className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Reports</span>
          </Button>
        </Link>
        <Link href="/clinic/settings">
          <Button
            variant={location === "/clinic/settings" ? "default" : "ghost"}
            size="sm"
            className="relative whitespace-nowrap"
            data-testid="tab-settings"
          >
            <Settings2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
