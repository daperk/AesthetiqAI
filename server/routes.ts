import type { Express, Request } from "express";
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
  insertAppointmentSchema, insertServiceSchema, insertMembershipSchema, insertMembershipTierSchema,
  insertRewardSchema, insertTransactionSchema, insertAuditLogSchema, insertUsageLogSchema, 
  insertAiInsightSchema, type User
} from "@shared/schema";
import { z } from "zod";

// Augment Express Request type to include our User type
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      username: string;
      password: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      role: "super_admin" | "clinic_admin" | "staff" | "patient";
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      emailVerified: boolean | null;
      isActive: boolean | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    }
  }
}

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
  const requireAuth = (req: Request, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  const requireRole = (...roles: string[]) => (req: Request, res: any, next: any) => {
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

  const auditLog = async (req: Request, action: string, resource: string, resourceId?: string, changes?: any) => {
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

        // For clinic_admin, create organization with subscription and link them
        if (user.role === "clinic_admin") {
          // Get enterprise plan for testing (all features enabled)
          const plans = await storage.getSubscriptionPlans();
          const enterprisePlan = plans.find(p => p.tier === 'enterprise') || plans[0];
          
          if (!enterprisePlan) {
            throw new Error("No subscription plans available");
          }
          
          // Create organization for the business
          const organizationData = {
            name: userData.businessName || `${user.firstName || ''} ${user.lastName || ''} Clinic`.trim(),
            slug: (userData.businessName || user.email).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
            subscriptionPlanId: enterprisePlan.id,
            whiteLabelSettings: {},
            isActive: true
          };
          
          const organization = await storage.createOrganization(organizationData);
          
          // Create Stripe customer and subscription with 30-day trial
          if (userData.paymentMethod) {
            try {
              // Create Stripe customer
              const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
              const customer = await stripe.customers.create({
                email: user.email,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                metadata: {
                  organizationId: organization.id,
                  userId: user.id
                }
              });
              
              // Attach payment method to customer
              await stripe.paymentMethods.attach(userData.paymentMethod.id, {
                customer: customer.id,
              });
              
              // Set as default payment method
              await stripe.customers.update(customer.id, {
                invoice_settings: {
                  default_payment_method: userData.paymentMethod.id,
                },
              });
              
              // Create subscription with 30-day trial
              const priceId = userData.billingCycle === 'yearly' ? 
                enterprisePlan.stripePriceIdYearly : enterprisePlan.stripePriceIdMonthly;
              
              const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [{ price: priceId }],
                trial_period_days: 30,
                metadata: {
                  organizationId: organization.id,
                  planTier: enterprisePlan.tier
                }
              });
              
              // Store Stripe IDs in organization
              await storage.updateOrganization(organization.id, {
                stripeCustomerId: customer.id,
                stripeSubscriptionId: subscription.id
              });
              
              console.log(`Created Stripe subscription ${subscription.id} with 30-day trial for organization ${organization.id}`);
            } catch (stripeError) {
              console.error("Stripe setup error:", stripeError);
              // Continue without subscription setup - user can add payment later
            }
          }
          
          // Create staff record linking admin to organization
          await storage.createStaff({
            userId: user.id,
            organizationId: organization.id,
            role: "admin",
            title: "Clinic Administrator",
            isActive: true
          });
          
          console.log(`Created organization ${organization.id} for clinic admin ${user.id} with ${enterprisePlan.name} plan`);
        }

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
      
      if (req.user!.role === "super_admin") {
        hasAccess = true;
      } else {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (userOrgId === organization.id) {
          hasAccess = true;
        } else if (req.user!.role === "patient") {
          // For patients, check if they have a client record with this organization
          const client = await storage.getClientByUser(req.user!.id);
          if (client && client.organizationId === organization.id) {
            hasAccess = true;
          }
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
      
      if (req.user!.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (!userOrgId) {
          return res.status(403).json({ message: "No organization access" });
        }
        organizationId = userOrgId;
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
      if (req.user!.role !== "patient") {
        return res.status(403).json({ message: "Only patients can access client records" });
      }

      const client = await storage.getClientByUser(req.user!.id);
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
      
      if (req.user!.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (!userOrgId) {
          return res.status(403).json({ message: "No organization access" });
        }
        organizationId = userOrgId;
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
      if (!userOrgId && req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "No organization access" });
      }
      
      if (req.user!.role !== "super_admin") {
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
  // Public booking with payment endpoint 
  app.post("/api/appointments/book-with-payment", async (req, res) => {
    try {
      const { 
        serviceId, 
        locationId, 
        staffId, 
        startTime, 
        endTime, 
        paymentType = 'full',
        clientInfo 
      } = req.body;

      // Get service details to determine payment type
      const service = await storage.getService(serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }

      // Validate location belongs to service organization
      const location = await storage.getLocation(locationId);
      if (!location || location.organizationId !== service.organizationId) {
        return res.status(400).json({ message: "Invalid location for this service" });
      }

      // For public bookings, create temporary client record
      let client;
      if (req.isAuthenticated()) {
        // Authenticated user booking
        client = await storage.getClientByUser(req.user!.id);
        if (!client) {
          client = await storage.createClient({
            userId: req.user!.id,
            organizationId: service.organizationId,
            firstName: req.user!.firstName || "",
            lastName: req.user!.lastName || "",
            email: req.user!.email,
            phone: req.user!.phone
          });
        }
      } else {
        // Public booking - create client with provided info
        if (!clientInfo?.email || !clientInfo?.firstName || !clientInfo?.lastName) {
          return res.status(400).json({ message: "Client information required for public booking" });
        }
        
        // Check if client already exists by email
        const existingClient = await storage.getClientByEmail(clientInfo.email);
        if (existingClient) {
          client = existingClient;
        } else {
          client = await storage.createClient({
            organizationId: service.organizationId,
            firstName: clientInfo.firstName,
            lastName: clientInfo.lastName,
            email: clientInfo.email,
            phone: clientInfo.phone || null
          });
        }
      }

      // Determine payment amount based on user selection and service config
      const isDepositPayment = paymentType === 'deposit' && service.depositRequired;
      const paymentAmount = isDepositPayment ? Number(service.depositAmount) : Number(service.price);
      
      // Create Stripe customer for payment
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({
        email: client.email,
        name: `${client.firstName} ${client.lastName}`,
        metadata: {
          organizationId: service.organizationId,
          clientId: client.id
        }
      });
      
      // Create Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(paymentAmount * 100), // Convert to cents
        currency: 'usd',
        customer: customer.id,
        metadata: {
          serviceId: service.id,
          organizationId: service.organizationId,
          clientId: client.id,
          paymentType: isDepositPayment ? "deposit" : "full_payment"
        }
      });

      // Create appointment
      const appointment = await storage.createAppointment({
        organizationId: service.organizationId,
        locationId,
        clientId: client.id,
        staffId,
        serviceId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        totalAmount: service.price.toString(),
        depositPaid: (isDepositPayment ? service.depositAmount : service.price).toString(),
        status: "scheduled"
      });

      // Create transaction record
      await storage.createTransaction({
        organizationId: service.organizationId,
        clientId: client.id,
        appointmentId: appointment.id,
        amount: paymentAmount.toString(),
        type: isDepositPayment ? "appointment_deposit" : "appointment_full",
        status: "pending",
        stripePaymentIntentId: paymentIntent.id
      });

      res.json({
        appointmentId: appointment.id,
        clientSecret: paymentIntent.client_secret,
        paymentAmount: paymentAmount,
        paymentType: isDepositPayment ? "deposit" : "full"
      });
      
    } catch (error) {
      console.error("Book with payment error:", error);
      res.status(500).json({ message: "Failed to create appointment with payment" });
    }
  });

  // Finalize payment after Stripe confirmation
  app.post("/api/appointments/finalize-payment", async (req, res) => {
    try {
      const { appointmentId, paymentIntentId } = req.body;

      if (!appointmentId || !paymentIntentId) {
        return res.status(400).json({ message: "Appointment ID and Payment Intent ID required" });
      }

      // Get appointment
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Verify payment with Stripe
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ message: "Payment not confirmed" });
      }

      // Update appointment to confirmed
      await storage.updateAppointment(appointmentId, {
        status: "scheduled"
      });

      // Update transaction to succeeded
      await storage.updateTransactionByPaymentIntent(paymentIntentId, {
        status: "completed"
      });

      res.json({
        success: true,
        appointment: await storage.getAppointment(appointmentId)
      });
      
    } catch (error) {
      console.error("Payment finalization error:", error);
      res.status(500).json({ message: "Failed to finalize payment" });
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
      if (req.user!.role !== "super_admin" && await getUserOrganizationId(req.user!) !== appointment.organizationId) {
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
          confirm: "true",
          off_session: "true"
        }
      );

      // Update appointment final total
      await storage.updateAppointment(appointmentId, { totalAmount: finalTotal.toString() });

      // Create transaction record
      await storage.createTransaction({
        organizationId: appointment.organizationId,
        clientId: appointment.clientId,
        appointmentId: appointment.id,
        amount: remainingBalance.toString(),
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
      if (req.user!.role === "patient") {
        const client = await storage.getClientByUser(req.user!.id);
        if (!client || client.id !== appointment.clientId) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (req.user!.role !== "super_admin" && await getUserOrganizationId(req.user!) !== appointment.organizationId) {
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
      if (req.user!.role !== "super_admin" && existingService.organizationId !== userOrgId) {
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
      if (req.user!.role !== "super_admin" && existingService.organizationId !== userOrgId) {
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

      if (req.user!.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = await getUserOrganizationId(req.user!);
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
      const client = await storage.getClientByUser(req.user!.id);
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
      const client = await storage.getClientByUser(req.user!.id);
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
        organizationId: client.organizationId,
        monthlyFee: "100.00" // Default membership fee
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
      const client = await storage.getClientByUser(req.user!.id);
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
      const client = await storage.getClientByUser(req.user!.id);
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
        organizationId: client.organizationId,
        clientId: client.id,
        points: -pointsCost, // Negative for redemption
        reason: `Redeemed: ${optionId}`
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
      
      if (req.user!.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = await getUserOrganizationId(req.user!);
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

  // Membership Tiers API (authenticated)
  app.get("/api/membership-tiers", requireAuth, async (req, res) => {
    try {
      console.log('🔍 [GET /api/membership-tiers] Request received');
      const orgId = await getUserOrganizationId(req.user!);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      const tiers = await storage.getMembershipTiersByOrganization(orgId);
      console.log('🔍 [GET /api/membership-tiers] Found tiers:', tiers.length);
      res.json(tiers);
    } catch (error) {
      console.error('🔍 [GET /api/membership-tiers] Error:', error);
      res.status(500).json({ message: "Failed to fetch membership tiers" });
    }
  });

  app.post("/api/membership-tiers", requireAuth, async (req, res) => {
    try {
      console.log('🔍 [POST /api/membership-tiers] Request received:', req.body);
      const orgId = await getUserOrganizationId(req.user!);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      // Validate request body using Zod schema
      const tierData = insertMembershipTierSchema.parse({
        ...req.body,
        organizationId: orgId
      });

      // Create Stripe products/prices if needed
      let stripePriceIdMonthly, stripePriceIdYearly;
      if (tierData.monthlyPrice) {
        try {
          const product = await stripeService.createProduct({
            name: `${tierData.name} Membership`,
            description: tierData.description || `${tierData.name} membership tier`
          });

          stripePriceIdMonthly = await stripeService.createPrice({
            productId: product.id,
            amount: Math.round(parseFloat(tierData.monthlyPrice.toString()) * 100),
            interval: 'month'
          });

          if (tierData.yearlyPrice) {
            stripePriceIdYearly = await stripeService.createPrice({
              productId: product.id,
              amount: Math.round(parseFloat(tierData.yearlyPrice.toString()) * 100),
              interval: 'year'
            });
          }
        } catch (stripeError) {
          console.error('Stripe integration error:', stripeError);
          // Continue without Stripe prices for now
        }
      }

      const newTier = await storage.createMembershipTier({
        ...tierData,
        stripePriceIdMonthly,
        stripePriceIdYearly
      });

      console.log('🔍 [POST /api/membership-tiers] Created tier:', newTier.id);
      res.status(201).json(newTier);
    } catch (error) {
      console.error('🔍 [POST /api/membership-tiers] Error:', error);
      res.status(500).json({ message: "Failed to create membership tier" });
    }
  });

  app.put("/api/membership-tiers/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const orgId = await getUserOrganizationId(req.user!);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      // Check if tier belongs to organization
      const existingTier = await storage.getMembershipTier(id);
      if (!existingTier || existingTier.organizationId !== orgId) {
        return res.status(404).json({ message: "Membership tier not found" });
      }

      const updates = insertMembershipTierSchema.partial().parse(req.body);
      const updatedTier = await storage.updateMembershipTier(id, updates);
      
      res.json(updatedTier);
    } catch (error) {
      console.error('🔍 [PUT /api/membership-tiers] Error:', error);
      res.status(500).json({ message: "Failed to update membership tier" });
    }
  });

  app.delete("/api/membership-tiers/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const orgId = await getUserOrganizationId(req.user!);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      // Check if tier belongs to organization
      const existingTier = await storage.getMembershipTier(id);
      if (!existingTier || existingTier.organizationId !== orgId) {
        return res.status(404).json({ message: "Membership tier not found" });
      }

      const success = await storage.deleteMembershipTier(id);
      if (success) {
        res.json({ message: "Membership tier deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete membership tier" });
      }
    } catch (error) {
      console.error('🔍 [DELETE /api/membership-tiers] Error:', error);
      res.status(500).json({ message: "Failed to delete membership tier" });
    }
  });

  // Public API endpoints for booking (before auth middleware)
  app.get("/api/locations", async (req, res) => {
    try {
      // For public booking, we'll get all active locations
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get("/api/services", async (req, res) => {
    try {
      console.log('🔍 [GET /api/services] Request received:', {
        query: req.query,
        isAuthenticated: req.isAuthenticated(),
        userRole: req.user?.role,
        headers: req.headers.accept
      });

      const { locationId } = req.query;
      
      // Public access only with valid locationId - no organization enumeration
      if (locationId) {
        console.log('🔍 [GET /api/services] Using locationId:', locationId);
        // Validate location exists and is active
        const location = await storage.getLocation(locationId as string);
        if (!location || !location.isActive) {
          return res.status(404).json({ message: "Location not found" });
        }
        
        const services = await storage.getServicesByLocation(locationId as string);
        console.log('🔍 [GET /api/services] Found services by location:', services.length);
        return res.json(services);
      }
      
      // Require authentication for organization-wide access
      if (!req.isAuthenticated()) {
        console.log('🔍 [GET /api/services] Authentication required - user not authenticated');
        return res.status(401).json({ message: "Authentication required" });
      }

      // Only authenticated users can access by organization
      const orgId = await getUserOrganizationId(req.user!);
      console.log('🔍 [GET /api/services] User orgId:', orgId);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      const services = await storage.getServicesByOrganization(orgId);
      console.log('🔍 [GET /api/services] Found services by organization:', services.length, 'services');
      res.json(services);
    } catch (error) {
      console.error('🔍 [GET /api/services] Error:', error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/staff", async (req, res) => {
    try {
      const { locationId, serviceId } = req.query;
      console.log("Staff endpoint called with:", { locationId, serviceId });
      
      // Public access with location/service filters for booking
      if (locationId || serviceId) {
        // Validate location if provided
        if (locationId) {
          const location = await storage.getLocation(locationId as string);
          if (!location || !location.isActive) {
            return res.status(404).json({ message: "Location not found" });
          }
        }
        
        let staff;
        if (locationId && serviceId) {
          console.log("Fetching staff by location and service");
          staff = await storage.getStaffByLocationAndService(locationId as string, serviceId as string);
        } else if (locationId) {
          console.log("Fetching staff by location only");
          staff = await storage.getStaffByLocation(locationId as string);
        } else {
          // For public booking, require at least locationId to prevent enumeration
          return res.status(400).json({ message: "Location ID required for public access" });
        }
        
        console.log("Staff fetched:", staff);
        return res.json(staff);
      }
      
      // Require authentication for organization-wide access
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Only authenticated users can access by organization
      const orgId = await getUserOrganizationId(req.user!);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      const staff = await storage.getStaffByOrganization(orgId);
      res.json(staff);
    } catch (error) {
      console.error("Staff endpoint error:", error);
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });


  // Subscription routes  
  app.post("/api/subscriptions/create", requireAuth, async (req, res) => {
    try {
      const { planId, billingCycle = 'monthly' } = req.body;
      const userId = req.user!.id;
      
      // Get user's organization
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }
      
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Get subscription plan
      const plan = await storage.getSubscriptionPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Subscription plan not found" });
      }
      
      // Initialize Stripe
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      
      let customerId = organization.stripeCustomerId;
      
      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user!.email,
          name: `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim(),
          metadata: {
            organizationId: organization.id,
            userId: userId
          }
        });
        customerId = customer.id;
        
        // Update organization with customer ID
        await storage.updateOrganization(organization.id, {
          stripeCustomerId: customerId
        });
      }
      
      // Create setup intent for payment method collection
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: 'off_session',
        metadata: {
          organizationId: organization.id,
          planId: plan.id,
          billingCycle: billingCycle
        }
      });
      
      res.json({
        setupIntent,
        planDetails: {
          name: plan.name,
          price: billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice,
          billingCycle: billingCycle
        }
      });
      
    } catch (error) {
      console.error("Subscription creation error:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });
  
  app.post("/api/subscriptions/confirm", requireAuth, async (req, res) => {
    try {
      const { setupIntentId, planId, billingCycle = 'monthly' } = req.body;
      
      // Get user's organization
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }
      
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Get subscription plan
      const plan = await storage.getSubscriptionPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Subscription plan not found" });
      }
      
      // Initialize Stripe
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      
      // Retrieve the setup intent
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      
      if (setupIntent.status !== 'succeeded') {
        return res.status(400).json({ message: "Payment method not confirmed" });
      }
      
      // Create subscription with 30-day trial
      const priceId = billingCycle === 'yearly' ? 
        plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
      
      if (!priceId) {
        // For testing, create without Stripe price ID
        console.log(`No Stripe price ID for plan ${plan.name}, creating without Stripe subscription`);
        
        // Update organization with plan info
        await storage.updateOrganization(organization.id, {
          subscriptionPlanId: plan.id,
          stripeCustomerId: organization.stripeCustomerId
        });
        
        return res.json({
          success: true,
          message: "Subscription activated with trial period",
          organization: await storage.getOrganization(organization.id)
        });
      }
      
      const subscription = await stripe.subscriptions.create({
        customer: setupIntent.customer,
        items: [{ price: priceId }],
        default_payment_method: setupIntent.payment_method,
        trial_period_days: 30,
        metadata: {
          organizationId: organization.id,
          planTier: plan.tier
        }
      });
      
      // Update organization with subscription info
      await storage.updateOrganization(organization.id, {
        subscriptionPlanId: plan.id,
        stripeSubscriptionId: subscription.id
      });
      
      res.json({
        success: true,
        subscription,
        organization: await storage.getOrganization(organization.id)
      });
      
    } catch (error) {
      console.error("Subscription confirmation error:", error);
      res.status(500).json({ message: "Failed to confirm subscription" });
    }
  });

  // Stripe Connect Express account creation and onboarding
  app.post("/api/stripe-connect/create-account", requireRole("clinic_admin"), async (req, res) => {
    const startTime = Date.now();
    console.log(`🔄 [STRIPE-CONNECT] Starting account creation process - ${new Date().toISOString()}`);
    
    try {
      // Step 1: Get organization ID
      console.log(`📋 [STRIPE-CONNECT] Step 1: Getting organization ID for user ${req.user!.id}`);
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        console.log(`❌ [STRIPE-CONNECT] FAILED: No organization found for user ${req.user!.id}`);
        return res.status(400).json({ 
          message: "No organization found for user",
          error_code: "NO_ORGANIZATION",
          user_id: req.user!.id
        });
      }
      console.log(`✅ [STRIPE-CONNECT] Organization ID found: ${organizationId}`);

      // Step 2: Get organization details
      console.log(`📋 [STRIPE-CONNECT] Step 2: Fetching organization details for ${organizationId}`);
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        console.log(`❌ [STRIPE-CONNECT] FAILED: Organization ${organizationId} not found in database`);
        return res.status(404).json({ 
          message: "Organization not found",
          error_code: "ORG_NOT_FOUND",
          organization_id: organizationId
        });
      }
      console.log(`✅ [STRIPE-CONNECT] Organization found: ${organization.name} (${organization.email})`);

      // Step 3: Check for existing Stripe Connect account
      console.log(`📋 [STRIPE-CONNECT] Step 3: Checking for existing Stripe Connect account`);
      if (organization.stripeConnectAccountId) {
        console.log(`❌ [STRIPE-CONNECT] FAILED: Organization ${organizationId} already has Stripe Connect account: ${organization.stripeConnectAccountId}`);
        return res.status(400).json({ 
          message: "Organization already has a Stripe Connect account",
          error_code: "ACCOUNT_EXISTS",
          existing_account_id: organization.stripeConnectAccountId,
          organization_id: organizationId
        });
      }
      console.log(`✅ [STRIPE-CONNECT] No existing account found, proceeding with creation`);

      // Step 4: Create Stripe Express account
      console.log(`📋 [STRIPE-CONNECT] Step 4: Creating Stripe Express account`);
      console.log(`🔧 [STRIPE-CONNECT] Account creation parameters:`, {
        name: organization.name,
        email: organization.email || req.user!.email,
        organizationId: organization.id,
        user_email: req.user!.email
      });
      
      const account = await stripeService.createConnectAccount({
        name: organization.name,
        email: organization.email || req.user!.email,
        organizationId: organization.id
      });
      console.log(`✅ [STRIPE-CONNECT] Stripe account created successfully: ${account.id}`);

      // Step 5: Update database with Stripe Connect account ID
      console.log(`📋 [STRIPE-CONNECT] Step 5: Updating database with Stripe account ID`);
      await storage.updateOrganizationStripeConnect(organization.id, {
        stripeConnectAccountId: account.id,
        stripeAccountStatus: 'pending'
      });
      console.log(`✅ [STRIPE-CONNECT] Database updated with account ID: ${account.id}`);

      // Step 6: Create account link for onboarding
      console.log(`📋 [STRIPE-CONNECT] Step 6: Creating onboarding link`);
      const accountLink = await stripeService.createAccountLink(account.id, organization.id);
      console.log(`✅ [STRIPE-CONNECT] Onboarding link created: ${accountLink.url}`);

      const duration = Date.now() - startTime;
      console.log(`🎉 [STRIPE-CONNECT] Account creation completed successfully in ${duration}ms`);
      console.log(`📊 [STRIPE-CONNECT] Final result:`, {
        account_id: account.id,
        onboarding_url: accountLink.url,
        organization_id: organizationId,
        duration_ms: duration
      });

      res.json({
        accountId: account.id,
        onboardingUrl: accountLink.url,
        message: "Stripe Connect account created. Please complete onboarding.",
        success: true,
        organization_id: organizationId
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`💥 [STRIPE-CONNECT] ERROR occurred after ${duration}ms`);
      console.log(`🔍 [STRIPE-CONNECT] Error type: ${error.type || 'Unknown'}`);
      console.log(`🔍 [STRIPE-CONNECT] Error code: ${error.code || 'No code'}`);
      console.log(`🔍 [STRIPE-CONNECT] Error message: ${error.message}`);
      console.log(`🔍 [STRIPE-CONNECT] Error stack:`, error.stack);
      
      if (error.type === 'StripeInvalidRequestError') {
        console.log(`🔍 [STRIPE-CONNECT] Stripe-specific error details:`, {
          statusCode: error.statusCode,
          requestId: error.requestId,
          param: error.param,
          doc_url: error.doc_url,
          detail: error.detail
        });
        
        if (error.message.includes('platform-profile')) {
          console.log(`🚨 [STRIPE-CONNECT] PLATFORM CONFIGURATION ERROR: This error means the Stripe Connect platform profile is not configured properly.`);
          console.log(`🔧 [STRIPE-CONNECT] SOLUTION: Go to Stripe Dashboard → Settings → Connect → Platform Profile and complete the setup.`);
          
          res.status(400).json({ 
            message: "Stripe Connect platform not configured. Please complete platform profile setup in Stripe Dashboard.",
            error_code: "PLATFORM_NOT_CONFIGURED",
            stripe_error: error.message,
            solution: "Go to Stripe Dashboard → Settings → Connect → Platform Profile and complete the setup.",
            doc_url: "https://dashboard.stripe.com/settings/connect/platform-profile",
            requestId: error.requestId
          });
          return;
        }
      }
      
      console.error("🔍 [STRIPE-CONNECT] Full error object:", error);
      res.status(500).json({ 
        message: "Failed to create Stripe Connect account",
        error_code: "CREATION_FAILED",
        error_type: error.type || 'Unknown',
        stripe_message: error.message,
        duration_ms: duration
      });
    }
  });

  app.get("/api/stripe-connect/status", requireRole("clinic_admin"), async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      if (!organization.stripeConnectAccountId) {
        return res.json({
          hasAccount: false,
          businessFeaturesEnabled: false,
          message: "No Stripe Connect account found"
        });
      }

      // Check account status with Stripe
      const accountStatus = await stripeService.checkAccountStatus(organization.stripeConnectAccountId);

      // Only update telemetry data - DO NOT enable business features
      // Business features are ONLY enabled via webhook confirmation
      await storage.updateOrganizationStripeConnect(organization.id, {
        payoutsEnabled: accountStatus.payoutsEnabled,
        capabilitiesTransfers: accountStatus.transfersActive ? 'active' : 'inactive',
        hasExternalAccount: accountStatus.hasExternalAccount
        // Note: stripeAccountStatus and businessFeaturesEnabled are ONLY updated by webhooks
      });

      res.json({
        hasAccount: true,
        accountId: organization.stripeConnectAccountId,
        payoutsEnabled: accountStatus.payoutsEnabled,
        transfersActive: accountStatus.transfersActive,
        hasExternalAccount: accountStatus.hasExternalAccount,
        businessFeaturesEnabled: accountStatus.ready,
        requirements: accountStatus.requirements
      });

    } catch (error) {
      console.error("Stripe Connect status check error:", error);
      res.status(500).json({ message: "Failed to check Stripe Connect status" });
    }
  });

  app.post("/api/stripe-connect/refresh-onboarding", requireRole("clinic_admin"), async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization || !organization.stripeConnectAccountId) {
        return res.status(400).json({ message: "No Stripe Connect account found" });
      }

      // Create new account link for onboarding
      const accountLink = await stripeService.createAccountLink(organization.stripeConnectAccountId, organization.id);

      res.json({
        onboardingUrl: accountLink.url,
        message: "New onboarding link created"
      });

    } catch (error) {
      console.error("Stripe Connect onboarding refresh error:", error);
      res.status(500).json({ message: "Failed to refresh onboarding link" });
    }
  });

  // Stripe Connect webhook handler
  app.post("/api/stripe/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured");
      return res.status(500).send("Webhook secret not configured");
    }

    let event: any;

    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // Handle account verification events
      if (event.type === 'account.updated') {
        const account = event.data.object;
        const organizationId = account.metadata?.organizationId;

        if (organizationId) {
          const payoutsEnabled = account.payouts_enabled || false;
          const transfersActive = account.capabilities?.transfers === 'active';
          const hasExternalAccount = account.external_accounts?.data?.length > 0 || false;
          const requirements = account.requirements?.currently_due || [];
          const accountReady = payoutsEnabled && transfersActive && hasExternalAccount && requirements.length === 0;

          // Update organization with latest verification status
          await storage.updateOrganizationStripeConnect(organizationId, {
            stripeAccountStatus: accountReady ? 'active' : 'pending',
            payoutsEnabled,
            capabilitiesTransfers: transfersActive ? 'active' : 'inactive',
            hasExternalAccount,
            businessFeaturesEnabled: accountReady
          });

          console.log(`Stripe Connect account ${account.id} updated for organization ${organizationId}: ready=${accountReady}`);
        }
      }

      // Handle capability updates
      if (event.type === 'capability.updated') {
        const capability = event.data.object;
        const account = capability.account;
        
        // Get the full account to check all capabilities
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const fullAccount = await stripe.accounts.retrieve(account);
        const organizationId = fullAccount.metadata?.organizationId;

        if (organizationId) {
          const payoutsEnabled = fullAccount.payouts_enabled || false;
          const transfersActive = fullAccount.capabilities?.transfers === 'active';
          const hasExternalAccount = fullAccount.external_accounts?.data?.length > 0 || false;
          const requirements = fullAccount.requirements?.currently_due || [];
          const accountReady = payoutsEnabled && transfersActive && hasExternalAccount && requirements.length === 0;

          await storage.updateOrganizationStripeConnect(organizationId, {
            stripeAccountStatus: accountReady ? 'active' : 'pending',
            payoutsEnabled,
            capabilitiesTransfers: transfersActive ? 'active' : 'inactive',
            hasExternalAccount,
            businessFeaturesEnabled: accountReady
          });

          console.log(`Stripe Connect capability updated for organization ${organizationId}: transfers=${transfersActive}, ready=${accountReady}`);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
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
      
      if (req.user!.role === "super_admin") {
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for super admin" });
        }
      } else {
        organizationId = await getUserOrganizationId(req.user!);
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
      const organizationId = await getUserOrganizationId(req.user!);
      const availableServices = organizationId ? await storage.getServicesByOrganization(organizationId) : [];
      
      // For now, we'll provide empty slots - this would typically query a calendar system
      const availableSlots: any[] = [];

      const responseText = await openaiService.generateBookingChatResponse(message, {
        clientName: context?.clientName || req.user!.firstName,
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
