// Re-export types from shared schema
export type {
  User,
  Organization,
  SubscriptionPlan,
  Location,
  Staff,
  Client,
  Service,
  Appointment as BaseAppointment,
  Membership,
  Reward,
  Transaction,
  AddOn,
  UsageLog,
  AiInsight,
  Notification,
  AuditLog,
  FileStorage,
  FeatureFlag
} from "@shared/schema";

import type { BaseAppointment } from "@shared/schema";

// Enriched appointment type with additional display fields
export interface Appointment extends BaseAppointment {
  clientName?: string;
  serviceName?: string;
  staffName?: string;
  locationName?: string;
  timezone?: string;
  archived?: boolean;
}

// Additional frontend-specific types
export interface DashboardStats {
  revenue: {
    today: number;
    month: number;
    year: number;
    change?: number;
  };
  appointments: {
    today: number;
    week: number;
    month: number;
    change?: number;
  };
  clients: {
    total: number;
    new: number;
    active: number;
    change?: number;
  };
  staff: {
    total: number;
    active: number;
    online?: number;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface BookingAvailability {
  date: string;
  slots: {
    time: string;
    available: boolean;
    staffId?: string;
    staffName?: string;
  }[];
}

export interface PlatformStats {
  mrr: number;
  activeOrganizations: number;
  churnRate: number;
  trialConversions: number;
  growth: {
    mrr: number;
    organizations: number;
    revenue: number;
  };
}

export interface NotificationChannel {
  type: "email" | "sms" | "push" | "in_app";
  enabled: boolean;
  settings?: Record<string, any>;
}
