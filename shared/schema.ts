import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, uuid, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["super_admin", "clinic_admin", "staff", "patient"]);
export const staffRoleEnum = pgEnum("staff_role", ["admin", "receptionist", "provider"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "past_due", "canceled", "trialing", "incomplete"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["scheduled", "confirmed", "in_progress", "completed", "canceled", "no_show"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "failed", "refunded"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "expired", "canceled", "suspended"]);
export const planTierEnum = pgEnum("plan_tier", ["starter", "professional", "business", "enterprise", "medical_chain"]);

// Core Tables
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("patient"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  emailVerified: boolean("email_verified").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`)
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  address: jsonb("address"),
  subscriptionPlanId: uuid("subscription_plan_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeConnectAccountId: text("stripe_connect_account_id"),
  stripeAccountStatus: text("stripe_account_status").default("pending"),
  payoutsEnabled: boolean("payouts_enabled").default(false),
  capabilitiesTransfers: text("capabilities_transfers").default("inactive"),
  hasExternalAccount: boolean("has_external_account").default(false),
  businessFeaturesEnabled: boolean("business_features_enabled").default(false),
  settings: jsonb("settings"),
  whiteLabelSettings: jsonb("white_label_settings"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`)
});

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tier: planTierEnum("tier").notNull(),
  description: text("description"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  maxLocations: integer("max_locations"),
  maxStaff: integer("max_staff"),
  maxClients: integer("max_clients"),
  features: jsonb("features"),
  limits: jsonb("limits"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  address: jsonb("address"),
  phone: text("phone"),
  email: text("email"),
  timezone: text("timezone").default("America/New_York"),
  businessHours: jsonb("business_hours"),
  settings: jsonb("settings"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  locationIds: jsonb("location_ids"),
  role: staffRoleEnum("role").notNull(),
  title: text("title"),
  specialties: jsonb("specialties"),
  bio: text("bio"),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  availability: jsonb("availability"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id"),
  organizationId: uuid("organization_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: timestamp("date_of_birth"),
  address: jsonb("address"),
  emergencyContact: jsonb("emergency_contact"),
  medicalHistory: jsonb("medical_history"),
  allergies: jsonb("allergies"),
  notes: text("notes"),
  tags: jsonb("tags"),
  preferences: jsonb("preferences"),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0"),
  lastVisit: timestamp("last_visit"),
  status: text("status").default("active"), // "invited", "active", "inactive"
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  duration: integer("duration").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  depositRequired: boolean("deposit_required").default(false),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  requiresConsent: boolean("requires_consent").default(false),
  availableStaffIds: jsonb("available_staff_ids"),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  locationId: uuid("location_id").notNull(),
  clientId: uuid("client_id").notNull(),
  staffId: uuid("staff_id").notNull(),
  serviceId: uuid("service_id").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: appointmentStatusEnum("status").default("scheduled"),
  notes: text("notes"),
  privateNotes: text("private_notes"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  depositPaid: decimal("deposit_paid", { precision: 10, scale: 2 }).default("0"),
  remindersSent: integer("reminders_sent").default(0),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const membershipTiers = pgTable("membership_tiers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  benefits: jsonb("benefits"),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }),
  monthlyCredits: decimal("monthly_credits", { precision: 10, scale: 2 }),
  color: text("color").default("gold"),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  isActive: boolean("is_active").default(true),
  autoRenew: boolean("auto_renew").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  clientId: uuid("client_id").notNull(),
  tierName: text("tier_name").notNull(),
  monthlyFee: decimal("monthly_fee", { precision: 10, scale: 2 }).notNull(),
  benefits: jsonb("benefits"),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }),
  monthlyCredits: decimal("monthly_credits", { precision: 10, scale: 2 }),
  usedCredits: decimal("used_credits", { precision: 10, scale: 2 }).default("0"),
  status: membershipStatusEnum("status").default("active"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  autoRenew: boolean("auto_renew").default(true),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const rewards = pgTable("rewards", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  clientId: uuid("client_id").notNull(),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  referenceId: uuid("reference_id"),
  referenceType: text("reference_type"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  clientId: uuid("client_id"),
  appointmentId: uuid("appointment_id"),
  membershipId: uuid("membership_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(),
  status: paymentStatusEnum("status").default("pending"),
  paymentMethod: text("payment_method"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const addOns = pgTable("add_ons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  billingCycle: text("billing_cycle"),
  stripePriceId: text("stripe_price_id"),
  features: jsonb("features"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const organizationAddOns = pgTable("organization_add_ons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  addOnId: uuid("add_on_id").notNull(),
  quantity: integer("quantity").default(1),
  isActive: boolean("is_active").default(true),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const usageLogs = pgTable("usage_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  feature: text("feature").notNull(),
  action: text("action").notNull(),
  quantity: integer("quantity").default(1),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  data: jsonb("data"),
  priority: text("priority").default("medium"),
  status: text("status").default("active"),
  actionTaken: boolean("action_taken").default(false),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id"),
  organizationId: uuid("organization_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  channels: jsonb("channels"),
  isRead: boolean("is_read").default(false),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id"),
  organizationId: uuid("organization_id"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: uuid("resource_id"),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const fileStorage = pgTable("file_storage", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  clientId: uuid("client_id"),
  uploadedById: uuid("uploaded_by_id").notNull(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  category: text("category"),
  tags: jsonb("tags"),
  isPublic: boolean("is_public").default(false),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isEnabled: boolean("is_enabled").default(false),
  targetPlans: jsonb("target_plans"),
  targetOrganizations: jsonb("target_organizations"),
  rolloutPercentage: integer("rollout_percentage").default(0),
  createdAt: timestamp("created_at").default(sql`now()`)
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  staff: one(staff, { fields: [users.id], references: [staff.userId] }),
  client: one(clients, { fields: [users.id], references: [clients.userId] }),
  notifications: many(notifications),
  auditLogs: many(auditLogs)
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  subscriptionPlan: one(subscriptionPlans, { fields: [organizations.subscriptionPlanId], references: [subscriptionPlans.id] }),
  locations: many(locations),
  staff: many(staff),
  clients: many(clients),
  services: many(services),
  appointments: many(appointments),
  memberships: many(memberships),
  rewards: many(rewards),
  transactions: many(transactions),
  organizationAddOns: many(organizationAddOns),
  usageLogs: many(usageLogs),
  aiInsights: many(aiInsights),
  fileStorage: many(fileStorage)
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  organization: one(organizations, { fields: [locations.organizationId], references: [organizations.id] }),
  appointments: many(appointments)
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  user: one(users, { fields: [staff.userId], references: [users.id] }),
  organization: one(organizations, { fields: [staff.organizationId], references: [organizations.id] }),
  appointments: many(appointments)
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  user: one(users, { fields: [clients.userId], references: [users.id] }),
  organization: one(organizations, { fields: [clients.organizationId], references: [organizations.id] }),
  appointments: many(appointments),
  memberships: many(memberships),
  rewards: many(rewards),
  transactions: many(transactions),
  fileStorage: many(fileStorage)
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  organization: one(organizations, { fields: [services.organizationId], references: [organizations.id] }),
  appointments: many(appointments)
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  organization: one(organizations, { fields: [appointments.organizationId], references: [organizations.id] }),
  location: one(locations, { fields: [appointments.locationId], references: [locations.id] }),
  client: one(clients, { fields: [appointments.clientId], references: [clients.id] }),
  staff: one(staff, { fields: [appointments.staffId], references: [staff.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] })
}));

export const membershipTiersRelations = relations(membershipTiers, ({ one, many }) => ({
  organization: one(organizations, { fields: [membershipTiers.organizationId], references: [organizations.id] }),
  memberships: many(memberships)
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, { fields: [memberships.organizationId], references: [organizations.id] }),
  client: one(clients, { fields: [memberships.clientId], references: [clients.id] })
}));

export const rewardsRelations = relations(rewards, ({ one }) => ({
  organization: one(organizations, { fields: [rewards.organizationId], references: [organizations.id] }),
  client: one(clients, { fields: [rewards.clientId], references: [clients.id] })
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  organization: one(organizations, { fields: [transactions.organizationId], references: [organizations.id] }),
  client: one(clients, { fields: [transactions.clientId], references: [clients.id] }),
  appointment: one(appointments, { fields: [transactions.appointmentId], references: [appointments.id] }),
  membership: one(memberships, { fields: [transactions.membershipId], references: [memberships.id] })
}));

export const addOnsRelations = relations(addOns, ({ many }) => ({
  organizationAddOns: many(organizationAddOns)
}));

export const organizationAddOnsRelations = relations(organizationAddOns, ({ one }) => ({
  organization: one(organizations, { fields: [organizationAddOns.organizationId], references: [organizations.id] }),
  addOn: one(addOns, { fields: [organizationAddOns.addOnId], references: [addOns.id] })
}));

// Insert and Select Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true
});

export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
  createdAt: true
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true
});

export const insertMembershipTierSchema = createInsertSchema(membershipTiers).omit({
  id: true,
  createdAt: true
});

export const insertMembershipSchema = createInsertSchema(memberships).omit({
  id: true,
  createdAt: true
});

export const insertRewardSchema = createInsertSchema(rewards).omit({
  id: true,
  createdAt: true
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true
});

export const insertAddOnSchema = createInsertSchema(addOns).omit({
  id: true,
  createdAt: true
});

export const insertUsageLogSchema = createInsertSchema(usageLogs).omit({
  id: true,
  createdAt: true
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true
});

export const insertFileStorageSchema = createInsertSchema(fileStorage).omit({
  id: true,
  createdAt: true
});

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type MembershipTier = typeof membershipTiers.$inferSelect;
export type InsertMembershipTier = z.infer<typeof insertMembershipTierSchema>;
export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Reward = typeof rewards.$inferSelect;
export type InsertReward = z.infer<typeof insertRewardSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type AddOn = typeof addOns.$inferSelect;
export type InsertAddOn = z.infer<typeof insertAddOnSchema>;
export type UsageLog = typeof usageLogs.$inferSelect;
export type InsertUsageLog = z.infer<typeof insertUsageLogSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type FileStorage = typeof fileStorage.$inferSelect;
export type InsertFileStorage = z.infer<typeof insertFileStorageSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
