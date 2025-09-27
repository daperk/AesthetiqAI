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
  // Helper to get user's organization ID
  const getUserOrganizationId = async (user: User): Promise<string | null> => {
    if (user.role === "super_admin") {
      return null; // Super admins can access all organizations
    }
    
    // For staff and clinic_admin, get organization through staff table
    if (user.role === "clinic_admin" || user.role === "staff") {
      const staff = await storage.getStaffByUser(user.id);
      return staff?.organizationId || null;
    }
    
    // For patients, get organization through client table
    if (user.role === "patient") {
      const client = await storage.getClientByUser(user.id);
      return client?.organizationId || null;
    }
    
    return null;
  };

  const auditLog = async (req: any, action: string, resource: string, resourceId?: string, changes?: any) => {
    if (req.user) {
      try {
        const organizationId = await getUserOrganizationId(req.user);
        await storage.createAuditLog({
          userId: req.user.id,
          organizationId,
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
      const { organizationSlug, ...userData } = req.body;
      
      // SECURITY: Enforce proper registration flow separation
      if (organizationSlug) {
        // Clinic-specific registration: ONLY patients allowed
        const organization = await storage.getOrganizationBySlug(organizationSlug);
        if (!organization || !organization.isActive) {
          return res.status(400).json({ message: "Invalid clinic" });
        }

        // Force patient role for clinic registration, ignore any client-provided role
        userData.role = "patient";
        
        const validatedUserData = insertUserSchema.parse(userData);
        
        // Check if user exists
        const existingUser = await storage.getUserByEmail(validatedUserData.email);
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        // Create patient user
        const hashedPassword = await bcrypt.hash(validatedUserData.password, 12);
        const user = await storage.createUser({
          ...validatedUserData,
          password: hashedPassword
        });

        // Create client record to link patient to organization
        console.log(`Creating client record for user ${user.id} with organization ${organization.id}`);
        const client = await storage.createClient({
          userId: user.id,
          organizationId: organization.id,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          email: user.email,
          phone: user.phone
        });
        console.log(`Client created successfully:`, client.id);

        // Log them in
        req.logIn(user, (err) => {
          if (err) {
            return res.status(500).json({ message: "Login failed after registration" });
          }
          res.json({ user: { ...user, password: undefined } });
        });

      } else {
        // Main platform registration: ONLY business roles allowed
        if (!userData.role || (userData.role !== "clinic_admin" && userData.role !== "staff")) {
          return res.status(400).json({ message: "Invalid role for business registration" });
        }

        // Staff registration requires additional validation (they need to be associated with an organization)
        if (userData.role === "staff") {
          return res.status(400).json({ message: "Staff members must be invited by clinic administrators" });
        }

        const validatedUserData = insertUserSchema.parse(userData);
        
        // Check if user exists
        const existingUser = await storage.getUserByEmail(validatedUserData.email);
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        // Create business user
        const hashedPassword = await bcrypt.hash(validatedUserData.password, 12);
        const user = await storage.createUser({
          ...validatedUserData,
          password: hashedPassword
        });

        // Log them in
        req.logIn(user, (err) => {
          if (err) {
            return res.status(500).json({ message: "Login failed after registration" });
          }
          res.json({ user: { ...user, password: undefined } });
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Registration error:", error);
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

  // Get current user's organization
  app.get("/api/organizations/my-organization", requireAuth, async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(404).json({ message: "No organization found for user" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("My organization fetch error:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
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
      let hasAccess = false;
      
      if (req.user.role === "super_admin") {
        hasAccess = true;
      } else if (req.user.organizationId === organization.id) {
        hasAccess = true;
      } else if (req.user.role === "patient") {
        // For patients, check if they have a client record with this organization
        const client = await storage.getClientByUser(req.user.id);
        if (client && client.organizationId === organization.id) {
          hasAccess = true;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Get organization error:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // Public endpoint to get organization by slug for white-label registration
  app.get("/api/organizations/by-slug/:slug", async (req, res) => {
    try {
      const organization = await storage.getOrganizationBySlug(req.params.slug);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      if (!organization.isActive) {
        return res.status(404).json({ message: "Organization not available" });
      }

      // Return only public information needed for white-label registration
      const publicOrgData = {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        whiteLabelSettings: organization.whiteLabelSettings,
        isActive: organization.isActive
      };

      res.json(publicOrgData);
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
      
      if (req.user?.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user?.organizationId;
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
      
      if (req.user?.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user?.organizationId;
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

  // Get current user's client record (for patients)
  app.get("/api/clients/me", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Only patients can access client records" });
      }

      const client = await storage.getClientByUser(req.user.id);
      res.json(client);
    } catch (error) {
      console.error("Get client/me error:", error);
      res.status(500).json({ message: "Failed to fetch client record" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      
      // Normalize date range to start/end of day
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (req.query.startDate) {
        startDate = new Date(req.query.startDate as string);
        startDate.setHours(0, 0, 0, 0); // Start of day
      }
      
      if (req.query.endDate) {
        endDate = new Date(req.query.endDate as string);
        endDate.setHours(23, 59, 59, 999); // End of day
      }
      
      if (req.user?.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = await getUserOrganizationId(req.user!);
      }

      if (!organizationId) {
        return res.status(403).json({ message: "No organization access" });
      }

      const appointments = await storage.getAppointmentsByOrganization(organizationId, startDate, endDate);
      res.json(appointments);
    } catch (error) {
      console.error("Get appointments error:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  app.post("/api/appointments", requireAuth, async (req, res) => {
    try {
      const appointmentData = insertAppointmentSchema.parse(req.body);
      
      // Check for appointment conflicts
      const conflicts = await storage.getAppointmentsByStaff(
        appointmentData.staffId, 
        new Date(appointmentData.startTime)
      );
      
      const hasConflict = conflicts.some(apt => {
        const aptStart = new Date(apt.startTime);
        const aptEnd = new Date(apt.endTime);
        const newStart = new Date(appointmentData.startTime);
        const newEnd = new Date(appointmentData.endTime);
        
        return (newStart < aptEnd && newEnd > aptStart);
      });
      
      if (hasConflict) {
        return res.status(409).json({ message: "Appointment time conflicts with existing booking" });
      }
      
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

  // Check availability for staff on specific date  
  app.get("/api/availability/:staffId", requireAuth, async (req, res) => {
    try {
      const { staffId } = req.params;
      const date = req.query.date as string;
      
      // Verify staff belongs to user's organization
      const userOrgId = await getUserOrganizationId(req.user!);
      if (!userOrgId && req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "No organization access" });
      }
      
      if (req.user?.role !== "super_admin") {
        const staff = await storage.getStaff(staffId);
        if (!staff || staff.organizationId !== userOrgId) {
          return res.status(403).json({ message: "Staff not accessible" });
        }
      }
      
      if (!date) {
        return res.status(400).json({ message: "Date parameter required" });
      }

      const selectedDate = new Date(date);
      
      // Get existing appointments for this staff member on this date
      const existingAppointments = await storage.getAppointmentsByStaff(staffId, selectedDate);
      
      // Generate time slots (9 AM to 6 PM, 30-minute intervals)
      const slots = [];
      const startHour = 9;
      const endHour = 18;
      const intervalMinutes = 30;
      
      for (let hour = startHour; hour < endHour; hour++) {
        for (let minute = 0; minute < 60; minute += intervalMinutes) {
          const slotTime = new Date(selectedDate);
          slotTime.setHours(hour, minute, 0, 0);
          
          const timeString = slotTime.toTimeString().slice(0, 5); // HH:MM format
          
          // Check if this slot conflicts with existing appointments
          const isAvailable = !existingAppointments.some(apt => {
            const aptStart = new Date(apt.startTime);
            const aptEnd = new Date(apt.endTime);
            return slotTime >= aptStart && slotTime < aptEnd;
          });
          
          slots.push({
            time: timeString,
            available: isAvailable,
            staffId: staffId
          });
        }
      }

      res.json({
        date: selectedDate.toISOString().split('T')[0],
        slots
      });
    } catch (error) {
      console.error("Availability check error:", error);
      res.status(500).json({ message: "Failed to check availability" });
    }
  });

  // Enhanced appointment booking with payment
  app.post("/api/appointments/book-with-payment", requireAuth, async (req, res) => {
    try {
      const { serviceId, locationId, staffId, startTime, endTime, paymentMethodId } = req.body;

      // Get service details to determine payment type
      const service = await storage.getService(serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }

      // Get or create client record
      let client = await storage.getClientByUser(req.user?.id);
      if (!client) {
        // Create client record for patient
        client = await storage.createClient({
          userId: req.user?.id,
          organizationId: service.organizationId,
          firstName: req.user?.firstName || "",
          lastName: req.user?.lastName || "",
          email: req.user?.email,
          phone: req.user?.phone
        });
      }

      // Ensure user has a Stripe customer ID
      if (!req.user?.stripeCustomerId) {
        const stripeCustomer = await stripeService.createCustomer(
          req.user?.email!,
          `${req.user?.firstName} ${req.user?.lastName}`,
          service.organizationId
        );
        await storage.updateUser(req.user?.id!, { stripeCustomerId: stripeCustomer.id });
        req.user.stripeCustomerId = stripeCustomer.id;
      }

      // Determine payment amount
      const isDepositOnly = service.depositRequired;
      const paymentAmount = isDepositOnly ? Number(service.depositAmount) : Number(service.price);
      
      // Create Stripe PaymentIntent
      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(paymentAmount * 100), // Convert to cents
        "usd",
        req.user.stripeCustomerId,
        {
          serviceId: service.id,
          organizationId: service.organizationId,
          clientId: client.id,
          paymentType: isDepositOnly ? "deposit" : "full_payment"
        }
      );

      // Create appointment
      const appointment = await storage.createAppointment({
        organizationId: service.organizationId,
        locationId,
        clientId: client.id,
        staffId,
        serviceId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        totalAmount: service.price,
        depositPaid: isDepositOnly ? service.depositAmount : service.price,
        status: "scheduled"
      });

      // Create transaction record
      await storage.createTransaction({
        organizationId: service.organizationId,
        clientId: client.id,
        appointmentId: appointment.id,
        amount: paymentAmount,
        type: isDepositOnly ? "appointment_deposit" : "appointment_full",
        status: "pending",
        stripePaymentIntentId: paymentIntent.paymentIntentId,
        description: `${isDepositOnly ? "Deposit for" : "Full payment for"} ${service.name}`
      });

      await auditLog(req, "create", "appointment", appointment.id, { serviceId, paymentType: isDepositOnly ? "deposit" : "full" });

      res.json({
        appointment,
        paymentIntent: {
          clientSecret: paymentIntent.clientSecret,
          amount: paymentAmount,
          type: isDepositOnly ? "deposit" : "full_payment",
          requiresConfirmation: true
        }
      });

    } catch (error) {
      console.error("Booking with payment error:", error);
      res.status(500).json({ message: "Failed to create appointment with payment" });
    }
  });

  // Admin: Finalize appointment payment (charge remaining balance)
  app.post("/api/appointments/:id/finalize-payment", requireRole("clinic_admin", "staff"), async (req, res) => {
    try {
      const { finalTotal } = req.body;
      const appointmentId = req.params.id;

      // Get appointment and verify permissions
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Check if user has access to this organization
      if (req.user?.role !== "super_admin" && req.user?.organizationId !== appointment.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get client's Stripe customer ID
      const client = await storage.getClient(appointment.clientId);
      if (!client?.userId) {
        return res.status(400).json({ message: "Client user account not found" });
      }
      
      const clientUser = await storage.getUser(client.userId);
      if (!clientUser?.stripeCustomerId) {
        return res.status(400).json({ message: "Client payment method not found" });
      }

      // Calculate remaining balance
      const paidTransactions = await storage.getTransactionsByAppointment(appointmentId);
      const totalPaid = paidTransactions
        .filter(t => t.status === "completed")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const remainingBalance = Number(finalTotal) - totalPaid;

      if (remainingBalance <= 0) {
        return res.status(400).json({ message: "No remaining balance to charge" });
      }

      // Create off-session payment for remaining balance
      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(remainingBalance * 100),
        "usd",
        clientUser.stripeCustomerId,
        {
          appointmentId: appointment.id,
          paymentType: "remaining_balance",
          confirm: true,
          off_session: true
        }
      );

      // Update appointment final total
      await storage.updateAppointment(appointmentId, { totalAmount: finalTotal });

      // Create transaction record
      await storage.createTransaction({
        organizationId: appointment.organizationId,
        clientId: appointment.clientId,
        appointmentId: appointment.id,
        amount: remainingBalance,
        type: "appointment_balance",
        status: "pending",
        stripePaymentIntentId: paymentIntent.paymentIntentId,
        description: `Remaining balance for appointment`
      });

      await auditLog(req, "finalize_payment", "appointment", appointment.id, { finalTotal, remainingBalance });

      res.json({
        message: "Payment finalized successfully",
        finalTotal,
        remainingBalance,
        paymentIntentId: paymentIntent.paymentIntentId
      });

    } catch (error) {
      console.error("Finalize payment error:", error);
      res.status(500).json({ message: "Failed to finalize payment" });
    }
  });

  // Get appointment payment history
  app.get("/api/appointments/:id/transactions", requireAuth, async (req, res) => {
    try {
      const appointmentId = req.params.id;
      
      // Get appointment and verify permissions
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Check permissions
      if (req.user?.role === "patient") {
        const client = await storage.getClientByUser(req.user.id);
        if (!client || client.id !== appointment.clientId) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (req.user?.role !== "super_admin" && req.user?.organizationId !== appointment.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const transactions = await storage.getTransactionsByAppointment(appointmentId);
      const totalPaid = transactions
        .filter(t => t.status === "completed")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const remainingBalance = Number(appointment.totalAmount || 0) - totalPaid;

      res.json({
        transactions,
        summary: {
          totalAmount: appointment.totalAmount,
          totalPaid,
          remainingBalance,
          depositPaid: appointment.depositPaid
        }
      });

    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Service routes
  app.get("/api/services", requireAuth, async (req, res) => {
    try {
      let organizationId = req.query.organizationId as string;
      
      if (req.user?.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = await getUserOrganizationId(req.user!) || '';
        if (!organizationId) {
          return res.status(400).json({ message: "User organization not found" });
        }
      }

      const services = await storage.getServicesByOrganization(organizationId);
      res.json(services);
    } catch (error) {
      console.error("Services fetch error:", error);
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

  app.put("/api/services/:id", requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertServiceSchema.partial().parse(req.body);
      
      // Verify service exists and belongs to user's organization
      const existingService = await storage.getService(id);
      if (!existingService) {
        return res.status(404).json({ message: "Service not found" });
      }

      const userOrgId = await getUserOrganizationId(req.user!);
      if (req.user?.role !== "super_admin" && existingService.organizationId !== userOrgId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const service = await storage.updateService(id, updates);
      await auditLog(req, "update", "service", service.id, updates);
      res.json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/services/:id", requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify service exists and belongs to user's organization
      const existingService = await storage.getService(id);
      if (!existingService) {
        return res.status(404).json({ message: "Service not found" });
      }

      const userOrgId = await getUserOrganizationId(req.user!);
      if (req.user?.role !== "super_admin" && existingService.organizationId !== userOrgId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Soft delete by setting isActive to false
      const service = await storage.updateService(id, { isActive: false });
      await auditLog(req, "delete", "service", service.id, { isActive: false });
      res.json({ message: "Service deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete service" });
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

      if (req.user?.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user?.organizationId;
      }

      const memberships = await storage.getMembershipsByOrganization(organizationId);
      res.json(memberships);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch memberships" });
    }
  });

  // Get current user's membership
  app.get("/api/memberships/my-membership", requireAuth, async (req, res) => {
    try {
      // Get client record for current user
      const client = await storage.getClientByUser(req.user?.id);
      if (!client) {
        return res.status(404).json({ message: "Client profile not found" });
      }

      const memberships = await storage.getMembershipsByClient(client.id);
      // Return the active membership or null
      const activeMembership = memberships.find(m => m.status === 'active') || null;
      res.json({ membership: activeMembership });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch membership" });
    }
  });

  // Upgrade membership endpoint
  app.post("/api/memberships/upgrade", requireAuth, async (req, res) => {
    try {
      const { tierId, billingCycle } = req.body;
      
      // Get client record for current user
      const client = await storage.getClientByUser(req.user?.id);
      if (!client) {
        return res.status(404).json({ message: "Client profile not found" });
      }

      // For now, create a simple membership record
      // In production, this would integrate with Stripe for billing
      const membership = await storage.createMembership({
        clientId: client.id,
        tierName: tierId,
        startDate: new Date(),
        status: 'active',
        billingCycle: billingCycle,
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      });

      await auditLog(req, "upgrade", "membership", membership.id, { tierId, billingCycle });
      res.json(membership);
    } catch (error) {
      console.error("Membership upgrade error:", error);
      res.status(500).json({ message: "Failed to upgrade membership" });
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

  // Get current user's rewards
  app.get("/api/rewards/my-rewards", requireAuth, async (req, res) => {
    try {
      // Get client record for current user
      const client = await storage.getClientByUser(req.user?.id);
      if (!client) {
        return res.status(404).json({ message: "Client profile not found" });
      }

      const rewards = await storage.getRewardsByClient(client.id);
      const balance = await storage.getClientRewardBalance(client.id);
      res.json({ rewards, balance: balance || 0 });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  // Redeem points endpoint
  app.post("/api/rewards/redeem", requireAuth, async (req, res) => {
    try {
      const { optionId, pointsCost } = req.body;
      
      // Get client record for current user
      const client = await storage.getClientByUser(req.user?.id);
      if (!client) {
        return res.status(404).json({ message: "Client profile not found" });
      }

      // Check if client has enough points
      const currentBalance = await storage.getClientRewardBalance(client.id);
      if (currentBalance < pointsCost) {
        return res.status(400).json({ message: "Insufficient points balance" });
      }

      // Create reward redemption record
      const reward = await storage.createReward({
        clientId: client.id,
        pointsEarned: -pointsCost, // Negative for redemption
        description: `Redeemed: ${optionId}`,
        earnedDate: new Date()
      });

      await auditLog(req, "redeem", "reward", reward.id, { optionId, pointsCost });
      res.json({ message: "Points redeemed successfully", reward });
    } catch (error) {
      console.error("Reward redemption error:", error);
      res.status(500).json({ message: "Failed to redeem points" });
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
      
      if (req.user?.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user?.organizationId;
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
      
      if (req.user?.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = req.user?.organizationId;
      }

      // Real analytics data aggregation
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisYear = new Date(now.getFullYear(), 0, 1);
      const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get revenue from completed appointments
      const completedAppointments = await storage.getAppointmentsByOrganization(organizationId);
      const todayRevenue = completedAppointments
        .filter(apt => apt.status === 'completed' && new Date(apt.createdAt!) >= today)
        .reduce((sum, apt) => sum + Number(apt.totalAmount || 0), 0);
      
      const monthRevenue = completedAppointments
        .filter(apt => apt.status === 'completed' && new Date(apt.createdAt!) >= thisMonth)
        .reduce((sum, apt) => sum + Number(apt.totalAmount || 0), 0);
        
      const yearRevenue = completedAppointments
        .filter(apt => apt.status === 'completed' && new Date(apt.createdAt!) >= thisYear)
        .reduce((sum, apt) => sum + Number(apt.totalAmount || 0), 0);

      // Get appointment counts
      const allAppointments = await storage.getAppointmentsByOrganization(organizationId);
      const todayAppointments = allAppointments.filter(apt => new Date(apt.startTime) >= today).length;
      const weekAppointments = allAppointments.filter(apt => new Date(apt.startTime) >= thisWeek).length;
      const monthAppointments = allAppointments.filter(apt => new Date(apt.startTime) >= thisMonth).length;

      // Get client counts
      const allClients = await storage.getClientsByOrganization(organizationId);
      const newClients = allClients.filter(client => new Date(client.createdAt!) >= thisMonth).length;
      const activeClients = allClients.filter(client => client.isActive !== false).length;

      // Get staff counts
      const allStaff = await storage.getStaffByOrganization(organizationId);
      const activeStaff = allStaff.filter(staff => staff.isActive !== false).length;

      const analytics = {
        revenue: {
          today: todayRevenue,
          month: monthRevenue,
          year: yearRevenue
        },
        appointments: {
          today: todayAppointments,
          week: weekAppointments,
          month: monthAppointments
        },
        clients: {
          total: allClients.length,
          new: newClients,
          active: activeClients
        },
        staff: {
          total: allStaff.length,
          active: activeStaff
        }
      };

      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // AI Chat endpoint for patient concierge
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const { message, context } = req.body;
      
      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Get available services and slots for context
      const organizationId = req.user?.organizationId;
      const availableServices = organizationId ? await storage.getServicesByOrganization(organizationId) : [];
      
      // For now, we'll provide empty slots - this would typically query a calendar system
      const availableSlots: any[] = [];

      const responseText = await openaiService.generateBookingChatResponse(message, {
        clientName: context?.clientName || req.user?.firstName,
        availableServices,
        availableSlots,
        membershipStatus: context?.membershipStatus
      });

      res.json({ 
        message: responseText,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Chat endpoint error:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
