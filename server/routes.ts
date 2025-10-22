import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "./storage";
import { pool } from "./db";
import * as stripeService from "./services/stripe";
import { stripe } from "./services/stripe";
import { sendEmail, getEmailServiceStatus } from "./services/sendgrid";

// Helper function to calculate reward points based on membership tier and spend
async function calculateRewardPoints(clientId: string, organizationId: string, amountSpent: number): Promise<number> {
  try {
    // Get client's current membership to determine earning rate
    const memberships = await storage.getMembershipsByClient(clientId);
    const activeMembership = memberships.find(m => m.status === 'active');
    
    // Get current points balance to determine tier
    const currentBalance = await storage.getClientRewardBalance(clientId);
    
    // Determine earning multiplier based on tier and membership
    let multiplier = 1.0; // Base rate: 1 point per $1
    
    // Tier-based earning rates
    if (currentBalance >= 5000) {
      multiplier = 2.5; // Platinum: 2.5x
    } else if (currentBalance >= 2500) {
      multiplier = 2.0; // Gold: 2x  
    } else if (currentBalance >= 1000) {
      multiplier = 1.5; // Silver: 1.5x
    } else {
      multiplier = 1.0; // Bronze: 1x
    }
    
    // Membership bonus (additional 0.5x for active members)
    if (activeMembership) {
      multiplier += 0.5;
    }
    
    // Calculate points (rounded down to whole numbers)
    const pointsEarned = Math.floor(amountSpent * multiplier);
    
    console.log(`Reward calculation: $${amountSpent} × ${multiplier} = ${pointsEarned} points (tier balance: ${currentBalance}, membership: ${activeMembership ? 'active' : 'none'})`);
    
    return pointsEarned;
  } catch (error) {
    console.error('Error calculating reward points:', error);
    return 0;
  }
}
import * as openaiService from "./services/openai";
import { 
  insertUserSchema, insertOrganizationSchema, insertStaffSchema, insertStaffRoleSchema, 
  insertStaffAvailabilitySchema, insertStaffServiceSchema, insertClientSchema,
  insertAppointmentSchema, insertServiceSchema, insertMembershipSchema, insertMembershipTierSchema,
  insertRewardSchema, insertRewardOptionSchema, insertTransactionSchema, insertAuditLogSchema, insertUsageLogSchema, 
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
  { usernameField: "emailOrUsername" },
  async (emailOrUsername, password, done) => {
    try {
      // Try to find user by email first, then by username
      let user = await storage.getUserByEmail(emailOrUsername);
      
      if (!user) {
        // If not found by email, try username
        user = await storage.getUserByUsername(emailOrUsername);
      }
      
      if (!user) {
        return done(null, false, { message: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return done(null, false, { message: "Invalid credentials" });
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
      httpOnly: true, // Prevent XSS attacks
      sameSite: 'lax', // Allow cookies across same-site navigations
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

  // Middleware to enforce business setup completion for core clinic features
  const requireBusinessSetupComplete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Only apply to clinic_admin and staff roles
      if (!["clinic_admin", "staff"].includes(req.user.role)) {
        return next();
      }

      const organizationId = await getUserOrganizationId(req.user);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if business setup is complete
      const stripeConnected = !!organization.stripeConnectAccountId;
      
      // CRITICAL: Check active subscription - organizations must pay to use the platform
      const hasActiveSubscription = !!organization.subscriptionPlanId && 
        (organization.subscriptionStatus === 'active' || organization.subscriptionStatus === 'trialing');
      
      const services = await storage.getServicesByOrganization(organizationId);
      const hasServices = services.length > 0;
      const memberships = await storage.getMembershipTiersByOrganization(organizationId);
      const hasMemberships = memberships.length > 0;
      const rewardOptions = await storage.getRewardOptionsByOrganization(organizationId);
      const hasRewards = rewardOptions.length > 0;
      
      const allComplete = stripeConnected && hasActiveSubscription && hasServices && hasMemberships && hasRewards;

      if (!allComplete) {
        const missingItems = [];
        if (!stripeConnected) missingItems.push("Payment setup");
        if (!hasActiveSubscription) missingItems.push("Active subscription");
        if (!hasServices) missingItems.push("Services");
        if (!hasMemberships) missingItems.push("Membership plans");
        if (!hasRewards) missingItems.push("Rewards program");
        
        return res.status(403).json({ 
          message: `Business setup incomplete. Missing: ${missingItems.join(", ")}. Please complete your business setup first.`,
          error_code: "BUSINESS_SETUP_INCOMPLETE",
          setup_status: {
            stripeConnected,
            hasSubscription: hasActiveSubscription,
            hasServices,
            hasMemberships,
            hasRewards,
            allComplete
          },
          missingSubscription: !hasActiveSubscription
        });
      }

      next();
    } catch (error) {
      console.error("Business setup check error:", error);
      res.status(500).json({ message: "Failed to verify business setup" });
    }
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

  // Helper to check if patient has active multi-location membership
  const hasMultiLocationAccess = async (clientId: string, organizationId: string): Promise<boolean> => {
    try {
      // Get patient's active membership
      const memberships = await storage.getMembershipsByClient(clientId);
      const activeMembership = memberships.find(m => m.status === "active");
      
      if (!activeMembership) {
        return false;
      }

      // Get all membership tiers for the organization and find the matching one
      const tiers = await storage.getMembershipTiersByOrganization(organizationId);
      const tier = tiers.find(t => t.name === activeMembership.tierName);
      
      return tier?.allowsMultiLocationAccess === true;
    } catch (error) {
      console.error("Error checking multi-location access:", error);
      return false;
    }
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

  // Get upcoming appointments for patient
  app.get("/api/appointments/upcoming", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClientByUser(req.user!.id);
      if (!client) {
        return res.json([]);
      }

      const allAppointments = await storage.getAppointmentsByClient(client.id);
      const now = new Date();
      const upcomingAppointments = allAppointments
        .filter(apt => new Date(apt.startTime) > now && apt.status !== 'cancelled')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      // Enrich appointments with service, staff, and location names
      const enrichedAppointments = await Promise.all(
        upcomingAppointments.map(async (apt) => {
          const service = await storage.getService(apt.serviceId);
          const staff = await storage.getUser(apt.staffId);
          const location = await storage.getLocation(apt.locationId);
          
          return {
            ...apt,
            serviceName: service?.name || 'Service',
            staffName: staff?.name || 'Staff member',
            locationName: location?.name || 'Location'
          };
        })
      );

      res.json(enrichedAppointments);
    } catch (error) {
      console.error("Error fetching upcoming appointments:", error);
      res.status(500).json({ message: "Failed to fetch upcoming appointments" });
    }
  });

  // Get patient wallet balance  
  app.get("/api/wallet/balance", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClientByUser(req.user!.id);
      if (!client) {
        return res.json({ balance: 0 });
      }

      // Get all transactions for the client to calculate wallet balance
      const transactions = await storage.getTransactionsByClient(client.id);
      
      // Calculate wallet balance from deposits minus spending
      const balance = transactions.reduce((total, tx) => {
        if (tx.type === 'wallet_deposit' || tx.type === 'refund') {
          return total + (tx.amount || 0);
        } else if (tx.type === 'wallet_payment') {
          return total - (tx.amount || 0);
        }
        return total;
      }, 0);

      res.json({ balance });
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      res.status(500).json({ message: "Failed to fetch wallet balance" });
    }
  });

  // Email configuration status endpoint
  app.get("/api/email/status", requireAuth, async (req, res) => {
    try {
      const emailServiceStatus = getEmailServiceStatus();
      const status = {
        configured: emailServiceStatus.configured,
        fromEmail: emailServiceStatus.fromEmail,
        fromName: 'Aesthiq',
        debugMode: emailServiceStatus.debugMode,
        configurationHelp: null as string | null,
        verificationRequired: false
      };

      if (!emailServiceStatus.configured) {
        status.configurationHelp = "SendGrid is not configured. Please set the SENDGRID_API_KEY environment variable to enable email sending.";
      } else {
        status.verificationRequired = true;
        status.configurationHelp = `Email sending is configured. Make sure ${emailServiceStatus.fromEmail} is verified in your SendGrid account.`;
      }

      res.json(status);
    } catch (error) {
      console.error("Email status check error:", error);
      res.status(500).json({ message: "Failed to check email status" });
    }
  });

  // Organization lookup by slug (for patient signup)
  app.get("/api/organizations/by-slug/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const organization = await storage.getOrganizationBySlug(slug);
      
      if (!organization || !organization.isActive) {
        return res.status(404).json({ message: "Clinic not found" });
      }

      // Return public info only
      res.json({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
        website: organization.website,
        whiteLabelSettings: organization.whiteLabelSettings
      });
    } catch (error) {
      console.error("Organization lookup error:", error);
      res.status(500).json({ message: "Failed to lookup clinic" });
    }
  });

  // Get Stripe Connect account ID for payment frontend integration (by slug)
  app.get("/api/organizations/:slug/stripe-connect", async (req, res) => {
    try {
      const { slug } = req.params;
      const organization = await storage.getOrganizationBySlug(slug);
      
      if (!organization || !organization.isActive) {
        return res.status(404).json({ message: "Clinic not found" });
      }

      // Return Connect account ID for frontend Stripe initialization
      res.json({
        stripeConnectAccountId: organization.stripeConnectAccountId || null,
        hasStripeConnected: !!organization.stripeConnectAccountId
      });
    } catch (error) {
      console.error("Stripe Connect lookup error:", error);
      res.status(500).json({ message: "Failed to lookup payment configuration" });
    }
  });

  // FIX: Get Stripe Connect account for logged-in patient (no slug needed)
  app.get("/api/organizations/my/stripe-connect", requireAuth, async (req, res) => {
    try {
      // Get patient's client record to find their organization
      const client = await storage.getClientByUser(req.user!.id);
      if (!client) {
        return res.status(404).json({ message: "Client record not found" });
      }

      const organization = await storage.getOrganization(client.organizationId);
      if (!organization || !organization.isActive) {
        return res.status(404).json({ message: "Clinic not found" });
      }

      // Return Connect account ID for frontend Stripe initialization
      res.json({
        stripeConnectAccountId: organization.stripeConnectAccountId || null,
        hasStripeConnected: !!organization.stripeConnectAccountId
      });
    } catch (error) {
      console.error("Stripe Connect lookup error:", error);
      res.status(500).json({ message: "Failed to lookup payment configuration" });
    }
  });

  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { organizationSlug, ...userData } = req.body;
      
      // SECURITY: Enforce proper registration flow separation
      if (organizationSlug) {
        // Clinic-specific registration: ONLY patients allowed
        // Check if slug is for a location first
        let location = await storage.getLocationBySlug(organizationSlug);
        let organization;
        let primaryLocationId = null;
        
        if (location && location.isActive) {
          // It's a location slug
          organization = await storage.getOrganization(location.organizationId);
          primaryLocationId = location.id;
        } else {
          // Try organization slug (backward compatibility)
          organization = await storage.getOrganizationBySlug(organizationSlug);
          if (organization && organization.isActive) {
            // Get default location for this organization
            const locations = await storage.getLocationsByOrganization(organization.id);
            const defaultLocation = locations.find(l => l.isDefault) || locations[0];
            if (defaultLocation) {
              primaryLocationId = defaultLocation.id;
            }
          }
        }
        
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

        // FIX: Check if client already exists (from invitation) before creating new one
        console.log(`Checking for existing client with email ${user.email} in organization ${organization.id}`);
        const existingClient = await storage.getClientByEmail(user.email);
        
        let client;
        if (existingClient && existingClient.organizationId === organization.id && !existingClient.userId) {
          // Client was invited but hasn't registered yet - link the new user to existing client
          console.log(`Found existing invited client ${existingClient.id} - linking to new user ${user.id}`);
          client = await storage.updateClient(existingClient.id, {
            userId: user.id,
            status: 'active'
          });
          console.log(`Client ${client.id} linked successfully to user ${user.id}`);
        } else {
          // No existing client or client already has a user - create new client record
          console.log(`Creating new client record for user ${user.id} with organization ${organization.id} and location ${primaryLocationId}`);
          client = await storage.createClient({
            userId: user.id,
            organizationId: organization.id,
            primaryLocationId: primaryLocationId,
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            email: user.email,
            phone: user.phone
          });
          console.log(`Client created successfully:`, client.id);
        }

        // Create client-location association
        if (primaryLocationId) {
          await storage.createClientLocation({
            clientId: client.id,
            locationId: primaryLocationId
          });
          console.log(`Client-location association created for location ${primaryLocationId}`);
        }

        // Log them in
        req.logIn(user, (err) => {
          if (err) {
            return res.status(500).json({ message: "Login failed after registration" });
          }
          res.json({ user: { ...user, password: undefined } });
        });

      } else {
        // Main platform registration: Allow clinic admin, staff, and patient roles
        if (!userData.role || !["clinic_admin", "staff", "patient"].includes(userData.role)) {
          return res.status(400).json({ message: "Invalid role for registration" });
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

        // Create user
        const hashedPassword = await bcrypt.hash(validatedUserData.password, 12);
        const user = await storage.createUser({
          ...validatedUserData,
          password: hashedPassword
        });

        // Handle different user roles
        if (user.role === "patient") {
          // Patients MUST register via clinic-specific link with organizationSlug
          if (!userData.organizationSlug) {
            return res.status(400).json({ 
              message: "Patients can only register via clinic invitation links. Please contact your clinic for the correct registration link." 
            });
          }

          // Find organization by slug
          const organizations = await storage.getOrganizations();
          const targetOrg = organizations.find(org => org.slug === userData.organizationSlug && org.isActive);
          
          if (!targetOrg) {
            return res.status(404).json({ 
              message: "Clinic not found or inactive. Please verify the registration link with your clinic." 
            });
          }

          // Create client record to link patient to specific organization
          await storage.createClient({
            userId: user.id,
            organizationId: targetOrg.id,
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            email: user.email,
            phone: user.phone
          });
          
          // Log them in
          req.logIn(user, (err) => {
            if (err) {
              return res.status(500).json({ message: "Login failed after registration" });
            }
            res.json({ user: { ...user, password: undefined } });
          });
          return;
          
        } else if (user.role === "clinic_admin") {
          // Create organization for the business (no plan assigned yet)
          // User will select plan during onboarding flow
          const organizationData = {
            name: userData.businessName || `${user.firstName || ''} ${user.lastName || ''} Clinic`.trim(),
            slug: (userData.businessName || user.email).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
            subscriptionPlanId: null, // No auto-assignment - user chooses during onboarding
            whiteLabelSettings: {},
            isActive: true
          };
          
          const organization = await storage.createOrganization(organizationData);
          
          // Create staff record linking admin to organization
          await storage.createStaff({
            userId: user.id,
            organizationId: organization.id,
            role: "admin",
            title: "Clinic Administrator",
            isActive: true
          });
          
          console.log(`Created organization ${organization.id} for clinic admin ${user.id} - no plan assigned yet`);
        }

        // Log them in
        req.logIn(user, (err) => {
          if (err) {
            return res.status(500).json({ message: "Login failed after registration" });
          }
          return res.json({ user: { ...user, password: undefined } });
        });
        return; // Ensure we don't fall through to catch block
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", passport.authenticate("local"), async (req, res) => {
    // Check if a patient is trying to login through the main login page
    if (req.user && req.user.role === 'patient') {
      // Log out the patient immediately
      req.logout((err) => {
        if (err) {
          console.error("Failed to logout patient during clinic-only login:", err);
        }
      });
      
      return res.status(403).json({ 
        message: "Patient accounts cannot log in here. Please use your clinic's login page.",
        type: "patient_wrong_login"
      });
    }
    
    res.json({ user: { ...req.user, password: undefined } });
  });

  // Patient-specific login endpoint for clinic URL logins
  app.post("/api/auth/patient-login", passport.authenticate("local"), async (req, res) => {
    const { organizationSlug } = req.body;
    
    // Ensure this is a patient account
    if (!req.user || req.user.role !== 'patient') {
      req.logout((err) => {
        if (err) {
          console.error("Failed to logout non-patient during patient login:", err);
        }
      });
      
      return res.status(403).json({ 
        message: "This login is for patient accounts only. Clinic staff should use the main login page.",
        type: "wrong_user_type"
      });
    }
    
    // Verify patient belongs to the clinic they're trying to login through
    if (organizationSlug) {
      try {
        const client = await storage.getClientByUser(req.user.id);
        
        if (client) {
          // Check if slug is for a location first (same logic as registration)
          let location = await storage.getLocationBySlug(organizationSlug);
          let organization;
          
          if (location && location.isActive) {
            // It's a location slug - get the organization
            organization = await storage.getOrganization(location.organizationId);
          } else {
            // Try organization slug (backward compatibility)
            organization = await storage.getOrganizationBySlug(organizationSlug);
          }
          
          if (!organization || client.organizationId !== organization.id) {
            req.logout((err) => {
              if (err) {
                console.error("Failed to logout patient with wrong clinic:", err);
              }
            });
            
            return res.status(403).json({ 
              message: "Your account is not associated with this clinic. Please use your clinic's login page.",
              type: "wrong_clinic"
            });
          }
        }
      } catch (error) {
        console.error("Error validating patient clinic association:", error);
      }
    }
    
    res.json({ user: { ...req.user, password: undefined } });
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      console.log("📧 Forgot password request received:", { email: req.body.email });
      
      const { email } = req.body;
      
      if (!email) {
        console.log("❌ No email provided");
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      console.log("👤 User lookup result:", { found: !!user, email });
      
      if (user) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        console.log("🔑 Token generated, length:", rawToken.length);
        
        const hashedToken = await bcrypt.hash(rawToken, 10);
        console.log("🔐 Token hashed");
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        console.log("⏰ Token expiry set:", expiresAt.toISOString());
        
        console.log("💾 Creating reset token in database...");
        await storage.createResetToken(user.id, hashedToken, expiresAt);
        console.log("✅ Reset token created successfully");
        
        const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${rawToken}`;
        console.log("📧 Preparing to send email to:", email);
        
        const emailContent = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password - Aesthiq</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Arial', 'Helvetica', sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #B8860B 0%, #DAA520 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 1px;">Password Reset</h1>
              </div>
              <div style="padding: 40px 30px;">
                <h2 style="color: #333333; font-size: 24px; margin: 0 0 20px 0;">Reset Your Password</h2>
                <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                  You requested a password reset for your Aesthiq account. Click the button below to set a new password.
                </p>
                <div style="text-align: center; margin: 35px 0;">
                  <a href="${resetLink}" 
                     style="display: inline-block; background: linear-gradient(135deg, #B8860B 0%, #DAA520 100%); 
                            color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; 
                            font-size: 16px; font-weight: 600; letter-spacing: 0.5px; 
                            box-shadow: 0 4px 15px rgba(184, 134, 11, 0.3);">
                    Reset Password
                  </a>
                </div>
                <p style="color: #999999; font-size: 13px; text-align: center; margin: 20px 0;">
                  Or copy and paste this link into your browser:<br>
                  <span style="color: #B8860B; word-break: break-all;">${resetLink}</span>
                </p>
                <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0;">
                  <strong>This link will expire in 24 hours.</strong><br><br>
                  If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                </p>
              </div>
              <div style="background-color: #333333; padding: 20px 30px; text-align: center;">
                <p style="color: #ffffff; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Aesthiq. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        
        const textContent = `Reset Your Password - Aesthiq\n\n` +
          `You requested a password reset. Click the link below to set a new password:\n\n` +
          `${resetLink}\n\n` +
          `This link will expire in 24 hours.\n\n` +
          `If you didn't request this password reset, please ignore this email.`;
        
        const emailResult = await sendEmail({
          to: email,
          subject: "Reset Your Password - Aesthiq",
          html: emailContent,
          text: textContent
        });
        
        if (emailResult.success) {
          console.log("✅ Email sent successfully, message ID:", emailResult.messageId);
        } else {
          console.warn("⚠️ Email failed to send:", emailResult.error);
          console.warn("   Email details:", emailResult.details);
        }
      }
      
      console.log("✅ Forgot password flow completed successfully");
      res.json({ message: "If an account exists with this email, a password reset link has been sent." });
    } catch (error: any) {
      console.error("❌ Forgot password error:", error);
      console.error("   Error name:", error.name);
      console.error("   Error message:", error.message);
      console.error("   Error stack:", error.stack);
      if (error.cause) {
        console.error("   Error cause:", error.cause);
      }
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }
      
      const allValidTokens = await storage.getAllValidResetTokens();
      
      let validToken = null;
      for (const dbToken of allValidTokens) {
        const isMatch = await bcrypt.compare(token, dbToken.token);
        if (isMatch) {
          validToken = dbToken;
          break;
        }
      }
      
      if (!validToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      
      await storage.updateUser(validToken.userId, { password: hashedPassword });
      
      await storage.invalidateResetToken(validToken.id);
      
      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
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

  // Public signup info endpoint - checks if slug is location or organization
  app.get("/api/signup-info/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      
      // First check if it's a location slug
      const location = await storage.getLocationBySlug(slug);
      if (location && location.isActive) {
        // Get organization info for the location
        const organization = await storage.getOrganization(location.organizationId);
        if (organization && organization.isActive) {
          return res.json({
            id: location.id,
            name: location.name,
            slug: location.slug,
            organizationId: organization.id,
            organizationName: organization.name,
            description: organization.description,
            website: organization.website,
            whiteLabelSettings: organization.whiteLabelSettings,
            isLocation: true
          });
        }
      }
      
      // If not a location, check if it's an organization slug (for backward compatibility)
      const organization = await storage.getOrganizationBySlug(slug);
      if (organization && organization.isActive) {
        return res.json({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          description: organization.description,
          website: organization.website,
          whiteLabelSettings: organization.whiteLabelSettings,
          isLocation: false
        });
      }
      
      return res.status(404).json({ message: "Invalid signup link" });
    } catch (error) {
      console.error("Signup info error:", error);
      res.status(500).json({ message: "Failed to fetch signup info" });
    }
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

      // Include subscription plan details
      let subscriptionPlan = null;
      if (organization.subscriptionPlanId) {
        subscriptionPlan = await storage.getSubscriptionPlan(organization.subscriptionPlanId);
      }

      res.json({
        ...organization,
        subscriptionPlan
      });
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

  app.post("/api/staff", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
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

  // Invite staff member endpoint
  app.post("/api/staff/invite", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { email, firstName, lastName, role, title, commissionRate, commissionType, hourlyRate, serviceIds } = req.body;
      
      console.log(`📋 Processing staff invitation for: ${email}`);
      
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if user already exists with this email
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ 
          message: "A user with this email already exists",
          existingUser: {
            id: existingUser.id,
            email: existingUser.email,
            role: existingUser.role
          }
        });
      }

      // Create a temporary password
      const temporaryPassword = `Temp${Math.random().toString(36).slice(2, 10)}!`;
      
      // Create user account for staff
      let user;
      try {
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
        user = await storage.createUser({
          email,
          username: email,
          password: hashedPassword,
          firstName,
          lastName,
          role: "staff",
          organizationId
        });
        
        console.log(`✅ User account created successfully: ${user.id}`);
      } catch (dbError) {
        console.error('❌ Failed to create user account:', dbError);
        return res.status(500).json({ 
          message: "Failed to create user account",
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
      }

      // Create staff record
      let staff;
      try {
        staff = await storage.createStaff({
          userId: user.id,
          organizationId,
          role: role || "provider",
          title,
          commissionRate: commissionRate || 15,
          commissionType: commissionType || "percentage",
          hourlyRate: hourlyRate || 0,
          canBookOnline: true,
          isActive: true,
        });
        
        console.log(`✅ Staff record created successfully: ${staff.id}`);
      } catch (dbError) {
        console.error('❌ Failed to create staff record:', dbError);
        return res.status(500).json({ 
          message: "Failed to create staff record",
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
      }

      // Prepare invitation link
      const invitationLink = `${req.protocol}://${req.get('host')}/login`;
      
      // Prepare email content
      const emailContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 0;
              background-color: #f5f1e8;
            }
            .container {
              background: white;
              border-radius: 12px;
              overflow: hidden;
              margin: 20px;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            }
            .header {
              background: linear-gradient(135deg, #8b7355 0%, #6b5a45 100%);
              color: white;
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
              letter-spacing: -0.5px;
            }
            .content {
              padding: 40px 30px;
            }
            .content h2 {
              color: #8b7355;
              font-size: 20px;
              margin-bottom: 10px;
            }
            .credentials {
              background: #f8f6f3;
              border-left: 4px solid #8b7355;
              padding: 20px;
              margin: 25px 0;
              border-radius: 6px;
            }
            .credentials p {
              margin: 8px 0;
              font-size: 15px;
            }
            .credentials strong {
              color: #6b5a45;
              display: inline-block;
              width: 120px;
            }
            .button {
              display: inline-block;
              padding: 14px 32px;
              background: linear-gradient(135deg, #8b7355 0%, #6b5a45 100%);
              color: white !important;
              text-decoration: none;
              border-radius: 30px;
              font-weight: 600;
              font-size: 16px;
              margin: 20px 0;
              text-align: center;
            }
            .footer {
              background: #f8f6f3;
              padding: 30px;
              text-align: center;
              color: #666;
              font-size: 14px;
            }
            .role-badge {
              display: inline-block;
              background: #8b7355;
              color: white;
              padding: 6px 16px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: 500;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ${organization.name}</h1>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>You've been invited to join our team at ${organization.name} as a staff member.</p>
              
              <p>Your role: <span class="role-badge">${title || role}</span></p>
              
              <div class="credentials">
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Username:</strong> ${email}</p>
                <p><strong>Password:</strong> ${temporaryPassword}</p>
                <p style="margin-top: 15px; font-size: 14px; color: #666;">
                  ⚠️ Please change your password after your first login for security.
                </p>
              </div>
              
              <p>Click the button below to access your dashboard:</p>
              
              <div style="text-align: center;">
                <a href="${invitationLink}" class="button">Access Your Dashboard</a>
              </div>
              
              <p style="margin-top: 30px;">As a team member, you'll have access to:</p>
              <ul style="color: #555; line-height: 1.8;">
                <li>Your personal staff dashboard</li>
                <li>Appointment management tools</li>
                <li>Client information and history</li>
                <li>Service scheduling</li>
                <li>Commission tracking</li>
              </ul>
            </div>
            <div class="footer">
              <p>If you have any questions, please contact your clinic administrator.</p>
              <p style="margin-top: 15px;">© ${new Date().getFullYear()} ${organization.name}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `Welcome to ${organization.name}\n\n` +
        `Hi ${firstName},\n\n` +
        `You've been invited to join our team as: ${title || role}\n\n` +
        `Your Login Credentials:\n` +
        `Email: ${email}\n` +
        `Username: ${email}\n` +
        `Password: ${temporaryPassword}\n\n` +
        `⚠️ Please change your password after your first login for security.\n\n` +
        `Access your dashboard at: ${invitationLink}\n\n` +
        `If you have any questions, please contact your clinic administrator.\n\n` +
        `© ${new Date().getFullYear()} ${organization.name}. All rights reserved.`;

      // Send invitation email
      const emailResult = await sendEmail({
        to: email,
        subject: `Staff Invitation - ${organization.name}`,
        html: emailContent,
        text: textContent,
        fromName: organization.name
      });

      // Prepare response
      const response: any = {
        success: true,
        staff: {
          id: staff.id,
          userId: user.id,
          firstName,
          lastName,
          email,
          role,
          title,
          createdAt: new Date().toISOString()
        },
        invitation: {
          link: invitationLink,
          sentTo: email,
          temporaryPassword: temporaryPassword // Only for initial display, should not be stored
        },
        emailStatus: {
          sent: emailResult.success,
          message: emailResult.success 
            ? '✅ Invitation email sent successfully'
            : `⚠️ Staff created but email failed to send: ${emailResult.error || 'Unknown error'}`,
          error: emailResult.error,
          debugInfo: emailResult.details
        }
      };

      // Log the final status
      if (emailResult.success) {
        console.log(`✅ Full staff invitation completed for ${email}:`, {
          staffId: staff.id,
          userId: user.id,
          organization: organization.name,
          emailSent: true
        });
      } else {
        console.warn(`⚠️ Partial staff invitation completed for ${email}:`, {
          staffId: staff.id,
          userId: user.id,
          organization: organization.name,
          emailSent: false,
          emailError: emailResult.error
        });
      }

      await auditLog(req, "create", "staff", staff.id, { email, role, title });
      res.json(response);

    } catch (error) {
      console.error("Staff invitation error:", error);
      res.status(500).json({ message: "Failed to send invitation" });
    }
  });

  // Staff Roles Management
  app.get("/api/staff/roles/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      if (req.user!.role !== "super_admin") {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (userOrgId !== organizationId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      const roles = await storage.getStaffRolesByOrganization(organizationId);
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff roles" });
    }
  });

  app.post("/api/staff/roles", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const organizationId = req.user!.role === "super_admin" 
        ? req.body.organizationId 
        : await getUserOrganizationId(req.user!);
        
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID required" });
      }
      
      const roleData = insertStaffRoleSchema.parse({
        ...req.body,
        organizationId
      });
      
      const role = await storage.createStaffRole(roleData);
      await auditLog(req, "create", "staff_role", role.id, roleData);
      res.json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create staff role" });
    }
  });

  app.put("/api/staff/roles/:id", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const role = await storage.updateStaffRole(id, updates);
      await auditLog(req, "update", "staff_role", id, updates);
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to update staff role" });
    }
  });

  app.delete("/api/staff/roles/:id", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { id } = req.params;
      
      await storage.deleteStaffRole(id);
      await auditLog(req, "delete", "staff_role", id, {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete staff role" });
    }
  });

  // Initialize default roles for organization
  app.post("/api/staff/roles/initialize/:organizationId", requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      if (req.user!.role !== "super_admin") {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (userOrgId !== organizationId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      await storage.createDefaultRolesForOrganization(organizationId);
      const roles = await storage.getStaffRolesByOrganization(organizationId);
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize default roles" });
    }
  });

  // Staff Permissions - Update staff member's role
  app.put("/api/staff/permissions/:staffId", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { staffId } = req.params;
      const { roleId } = req.body;
      
      const staff = await storage.updateStaff(staffId, { roleId });
      await auditLog(req, "update", "staff_permissions", staffId, { roleId });
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to update staff permissions" });
    }
  });

  // Staff Availability Management
  app.get("/api/staff/availability/:staffId", requireAuth, async (req, res) => {
    try {
      const { staffId } = req.params;
      const availability = await storage.getStaffAvailabilityByStaff(staffId);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff availability" });
    }
  });

  app.post("/api/staff/availability", requireRole("clinic_admin", "staff", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const availabilityData = insertStaffAvailabilitySchema.parse(req.body);
      const availability = await storage.createStaffAvailability(availabilityData);
      
      await auditLog(req, "create", "staff_availability", availability.id, availabilityData);
      res.json(availability);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create staff availability" });
    }
  });

  app.put("/api/staff/availability/:id", requireRole("clinic_admin", "staff", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const availability = await storage.updateStaffAvailability(id, updates);
      await auditLog(req, "update", "staff_availability", id, updates);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to update staff availability" });
    }
  });

  app.delete("/api/staff/availability/:id", requireRole("clinic_admin", "staff", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { id } = req.params;
      
      await storage.deleteStaffAvailability(id);
      await auditLog(req, "delete", "staff_availability", id, {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete staff availability" });
    }
  });

  // Get available staff for a time slot
  app.get("/api/staff/available-for-slot", requireAuth, async (req, res) => {
    try {
      const { organizationId, startTime, endTime } = req.query;
      
      if (!organizationId || !startTime || !endTime) {
        return res.status(400).json({ message: "organizationId, startTime, and endTime are required" });
      }
      
      const availableStaff = await storage.getAvailableStaffForTimeSlot(
        organizationId as string,
        new Date(startTime as string),
        new Date(endTime as string)
      );
      
      res.json(availableStaff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch available staff" });
    }
  });

  // Staff Services Management
  app.get("/api/staff/services/:staffId", requireAuth, async (req, res) => {
    try {
      const { staffId } = req.params;
      const services = await storage.getStaffServices(staffId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff services" });
    }
  });

  app.post("/api/staff/services", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { staffId, serviceId } = req.body;
      
      if (!staffId || !serviceId) {
        return res.status(400).json({ message: "staffId and serviceId are required" });
      }
      
      const assignment = await storage.assignServiceToStaff(staffId, serviceId);
      await auditLog(req, "create", "staff_service", `${staffId}-${serviceId}`, { staffId, serviceId });
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ message: "Failed to assign service to staff" });
    }
  });

  app.delete("/api/staff/services/:staffId/:serviceId", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { staffId, serviceId } = req.params;
      
      await storage.removeServiceFromStaff(staffId, serviceId);
      await auditLog(req, "delete", "staff_service", `${staffId}-${serviceId}`, {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove service from staff" });
    }
  });

  // Get staff who can perform a specific service
  app.get("/api/services/:serviceId/staff", requireAuth, async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { organizationId } = req.query;
      
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      
      const staff = await storage.getStaffByService(organizationId as string, serviceId);
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff for service" });
    }
  });

  // Update staff member details
  app.put("/api/staff/:id", requireRole("clinic_admin", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const staff = await storage.updateStaff(id, updates);
      await auditLog(req, "update", "staff", id, updates);
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to update staff member" });
    }
  });

  // Get all staff for an organization
  app.get("/api/staff/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const staff = await storage.getStaffByOrganization(organizationId);
      res.json(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });
  
  // Get a specific staff member by ID
  app.get("/api/staff/member/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const staff = await storage.getStaff(id);
      
      if (!staff) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff member" });
    }
  });

  // Client routes
  app.get("/api/clients", requireAuth, requireBusinessSetupComplete, async (req, res) => {
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

  // Update client information
  app.patch("/api/clients/:id", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const { firstName, lastName, email, phone, dateOfBirth, address, notes } = req.body;

      // Get organization ID to verify access
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(403).json({ message: "No organization access" });
      }

      // Get the client to verify it belongs to the user's organization
      const client = await storage.getClientById(id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      if (client.organizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Update the client
      const updatedClient = await storage.updateClient(id, {
        firstName,
        lastName,
        email,
        phone: phone || null,
        dateOfBirth: dateOfBirth || null,
        address: address || null,
        notes: notes || null,
      });

      // Update Stripe customer if email changed and Stripe is configured
      if (client.stripeCustomerId && email !== client.email && stripe) {
        try {
          const organization = await storage.getOrganization(organizationId);
          const updateOptions: any = {
            email,
            name: `${firstName} ${lastName}`,
          };
          
          if (organization?.stripeConnectAccountId) {
            await stripe.customers.update(client.stripeCustomerId, updateOptions, {
              stripeAccount: organization.stripeConnectAccountId
            });
          } else {
            await stripe.customers.update(client.stripeCustomerId, updateOptions);
          }
        } catch (stripeError) {
          console.error("Failed to update Stripe customer:", stripeError);
          // Continue - Stripe update failure is not critical
        }
      }

      res.json(updatedClient);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // Delete client
  app.delete("/api/clients/:id", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { id } = req.params;

      // Get organization ID to verify access
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(403).json({ message: "No organization access" });
      }

      // Get the client to verify it belongs to the user's organization
      const client = await storage.getClientById(id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      if (client.organizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Delete from Stripe if customer exists
      if (client.stripeCustomerId && stripe) {
        try {
          const organization = await storage.getOrganization(organizationId);
          if (organization?.stripeConnectAccountId) {
            await stripe.customers.del(client.stripeCustomerId, {
              stripeAccount: organization.stripeConnectAccountId
            });
          } else {
            await stripe.customers.del(client.stripeCustomerId);
          }
        } catch (stripeError) {
          console.error("Failed to delete Stripe customer:", stripeError);
          // Continue - Stripe deletion failure is not critical
        }
      }

      // Delete the client
      await storage.deleteClient(id);

      res.json({ message: "Client deleted successfully" });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // Toggle client active status
  app.patch("/api/clients/:id/status", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      // Get organization ID to verify access
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(403).json({ message: "No organization access" });
      }

      // Get the client to verify it belongs to the user's organization
      const client = await storage.getClientById(id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      if (client.organizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Update the client status
      const updatedClient = await storage.updateClient(id, {
        isActive,
      });

      res.json(updatedClient);
    } catch (error) {
      console.error("Error updating client status:", error);
      res.status(500).json({ message: "Failed to update client status" });
    }
  });

  app.post("/api/clients", requireRole("clinic_admin", "staff", "super_admin"), requireBusinessSetupComplete, async (req, res) => {
    try {
      // Get organization ID from user session (same logic as GET endpoint)
      let organizationId: string;
      
      if (req.user!.role === "super_admin") {
        organizationId = req.body.organizationId;
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

      // Parse client data and automatically set organizationId
      const clientDataWithOrg = {
        ...req.body,
        organizationId,
        // Convert date string to Date object if needed
        dateOfBirth: req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : undefined
      };
      
      const clientData = insertClientSchema.parse(clientDataWithOrg);
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

  // Services routes
  app.post("/api/services", requireAuth, requireRole("clinic_admin"), async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(403).json({ message: "No organization access" });
      }

      const serviceData = insertServiceSchema.parse({
        ...req.body,
        organizationId
      });

      const service = await storage.createService(serviceData);
      res.json(service);
    } catch (error) {
      console.error("Create service error:", error);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  app.patch("/api/services/:id", requireAuth, requireRole("clinic_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify service exists and belongs to user's organization
      const existingService = await storage.getService(id);
      if (!existingService) {
        return res.status(404).json({ message: "Service not found" });
      }

      const userOrgId = await getUserOrganizationId(req.user!);
      if (req.user!.role !== "super_admin" && existingService.organizationId !== userOrgId) {
        return res.status(403).json({ message: "Access denied - service belongs to another organization" });
      }

      // Validate the request body with the schema
      const updates = insertServiceSchema.partial().parse(req.body);
      
      const service = await storage.updateService(id, updates);
      await auditLog(req, "update", "service", service.id, updates);
      res.json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Update service error:", error);
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", requireAuth, requireBusinessSetupComplete, async (req, res) => {
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

  app.post("/api/appointments", requireAuth, requireBusinessSetupComplete, async (req, res) => {
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

  // Update appointment (clinic admin can edit/reschedule)
  app.patch("/api/appointments/:id", requireAuth, requireRole("clinic_admin", "staff"), async (req, res) => {
    try {
      const appointmentId = req.params.id;
      const appointment = await storage.getAppointment(appointmentId);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Validate organization access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (appointment.organizationId !== userOrgId && req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedAppointment = await storage.updateAppointment(appointmentId, req.body);
      await auditLog(req, "update", "appointment", appointmentId, req.body);
      
      res.json(updatedAppointment);
    } catch (error) {
      console.error("Update appointment error:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // Cancel appointment - patients request cancellation, clinics approve/cancel directly
  app.delete("/api/appointments/:id", requireAuth, async (req, res) => {
    try {
      const appointmentId = req.params.id;
      const appointment = await storage.getAppointment(appointmentId);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Check if appointment is already cancelled or completed
      if (appointment.status === "canceled" || appointment.status === "completed") {
        return res.status(400).json({ message: `Cannot cancel ${appointment.status} appointment` });
      }

      // Check permissions - clinic admin/staff can cancel any, patients can request cancellation
      if (req.user!.role === "patient") {
        const client = await storage.getClientByUser(req.user!.id);
        if (!client || client.id !== appointment.clientId) {
          return res.status(403).json({ message: "Can only cancel your own appointments" });
        }
        // For patients, mark as cancellation requested
        await storage.updateAppointment(appointmentId, { 
          status: "cancellation_requested" as any,
          notes: `${appointment.notes || ''}\nPatient requested cancellation on ${new Date().toLocaleDateString()}`
        });
        res.json({ 
          message: "Cancellation request submitted. Clinic will review and decide on deposit retention.",
          depositPaid: appointment.depositPaid 
        });
      } else {
        // Clinic staff can directly cancel with option to retain deposit
        const userOrgId = await getUserOrganizationId(req.user!);
        if (appointment.organizationId !== userOrgId && req.user!.role !== "super_admin") {
          return res.status(403).json({ message: "Access denied" });
        }
        
        // Check if deposit should be retained (default: no refund for late cancellations)
        const retainDeposit = req.query.retainDeposit !== 'false';
        
        await storage.updateAppointment(appointmentId, { status: "canceled" });
        await auditLog(req, "cancel", "appointment", appointmentId, { 
          status: "canceled",
          depositRetained: retainDeposit,
          depositAmount: appointment.depositPaid
        });
        
        res.json({ 
          message: `Appointment cancelled ${retainDeposit ? 'with deposit retained' : 'with full refund'}`,
          depositRetained: retainDeposit,
          depositAmount: appointment.depositPaid
        });
      }
    } catch (error) {
      console.error("Cancel appointment error:", error);
      res.status(500).json({ message: "Failed to cancel appointment" });
    }
  });

  // Process cancellation request - approve or deny with deposit retention decision
  app.post("/api/appointments/:id/process-cancellation", requireAuth, requireRole("clinic_admin", "staff"), async (req, res) => {
    try {
      const { approved, retainDeposit, reason } = req.body;
      const appointmentId = req.params.id;

      // Get appointment and verify it has cancellation request
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      if (appointment.status !== "cancellation_requested") {
        return res.status(400).json({ message: "No cancellation request pending for this appointment" });
      }

      // Check organization access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (appointment.organizationId !== userOrgId && req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      if (approved) {
        // Approve cancellation
        await storage.updateAppointment(appointmentId, { 
          status: "canceled",
          privateNotes: `${appointment.privateNotes || ''}\nCancellation approved by ${req.user!.email} on ${new Date().toLocaleDateString()}.${retainDeposit ? ' Deposit retained.' : ' Full refund issued.'} Reason: ${reason || 'N/A'}`
        });

        // Handle refund if not retaining deposit
        if (!retainDeposit && Number(appointment.depositPaid) > 0) {
          // Get the original payment transaction
          const transactions = await storage.getTransactionsByAppointment(appointmentId);
          const depositTransaction = transactions.find(t => 
            t.type === "appointment_deposit" && t.status === "completed"
          );

          if (depositTransaction?.stripePaymentIntentId) {
            try {
              // Process refund through Stripe
              const organization = await storage.getOrganization(appointment.organizationId);
              if (stripe && organization?.stripeConnectAccountId) {
                const refund = await stripe.refunds.create({
                  payment_intent: depositTransaction.stripePaymentIntentId,
                  amount: Math.round(Number(appointment.depositPaid) * 100) // Convert to cents
                }, {
                  stripeAccount: organization.stripeConnectAccountId
                });

                // Record refund transaction
                await storage.createTransaction({
                  organizationId: appointment.organizationId,
                  clientId: appointment.clientId,
                  appointmentId: appointment.id,
                  amount: `-${appointment.depositPaid}`,
                  type: "refund",
                  status: "completed",
                  stripePaymentIntentId: depositTransaction.stripePaymentIntentId,
                  description: `Deposit refund for cancelled appointment`
                });
              }
            } catch (refundError) {
              console.error("Refund processing error:", refundError);
              // Continue even if refund fails - log it for manual processing
            }
          }
        }

        await auditLog(req, "approve_cancellation", "appointment", appointmentId, {
          approved: true,
          retainDeposit,
          depositAmount: appointment.depositPaid,
          reason
        });

        res.json({
          message: `Cancellation approved${retainDeposit ? ', deposit retained' : ', deposit refunded'}`,
          approved: true,
          retainDeposit,
          depositAmount: appointment.depositPaid
        });
      } else {
        // Deny cancellation - appointment remains scheduled
        await storage.updateAppointment(appointmentId, { 
          status: "scheduled",
          privateNotes: `${appointment.privateNotes || ''}\nCancellation denied by ${req.user!.email} on ${new Date().toLocaleDateString()}. Reason: ${reason || 'N/A'}`
        });

        await auditLog(req, "deny_cancellation", "appointment", appointmentId, {
          approved: false,
          reason
        });

        res.json({
          message: "Cancellation request denied, appointment remains scheduled",
          approved: false
        });
      }
    } catch (error) {
      console.error("Process cancellation error:", error);
      res.status(500).json({ message: "Failed to process cancellation request" });
    }
  });

  // Check availability for staff on specific date  
  app.get("/api/availability/:staffId", requireAuth, async (req, res) => {
    try {
      const { staffId } = req.params;
      const date = req.query.date as string;
      const locationId = req.query.locationId as string;
      
      // Verify staff belongs to user's organization
      const userOrgId = await getUserOrganizationId(req.user!);
      if (!userOrgId && req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "No organization access" });
      }
      
      const staff = await storage.getStaff(staffId);
      if (!staff) {
        return res.status(404).json({ message: "Staff not found" });
      }
      
      if (req.user!.role !== "super_admin") {
        if (staff.organizationId !== userOrgId) {
          return res.status(403).json({ message: "Staff not accessible" });
        }
      }
      
      if (!date) {
        return res.status(400).json({ message: "Date parameter required" });
      }

      // Get location to access timezone and business hours
      let location;
      if (locationId) {
        location = await storage.getLocation(locationId);
      } else {
        // Get default location for the organization
        const locations = await storage.getLocationsByOrganization(staff.organizationId);
        location = locations.find(l => l.isDefault) || locations[0];
      }

      // Use location's timezone or default to America/New_York
      const timezone = location?.timezone || "America/New_York";
      
      // Parse the date string as if it's in the clinic's timezone
      // The date comes from the frontend calendar which gives us YYYY-MM-DD
      const [year, month, day] = date.split('T')[0].split('-').map(Number);
      
      // Get existing appointments for this staff member on this date
      const existingAppointments = await storage.getAppointmentsByStaff(staffId, new Date(date));
      
      // Get business hours from location or use defaults
      const businessHours = location?.businessHours as any || {
        monday: { open: "09:00", close: "18:00" },
        tuesday: { open: "09:00", close: "18:00" },
        wednesday: { open: "09:00", close: "18:00" },
        thursday: { open: "09:00", close: "18:00" },
        friday: { open: "09:00", close: "18:00" },
        saturday: { open: "09:00", close: "18:00" },
        sunday: { open: "09:00", close: "18:00" }
      };
      
      // Get day of week
      const selectedDate = new Date(year, month - 1, day);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[selectedDate.getDay()];
      const dayHours = businessHours[dayName];
      
      // If clinic is closed on this day, return empty slots
      if (!dayHours || !dayHours.open || !dayHours.close) {
        return res.json({
          date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          timezone,
          slots: []
        });
      }
      
      // Parse business hours
      const [startHour, startMinute] = dayHours.open.split(':').map(Number);
      const [endHour, endMinute] = dayHours.close.split(':').map(Number);
      
      // Generate time slots based on business hours (30-minute intervals)
      const slots = [];
      const intervalMinutes = 30;
      
      let currentHour = startHour;
      let currentMinute = startMinute;
      
      while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
        // Create slot time in UTC for comparison with database times
        const slotTime = new Date(Date.UTC(year, month - 1, day, currentHour, currentMinute, 0, 0));
        
        // Format time for display (HH:MM in clinic's local time)
        const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        
        // Check if this slot conflicts with existing appointments
        const isAvailable = !existingAppointments.some(apt => {
          const aptStart = new Date(apt.startTime);
          const aptEnd = new Date(apt.endTime);
          return slotTime >= aptStart && slotTime < aptEnd;
        });
        
        slots.push({
          time: timeString,
          available: isAvailable,
          staffId: staffId,
          datetime: slotTime.toISOString()
        });
        
        // Increment by interval
        currentMinute += intervalMinutes;
        if (currentMinute >= 60) {
          currentHour += Math.floor(currentMinute / 60);
          currentMinute = currentMinute % 60;
        }
      }

      res.json({
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        timezone,
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
      // Use the service's paymentType configuration to determine what to charge
      // If service is set to "deposit", charge only the deposit amount
      // If service is set to "full", charge the full price
      const isDepositPayment = service.paymentType === 'deposit';
      const paymentAmount = isDepositPayment ? Number(service.depositAmount || 0) : Number(service.price);
      
      // Create Stripe PaymentIntent using DESTINATION CHARGE pattern
      if (!stripe) {
        return res.status(500).json({ message: "Payment system not configured" });
      }
      
      const organization = await storage.getOrganization(service.organizationId);
      
      // CRITICAL: Must have Connect account for multi-tenant isolation
      if (!organization?.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: "Payment system not configured. Clinic must complete Stripe Connect onboarding first.",
          error_code: "STRIPE_CONNECT_REQUIRED"
        });
      }

      // Calculate platform commission based on organization's subscription plan
      const orgPlan = organization.subscriptionPlanId ? 
        await storage.getSubscriptionPlan(organization.subscriptionPlanId) : null;
      
      // Commission rates: Professional=12%, Enterprise=10%, default=12%
      const commissionPercent = orgPlan?.tier === 'enterprise' ? 10 : 12;
      const applicationFeeAmount = Math.round((paymentAmount * commissionPercent / 100) * 100); // in cents
      
      console.log(`🔍 [PAYMENT INTENT] Creating DESTINATION CHARGE for org: ${organization.name}`);
      console.log(`🔍 [PAYMENT INTENT] Amount: $${paymentAmount}, Commission: ${commissionPercent}% ($${applicationFeeAmount/100})`);
      console.log(`🔍 [PAYMENT INTENT] Destination Connect account: ${organization.stripeConnectAccountId}`);
      
      // DESTINATION CHARGE: Created on platform account, funds transferred to Connect account
      // This allows application_fee_amount and on_behalf_of for proper commission collection
      const paymentIntentData: any = {
        amount: Math.round(paymentAmount * 100), // Convert to cents
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
        application_fee_amount: applicationFeeAmount, // Platform commission
        transfer_data: {
          destination: organization.stripeConnectAccountId, // Clinic receives funds (minus commission)
        },
        on_behalf_of: organization.stripeConnectAccountId, // Charge appears on clinic's Stripe account
        metadata: {
          serviceId: service.id,
          organizationId: service.organizationId,
          clientId: client.id,
          clientEmail: client.email || '',
          clientName: `${client.firstName} ${client.lastName}`,
          paymentType: isDepositPayment ? "deposit" : "full_payment",
          platformCommission: `${commissionPercent}%`
        }
      };
      
      // Create destination charge on PLATFORM account (funds go to clinic's Connect account)
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
      
      console.log(`✅ [PAYMENT INTENT] Destination charge created: ${paymentIntent.id}`);

      // Create appointment with pending status - only marked as scheduled after payment confirmation
      const appointment = await storage.createAppointment({
        organizationId: service.organizationId,
        locationId,
        clientId: client.id,
        staffId,
        serviceId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        totalAmount: (service.price || 0).toString(),
        depositPaid: "0", // No deposit paid yet until payment is confirmed
        status: "pending"
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
      if (!stripe) {
        return res.status(500).json({ message: "Payment system not configured" });
      }
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ message: "Payment not confirmed" });
      }

      // Get transaction to determine payment amount and type
      const transactions = await storage.getTransactionsByAppointment(appointmentId);
      const transaction = transactions.find(t => t.stripePaymentIntentId === paymentIntentId);
      const paymentAmount = paymentIntent.amount / 100; // Convert cents to dollars

      // Update appointment to scheduled (confirmed) and record deposit/payment
      await storage.updateAppointment(appointmentId, {
        status: "scheduled",
        depositPaid: paymentAmount.toString() // Record the amount paid
      });

      // Update transaction to succeeded
      await storage.updateTransactionByPaymentIntent(paymentIntentId, {
        status: "completed"
      });

      // Award reward points for service payment (with idempotency check)
      if (appointment.clientId && paymentIntent.amount) {
        // Check if reward already exists for this appointment
        const existingRewards = await storage.getRewardsByClient(appointment.clientId);
        const alreadyAwarded = existingRewards.some(r => 
          r.referenceType === 'appointment' && r.referenceId === appointmentId
        );
        
        if (!alreadyAwarded) {
          const pointsEarned = await calculateRewardPoints(
            appointment.clientId, 
            appointment.organizationId, 
            paymentIntent.amount / 100 // Convert cents to dollars
          );
          
          if (pointsEarned > 0) {
            await storage.createReward({
              organizationId: appointment.organizationId,
              clientId: appointment.clientId,
              points: pointsEarned,
              reason: `Service payment: ${appointment.notes || 'Appointment'}`,
              referenceId: appointmentId,
              referenceType: 'appointment'
            });
          }
        }
      }

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
  app.post("/api/appointments/:id/finalize-payment", requireAuth, requireRole("clinic_admin", "staff"), async (req, res) => {
    try {
      const { finalTotal } = req.body;
      const appointmentId = req.params.id;

      if (!finalTotal || Number(finalTotal) <= 0) {
        return res.status(400).json({ message: "Valid final total amount required" });
      }

      // Get appointment and verify permissions
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Check if user has access to this organization
      const userOrgId = await getUserOrganizationId(req.user!);
      if (req.user!.role !== "super_admin" && userOrgId !== appointment.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get client's Stripe customer ID
      const client = await storage.getClient(appointment.clientId);
      if (!client) {
        return res.status(400).json({ message: "Client not found" });
      }

      // Calculate remaining balance
      const paidTransactions = await storage.getTransactionsByAppointment(appointmentId);
      const totalPaid = paidTransactions
        .filter(t => t.status === "completed")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const remainingBalance = Number(finalTotal) - totalPaid;

      if (remainingBalance <= 0) {
        // Just update the total if no additional payment needed
        await storage.updateAppointment(appointmentId, { 
          totalAmount: finalTotal.toString(),
          status: "completed" 
        });
        return res.json({
          message: "Appointment finalized without additional charge",
          finalTotal,
          remainingBalance: 0
        });
      }

      // Get organization to access Stripe Connect account
      const organization = await storage.getOrganization(appointment.organizationId);
      if (!organization?.stripeConnectAccountId) {
        return res.status(400).json({ message: "Payment system not configured for this organization" });
      }

      // Create payment intent for remaining balance
      if (!client.stripeCustomerId) {
        return res.status(400).json({ message: "Client has no payment method on file. Please collect payment manually." });
      }

      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(remainingBalance * 100), // Convert to cents
        "usd",
        client.stripeCustomerId,
        {
          appointmentId: appointment.id,
          paymentType: "remaining_balance"
        },
        organization.stripeConnectAccountId
      );

      // Update appointment with final total
      await storage.updateAppointment(appointmentId, { 
        totalAmount: finalTotal.toString() 
      });

      // Create transaction record for the remaining balance
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

      await auditLog(req, "finalize_payment", "appointment", appointment.id, { 
        finalTotal, 
        remainingBalance,
        previousTotal: appointment.totalAmount
      });

      res.json({
        message: "Payment intent created for remaining balance",
        finalTotal,
        remainingBalance,
        paymentIntentId: paymentIntent.paymentIntentId,
        clientSecret: paymentIntent.clientSecret
      });

    } catch (error) {
      console.error("Finalize payment error:", error);
      res.status(500).json({ message: "Failed to finalize payment: " + (error as any).message });
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
      
      // Get organization's Stripe Connect account ID
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "User not associated with an organization" });
      }
      
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(400).json({ message: "Organization not found" });
      }
      
      const stripeConnectAccountId = organization.stripeConnectAccountId;
      
      // Create Stripe product and prices for the service
      let stripeProductId, stripePriceId, stripeDepositPriceId;
      
      if (stripeConnectAccountId && serviceData.price) {
        console.log(`🔍 [SERVICE-STRIPE] Attempting to create product for service: ${serviceData.name}`);
        console.log(`🔍 [SERVICE-STRIPE] Connect Account: ${stripeConnectAccountId}`);
        console.log(`🔍 [SERVICE-STRIPE] Service Price: $${serviceData.price}`);
        
        try {
          // Always create a Stripe product for the service
          const product = await stripeService.createProduct({
            name: serviceData.name,
            description: serviceData.description || `${serviceData.name} service`,
            connectAccountId: stripeConnectAccountId
          });
          stripeProductId = product.id;

          // Create main service price
          stripePriceId = await stripeService.createOneTimePrice({
            productId: product.id,
            amount: Math.round(parseFloat(serviceData.price.toString()) * 100), // Convert service price to cents
            connectAccountId: stripeConnectAccountId
          });

          console.log(`✅ [SERVICE-STRIPE] Success: Product ${stripeProductId}, Price ${stripePriceId}`);

          // Additionally create deposit price if required
          if (serviceData.depositRequired && serviceData.depositAmount) {
            stripeDepositPriceId = await stripeService.createOneTimePrice({
              productId: product.id,
              amount: Math.round(parseFloat(serviceData.depositAmount.toString()) * 100), // Convert deposit to cents
              connectAccountId: stripeConnectAccountId
            });
            console.log(`✅ [SERVICE-STRIPE] Deposit price created: ${stripeDepositPriceId} (Amount: $${serviceData.depositAmount})`);
          }

        } catch (stripeError) {
          console.error(`❌ [SERVICE-STRIPE] Failed to create Stripe product:`, stripeError);
          console.error(`❌ [SERVICE-STRIPE] Error details:`, {
            message: stripeError instanceof Error ? stripeError.message : 'Unknown error',
            accountId: stripeConnectAccountId,
            serviceName: serviceData.name
          });
          // Continue without Stripe integration for now
        }
      } else if (!stripeConnectAccountId) {
        console.log(`⚠️ [SERVICE-STRIPE] No Stripe Connect account found for organization - skipping Stripe product creation`);
      } else {
        console.log(`⚠️ [SERVICE-STRIPE] No service price specified for: ${serviceData.name} - skipping Stripe product creation`);
      }

      // Add organization ID and Stripe IDs to service data
      const serviceWithStripe = {
        ...serviceData,
        organizationId,
        stripeProductId,
        stripePriceId
      };

      const service = await storage.createService(serviceWithStripe);
      
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

  // Upgrade membership endpoint with Stripe subscription
  app.post("/api/memberships/upgrade", requireAuth, async (req, res) => {
    try {
      const { tierId, billingCycle } = req.body;
      
      // Get client record for current user
      const client = await storage.getClientByUser(req.user!.id);
      if (!client) {
        return res.status(404).json({ message: "Client profile not found" });
      }

      // Get membership tier with Stripe price IDs (handle both UUID and name)
      let tier;
      console.log(`🔍 [TIER LOOKUP] tierId: ${tierId}, clientOrgId: ${client.organizationId}`);
      
      try {
        // First try as UUID
        tier = await storage.getMembershipTier(tierId);
        console.log(`✅ [TIER LOOKUP] Found tier by UUID:`, tier?.name);
      } catch (error) {
        console.log(`❌ [TIER LOOKUP] UUID lookup failed, trying name lookup`);
        // If UUID lookup fails, try by tier name
        const tiers = await storage.getMembershipTiersByOrganization(client.organizationId);
        console.log(`🔍 [TIER LOOKUP] Found ${tiers.length} tiers for org:`, tiers.map(t => t.name));
        tier = tiers.find(t => t.name.toLowerCase() === tierId.toLowerCase());
        console.log(`🔍 [TIER LOOKUP] Name match result:`, tier?.name || 'NO MATCH');
      }
      
      if (!tier) {
        console.log(`❌ [TIER LOOKUP] No tier found for: ${tierId}`);
        return res.status(404).json({ message: "Membership tier not found" });
      }
      
      console.log(`✅ [TIER LOOKUP] Using tier: ${tier.name} (${tier.id})`);

      // Get the appropriate Stripe price ID based on billing cycle
      const priceId = billingCycle === 'yearly' ? tier.stripePriceIdYearly : tier.stripePriceIdMonthly;
      
      let membership;
      let clientSecret = null;
      let subscriptionId = null;
      let requiresPayment = false;
      
      if (!priceId) {
        // SECURITY: Only allow free memberships in development environment
        if (process.env.NODE_ENV === 'production') {
          console.error(`🚨 [SECURITY] Attempted to create free membership in production for tier ${tier.name}`);
          return res.status(400).json({ 
            message: "Payment is required for membership subscriptions. Please contact support if you believe this is an error." 
          });
        }
        
        console.log(`⚠️ [STRIPE] No price ID configured for tier ${tier.name}, creating free membership for development`);
        
        // Create active membership without Stripe integration (for development/testing ONLY)
        membership = await storage.createMembership({
          clientId: client.id,
          tierName: tier.name, // Use actual tier name instead of tierId
          startDate: new Date(),
          status: 'active', // Active immediately since no payment required (DEV ONLY)
          organizationId: client.organizationId,
          monthlyFee: billingCycle === 'yearly' ? tier.yearlyPrice || tier.monthlyPrice : tier.monthlyPrice,
          stripeSubscriptionId: null
        });

        await auditLog(req, "upgrade_completed_dev", "membership", membership.id, { tierId, billingCycle, reason: "no_stripe_config" });
        
        // Award membership signup points immediately
        await storage.createReward({
          clientId: client.id,
          points: 100,
          reason: "membership_signup",
          organizationId: client.organizationId
        });
        
      } else {
        // Full Stripe integration flow
        // Get organization to access Stripe Connect account
        const organization = await storage.getOrganization(client.organizationId);
        
        // Get or create Stripe customer
        let stripeCustomerId = req.user!.stripeCustomerId;
        console.log(`🔍 [MEMBERSHIP UPGRADE] Checking customer - User: ${req.user!.email}, existing customer ID: ${stripeCustomerId}`);
        
        // CRITICAL: Must have Connect account for multi-tenant isolation
        if (!organization?.stripeConnectAccountId) {
          return res.status(400).json({ 
            message: "Payment system not configured. Please complete Stripe Connect onboarding first.",
            error_code: "STRIPE_CONNECT_REQUIRED"
          });
        }

        if (!stripeCustomerId) {
          console.log(`🔍 [MEMBERSHIP UPGRADE] Creating new customer on Connect account: ${organization.stripeConnectAccountId}`);
          
          // Create customer on CLINIC'S Connect account for tenant isolation
          const customer = await stripeService.createCustomer(
            req.user!.email,
            `${req.user!.firstName || ''} ${req.user!.lastName || ''}`,
            client.organizationId,
            organization.stripeConnectAccountId // MUST use Connect account
          );
          stripeCustomerId = customer.id;
          console.log(`✅ [MEMBERSHIP UPGRADE] Customer created: ${customer.id} on Connect account`);
          
          // Update user with Stripe customer ID
          await storage.updateUser(req.user!.id, { stripeCustomerId });
          
          // IMPORTANT: Also update the client record with Stripe customer ID
          await storage.updateClient(client.id, { stripeCustomerId });
        }

        // Calculate platform commission based on organization's subscription plan
        const orgPlan = organization.subscriptionPlanId ? 
          await storage.getSubscriptionPlan(organization.subscriptionPlanId) : null;
        
        // Commission rates: Professional=12%, Enterprise=10%, default=12%
        const commissionPercent = orgPlan?.tier === 'enterprise' ? 10 : 12;
        
        console.log(`🔍 [MEMBERSHIP UPGRADE] Commission: ${commissionPercent}% for plan ${orgPlan?.tier || 'default'}`);

        // Create Stripe subscription on CLINIC'S Connect account with application fee
        const subscriptionResult = await stripeService.createSubscription(
          stripeCustomerId,
          priceId,
          undefined,
          organization.stripeConnectAccountId, // MUST use Connect account
          commissionPercent // Platform commission percentage
        );

        // Create inactive membership record until payment confirmed
        membership = await storage.createMembership({
          clientId: client.id,
          tierName: tier.name, // Use actual tier name instead of tierId
          startDate: new Date(),
          status: 'suspended', // Will be activated by webhook
          organizationId: client.organizationId,
          monthlyFee: billingCycle === 'yearly' ? tier.yearlyPrice || tier.monthlyPrice : tier.monthlyPrice,
          stripeSubscriptionId: subscriptionResult.subscriptionId
        });

        await auditLog(req, "upgrade_initiated", "membership", membership.id, { tierId, billingCycle, subscriptionId: subscriptionResult.subscriptionId });
        
        clientSecret = subscriptionResult.clientSecret;
        subscriptionId = subscriptionResult.subscriptionId;
        requiresPayment = true;
      }
      
      // Return membership data and payment info
      res.json({
        membership,
        clientSecret,
        subscriptionId,
        requiresPayment
      });
    } catch (error) {
      console.error("Membership upgrade error:", error);
      res.status(500).json({ message: "Failed to upgrade membership" });
    }
  });

  // Rewards routes
  // Get current user's rewards - MUST come before parameterized route
  app.get("/api/rewards/my-rewards", requireAuth, async (req, res) => {
    try {
      console.log("🔍 [GET /api/rewards/my-rewards] User:", req.user?.id, "Role:", req.user?.role);
      
      // Get client record for current user
      const client = await storage.getClientByUser(req.user!.id);
      if (!client) {
        console.log("🔍 [GET /api/rewards/my-rewards] Client profile not found for user:", req.user!.id);
        return res.status(404).json({ message: "Client profile not found" });
      }
      
      console.log("🔍 [GET /api/rewards/my-rewards] Found client:", client.id);

      const rewards = await storage.getRewardsByClient(client.id);
      console.log("🔍 [GET /api/rewards/my-rewards] Found rewards count:", rewards?.length || 0);
      
      const balance = await storage.getClientRewardBalance(client.id);
      console.log("🔍 [GET /api/rewards/my-rewards] Calculated balance:", balance);
      
      res.json({ rewards, balance: balance || 0 });
    } catch (error) {
      console.error("❌ [GET /api/rewards/my-rewards] Failed to fetch rewards:", error);
      console.error("❌ [GET /api/rewards/my-rewards] Error details:", (error as any)?.message, (error as any)?.stack);
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  // Get rewards by client ID - parameterized route (must come after specific routes)
  app.get("/api/rewards/:clientId", requireAuth, async (req, res) => {
    try {
      const rewards = await storage.getRewardsByClient(req.params.clientId);
      const balance = await storage.getClientRewardBalance(req.params.clientId);
      res.json({ rewards, balance });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  // Redeem points endpoint
  app.post("/api/rewards/redeem", requireAuth, async (req, res) => {
    try {
      const { optionId } = req.body;
      
      // Get client record for current user
      const client = await storage.getClientByUser(req.user!.id);
      if (!client) {
        return res.status(404).json({ message: "Client profile not found" });
      }

      // Look up reward option from catalog
      const rewardOption = await storage.getRewardOptionById(optionId);
      if (!rewardOption) {
        return res.status(404).json({ message: "Reward option not found" });
      }

      if (!rewardOption.isActive) {
        return res.status(400).json({ message: "This reward option is no longer available" });
      }

      if (rewardOption.organizationId !== client.organizationId) {
        return res.status(403).json({ message: "This reward is not available for your organization" });
      }

      const pointsCost = rewardOption.pointsCost;

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
        reason: `Redeemed: ${rewardOption.name}`,
        referenceId: rewardOption.id,
        referenceType: 'reward_option'
      });

      await auditLog(req, "redeem", "reward", reward.id, { 
        optionId, 
        optionName: rewardOption.name, 
        pointsCost,
        discountValue: rewardOption.discountValue 
      });
      
      res.json({ 
        message: "Points redeemed successfully", 
        reward,
        discountValue: rewardOption.discountValue 
      });
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

  // Reward Options API (catalog items)
  app.get("/api/reward-options", requireAuth, async (req, res) => {
    try {
      console.log("🔍 [GET /api/reward-options] User:", req.user?.email, "Role:", req.user?.role);
      
      const orgId = await getUserOrganizationId(req.user!);
      console.log("🔍 [GET /api/reward-options] Organization ID:", orgId);
      
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      const options = await storage.getRewardOptionsByOrganization(orgId);
      console.log("🔍 [GET /api/reward-options] Found options:", options.length);
      
      res.json(options);
    } catch (error) {
      console.error('Error fetching reward options:', error);
      res.status(500).json({ message: "Failed to fetch reward options" });
    }
  });

  app.post("/api/reward-options", requireAuth, async (req, res) => {
    try {
      const orgId = await getUserOrganizationId(req.user!);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      console.log("📋 [POST /api/reward-options] Request body:", JSON.stringify(req.body, null, 2));

      let optionData;
      try {
        optionData = insertRewardOptionSchema.parse({
          ...req.body,
          organizationId: orgId
        });
      } catch (parseError: any) {
        console.error("❌ [REWARD-OPTIONS] Validation failed:", JSON.stringify(parseError.errors, null, 2));
        throw parseError;
      }

      // Get organization and Stripe Connect account
      const organization = await storage.getOrganization(orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const stripeConnectAccountId = organization.stripeConnectAccountId;

      // Create Stripe product on Connect account if available (optional for rewards)
      let stripeProductId, stripePriceId;
      if (stripeConnectAccountId && optionData.discountValue) {
        try {
          console.log(`🔄 [STRIPE] Creating reward option product on Connect account ${stripeConnectAccountId} for: ${optionData.name}`);
          
          const product = await stripeService.createProduct({
            name: `${optionData.name} Reward`,
            description: optionData.description || `Reward: ${optionData.name}`,
            connectAccountId: stripeConnectAccountId
          });

          // Create price for the discount value (one-time)
          stripePriceId = await stripeService.createOneTimePrice({
            productId: product.id,
            amount: Math.round(parseFloat(optionData.discountValue.toString()) * 100),
            connectAccountId: stripeConnectAccountId
          });

          stripeProductId = product.id;
          console.log(`✅ [STRIPE] Created reward product ${product.id} and price ${stripePriceId} on Connect account for: ${optionData.name}`);
        } catch (stripeError) {
          console.error('⚠️ [STRIPE] Failed to create reward product on Connect account (continuing without Stripe):', stripeError);
        }
      }

      const rewardOption = await storage.createRewardOption({
        ...optionData,
        stripeProductId,
        stripePriceId
      });

      await auditLog(req, "create", "reward_option", rewardOption.id, optionData);
      res.json(rewardOption);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error('Error creating reward option:', error);
      res.status(500).json({ message: "Failed to create reward option" });
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
      // Validate request body
      const chatSchema = z.object({
        message: z.string().min(1, "Message cannot be empty"),
        context: z.object({
          clientName: z.string().optional(),
          membershipStatus: z.string().optional(),
          rewardPoints: z.number().optional(),
          availableServices: z.array(z.any()).optional(),
          availableMemberships: z.array(z.any()).optional(),
        }).optional()
      });

      const { message, context } = chatSchema.parse(req.body);
      const response = await openaiService.generateBookingChatResponse(message, {
        ...context,
        availableServices: context?.availableServices || [],
        availableSlots: context?.availableSlots
      });
      res.json({ response });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Chat error:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  // Membership Tiers API (authenticated)
  app.get("/api/membership-tiers", requireAuth, async (req, res) => {
    try {
      console.log('🔍 [GET /api/membership-tiers] Request received for user:', req.user!.email, 'role:', req.user!.role);
      const orgId = await getUserOrganizationId(req.user!);
      console.log('🔍 [GET /api/membership-tiers] Organization ID:', orgId);
      if (!orgId) {
        // For patient role, try getting client directly as fallback
        if (req.user!.role === 'patient') {
          const client = await storage.getClientByUser(req.user!.id);
          console.log('🔍 [GET /api/membership-tiers] Fallback client lookup:', client?.id, 'orgId:', client?.organizationId);
          if (client?.organizationId) {
            const tiers = await storage.getMembershipTiersByOrganization(client.organizationId);
            console.log('🔍 [GET /api/membership-tiers] Found tiers via fallback:', tiers.length);
            return res.json(tiers);
          }
        }
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

      // Get organization and Stripe Connect account
      const organization = await storage.getOrganization(orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      const stripeConnectAccountId = organization.stripeConnectAccountId;

      // Create Stripe products/prices on the organization's Connect account
      let stripePriceIdMonthly, stripePriceIdYearly;
      if (tierData.monthlyPrice && stripeConnectAccountId) {
        try {
          console.log(`🔄 [STRIPE] Creating membership product on Connect account ${stripeConnectAccountId} for: ${tierData.name}`);
          
          const product = await stripeService.createProduct({
            name: `${tierData.name} Membership`,
            description: tierData.description || `${tierData.name} membership tier`,
            connectAccountId: stripeConnectAccountId
          });

          stripePriceIdMonthly = await stripeService.createPrice({
            productId: product.id,
            amount: Math.round(parseFloat(tierData.monthlyPrice.toString()) * 100),
            interval: 'month',
            connectAccountId: stripeConnectAccountId
          });

          if (tierData.yearlyPrice) {
            stripePriceIdYearly = await stripeService.createPrice({
              productId: product.id,
              amount: Math.round(parseFloat(tierData.yearlyPrice.toString()) * 100),
              interval: 'year',
              connectAccountId: stripeConnectAccountId
            });
          }

          console.log(`✅ [STRIPE] Created membership product ${product.id} with prices (Monthly: ${stripePriceIdMonthly}, Yearly: ${stripePriceIdYearly || 'N/A'}) on Connect account ${stripeConnectAccountId} for: ${tierData.name}`);
        } catch (stripeError) {
          console.error('❌ [STRIPE] Failed to create membership product/prices on Connect account:', stripeError);
          return res.status(500).json({ 
            message: "Failed to create membership plan in Stripe. Please check your Stripe Connect setup.", 
            error: stripeError.message 
          });
        }
      } else if (!stripeConnectAccountId) {
        console.log(`⚠️ [STRIPE] No Stripe Connect account found for organization - membership will be created without Stripe integration`);
        return res.status(400).json({ 
          message: "Stripe Connect account required to create membership plans. Please complete your payment setup first." 
        });
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
      // If user is authenticated (patient or clinic staff), filter by their organization
      if (req.isAuthenticated()) {
        const orgId = await getUserOrganizationId(req.user!);
        
        if (orgId) {
          let locations = await storage.getLocationsByOrganization(orgId);
          
          // For patients, filter based on membership and location assignments
          if (req.user!.role === "patient") {
            const client = await storage.getClientByUser(req.user!.id);
            
            if (client) {
              // Check if patient has multi-location access via membership
              const hasMultiAccess = await hasMultiLocationAccess(client.id, orgId);
              
              if (hasMultiAccess) {
                // Patient with multi-location membership sees all org locations
                // No filtering needed
              } else {
                // Get patient's authorized locations from clientLocations
                const clientLocationLinks = await storage.getClientLocations(client.id);
                
                if (clientLocationLinks.length > 0) {
                  // Filter to only show authorized locations
                  const authorizedLocationIds = clientLocationLinks.map(cl => cl.locationId);
                  locations = locations.filter(loc => authorizedLocationIds.includes(loc.id));
                } else if (client.primaryLocationId) {
                  // Fallback to primary location if no client-location links exist
                  locations = locations.filter(loc => loc.id === client.primaryLocationId);
                } else {
                  // Legacy patient without location assignment - assign to first org location
                  if (locations.length > 0) {
                    const firstLocation = locations[0];
                    // Backfill: assign patient to first location
                    await storage.updateClient(client.id, { primaryLocationId: firstLocation.id });
                    await storage.createClientLocation({ clientId: client.id, locationId: firstLocation.id });
                    locations = [firstLocation];
                  }
                }
              }
            }
          }
          
          return res.json(locations);
        }
      }
      
      // For public booking, get all active locations
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      console.error("Failed to fetch locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  // Get location by slug - public endpoint for location-specific booking
  app.get("/api/locations/by-slug/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const location = await storage.getLocationBySlug(slug);
      
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      if (!location.isActive) {
        return res.status(404).json({ message: "Location is not currently available" });
      }
      
      res.json(location);
    } catch (error) {
      console.error("Failed to fetch location by slug:", error);
      res.status(500).json({ message: "Failed to fetch location" });
    }
  });

  // Create location - enforces subscription plan limits
  app.post("/api/locations", requireAuth, async (req, res) => {
    try {
      const orgId = await getUserOrganizationId(req.user!);
      if (!orgId) {
        return res.status(400).json({ message: "User organization not found" });
      }

      // Get organization with subscription plan
      const organization = await storage.getOrganization(orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get subscription plan to check limits
      let maxLocations = 1; // Default for free/starter plans
      if (organization.subscriptionPlanId) {
        const plan = await storage.getSubscriptionPlan(organization.subscriptionPlanId);
        if (plan && plan.maxLocations !== null) {
          maxLocations = plan.maxLocations;
        }
      }

      // Check current location count
      const currentLocations = await storage.getLocationsByOrganization(orgId);
      if (currentLocations.length >= maxLocations) {
        return res.status(403).json({ 
          message: `Your ${organization.subscriptionPlanId ? 'current plan' : 'plan'} allows ${maxLocations} location${maxLocations !== 1 ? 's' : ''}. Please upgrade to add more locations.`,
          maxLocations,
          currentCount: currentLocations.length
        });
      }

      // Generate slug from name
      const slug = req.body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substring(2, 8);

      // Create location
      const locationData = {
        organizationId: orgId,
        name: req.body.name,
        slug,
        address: req.body.address || null,
        phone: req.body.phone || null,
        email: req.body.email || null,
        timezone: req.body.timezone || 'America/New_York',
        businessHours: req.body.businessHours || null,
        isDefault: currentLocations.length === 0, // First location is default
        publicSettings: req.body.publicSettings || null,
        settings: req.body.settings || null,
        isActive: true
      };

      const location = await storage.createLocation(locationData);
      res.json(location);
    } catch (error) {
      console.error("Failed to create location:", error);
      res.status(500).json({ message: "Failed to create location" });
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

  app.get("/api/staff", requireBusinessSetupComplete, async (req, res) => {
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

  // Patient invitation endpoint
  app.post("/api/patients/invite", requireAuth, async (req, res) => {
    try {
      const { email, firstName, lastName, phone } = req.body;
      
      console.log(`📋 Processing patient invitation for: ${email}`);
      
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if patient already exists with this email in this organization
      const existingClients = await storage.getClientsByOrganization(organizationId);
      const existingClient = existingClients.find((client: any) => client.email === email);
      
      if (existingClient) {
        return res.status(400).json({ 
          message: "Patient with this email already exists",
          existingPatient: {
            id: existingClient.id,
            name: `${existingClient.firstName} ${existingClient.lastName}`,
            status: existingClient.status
          }
        });
      }

      // IMPORTANT: Create patient record first - this should always succeed
      let client;
      try {
        client = await storage.createClient({
          organizationId,
          firstName,
          lastName,
          email,
          phone: phone || null,
          status: "invited" // Mark as invited until they complete registration
        });
        
        console.log(`✅ Patient record created successfully: ${client.id}`);
      } catch (dbError) {
        console.error('❌ Failed to create patient record:', dbError);
        return res.status(500).json({ 
          message: "Failed to create patient record",
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
      }

      // Create Stripe customer on clinic's connected account
      let stripeCustomerId = null;
      if (organization.stripeConnectAccountId && stripe) {
        try {
          const stripeCustomer = await stripeService.createCustomer(
            email,
            `${firstName} ${lastName}`,
            organizationId,
            organization.stripeConnectAccountId // Create on connected account
          );
          
          stripeCustomerId = stripeCustomer.id;
          
          // Update patient record with Stripe customer ID
          await storage.updateClient(client.id, {
            stripeCustomerId: stripeCustomerId
          });
          
          console.log(`✅ Stripe customer created on connected account: ${stripeCustomerId}`);
          console.log(`   Connected Account: ${organization.stripeConnectAccountId}`);
        } catch (stripeError) {
          console.error('⚠️ Failed to create Stripe customer (non-fatal):', stripeError);
          // Continue without Stripe - this is not a fatal error
        }
      } else if (!organization.stripeConnectAccountId) {
        console.log(`⚠️ Organization ${organizationId} does not have Stripe Connect configured`);
      }

      // Create user account immediately
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 12);
      const username = email.split('@')[0] + '-' + crypto.randomBytes(4).toString('hex');
      
      let user;
      try {
        user = await storage.createUser({
          email,
          username,
          password: hashedPassword,
          firstName,
          lastName,
          phone: phone || null,
          role: 'patient'
        });
        
        console.log(`✅ User account created: ${user.id}`);
        
        await storage.updateClient(client.id, { userId: user.id, status: 'active' });
        console.log(`✅ Client linked to user account`);
      } catch (userError) {
        console.error('❌ Failed to create user account:', userError);
        return res.status(500).json({ 
          message: "Failed to create user account",
          error: userError instanceof Error ? userError.message : 'Unknown error'
        });
      }
      
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(rawToken, 10);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await storage.createResetToken(user.id, hashedToken, expiresAt);
      
      const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${rawToken}`;
      
      const locations = await storage.getLocationsByOrganization(organizationId);
      const primaryLocation = locations[0];
      
      const emailContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to ${organization.name} - Set Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Arial', 'Helvetica', sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #B8860B 0%, #DAA520 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 1px;">
                ${organization.name}
              </h1>
              <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px; opacity: 0.95;">
                Welcome to Our Patient Portal
              </p>
            </div>
            
            <div style="padding: 40px 30px;">
              <h2 style="color: #333333; font-size: 24px; margin: 0 0 20px 0;">
                Welcome, ${firstName}!
              </h2>
              
              <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Your account has been created at <strong>${organization.name}</strong>. 
                Click below to set your password and access your patient portal.
              </p>
              
              <div style="background-color: #f9f9f9; border-left: 4px solid #B8860B; padding: 20px; margin: 25px 0;">
                <h3 style="color: #333333; font-size: 18px; margin: 0 0 15px 0;">
                  Your Member Benefits:
                </h3>
                <ul style="color: #666666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  <li><strong>Online Booking</strong> - Schedule appointments at your convenience</li>
                  <li><strong>Exclusive Memberships</strong> - Access to VIP treatment packages</li>
                  <li><strong>Rewards Program</strong> - Earn points with every visit and purchase</li>
                  <li><strong>Treatment History</strong> - Track your aesthetic journey</li>
                  <li><strong>Special Offers</strong> - Member-only promotions and discounts</li>
                  <li><strong>Priority Access</strong> - First access to new treatments and services</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 35px 0;">
                <a href="${resetLink}" 
                   style="display: inline-block; background: linear-gradient(135deg, #B8860B 0%, #DAA520 100%); 
                          color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; 
                          font-size: 16px; font-weight: 600; letter-spacing: 0.5px; 
                          box-shadow: 0 4px 15px rgba(184, 134, 11, 0.3);">
                  Set My Password
                </a>
              </div>
              
              <p style="color: #999999; font-size: 13px; text-align: center; margin: 20px 0;">
                Or copy and paste this link into your browser:<br>
                <span style="color: #B8860B; word-break: break-all;">${resetLink}</span>
              </p>
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0;">
                <strong>This link will expire in 7 days.</strong>
              </p>
            </div>
            
            <!-- Contact Information -->
            <div style="background-color: #f9f9f9; padding: 25px 30px; border-top: 1px solid #e0e0e0;">
              <h3 style="color: #333333; font-size: 16px; margin: 0 0 15px 0;">
                Contact Information
              </h3>
              <div style="color: #666666; font-size: 14px; line-height: 1.6;">
                ${primaryLocation ? `
                  <p style="margin: 5px 0;"><strong>${primaryLocation.name}</strong></p>
                  ${primaryLocation.phone ? `<p style="margin: 5px 0;">📞 ${primaryLocation.phone}</p>` : ''}
                  ${primaryLocation.email ? `<p style="margin: 5px 0;">✉️ ${primaryLocation.email}</p>` : ''}
                  ${primaryLocation.address ? `<p style="margin: 5px 0;">📍 ${primaryLocation.address}</p>` : ''}
                ` : `
                  <p style="margin: 5px 0;"><strong>${organization.name}</strong></p>
                  ${organization.phone ? `<p style="margin: 5px 0;">📞 ${organization.phone}</p>` : ''}
                  ${organization.email ? `<p style="margin: 5px 0;">✉️ ${organization.email}</p>` : ''}
                `}
                ${organization.website ? `<p style="margin: 5px 0;">🌐 <a href="${organization.website}" style="color: #B8860B; text-decoration: none;">${organization.website}</a></p>` : ''}
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #333333; padding: 20px 30px; text-align: center;">
              <p style="color: #ffffff; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} ${organization.name}. All rights reserved.
              </p>
              <p style="color: #999999; font-size: 11px; margin: 10px 0 0 0;">
                This invitation was sent to ${email}.<br>
                If you believe this was sent in error, please disregard this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Prepare plain text version of the email
      const textContent = `Welcome to ${organization.name} - Set Your Password\n\n` +
        `Hi ${firstName},\n\n` +
        `Your account has been created at ${organization.name}. Click below to set your password and access your patient portal.\n\n` +
        `Set your password: ${resetLink}\n\n` +
        `Your Member Benefits:\n` +
        `- Online appointment booking\n` +
        `- Exclusive memberships\n` +
        `- Rewards program\n` +
        `- Treatment history tracking\n` +
        `- Special member-only offers\n` +
        `- Priority access to new services\n\n` +
        `This link will expire in 7 days.\n\n` +
        `Contact Information:\n` +
        `${primaryLocation ? primaryLocation.name : organization.name}\n` +
        `${primaryLocation?.phone || organization.phone || 'Contact us for more info'}\n` +
        `${primaryLocation?.email || organization.email || ''}\n` +
        `${organization.website || ''}\n\n` +
        `© ${new Date().getFullYear()} ${organization.name}. All rights reserved.`;

      // Send invitation email using the improved email helper
      const emailResult = await sendEmail({
        to: email,
        subject: `Welcome to ${organization.name} - Set Your Password`,
        html: emailContent,
        text: textContent,
        fromName: organization.name
      });

      // Prepare response with clear status messages
      const response: any = {
        success: true,
        patient: {
          id: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          phone: client.phone,
          status: client.status,
          stripeCustomerId: stripeCustomerId,
          createdAt: new Date().toISOString()
        },
        stripe: {
          customerCreated: !!stripeCustomerId,
          customerId: stripeCustomerId,
          connectedAccountId: organization.stripeConnectAccountId || null,
          message: stripeCustomerId 
            ? `✅ Patient synced to Stripe on clinic's connected account`
            : organization.stripeConnectAccountId 
              ? '⚠️ Failed to create Stripe customer (non-fatal)'
              : '⚠️ Clinic does not have Stripe Connect configured'
        },
        invitation: {
          link: invitationLink,
          sentTo: email
        },
        emailStatus: {
          sent: emailResult.success,
          message: emailResult.success 
            ? '✅ Invitation email sent successfully'
            : `⚠️ Patient invited but email failed to send: ${emailResult.error || 'Unknown error'}`,
          error: emailResult.error,
          debugInfo: emailResult.details
        }
      };

      // Log the final status
      if (emailResult.success) {
        console.log(`✅ Full invitation completed for ${email}:`, {
          patientId: client.id,
          organization: organization.name,
          emailSent: true
        });
      } else {
        console.warn(`⚠️ Partial invitation completed for ${email}:`, {
          patientId: client.id,
          organization: organization.name,
          emailSent: false,
          emailError: emailResult.error
        });
      }

      res.json(response);

    } catch (error) {
      console.error("Patient invitation error:", error);
      res.status(500).json({ message: "Failed to send invitation" });
    }
  });

  // Test email sending endpoint (for debugging)
  app.post("/api/email/test", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { to } = req.body;
      if (!to) {
        return res.status(400).json({ message: "Email address is required" });
      }

      console.log(`🧪 Testing email to: ${to}`);

      const emailResult = await sendEmail({
        to,
        subject: "Test Email from Aesthiq",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f5f1e8 0%, #e8ddd0 100%); padding: 30px; text-align: center; }
              h1 { color: #8b7355; margin: 0; }
              .content { padding: 30px; background: white; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Test Email</h1>
              </div>
              <div class="content">
                <p>This is a test email from your Aesthiq platform.</p>
                <p>If you received this email, your email configuration is working correctly!</p>
                <p>Timestamp: ${new Date().toISOString()}</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `This is a test email from Aesthiq. If you received this, your email configuration is working! Timestamp: ${new Date().toISOString()}`,
        fromName: "Aesthiq Test"
      });

      if (emailResult.success) {
        res.json({
          success: true,
          message: "Test email sent successfully",
          debugInfo: emailResult.details
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to send test email",
          error: emailResult.error
        });
      }
    } catch (error) {
      console.error("Test email error:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to send test email", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get current user's organization
  app.get("/api/organization", requireAuth, async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Organization fetch error:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // Business setup status endpoint
  app.get("/api/clinic/setup-status", requireAuth, async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check Stripe Connect status
      const stripeConnected = !!organization.stripeConnectAccountId;

      // Check subscription status (include trialing subscriptions)
      const hasSubscription = !!organization.subscriptionPlanId && 
        (organization.subscriptionStatus === 'active' || organization.subscriptionStatus === 'trialing');

      // Check if plan supports locations
      let maxLocations = 0;
      let requiresLocations = false;
      if (organization.subscriptionPlanId) {
        const plan = await storage.getSubscriptionPlan(organization.subscriptionPlanId);
        if (plan && plan.maxLocations !== null && plan.maxLocations > 0) {
          maxLocations = plan.maxLocations;
          requiresLocations = true;
        }
      }

      // Check if they have locations (only required if plan supports it)
      const locations = await storage.getLocationsByOrganization(organizationId);
      const hasLocations = locations.length > 0;

      // Check if they have services
      const services = await storage.getServicesByOrganization(organizationId);
      const hasServices = services.length > 0;

      // Check if they have membership plans
      const memberships = await storage.getMembershipTiersByOrganization(organizationId);
      const hasMemberships = memberships.length > 0;

      // Check if they have reward options (catalog)
      const rewardOptions = await storage.getRewardOptionsByOrganization(organizationId);
      const hasRewards = rewardOptions.length > 0;

      // Check if they have invited patients (new requirement)
      const clients = await storage.getClientsByOrganization(organizationId);
      const hasPatients = clients.length > 0;

      // allComplete should only check locations if the plan requires them
      const locationCheck = requiresLocations ? hasLocations : true;
      const allComplete = stripeConnected && hasSubscription && locationCheck && hasServices && hasMemberships && hasRewards && hasPatients;

      res.json({
        stripeConnected,
        hasSubscription,
        hasLocations,
        requiresLocations,
        maxLocations,
        hasServices,
        hasMemberships,
        hasRewards,
        hasPatients,
        allComplete
      });

    } catch (error) {
      console.error("Setup status check error:", error);
      res.status(500).json({ message: "Failed to check setup status" });
    }
  });

  // Subscription routes (old endpoint removed - duplicate with line 3019)
  
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

  // Business setup status check

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

  app.get("/api/stripe-connect/status/:organizationId", requireRole("clinic_admin"), async (req, res) => {
    try {
      const organizationId = req.params.organizationId;
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

      // Handle subscription activation
      if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        
        console.log(`💳 [WEBHOOK] Payment succeeded for subscription: ${subscriptionId}`);
        
        if (subscriptionId) {
          // Find membership by subscription ID and activate it
          const membership = await storage.getMembershipByStripeSubscriptionId(subscriptionId);
          
          if (!membership) {
            console.log(`⚠️ [WEBHOOK] No membership found for subscription: ${subscriptionId}`);
          } else if (membership.status !== 'suspended') {
            console.log(`⚠️ [WEBHOOK] Membership ${membership.id} already active, skipping activation`);
          } else {
            // SECURITY: Only activate if payment actually succeeded
            console.log(`✅ [WEBHOOK] Activating membership ${membership.id} for tier: ${membership.tierName}`);
            await storage.updateMembership(membership.id, { status: 'active' });
            console.log(`🎉 [WEBHOOK] Membership ${membership.id} successfully activated`);
            
            // Award reward points for membership purchase (with idempotency check)
            const existingRewards = await storage.getRewardsByClient(membership.clientId);
            const alreadyAwarded = existingRewards.some(r => 
              r.referenceType === 'membership' && r.referenceId === membership.id
            );
            
            if (!alreadyAwarded) {
              const membershipAmount = parseFloat(membership.monthlyFee);
              const pointsEarned = await calculateRewardPoints(
                membership.clientId, 
                membership.organizationId, 
                membershipAmount
              );
              
              if (pointsEarned > 0) {
                await storage.createReward({
                  organizationId: membership.organizationId,
                  clientId: membership.clientId,
                  points: pointsEarned,
                  reason: `Membership activated: ${membership.tierName} ($${membershipAmount})`,
                  referenceId: membership.id,
                  referenceType: 'membership'
                });
              }
            }
            
            console.log(`Membership ${membership.id} activated for subscription ${subscriptionId}`);
          }
        }
      }
      
      // Handle subscription cancellation
      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        
        // Find membership by subscription ID and cancel it
        const membership = await storage.getMembershipByStripeSubscriptionId(subscriptionId);
        if (membership) {
          await storage.updateMembership(membership.id, { status: 'canceled' });
          console.log(`Membership ${membership.id} canceled for subscription ${subscriptionId}`);
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
  // NOTE: This endpoint expects amount in CENTS (e.g., $10.00 = 1000)
  app.post("/api/payments/create-payment-intent", requireAuth, async (req, res) => {
    try {
      const { amount, metadata, organizationId } = req.body; // amount should be in cents
      
      // Get organization if organizationId is provided to use its connected account
      let connectAccountId: string | undefined;
      if (organizationId) {
        const organization = await storage.getOrganization(organizationId);
        connectAccountId = organization?.stripeConnectAccountId;
      }
      
      const result = await stripeService.createPaymentIntent(
        amount,
        "usd",
        req.user.stripeCustomerId,
        metadata,
        connectAccountId
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // Subscription routes
  app.post("/api/subscriptions/create", requireAuth, async (req, res) => {
    try {
      const { priceId, trialDays, organizationId } = req.body;
      
      // Get organization if organizationId is provided to use its connected account
      let connectAccountId: string | undefined;
      if (organizationId) {
        const organization = await storage.getOrganization(organizationId);
        connectAccountId = organization?.stripeConnectAccountId;
      }
      
      let customerId = req.user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          req.user.email,
          `${req.user.firstName} ${req.user.lastName}`,
          req.user.organizationId || "",
          connectAccountId
        );
        customerId = customer.id;
        await storage.updateUserStripeInfo(req.user.id, customerId);
      }

      const subscription = await stripeService.createSubscription(customerId, priceId, trialDays, connectAccountId);
      
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

  // Get today's appointments for organization
  app.get("/api/appointments/:organizationId/today", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      if (req.user!.role !== "super_admin") {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (userOrgId !== organizationId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const allAppointments = await storage.getAppointmentsByOrganization(organizationId);
      const todayAppointments = allAppointments.filter(apt => {
        const aptDate = new Date(apt.startTime);
        return aptDate >= today && aptDate < tomorrow;
      });

      res.json(todayAppointments);
    } catch (error) {
      console.error("Error fetching today's appointments:", error);
      res.status(500).json({ message: "Failed to fetch today's appointments" });
    }
  });

  // Recent activities endpoint
  app.get("/api/activities/recent", requireAuth, requireBusinessSetupComplete, async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Get recent appointments, clients, and payments
      const recentAppointments = await storage.getAppointmentsByOrganization(organizationId);
      const recentClients = await storage.getClientsByOrganization(organizationId);
      
      const activities = [];
      
      // Add new appointments
      const newAppointments = recentAppointments
        .filter(apt => new Date(apt.createdAt!) >= last24Hours)
        .slice(0, 3);
      
      for (const apt of newAppointments) {
        const client = recentClients.find(c => c.id === apt.clientId);
        activities.push({
          id: `apt-${apt.id}`,
          type: 'appointment',
          title: 'New appointment booked',
          description: `${client?.firstName || 'Client'} - Appointment`,
          timestamp: apt.createdAt,
          color: 'blue'
        });
      }
      
      // Add new clients
      const newClients = recentClients
        .filter(client => new Date(client.createdAt!) >= last24Hours)
        .slice(0, 3);
        
      for (const client of newClients) {
        activities.push({
          id: `client-${client.id}`,
          type: 'client',
          title: 'New client registered',
          description: `${client.firstName} ${client.lastName}`,
          timestamp: client.createdAt,
          color: 'green'
        });
      }
      
      // Add completed appointments (payments)
      const completedAppointments = recentAppointments
        .filter(apt => apt.status === 'completed' && new Date(apt.createdAt!) >= last24Hours)
        .slice(0, 2);
        
      for (const apt of completedAppointments) {
        const client = recentClients.find(c => c.id === apt.clientId);
        activities.push({
          id: `payment-${apt.id}`,
          type: 'payment',
          title: 'Payment received',
          description: `$${apt.totalAmount} - ${client?.firstName || 'Client'}`,
          timestamp: apt.createdAt,
          color: 'blue'
        });
      }
      
      // Sort by timestamp and limit to 10
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      res.json(activities.slice(0, 10));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent activities" });
    }
  });

  // AI insights endpoint  
  app.get("/api/ai-insights", requireAuth, requireBusinessSetupComplete, async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      
      // Get data for AI analysis
      const appointments = await storage.getAppointmentsByOrganization(organizationId);
      const clients = await storage.getClientsByOrganization(organizationId);
      const services = await storage.getServicesByOrganization(organizationId);
      
      const insights = [];
      
      // Identify potential upsells (clients with frequent single services)
      const frequentClients = clients.filter(client => {
        const clientAppts = appointments.filter(apt => apt.clientId === client.id);
        return clientAppts.length >= 3;
      }).slice(0, 2);
      
      for (const client of frequentClients) {
        insights.push({
          id: `upsell-${client.id}`,
          type: 'upsell',
          title: 'Upsell Opportunity',
          description: `${client.firstName} ${client.lastName} books regularly - suggest membership for savings`,
          priority: 'high'
        });
      }
      
      // Identify inactive clients for retention
      const now = new Date();
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      
      const inactiveClients = clients.filter(client => {
        const lastAppt = appointments
          .filter(apt => apt.clientId === client.id)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
        return lastAppt && new Date(lastAppt.startTime) < sixtyDaysAgo;
      }).length;
      
      if (inactiveClients > 0) {
        insights.push({
          id: 'retention-alert',
          type: 'retention',
          title: 'Retention Alert',
          description: `${inactiveClients} clients haven't booked in 60+ days - send reactivation campaign`,
          priority: 'medium'
        });
      }
      
      // Popular service insights
      const serviceBookings: Record<string, number> = {};
      appointments.forEach(apt => {
        const serviceName = 'Service'; // For now use generic name
        serviceBookings[serviceName] = (serviceBookings[serviceName] || 0) + 1;
      });
      
      const topService = Object.entries(serviceBookings)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0];
        
      if (topService) {
        insights.push({
          id: 'popular-service',
          type: 'trend',
          title: 'Popular Service',
          description: `${topService[0]} is your most booked service (${topService[1]} bookings)`,
          priority: 'low'
        });
      }
      
      res.json(insights.slice(0, 5));
    } catch (error) {
      res.status(500).json({ message: "Failed to generate AI insights" });
    }
  });

  // AI insights endpoint with organization ID - Enterprise tier only
  app.get("/api/ai-insights/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      if (req.user!.role !== "super_admin") {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (userOrgId !== organizationId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Get organization and subscription plan details
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check subscription tier - AI is Enterprise only
      let subscriptionPlan = null;
      if (organization.subscriptionPlanId) {
        subscriptionPlan = await storage.getSubscriptionPlan(organization.subscriptionPlanId);
      }

      const isEnterpriseTier = subscriptionPlan?.name === 'Enterprise' || 
                               subscriptionPlan?.tier === 'enterprise';
      
      if (!isEnterpriseTier) {
        return res.status(403).json({ 
          message: "AI insights are only available for Enterprise tier subscriptions",
          upgrade_required: true,
          current_plan: subscriptionPlan?.name || 'No active plan',
          current_tier: subscriptionPlan?.tier || 'none',
          upgrade_url: "/pricing",
          features_available_in_enterprise: [
            "AI-powered customer retention analysis",
            "Predictive churn detection",
            "Personalized upsell recommendations",
            "Pricing optimization suggestions",
            "Marketing campaign ideas",
            "Appointment optimization insights"
          ]
        });
      }

      // Get comprehensive data for AI analysis
      const appointments = await storage.getAppointmentsByOrganization(organizationId);
      const clients = await storage.getClientsByOrganization(organizationId);
      const services = await storage.getServicesByOrganization(organizationId);
      const transactions = await storage.getTransactionsByOrganization(organizationId);
      const memberships = await storage.getMembershipsByOrganization(organizationId);
      const rewardBalances = await storage.getRewardsByOrganization(organizationId);
      
      // Calculate key metrics
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      
      // Revenue calculations
      const totalRevenue = transactions.reduce((sum, t) => sum + (parseFloat(t.amount?.toString() || '0')), 0);
      const last30DaysRevenue = transactions
        .filter(t => new Date(t.createdAt!) > thirtyDaysAgo)
        .reduce((sum, t) => sum + (parseFloat(t.amount?.toString() || '0')), 0);
      
      // Client activity analysis
      const activeClients = clients.filter(client => {
        const clientAppts = appointments.filter(a => a.clientId === client.id);
        return clientAppts.some(a => new Date(a.startTime) > thirtyDaysAgo);
      });
      
      const inactiveClients = clients.filter(client => {
        const clientAppts = appointments.filter(a => a.clientId === client.id);
        const lastAppt = clientAppts
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
        return lastAppt && new Date(lastAppt.startTime) < sixtyDaysAgo;
      });

      // Service performance
      const serviceBookings: Record<string, number> = {};
      const serviceRevenue: Record<string, number> = {};
      
      appointments.forEach(apt => {
        const service = services.find(s => s.id === apt.serviceId);
        if (service) {
          serviceBookings[service.name] = (serviceBookings[service.name] || 0) + 1;
          serviceRevenue[service.name] = (serviceRevenue[service.name] || 0) + 
            parseFloat(apt.totalAmount?.toString() || '0');
        }
      });

      // Generate AI insights using OpenAI
      let aiGeneratedInsights = [];
      
      try {
        const clinicData = {
          organizationName: organization.name,
          totalClients: clients.length,
          activeClients: activeClients.length,
          inactiveClients: inactiveClients.length,
          totalAppointments: appointments.length,
          last30DaysAppointments: appointments.filter(a => new Date(a.startTime) > thirtyDaysAgo).length,
          totalRevenue: totalRevenue,
          last30DaysRevenue: last30DaysRevenue,
          avgServicePrice: services.length > 0 ? 
            services.reduce((sum, s) => sum + parseFloat(s.price?.toString() || '0'), 0) / services.length : 0,
          activeMembers: memberships.filter(m => m.status === 'active').length,
          services: services.map(s => ({
            name: s.name,
            price: parseFloat(s.price?.toString() || '0'),
            bookings: serviceBookings[s.name] || 0,
            revenue: serviceRevenue[s.name] || 0
          })),
          topClients: activeClients.slice(0, 5).map(c => {
            const clientAppts = appointments.filter(a => a.clientId === c.id);
            const clientTransactions = transactions.filter(t => t.clientId === c.id);
            const totalSpent = clientTransactions.reduce((sum, t) => 
              sum + parseFloat(t.amount?.toString() || '0'), 0);
            return {
              id: c.id,
              name: `${c.firstName} ${c.lastName}`,
              appointments: clientAppts.length,
              totalSpent: totalSpent,
              lastVisit: clientAppts[0]?.startTime || null
            };
          })
        };

        // Use OpenAI to generate insights
        const aiResponse = await openaiService.generateBusinessInsights(clinicData);
        
        if (aiResponse && aiResponse.insights) {
          aiGeneratedInsights = aiResponse.insights.map((insight: any) => ({
            id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: insight.type || 'recommendation',
            title: insight.title,
            description: insight.description,
            priority: insight.priority || 'medium',
            metrics: insight.metrics || {},
            actionable: insight.actionable !== false
          }));
        }
      } catch (aiError) {
        console.error("OpenAI insight generation failed:", aiError);
        // Fall back to rule-based insights if AI fails
        aiGeneratedInsights = generateFallbackInsights(
          clients, activeClients, inactiveClients, 
          appointments, services, serviceBookings, 
          totalRevenue, last30DaysRevenue
        );
      }

      // Always include some guaranteed valuable insights
      if (inactiveClients.length > 0) {
        aiGeneratedInsights.unshift({
          id: `retention-${Date.now()}`,
          type: 'retention',
          title: 'Client Retention Alert',
          description: `${inactiveClients.length} clients haven't visited in 60+ days. Consider launching a win-back campaign with special offers.`,
          priority: 'high',
          metrics: {
            at_risk_clients: inactiveClients.length,
            potential_revenue_loss: inactiveClients.length * (totalRevenue / clients.length)
          },
          actionable: true
        });
      }

      // Store insights in database for caching (optional)
      for (const insight of aiGeneratedInsights.slice(0, 10)) {
        try {
          await storage.createAiInsight({
            organizationId,
            type: insight.type,
            category: 'business',
            title: insight.title,
            description: insight.description,
            priority: insight.priority as any,
            data: insight.metrics || {},
            isActionable: insight.actionable
          });
        } catch (err) {
          console.error("Failed to store insight:", err);
        }
      }
      
      res.json(aiGeneratedInsights.slice(0, 5)); // Return top 5 insights
    } catch (error) {
      console.error("Error fetching AI insights:", error);
      res.status(500).json({ message: "Failed to fetch AI insights" });
    }
  });

  // Helper function to generate fallback insights when AI is unavailable
  function generateFallbackInsights(
    clients: any[], activeClients: any[], inactiveClients: any[],
    appointments: any[], services: any[], serviceBookings: Record<string, number>,
    totalRevenue: number, last30DaysRevenue: number
  ) {
    const insights = [];
    
    // Revenue trend insight
    if (last30DaysRevenue > 0) {
      const avgMonthlyRevenue = totalRevenue / 12; // Rough estimate
      const trend = last30DaysRevenue > avgMonthlyRevenue ? 'up' : 'down';
      insights.push({
        id: `revenue-${Date.now()}`,
        type: 'revenue',
        title: `Revenue Trending ${trend === 'up' ? '📈' : '📉'}`,
        description: `Last 30 days revenue: $${last30DaysRevenue.toFixed(2)}. ${
          trend === 'up' 
            ? 'Great job! Consider raising prices on popular services.' 
            : 'Consider promotions to boost bookings.'
        }`,
        priority: 'high',
        metrics: { last30Days: last30DaysRevenue, trend },
        actionable: true
      });
    }

    // Popular service insight
    const topService = Object.entries(serviceBookings)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (topService) {
      insights.push({
        id: `popular-${Date.now()}`,
        type: 'opportunity',
        title: 'Most Popular Service',
        description: `"${topService[0]}" has ${topService[1]} bookings. Consider creating package deals or add-ons for this service.`,
        priority: 'medium',
        metrics: { service: topService[0], bookings: topService[1] },
        actionable: true
      });
    }

    // Client acquisition insight
    const clientGrowthRate = activeClients.length / Math.max(clients.length, 1);
    if (clientGrowthRate < 0.5) {
      insights.push({
        id: `acquisition-${Date.now()}`,
        type: 'growth',
        title: 'Boost Client Acquisition',
        description: 'Only ' + (clientGrowthRate * 100).toFixed(0) + '% of clients are active. Consider referral programs or new client specials.',
        priority: 'high',
        metrics: { activeRate: clientGrowthRate },
        actionable: true
      });
    }

    return insights;
  }

  // Staff availability endpoint with organization ID
  app.get("/api/staff/availability/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      if (req.user!.role !== "super_admin") {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (userOrgId !== organizationId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const staff = await storage.getStaffByOrganization(organizationId);
      
      // For now, simulate online status - in production this would track actual login/activity
      const now = new Date();
      const workingHours = now.getHours() >= 8 && now.getHours() <= 18; // 8 AM to 6 PM
      
      const availability = {
        total: staff.length,
        online: workingHours ? Math.min(staff.length, Math.max(1, Math.floor(staff.length * 0.8))) : 0,
        available: workingHours ? Math.min(staff.length, Math.max(1, Math.floor(staff.length * 0.6))) : 0
      };
      
      res.json(availability);
    } catch (error) {
      console.error("Error fetching staff availability:", error);
      res.status(500).json({ message: "Failed to fetch staff availability" });
    }
  });

  // Staff availability endpoint
  app.get("/api/staff/availability", requireAuth, requireBusinessSetupComplete, async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      const staff = await storage.getStaffByOrganization(organizationId);
      
      // For now, simulate online status - in production this would track actual login/activity
      const now = new Date();
      const workingHours = now.getHours() >= 8 && now.getHours() <= 18; // 8 AM to 6 PM
      
      const availability = {
        total: staff.length,
        online: workingHours ? Math.min(staff.length, Math.max(1, Math.floor(staff.length * 0.8))) : 0,
        available: workingHours ? Math.min(staff.length, Math.max(1, Math.floor(staff.length * 0.6))) : 0
      };
      
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff availability" });
    }
  });

  // Platform analytics for super admin
  app.get("/api/analytics/platform", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      
      // Get all organizations
      const allOrganizations = await storage.getOrganizations();
      const activeOrganizations = allOrganizations.filter(org => org.isActive && org.subscriptionStatus === 'active');
      const trialOrganizations = allOrganizations.filter(org => org.subscriptionStatus === 'trialing');
      
      // Calculate MRR from active subscriptions
      let mrr = 0;
      for (const org of activeOrganizations) {
        if (org.subscriptionPlanId) {
          const plan = await storage.getSubscriptionPlan(org.subscriptionPlanId);
          if (plan) {
            mrr += parseFloat(plan.monthlyPrice.toString());
          }
        }
      }
      
      // Calculate churn rate
      const churnedThisMonth = allOrganizations.filter(org => 
        org.subscriptionStatus === 'cancelled' && 
        org.updatedAt && new Date(org.updatedAt) >= thisMonth
      ).length;
      const activeLastMonth = allOrganizations.filter(org =>
        org.createdAt && new Date(org.createdAt) < lastMonth
      ).length;
      const churnRate = activeLastMonth > 0 ? (churnedThisMonth / activeLastMonth) * 100 : 0;
      
      // Calculate trial conversion rate
      const completedTrials = allOrganizations.filter(org =>
        org.trialEndsAt && new Date(org.trialEndsAt) < now
      );
      const convertedTrials = completedTrials.filter(org =>
        org.subscriptionStatus === 'active'
      );
      const trialConversions = completedTrials.length > 0 
        ? (convertedTrials.length / completedTrials.length) * 100 
        : 0;
      
      // Calculate growth metrics
      const newThisMonth = allOrganizations.filter(org =>
        org.createdAt && new Date(org.createdAt) >= thisMonth
      ).length;
      
      const stats = {
        mrr,
        activeOrganizations: activeOrganizations.length,
        trialOrganizations: trialOrganizations.length,
        totalOrganizations: allOrganizations.length,
        churnRate,
        trialConversions,
        newThisMonth,
        revenue: {
          subscription: mrr,
          processing: mrr * 0.12, // Estimated processing fees
          total: mrr * 1.12
        }
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching platform analytics:", error);
      res.status(500).json({ message: "Failed to fetch platform analytics" });
    }
  });

  // Dashboard analytics with organization ID in path
  app.get("/api/analytics/dashboard/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      if (req.user!.role !== "super_admin") {
        const userOrgId = await getUserOrganizationId(req.user!);
        if (userOrgId !== organizationId) {
          return res.status(403).json({ message: "Access denied" });
        }
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

      // Get membership counts
      const allMemberships = await storage.getMembershipsByOrganization(organizationId);
      const activeMemberships = allMemberships.filter(membership => membership.status === 'active').length;

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
        memberships: {
          active: activeMemberships
        },
        staff: {
          total: allStaff.length,
          active: activeStaff,
          online: activeStaff // For now, assume active staff are online during work hours
        }
      };

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching dashboard analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
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

      // Get membership counts
      const allMemberships = await storage.getMembershipsByOrganization(organizationId);
      const activeMemberships = allMemberships.filter(membership => membership.status === 'active').length;

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
        memberships: {
          active: activeMemberships
        },
        staff: {
          total: allStaff.length,
          active: activeStaff,
          online: activeStaff // For now, assume active staff are online during work hours
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

  // Get subscription plans (public)
  app.get("/api/subscription-plans", async (req, res) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      console.error("Get subscription plans error:", error);
      res.status(500).json({ message: "Failed to fetch subscription plans" });
    }
  });

  // Subscribe to a plan
  app.post("/api/subscription/subscribe", requireAuth, async (req, res) => {
    try {
      const { planId, billingCycle, paymentMethodId } = req.body;
      
      if (!planId || !billingCycle) {
        return res.status(400).json({ message: "Plan ID and billing cycle are required" });
      }

      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "Organization not found" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const plan = await storage.getSubscriptionPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Subscription plan not found" });
      }

      // Get the correct price ID based on billing cycle
      const priceId = billingCycle === 'monthly' ? plan.stripePriceIdMonthly : plan.stripePriceIdYearly;
      if (!priceId) {
        return res.status(400).json({ message: "Price not available for selected billing cycle" });
      }

      // Create or get Stripe customer for organization (on platform account, not Connect)
      let customerId = organization.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          req.user!.email,
          organization.name,
          organizationId
        );
        customerId = customer.id;
        
        // Update organization with customer ID
        await storage.updateOrganization(organizationId, {
          stripeCustomerId: customerId
        });
      }

      // If payment method is provided, attach it to customer
      if (paymentMethodId) {
        await stripeService.attachPaymentMethodToCustomer(paymentMethodId, customerId, true);
      }

      // Create subscription on platform account with 30-day trial
      const subscription = await stripeService.createSubscription(
        customerId,
        priceId,
        30 // 30-day trial period
      );

      // Update organization with subscription details and trial period
      const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      await storage.updateOrganization(organizationId, {
        subscriptionPlanId: planId,
        stripeSubscriptionId: subscription.subscriptionId,
        subscriptionStatus: 'trialing' as any,
        trialEndsAt: trialEndsAt
      });

      res.json({ 
        message: "Subscription created successfully",
        subscriptionId: subscription.subscriptionId,
        status: subscription.status,
        trial: true,
        trialEndsAt: trialEndsAt
      });
    } catch (error) {
      console.error("Subscribe to plan error:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Create setup intent for payment method collection
  app.post("/api/stripe/setup-intent", requireAuth, async (req, res) => {
    try {
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "Organization not found" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Create or get Stripe customer for organization (on platform account, not Connect)
      let customerId = organization.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          req.user!.email,
          organization.name,
          organizationId
        );
        customerId = customer.id;
        
        // Update organization with customer ID
        await storage.updateOrganization(organizationId, {
          stripeCustomerId: customerId
        });
      }

      // Create setup intent for collecting payment method
      const setupIntent = await stripeService.createSetupIntent(customerId);

      res.json({
        clientSecret: setupIntent.client_secret
      });
    } catch (error) {
      console.error("Setup intent creation error:", error);
      res.status(500).json({ message: "Failed to create setup intent" });
    }
  });

  // Setup subscription plans with Stripe (Platform account)
  app.post("/api/admin/setup-subscription-plans", requireRole("super_admin"), async (req, res) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      
      for (const plan of plans) {
        if (!plan.stripePriceIdMonthly) {
          // Create Stripe product on platform account (no connectAccountId)
          const product = await stripeService.createProduct({
            name: `Aesthiq ${plan.name} Plan`,
            description: plan.description || `${plan.name} subscription plan for Aesthiq platform`
          });
          
          // Create monthly price on platform account
          const monthlyPriceId = await stripeService.createPrice({
            productId: product.id,
            amount: Math.round(parseFloat(plan.monthlyPrice.toString()) * 100), // Convert to cents
            interval: 'month'
          });
          
          // Create yearly price if yearlyPrice exists
          let yearlyPriceId;
          if (plan.yearlyPrice) {
            yearlyPriceId = await stripeService.createPrice({
              productId: product.id,
              amount: Math.round(parseFloat(plan.yearlyPrice.toString()) * 100), // Convert to cents
              interval: 'year'
            });
          }
          
          // Update plan with Stripe IDs
          await storage.updateSubscriptionPlan(plan.id, {
            stripePriceIdMonthly: monthlyPriceId,
            stripePriceIdYearly: yearlyPriceId
          });
          
          console.log(`✅ [STRIPE PLATFORM] Created subscription plan ${plan.name}: Product ${product.id}, Monthly Price ${monthlyPriceId}${yearlyPriceId ? `, Yearly Price ${yearlyPriceId}` : ''}`);
        }
      }
      
      res.json({ message: "Subscription plans setup complete", plans: await storage.getSubscriptionPlans() });
    } catch (error) {
      console.error("Setup subscription plans error:", error);
      res.status(500).json({ message: "Failed to setup subscription plans" });
    }
  });

  // SMS and Email Marketing Endpoints
  
  // Rate limiting storage (in-memory for now, can be replaced with Redis later)
  const rateLimits = new Map<string, { count: number, resetTime: number }>();
  const dailyLimits = new Map<string, { count: number, date: string }>();

  // Rate limiting middleware
  const checkRateLimit = (limitType: 'sms_per_minute' | 'sms_daily' | 'campaign_daily') => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userOrgId = await getUserOrganizationId(req.user!);
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      const today = new Date().toISOString().split('T')[0];

      if (limitType === 'sms_per_minute') {
        const key = `sms_minute_${clientIp}`;
        const limit = rateLimits.get(key);
        
        if (limit && limit.resetTime > now) {
          if (limit.count >= 5) {
            return res.status(429).json({
              success: false,
              message: "Rate limit exceeded. Maximum 5 SMS per minute per IP.",
              retryAfter: Math.ceil((limit.resetTime - now) / 1000)
            });
          }
          limit.count++;
        } else {
          rateLimits.set(key, { count: 1, resetTime: now + 60000 }); // 1 minute
        }
      }

      if (limitType === 'sms_daily' && userOrgId) {
        const key = `sms_daily_${userOrgId}_${today}`;
        const limit = dailyLimits.get(key);
        
        if (limit && limit.date === today) {
          if (limit.count >= 100) {
            return res.status(429).json({
              success: false,
              message: "Daily SMS limit exceeded. Maximum 100 SMS per organization per day."
            });
          }
          limit.count++;
        } else {
          dailyLimits.set(key, { count: 1, date: today });
        }
      }

      if (limitType === 'campaign_daily' && userOrgId) {
        const key = `campaign_daily_${userOrgId}_${today}`;
        const limit = dailyLimits.get(key);
        
        if (limit && limit.date === today) {
          if (limit.count >= 10) {
            return res.status(429).json({
              success: false,
              message: "Daily campaign limit exceeded. Maximum 10 campaigns per organization per day."
            });
          }
          limit.count++;
        } else {
          dailyLimits.set(key, { count: 1, date: today });
        }
      }

      next();
    };
  };

  // Send individual SMS - SECURED with role check and rate limiting
  app.post("/api/sms/send", 
    requireAuth, 
    requireRole("clinic_admin", "staff", "super_admin"),
    checkRateLimit('sms_per_minute'),
    checkRateLimit('sms_daily'),
    async (req, res) => {
      try {
        const { to, message, organizationId } = req.body;
        
        // Validate required fields
        if (!to || !message) {
          return res.status(400).json({ 
            success: false, 
            message: "Phone number and message are required" 
          });
        }
        
        // Get user's organization
        const userOrgId = await getUserOrganizationId(req.user!);
        
        // SECURITY: Verify user belongs to the organization they're trying to send from
        if (organizationId) {
          if (req.user!.role !== 'super_admin' && organizationId !== userOrgId) {
            await auditLog(req, "unauthorized_access", "sms_send", organizationId, { 
              attemptedOrg: organizationId,
              userOrg: userOrgId,
              blocked: true 
            });
            return res.status(403).json({ 
              success: false, 
              message: "Access denied. You cannot send SMS for another organization." 
            });
          }
        }
        
        const targetOrgId = organizationId || userOrgId;
        if (!targetOrgId) {
          return res.status(400).json({ 
            success: false, 
            message: "No organization found" 
          });
        }
        
        // Import Twilio service
        const twilioService = await import("./services/twilio");
        
        // Send SMS
        const result = await twilioService.sendSMS({
          to,
          message
        });
        
        // Audit log for successful send
        await auditLog(req, "sms_send", "message", result.messageId || 'unknown', {
          to: to.slice(0, 3) + '***' + to.slice(-2), // Partially mask phone number
          messageLength: message.length,
          organizationId: targetOrgId,
          success: result.success
        });
        
        // Log usage
        await storage.createUsageLog({
          organizationId: targetOrgId,
          feature: 'sms_send',
          usage: 1,
          metadata: { to, messageLength: message.length }
        });
        
        res.json(result);
      } catch (error) {
        console.error("SMS send error:", error);
        res.status(500).json({ 
          success: false, 
          message: "Failed to send SMS",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });
  
  // Send bulk SMS campaign - SECURED with role check and rate limiting
  app.post("/api/sms/campaign", 
    requireAuth, 
    requireRole("clinic_admin", "super_admin"), // Only admins can send bulk campaigns
    checkRateLimit('campaign_daily'),
    async (req, res) => {
      try {
        const { campaignId, recipients, template, organizationId } = req.body;
        
        // Get user's organization
        const userOrgId = await getUserOrganizationId(req.user!);
        
        // SECURITY: Verify user belongs to the organization they're trying to send from
        if (organizationId) {
          if (req.user!.role !== 'super_admin' && organizationId !== userOrgId) {
            await auditLog(req, "unauthorized_access", "sms_campaign", organizationId, { 
              attemptedOrg: organizationId,
              userOrg: userOrgId,
              blocked: true 
            });
            return res.status(403).json({ 
              success: false, 
              message: "Access denied. You cannot send campaigns for another organization." 
            });
          }
        }
        
        const targetOrgId = organizationId || userOrgId;
        if (!targetOrgId) {
          return res.status(400).json({ 
            success: false, 
            message: "No organization found" 
          });
        }
        
        // Import services
        const twilioService = await import("./services/twilio");
        
        // Send bulk SMS
        const result = await twilioService.sendBulkSMS({
          recipients,
          template
        });
        
        // Audit log for campaign send
        await auditLog(req, "sms_campaign_send", "campaign", campaignId || 'direct', {
          recipientCount: recipients.length,
          sent: result.sent,
          failed: result.failed,
          organizationId: targetOrgId
        });
        
        // Update campaign if provided
        if (campaignId) {
          await storage.updateMarketingCampaign(campaignId, {
            status: 'sent',
            sentDate: new Date(),
            sentCount: result.sent,
            failedCount: result.failed
          });
          
          // Update recipients status
          for (const recipientResult of result.results) {
            const recipient = recipients.find((r: any) => r.to === recipientResult.to);
            if (recipient?.clientId) {
              await storage.createCampaignRecipient({
                campaignId,
                clientId: recipient.clientId,
                status: recipientResult.success ? 'sent' : 'failed',
                phoneNumber: recipientResult.to,
                messageId: recipientResult.messageId,
                error: recipientResult.error,
                sentAt: recipientResult.success ? new Date() : undefined,
                variables: recipient.variables
              });
            }
          }
        }
        
        // Log usage
        await storage.createUsageLog({
          organizationId: targetOrgId,
          feature: 'sms_campaign',
          usage: recipients.length,
          metadata: { campaignId, sent: result.sent, failed: result.failed }
        });
        
        res.json(result);
      } catch (error) {
        console.error("SMS campaign error:", error);
        res.status(500).json({ 
          success: false, 
          message: "Failed to send SMS campaign",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });
  
  // Get message templates
  app.get("/api/message-templates/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      const { category } = req.query;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      let templates;
      if (category) {
        templates = await storage.getMessageTemplatesByCategory(organizationId, category as string);
      } else {
        templates = await storage.getMessageTemplatesByOrganization(organizationId);
      }
      
      res.json(templates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ message: "Failed to get templates" });
    }
  });
  
  // Create message template
  app.post("/api/message-templates/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Import schema
      const { insertMessageTemplateSchema } = await import("@shared/schema");
      const validatedData = insertMessageTemplateSchema.parse({
        ...req.body,
        organizationId
      });
      
      const template = await storage.createMessageTemplate(validatedData);
      res.json(template);
    } catch (error) {
      console.error("Create template error:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });
  
  // Update message template
  app.put("/api/message-templates/:organizationId/:templateId", requireAuth, async (req, res) => {
    try {
      const { organizationId, templateId } = req.params;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const template = await storage.updateMessageTemplate(templateId, req.body);
      res.json(template);
    } catch (error) {
      console.error("Update template error:", error);
      res.status(500).json({ message: "Failed to update template" });
    }
  });
  
  // Delete message template
  app.delete("/api/message-templates/:organizationId/:templateId", requireAuth, async (req, res) => {
    try {
      const { organizationId, templateId } = req.params;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteMessageTemplate(templateId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete template error:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });
  
  // Create marketing campaign
  app.post("/api/marketing/campaigns/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Import schema
      const { insertMarketingCampaignSchema } = await import("@shared/schema");
      const validatedData = insertMarketingCampaignSchema.parse({
        ...req.body,
        organizationId,
        createdBy: req.user!.id
      });
      
      const campaign = await storage.createMarketingCampaign(validatedData);
      
      // If audience filters provided, calculate estimated recipients
      if (req.body.audience) {
        const clients = await storage.getClientsByOrganization(organizationId);
        let filteredClients = clients;
        
        // Apply filters
        const audience = req.body.audience;
        if (audience.membershipTier) {
          const memberships = await storage.getMembershipsByOrganization(organizationId);
          const tierMembershipClientIds = memberships
            .filter(m => m.tierName === audience.membershipTier && m.status === 'active')
            .map(m => m.clientId);
          filteredClients = filteredClients.filter(c => tierMembershipClientIds.includes(c.id));
        }
        
        if (audience.lastVisitDays) {
          const daysAgo = new Date();
          daysAgo.setDate(daysAgo.getDate() - audience.lastVisitDays);
          filteredClients = filteredClients.filter(c => c.lastVisit && c.lastVisit >= daysAgo);
        }
        
        if (audience.birthdayMonth) {
          const month = parseInt(audience.birthdayMonth);
          filteredClients = filteredClients.filter(c => 
            c.dateOfBirth && c.dateOfBirth.getMonth() + 1 === month
          );
        }
        
        if (audience.minTotalSpent) {
          filteredClients = filteredClients.filter(c => 
            parseFloat(c.totalSpent || "0") >= audience.minTotalSpent
          );
        }
        
        // Update estimated recipients
        await storage.updateMarketingCampaign(campaign.id, {
          estimatedRecipients: filteredClients.length
        });
        
        campaign.estimatedRecipients = filteredClients.length;
      }
      
      res.json(campaign);
    } catch (error) {
      console.error("Create campaign error:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });
  
  // Get marketing campaigns
  app.get("/api/marketing/campaigns/:organizationId", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const campaigns = await storage.getMarketingCampaignsByOrganization(organizationId);
      res.json(campaigns);
    } catch (error) {
      console.error("Get campaigns error:", error);
      res.status(500).json({ message: "Failed to get campaigns" });
    }
  });
  
  // Get campaign analytics
  app.get("/api/marketing/campaigns/:organizationId/:campaignId/analytics", requireAuth, async (req, res) => {
    try {
      const { organizationId, campaignId } = req.params;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const analytics = await storage.getCampaignAnalytics(campaignId);
      res.json(analytics);
    } catch (error) {
      console.error("Get analytics error:", error);
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });
  
  // Send test SMS
  app.post("/api/sms/test", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ 
          success: false, 
          message: "Phone number is required" 
        });
      }
      
      // Import services
      const twilioService = await import("./services/twilio");
      
      // Validate phone number
      const validation = await twilioService.validatePhoneNumber(phoneNumber);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number",
          error: validation.error
        });
      }
      
      // Send test message
      const result = await twilioService.sendSMS({
        to: validation.formatted!,
        message: "This is a test message from Aesthiq. Your SMS integration is working correctly!"
      });
      
      res.json({
        success: result.success,
        message: result.success ? "Test SMS sent successfully" : "Failed to send test SMS",
        messageId: result.messageId,
        error: result.error,
        details: result.details
      });
    } catch (error) {
      console.error("Test SMS error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to send test SMS",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Initialize default templates for organization
  app.post("/api/message-templates/:organizationId/initialize", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Verify access
      const userOrgId = await getUserOrganizationId(req.user!);
      if (organizationId !== userOrgId && req.user!.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Import notification service
      const { notificationService } = await import("./services/notifications");
      
      // Create default templates
      await notificationService.createDefaultTemplates(organizationId);
      
      // Get all templates
      const templates = await storage.getMessageTemplatesByOrganization(organizationId);
      
      res.json({
        success: true,
        message: "Default templates created successfully",
        templates
      });
    } catch (error) {
      console.error("Initialize templates error:", error);
      res.status(500).json({ 
        message: "Failed to initialize templates",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test endpoint to verify Stripe Connect customer creation
  app.post("/api/test/stripe-connect-customer", requireAuth, requireRole("clinic_admin", "super_admin"), async (req, res) => {
    try {
      const { email, name, useConnectAccount = true } = req.body;
      
      // Get organization for the current user
      const organizationId = await getUserOrganizationId(req.user!);
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found for user" });
      }
      
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      console.log(`🧪 [TEST] Starting Stripe Connect customer test`);
      console.log(`🧪 [TEST] Organization: ${organization.name} (${organization.id})`);
      console.log(`🧪 [TEST] Connect Account ID: ${organization.stripeConnectAccountId || 'NOT SET'}`);
      console.log(`🧪 [TEST] Use Connect Account: ${useConnectAccount}`);
      
      // Create customer on platform or connect account based on parameter
      const connectAccountId = useConnectAccount ? organization.stripeConnectAccountId : undefined;
      
      const customer = await stripeService.createCustomer(
        email || req.user!.email,
        name || `${req.user!.firstName} ${req.user!.lastName}`,
        organizationId,
        connectAccountId || undefined
      );
      
      console.log(`✅ [TEST] Customer created successfully`);
      console.log(`✅ [TEST] Customer ID: ${customer.id}`);
      console.log(`✅ [TEST] Created on: ${connectAccountId ? `Connected Account (${connectAccountId})` : 'Platform Account'}`);
      
      // Verify customer exists by retrieving it
      let verificationResult;
      if (connectAccountId && stripe) {
        verificationResult = await stripe.customers.retrieve(customer.id, {
          stripeAccount: connectAccountId
        });
      } else if (stripe) {
        verificationResult = await stripe.customers.retrieve(customer.id);
      }
      
      res.json({
        success: true,
        message: "Test customer created successfully",
        customerId: customer.id,
        createdOn: connectAccountId ? "connected_account" : "platform_account",
        connectAccountId: connectAccountId || null,
        organizationName: organization.name,
        customerDetails: {
          email: customer.email,
          name: customer.name,
          metadata: customer.metadata
        },
        verified: !!verificationResult
      });
      
    } catch (error) {
      console.error("❌ [TEST] Stripe Connect customer test failed:", error);
      res.status(500).json({ 
        success: false,
        message: "Test failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
