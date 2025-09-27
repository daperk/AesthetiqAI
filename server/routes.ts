import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { pool } from "./db";
import * as stripeService from "./services/stripe";
import * as openaiService from "./services/openai";
import { 
  insertUserSchema, insertOrganizationSchema, insertStaffSchema, insertClientSchema,
  insertAppointmentSchema, insertServiceSchema, insertMembershipSchema, insertRewardSchema,
  insertTransactionSchema, insertAuditLogSchema, insertUsageLogSchema, insertAiInsightSchema,
  type User
} from "@shared/schema";
import { z } from "zod";

const pgSession = connectPgSimple(session);

// Authentication setup
passport.use(new LocalStrategy(
  { usernameField: "email" },
  async (email, password, done) => {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return done(null, false, { message: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return done(null, false, { message: "Invalid email or password" });
      }

      if (!user.isActive) {
        return done(null, false, { message: "Account is deactivated" });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user || false);
  } catch (error) {
    done(error);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  app.use(session({
    store: new pgSession({
      pool: pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Auth middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };

  // Audit logging middleware
  const auditLog = async (req: any, action: string, resource: string, resourceId?: string, changes?: any) => {
    if (req.user) {
      try {
        await storage.createAuditLog({
          userId: req.user.id,
          organizationId: req.user.organizationId,
          action,
          resource,
          resourceId,
          changes,
          ipAddress: req.ip,
          userAgent: req.get("user-agent")
        });
      } catch (error) {
        console.error("Failed to create audit log:", error);
      }
    }
  };

  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      
      // Create user
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword
      });

      // Log them in
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed after registration" });
        }
        res.json({ user: { ...user, password: undefined } });
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    res.json({ user: { ...req.user, password: undefined } });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: { ...req.user, password: undefined } });
  });

  // Organization routes
  app.get("/api/organizations", requireRole("super_admin"), async (req, res) => {
    try {
      const organizations = await storage.getOrganizations();
      res.json(organizations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  app.post("/api/organizations", requireRole("super_admin"), async (req, res) => {
    try {
      const orgData = insertOrganizationSchema.parse(req.body);
      const organization = await storage.createOrganization(orgData);
      
      await auditLog(req, "create", "organization", organization.id, orgData);
      res.json(organization);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.get("/api/organizations/:id", requireAuth, async (req, res) => {
    try {
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Check permissions
      if (req.user.role !== "super_admin" && req.user.organizationId !== organization.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(organization);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // Subscription Plan routes
  app.get("/api/subscription-plans", async (req, res) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch subscription plans" });
    }
  });

  // Staff routes
  app.get("/api/staff", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      
      if (req.user.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user.organizationId;
      }

      const staff = await storage.getStaffByOrganization(organizationId);
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  app.post("/api/staff", requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const staffData = insertStaffSchema.parse(req.body);
      const staff = await storage.createStaff(staffData);
      
      await auditLog(req, "create", "staff", staff.id, staffData);
      res.json(staff);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create staff member" });
    }
  });

  // Client routes
  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      
      if (req.user.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user.organizationId;
      }

      const clients = await storage.getClientsByOrganization(organizationId);
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients", requireRole("clinic_admin", "staff", "super_admin"), async (req, res) => {
    try {
      const clientData = insertClientSchema.parse(req.body);
      const client = await storage.createClient(clientData);
      
      await auditLog(req, "create", "client", client.id, clientData);
      res.json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create client" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      if (req.user.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user.organizationId;
      }

      const appointments = await storage.getAppointmentsByOrganization(organizationId, startDate, endDate);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  app.post("/api/appointments", requireAuth, async (req, res) => {
    try {
      const appointmentData = insertAppointmentSchema.parse(req.body);
      const appointment = await storage.createAppointment(appointmentData);
      
      await auditLog(req, "create", "appointment", appointment.id, appointmentData);
      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  // Service routes
  app.get("/api/services", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      
      if (req.user.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user.organizationId;
      }

      const services = await storage.getServicesByOrganization(organizationId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.post("/api/services", requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const serviceData = insertServiceSchema.parse(req.body);
      const service = await storage.createService(serviceData);
      
      await auditLog(req, "create", "service", service.id, serviceData);
      res.json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  // Membership routes
  app.get("/api/memberships", requireAuth, async (req, res) => {
    try {
      const clientId = req.query.clientId as string;
      let organizationId = req.query.organizationId as string;
      
      if (clientId) {
        const memberships = await storage.getMembershipsByClient(clientId);
        return res.json(memberships);
      }

      if (req.user.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user.organizationId;
      }

      const memberships = await storage.getMembershipsByOrganization(organizationId);
      res.json(memberships);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch memberships" });
    }
  });

  // Rewards routes
  app.get("/api/rewards/:clientId", requireAuth, async (req, res) => {
    try {
      const rewards = await storage.getRewardsByClient(req.params.clientId);
      const balance = await storage.getClientRewardBalance(req.params.clientId);
      res.json({ rewards, balance });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  app.post("/api/rewards", requireAuth, async (req, res) => {
    try {
      const rewardData = insertRewardSchema.parse(req.body);
      const reward = await storage.createReward(rewardData);
      
      await auditLog(req, "create", "reward", reward.id, rewardData);
      res.json(reward);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create reward" });
    }
  });

  // AI Insights routes
  app.get("/api/ai-insights", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      
      if (req.user.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user.organizationId;
      }

      const insights = await storage.getAiInsightsByOrganization(organizationId);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI insights" });
    }
  });

  app.post("/api/ai-insights/generate", requireAuth, async (req, res) => {
    try {
      const { type, data } = req.body;
      let result;

      switch (type) {
        case "client_insights":
          result = await openaiService.generateClientInsights(data);
          break;
        case "marketing_copy":
          result = await openaiService.generateMarketingCopy(data);
          break;
        case "pricing_strategy":
          result = await openaiService.analyzePricingStrategy(data);
          break;
        case "growth_recommendations":
          result = await openaiService.generateGrowthRecommendations(data);
          break;
        default:
          return res.status(400).json({ message: "Invalid insight type" });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate AI insights" });
    }
  });

  // Chat routes for AI concierge
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const { message, context } = req.body;
      const response = await openaiService.generateBookingChatResponse(message, context);
      res.json({ response });
    } catch (error) {
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  // Stripe payment routes
  app.post("/api/payments/create-payment-intent", requireAuth, async (req, res) => {
    try {
      const { amount, metadata } = req.body;
      const result = await stripeService.createPaymentIntent(
        amount,
        "usd",
        req.user.stripeCustomerId,
        metadata
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // Subscription routes
  app.post("/api/subscriptions/create", requireAuth, async (req, res) => {
    try {
      const { priceId, trialDays } = req.body;
      
      let customerId = req.user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          req.user.email,
          `${req.user.firstName} ${req.user.lastName}`,
          req.user.organizationId || ""
        );
        customerId = customer.id;
        await storage.updateUserStripeInfo(req.user.id, customerId);
      }

      const subscription = await stripeService.createSubscription(customerId, priceId, trialDays);
      
      // Update user with subscription ID
      await storage.updateUserStripeInfo(req.user.id, customerId, subscription.subscriptionId);
      
      res.json(subscription);
    } catch (error) {
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Usage tracking
  app.post("/api/usage", requireAuth, async (req, res) => {
    try {
      const usageData = insertUsageLogSchema.parse(req.body);
      const usage = await storage.createUsageLog(usageData);
      res.json(usage);
    } catch (error) {
      res.status(500).json({ message: "Failed to log usage" });
    }
  });

  // Dashboard analytics routes
  app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      
      if (req.user.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user.organizationId;
      }

      // This would typically involve complex aggregation queries
      // For now, return basic analytics structure
      const analytics = {
        revenue: {
          today: 0,
          month: 0,
          year: 0
        },
        appointments: {
          today: 0,
          week: 0,
          month: 0
        },
        clients: {
          total: 0,
          new: 0,
          active: 0
        },
        staff: {
          total: 0,
          active: 0
        }
      };

      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
