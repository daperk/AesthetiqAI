import {
  users, organizations, subscriptionPlans, locations, staff, clients, services,
  appointments, memberships, rewards, transactions, addOns, organizationAddOns,
  usageLogs, aiInsights, notifications, auditLogs, fileStorage, featureFlags,
  type User, type InsertUser, type Organization, type InsertOrganization,
  type SubscriptionPlan, type InsertSubscriptionPlan, type Location, type InsertLocation,
  type Staff, type InsertStaff, type Client, type InsertClient, type Service, type InsertService,
  type Appointment, type InsertAppointment, type Membership, type InsertMembership,
  type Reward, type InsertReward, type Transaction, type InsertTransaction,
  type AddOn, type InsertAddOn, type UsageLog, type InsertUsageLog,
  type AiInsight, type InsertAiInsight, type Notification, type InsertNotification,
  type AuditLog, type InsertAuditLog, type FileStorage, type InsertFileStorage,
  type FeatureFlag, type InsertFeatureFlag
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte, like, count, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  updateUserStripeInfo(id: string, customerId: string, subscriptionId?: string): Promise<User>;

  // Organizations
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  getOrganizations(limit?: number, offset?: number): Promise<Organization[]>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization>;

  // Subscription Plans
  getSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined>;
  createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  updateSubscriptionPlan(id: string, updates: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan>;

  // Locations
  getLocationsByOrganization(organizationId: string): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string, updates: Partial<InsertLocation>): Promise<Location>;

  // Staff
  getStaffByOrganization(organizationId: string): Promise<Staff[]>;
  getStaff(id: string): Promise<Staff | undefined>;
  getStaffByUser(userId: string): Promise<Staff | undefined>;
  createStaff(staff: InsertStaff): Promise<Staff>;
  updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff>;

  // Clients
  getClientsByOrganization(organizationId: string): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  getClientByUser(userId: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, updates: Partial<InsertClient>): Promise<Client>;

  // Services
  getServicesByOrganization(organizationId: string): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, updates: Partial<InsertService>): Promise<Service>;

  // Appointments
  getAppointmentsByOrganization(organizationId: string, startDate?: Date, endDate?: Date): Promise<Appointment[]>;
  getAppointmentsByClient(clientId: string): Promise<Appointment[]>;
  getAppointmentsByStaff(staffId: string, date?: Date): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment>;

  // Memberships
  getMembershipsByOrganization(organizationId: string): Promise<Membership[]>;
  getMembershipsByClient(clientId: string): Promise<Membership[]>;
  getMembership(id: string): Promise<Membership | undefined>;
  createMembership(membership: InsertMembership): Promise<Membership>;
  updateMembership(id: string, updates: Partial<InsertMembership>): Promise<Membership>;

  // Rewards
  getRewardsByClient(clientId: string): Promise<Reward[]>;
  getClientRewardBalance(clientId: string): Promise<number>;
  createReward(reward: InsertReward): Promise<Reward>;

  // Transactions
  getTransactionsByOrganization(organizationId: string): Promise<Transaction[]>;
  getTransactionsByClient(clientId: string): Promise<Transaction[]>;
  getTransactionsByAppointment(appointmentId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: string, updates: Partial<InsertTransaction>): Promise<Transaction>;

  // AI Insights
  getAiInsightsByOrganization(organizationId: string): Promise<AiInsight[]>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  updateAiInsight(id: string, updates: Partial<InsertAiInsight>): Promise<AiInsight>;

  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification>;

  // Usage Logs
  createUsageLog(log: InsertUsageLog): Promise<UsageLog>;
  getUsageLogsByOrganization(organizationId: string, feature?: string): Promise<UsageLog[]>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByOrganization(organizationId: string): Promise<AuditLog[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users).set({ ...updates, updatedAt: sql`now()` }).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserStripeInfo(id: string, customerId: string, subscriptionId?: string): Promise<User> {
    const [user] = await db.update(users)
      .set({ 
        stripeCustomerId: customerId, 
        stripeSubscriptionId: subscriptionId,
        updatedAt: sql`now()`
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Organizations
  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));
    return organization || undefined;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return organization || undefined;
  }

  async getOrganizations(limit = 50, offset = 0): Promise<Organization[]> {
    return await db.select().from(organizations).limit(limit).offset(offset).orderBy(desc(organizations.createdAt));
  }

  async createOrganization(insertOrganization: InsertOrganization): Promise<Organization> {
    const [organization] = await db.insert(organizations).values(insertOrganization).returning();
    return organization;
  }

  async updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization> {
    const [organization] = await db.update(organizations)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(organizations.id, id))
      .returning();
    return organization;
  }

  // Subscription Plans
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }

  async getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    return plan || undefined;
  }

  async createSubscriptionPlan(insertPlan: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [plan] = await db.insert(subscriptionPlans).values(insertPlan).returning();
    return plan;
  }

  async updateSubscriptionPlan(id: string, updates: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan> {
    const [plan] = await db.update(subscriptionPlans).set(updates).where(eq(subscriptionPlans.id, id)).returning();
    return plan;
  }

  // Locations
  async getLocationsByOrganization(organizationId: string): Promise<Location[]> {
    return await db.select().from(locations)
      .where(and(eq(locations.organizationId, organizationId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location || undefined;
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    const [location] = await db.insert(locations).values(insertLocation).returning();
    return location;
  }

  async updateLocation(id: string, updates: Partial<InsertLocation>): Promise<Location> {
    const [location] = await db.update(locations).set(updates).where(eq(locations.id, id)).returning();
    return location;
  }

  // Staff
  async getStaffByOrganization(organizationId: string): Promise<Staff[]> {
    return await db.select().from(staff)
      .where(and(eq(staff.organizationId, organizationId), eq(staff.isActive, true)));
  }

  async getStaff(id: string): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, id));
    return staffMember || undefined;
  }

  async getStaffByUser(userId: string): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.userId, userId));
    return staffMember || undefined;
  }

  async createStaff(insertStaff: InsertStaff): Promise<Staff> {
    const [staffMember] = await db.insert(staff).values(insertStaff).returning();
    return staffMember;
  }

  async updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff> {
    const [staffMember] = await db.update(staff).set(updates).where(eq(staff.id, id)).returning();
    return staffMember;
  }

  // Clients
  async getClientsByOrganization(organizationId: string): Promise<Client[]> {
    return await db.select().from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.isActive, true)))
      .orderBy(asc(clients.firstName), asc(clients.lastName));
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  }

  async getClientByUser(userId: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId));
    return client || undefined;
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(insertClient).returning();
    return client;
  }

  async updateClient(id: string, updates: Partial<InsertClient>): Promise<Client> {
    const [client] = await db.update(clients).set(updates).where(eq(clients.id, id)).returning();
    return client;
  }

  // Services
  async getServicesByOrganization(organizationId: string): Promise<Service[]> {
    return await db.select().from(services)
      .where(and(eq(services.organizationId, organizationId), eq(services.isActive, true)))
      .orderBy(asc(services.category), asc(services.name));
  }

  async getService(id: string): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service || undefined;
  }

  async createService(insertService: InsertService): Promise<Service> {
    const [service] = await db.insert(services).values(insertService).returning();
    return service;
  }

  async updateService(id: string, updates: Partial<InsertService>): Promise<Service> {
    const [service] = await db.update(services).set(updates).where(eq(services.id, id)).returning();
    return service;
  }

  // Appointments
  async getAppointmentsByOrganization(organizationId: string, startDate?: Date, endDate?: Date): Promise<Appointment[]> {
    let conditions = [eq(appointments.organizationId, organizationId)];
    
    if (startDate) {
      conditions.push(gte(appointments.startTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(appointments.startTime, endDate));
    }
    
    return await db.select().from(appointments)
      .where(and(...conditions))
      .orderBy(asc(appointments.startTime));
  }

  async getAppointmentsByClient(clientId: string): Promise<Appointment[]> {
    return await db.select().from(appointments)
      .where(eq(appointments.clientId, clientId))
      .orderBy(desc(appointments.startTime));
  }

  async getAppointmentsByStaff(staffId: string, date?: Date): Promise<Appointment[]> {
    let query = db.select().from(appointments).where(eq(appointments.staffId, staffId));
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      query = query.where(and(
        gte(appointments.startTime, startOfDay),
        lte(appointments.startTime, endOfDay)
      ));
    }
    
    return await query.orderBy(asc(appointments.startTime));
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment || undefined;
  }

  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db.insert(appointments).values(insertAppointment).returning();
    return appointment;
  }

  async updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment> {
    const [appointment] = await db.update(appointments).set(updates).where(eq(appointments.id, id)).returning();
    return appointment;
  }

  // Memberships
  async getMembershipsByOrganization(organizationId: string): Promise<Membership[]> {
    return await db.select().from(memberships)
      .where(eq(memberships.organizationId, organizationId))
      .orderBy(desc(memberships.createdAt));
  }

  async getMembershipsByClient(clientId: string): Promise<Membership[]> {
    return await db.select().from(memberships)
      .where(eq(memberships.clientId, clientId))
      .orderBy(desc(memberships.createdAt));
  }

  async getMembership(id: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships).where(eq(memberships.id, id));
    return membership || undefined;
  }

  async createMembership(insertMembership: InsertMembership): Promise<Membership> {
    const [membership] = await db.insert(memberships).values(insertMembership).returning();
    return membership;
  }

  async updateMembership(id: string, updates: Partial<InsertMembership>): Promise<Membership> {
    const [membership] = await db.update(memberships).set(updates).where(eq(memberships.id, id)).returning();
    return membership;
  }

  // Rewards
  async getRewardsByClient(clientId: string): Promise<Reward[]> {
    return await db.select().from(rewards)
      .where(eq(rewards.clientId, clientId))
      .orderBy(desc(rewards.createdAt));
  }

  async getClientRewardBalance(clientId: string): Promise<number> {
    const result = await db.select({ 
      total: sql<number>`COALESCE(SUM(${rewards.points}), 0)` 
    })
    .from(rewards)
    .where(eq(rewards.clientId, clientId));
    
    return result[0]?.total || 0;
  }

  async createReward(insertReward: InsertReward): Promise<Reward> {
    const [reward] = await db.insert(rewards).values(insertReward).returning();
    return reward;
  }

  // Transactions
  async getTransactionsByOrganization(organizationId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.organizationId, organizationId))
      .orderBy(desc(transactions.createdAt));
  }

  async getTransactionsByClient(clientId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.clientId, clientId))
      .orderBy(desc(transactions.createdAt));
  }

  async getTransactionsByAppointment(appointmentId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.appointmentId, appointmentId))
      .orderBy(desc(transactions.createdAt));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(insertTransaction).returning();
    return transaction;
  }

  async updateTransaction(id: string, updates: Partial<InsertTransaction>): Promise<Transaction> {
    const [transaction] = await db.update(transactions).set(updates).where(eq(transactions.id, id)).returning();
    return transaction;
  }

  // AI Insights
  async getAiInsightsByOrganization(organizationId: string): Promise<AiInsight[]> {
    return await db.select().from(aiInsights)
      .where(and(eq(aiInsights.organizationId, organizationId), eq(aiInsights.status, "active")))
      .orderBy(desc(aiInsights.createdAt));
  }

  async createAiInsight(insertInsight: InsertAiInsight): Promise<AiInsight> {
    const [insight] = await db.insert(aiInsights).values(insertInsight).returning();
    return insight;
  }

  async updateAiInsight(id: string, updates: Partial<InsertAiInsight>): Promise<AiInsight> {
    const [insight] = await db.update(aiInsights).set(updates).where(eq(aiInsights.id, id)).returning();
    return insight;
  }

  // Notifications
  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(insertNotification).returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const [notification] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  // Usage Logs
  async createUsageLog(insertLog: InsertUsageLog): Promise<UsageLog> {
    const [log] = await db.insert(usageLogs).values(insertLog).returning();
    return log;
  }

  async getUsageLogsByOrganization(organizationId: string, feature?: string): Promise<UsageLog[]> {
    let query = db.select().from(usageLogs).where(eq(usageLogs.organizationId, organizationId));
    
    if (feature) {
      query = query.where(eq(usageLogs.feature, feature));
    }
    
    return await query.orderBy(desc(usageLogs.createdAt));
  }

  // Audit Logs
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAuditLogsByOrganization(organizationId: string): Promise<AuditLog[]> {
    return await db.select().from(auditLogs)
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.createdAt));
  }
}

export const storage = new DatabaseStorage();
