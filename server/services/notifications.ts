import { storage } from "../storage";
import * as twilioService from "./twilio";
import * as sendgridService from "./sendgrid";
import type { Client, Appointment, Membership, Organization, MessageTemplate } from "@shared/schema";
import { addDays, addHours, format, startOfDay, endOfDay } from "date-fns";

// Default SMS templates
const DEFAULT_SMS_TEMPLATES = {
  appointment_reminder_24h: {
    name: "24 Hour Appointment Reminder",
    type: "sms" as const,
    category: "appointment" as const,
    content: "Hi {{firstName}}, this is a reminder about your {{serviceName}} appointment tomorrow at {{appointmentTime}}. Reply CONFIRM to confirm or CANCEL to cancel.",
    variables: ["firstName", "serviceName", "appointmentTime"],
    isDefault: true
  },
  appointment_reminder_2h: {
    name: "2 Hour Appointment Reminder",
    type: "sms" as const,
    category: "appointment" as const,
    content: "Hi {{firstName}}, your {{serviceName}} appointment is coming up in 2 hours at {{appointmentTime}}. We look forward to seeing you!",
    variables: ["firstName", "serviceName", "appointmentTime"],
    isDefault: true
  },
  birthday_greeting: {
    name: "Birthday Greeting",
    type: "sms" as const,
    category: "birthday" as const,
    content: "Happy Birthday {{firstName}}! 🎉 Enjoy 20% off any service this month. Book at {{bookingLink}}",
    variables: ["firstName", "bookingLink"],
    isDefault: true
  },
  membership_renewal: {
    name: "Membership Renewal Reminder",
    type: "sms" as const,
    category: "membership" as const,
    content: "Hi {{firstName}}, your {{membershipTier}} membership expires in 7 days. Renew now to keep your benefits!",
    variables: ["firstName", "membershipTier"],
    isDefault: true
  },
  follow_up: {
    name: "Service Follow-up",
    type: "sms" as const,
    category: "follow_up" as const,
    content: "Hi {{firstName}}, thank you for visiting us! How was your {{serviceName}} experience? We'd love your feedback.",
    variables: ["firstName", "serviceName"],
    isDefault: true
  }
};

export class NotificationService {
  private organizationCache = new Map<string, Organization>();

  // Get organization with caching
  private async getOrganization(organizationId: string): Promise<Organization | null> {
    if (!this.organizationCache.has(organizationId)) {
      const org = await storage.getOrganization(organizationId);
      if (org) {
        this.organizationCache.set(organizationId, org);
      }
    }
    return this.organizationCache.get(organizationId) || null;
  }

  // Main sendNotification function - simplified multi-channel dispatch
  async send(params: {
    userId: string;
    organizationId: string;
    type: 'booking' | 'membership' | 'reward' | 'custom' | 'system';
    title: string;
    message: string;
    data?: any;
    channels?: ('email' | 'sms' | 'in_app')[];
  }): Promise<{
    success: boolean;
    notificationId?: string;
    emailSent?: boolean;
    smsSent?: boolean;
    errors?: string[];
  }> {
    const { userId, organizationId, type, title, message, data, channels = ['in_app'] } = params;
    const errors: string[] = [];
    let emailSent = false;
    let smsSent = false;

    console.log(`[NOTIFICATIONS] Sending ${type} notification to user ${userId} via ${channels.join(', ')}`);

    // Get user and organization info
    const [user, organization] = await Promise.all([
      storage.getUser(userId),
      storage.getOrganization(organizationId)
    ]);

    if (!user) {
      console.error('[NOTIFICATIONS] User not found:', userId);
      return { success: false, errors: ['User not found'] };
    }

    if (!organization) {
      console.error('[NOTIFICATIONS] Organization not found:', organizationId);
      return { success: false, errors: ['Organization not found'] };
    }

    // Get client for contact info
    const client = await storage.getClientByUser(userId);

    // Send EMAIL if requested
    if (channels.includes('email') && (user.email || client?.email)) {
      const recipientEmail = user.email || client?.email;
      try {
        console.log(`[NOTIFICATIONS] Sending email to ${recipientEmail}`);
        const emailResult = await sendgridService.sendEmail({
          to: recipientEmail!,
          subject: title,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">${title}</h1>
              </div>
              <div style="padding: 30px; background: #f7f7f7;">
                <p style="font-size: 16px; color: #333; white-space: pre-wrap;">${message}</p>
                ${data?.actionUrl ? `
                  <div style="text-align: center; margin-top: 30px;">
                    <a href="${data.actionUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                      ${data.actionText || 'View Details'}
                    </a>
                  </div>
                ` : ''}
              </div>
              <div style="padding: 20px; background: #333; color: #999; text-align: center; font-size: 12px;">
                <p style="margin: 5px 0;">${organization.name}</p>
                ${organization.phone ? `<p style="margin: 5px 0;">${organization.phone}</p>` : ''}
                ${organization.email ? `<p style="margin: 5px 0;">${organization.email}</p>` : ''}
              </div>
            </div>
          `,
          categories: [type]
        });
        
        emailSent = emailResult.success;
        if (!emailResult.success) {
          errors.push(`Email failed: ${emailResult.error}`);
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] Email error:', error);
        errors.push(`Email error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Send SMS if requested
    if (channels.includes('sms') && (user.phone || client?.phone)) {
      const recipientPhone = user.phone || client?.phone;
      try {
        console.log(`[NOTIFICATIONS] Sending SMS to ${recipientPhone}`);
        
        // SMS character limit handling - keep it concise
        let smsMessage = `${title}\n\n${message}`;
        if (smsMessage.length > 160) {
          // Truncate message to fit SMS limit
          smsMessage = message.substring(0, 140) + '...';
        }
        
        const smsResult = await twilioService.sendSMS({
          to: recipientPhone!,
          message: smsMessage
        });
        
        smsSent = smsResult.success;
        if (!smsResult.success) {
          errors.push(`SMS failed: ${smsResult.error}`);
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] SMS error:', error);
        errors.push(`SMS error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Always create in-app notification record
    try {
      const notification = await storage.createNotification({
        userId,
        organizationId,
        type,
        title,
        message,
        data: data || {},
        channels,
        isRead: false
      });

      console.log(`✅ [NOTIFICATIONS] In-app notification created: ${notification.id}`);
      
      return {
        success: true,
        notificationId: notification.id,
        emailSent,
        smsSent,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to create in-app notification:', error);
      return {
        success: false,
        emailSent,
        smsSent,
        errors: [...errors, `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  // Create default templates for an organization (with idempotency)
  async createDefaultTemplates(organizationId: string): Promise<void> {
    console.log(`[NOTIFICATIONS] Initializing default templates for organization ${organizationId}`);
    
    // Upsert SMS templates (check if exists, update if needed, create if not)
    for (const [key, template] of Object.entries(DEFAULT_SMS_TEMPLATES)) {
      try {
        // Check if template already exists
        const existingTemplates = await storage.getMessageTemplatesByOrganization(organizationId);
        const existing = existingTemplates.find(t => 
          t.name === template.name && 
          t.type === template.type
        );
        
        if (existing) {
          // Update existing template if it's a default template
          if (existing.isDefault) {
            await storage.updateMessageTemplate(existing.id, {
              category: template.category,
              content: template.content,
              variables: template.variables,
              isActive: true
            });
            console.log(`✅ Updated existing default SMS template: ${template.name}`);
          } else {
            console.log(`⏭️ Skipped SMS template (custom exists): ${template.name}`);
          }
        } else {
          // Create new template
          await storage.createMessageTemplate({
            organizationId,
            name: template.name,
            type: template.type,
            category: template.category,
            content: template.content,
            variables: template.variables,
            isDefault: true,
            isActive: true
          });
          console.log(`✅ Created default SMS template: ${template.name}`);
        }
      } catch (error: any) {
        // Handle unique constraint violation gracefully
        if (error.code === '23505' || error.message?.includes('unique')) {
          console.log(`⏭️ Template already exists: ${template.name} (skipped)`);
        } else {
          console.error(`❌ Failed to create/update template ${template.name}:`, error);
        }
      }
    }

    // Upsert email templates (using SendGrid defaults)
    for (const [key, template] of Object.entries(sendgridService.DEFAULT_EMAIL_TEMPLATES)) {
      try {
        const templateName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        // Check if template already exists
        const existingTemplates = await storage.getMessageTemplatesByOrganization(organizationId);
        const existing = existingTemplates.find(t => 
          t.name === templateName && 
          t.type === 'email'
        );
        
        if (existing) {
          // Update existing template if it's a default template
          if (existing.isDefault) {
            await storage.updateMessageTemplate(existing.id, {
              category: key.includes('appointment') ? 'appointment' : 
                       key.includes('birthday') ? 'birthday' :
                       key.includes('membership') ? 'membership' :
                       key.includes('follow') ? 'follow_up' : 'promotion',
              subject: template.subject,
              content: template.html,
              variables: template.variables,
              isActive: true
            });
            console.log(`✅ Updated existing default email template: ${templateName}`);
          } else {
            console.log(`⏭️ Skipped email template (custom exists): ${templateName}`);
          }
        } else {
          // Create new template
          await storage.createMessageTemplate({
            organizationId,
            name: templateName,
            type: 'email',
            category: key.includes('appointment') ? 'appointment' : 
                     key.includes('birthday') ? 'birthday' :
                     key.includes('membership') ? 'membership' :
                     key.includes('follow') ? 'follow_up' : 'promotion',
            subject: template.subject,
            content: template.html,
            variables: template.variables,
            isDefault: true,
            isActive: true
          });
          console.log(`✅ Created default email template: ${templateName}`);
        }
      } catch (error: any) {
        // Handle unique constraint violation gracefully
        if (error.code === '23505' || error.message?.includes('unique')) {
          console.log(`⏭️ Template already exists: ${key} (skipped)`);
        } else {
          console.error(`❌ Failed to create/update email template ${key}:`, error);
        }
      }
    }
  }

  // Send notification via SMS and/or email
  async sendNotification(options: {
    recipientId?: string;
    recipientPhone?: string;
    recipientEmail?: string;
    organizationId: string;
    templateCategory: string;
    variables: Record<string, any>;
    channels?: ('sms' | 'email')[];
    preferredChannel?: 'sms' | 'email';
  }): Promise<{
    success: boolean;
    smsResult?: any;
    emailResult?: any;
    error?: string;
  }> {
    const channels = options.channels || ['sms', 'email'];
    const results: any = { success: false };

    // Get recipient info if ID provided
    let recipient: Client | undefined;
    if (options.recipientId) {
      recipient = await storage.getClient(options.recipientId);
      if (!recipient) {
        return { success: false, error: 'Recipient not found' };
      }
    }

    const phone = options.recipientPhone || recipient?.phone;
    const email = options.recipientEmail || recipient?.email;

    // Get organization for branding
    const organization = await this.getOrganization(options.organizationId);
    if (!organization) {
      return { success: false, error: 'Organization not found' };
    }

    // Add organization variables
    const fullVariables = {
      ...options.variables,
      organizationName: organization.name,
      organizationPhone: organization.phone || '',
      organizationEmail: organization.email || '',
      bookingLink: `https://aesthiq.app/c/${organization.slug}`
    };

    // Send SMS if requested and phone available
    if (channels.includes('sms') && phone) {
      try {
        // Get SMS template
        const smsTemplates = await storage.getMessageTemplatesByCategory(
          options.organizationId,
          options.templateCategory
        );
        const smsTemplate = smsTemplates.find(t => t.type === 'sms' && t.isActive);
        
        if (smsTemplate) {
          const message = twilioService.replaceTemplateVariables(
            smsTemplate.content,
            fullVariables
          );
          
          results.smsResult = await twilioService.sendSMS({
            to: phone,
            message
          });
          
          if (results.smsResult.success) {
            // Update template usage
            await storage.updateMessageTemplate(smsTemplate.id, {
              usageCount: (smsTemplate.usageCount || 0) + 1,
              lastUsedAt: new Date()
            });
          }
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] SMS send error:', error);
        results.smsError = error;
      }
    }

    // Send email if requested and email available
    if (channels.includes('email') && email) {
      try {
        // Get email template
        const emailTemplates = await storage.getMessageTemplatesByCategory(
          options.organizationId,
          options.templateCategory
        );
        const emailTemplate = emailTemplates.find(t => t.type === 'email' && t.isActive);
        
        if (emailTemplate) {
          results.emailResult = await sendgridService.sendEmail({
            to: email,
            subject: sendgridService.replaceTemplateVariables(
              emailTemplate.subject || '',
              fullVariables
            ),
            html: sendgridService.replaceTemplateVariables(
              emailTemplate.content,
              fullVariables
            ),
            categories: [options.templateCategory]
          });
          
          if (results.emailResult.success) {
            // Update template usage
            await storage.updateMessageTemplate(emailTemplate.id, {
              usageCount: (emailTemplate.usageCount || 0) + 1,
              lastUsedAt: new Date()
            });
          }
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] Email send error:', error);
        results.emailError = error;
      }
    }

    // Determine overall success
    results.success = (results.smsResult?.success || results.emailResult?.success) || false;
    
    // Log notification
    if (recipient?.userId) {
      await storage.createNotification({
        userId: recipient.userId,
        organizationId: options.organizationId,
        type: options.templateCategory,
        title: `${options.templateCategory} notification`,
        message: `Notification sent via ${channels.join(' and ')}`,
        data: {
          variables: fullVariables,
          results
        },
        channels: channels,
        sentAt: new Date()
      });
    }

    return results;
  }

  // Check and send appointment reminders
  async sendAppointmentReminders(): Promise<void> {
    console.log('[NOTIFICATIONS] Checking for appointment reminders...');
    
    const now = new Date();
    const in24Hours = addHours(now, 24);
    const in2Hours = addHours(now, 2);

    // Get all organizations
    const organizations = await storage.getOrganizations();
    
    for (const org of organizations) {
      if (!org.isActive) continue;
      
      // Get appointments for the next 24 hours
      const appointments = await storage.getAppointmentsByOrganization(
        org.id,
        now,
        in24Hours
      );

      for (const appointment of appointments) {
        const timeDiff = appointment.startTime.getTime() - now.getTime();
        const hoursUntil = timeDiff / (1000 * 60 * 60);
        
        // Skip if already reminded
        if (appointment.remindersSent && appointment.remindersSent >= 2) continue;
        
        // Get client and service details
        const [client, service, staff] = await Promise.all([
          storage.getClient(appointment.clientId),
          storage.getService(appointment.serviceId),
          storage.getStaff(appointment.staffId)
        ]);

        if (!client || !service) continue;

        const variables = {
          firstName: client.firstName,
          serviceName: service.name,
          appointmentDate: format(appointment.startTime, 'MMMM d, yyyy'),
          appointmentTime: format(appointment.startTime, 'h:mm a'),
          staffName: staff ? `${staff.user?.firstName || ''} ${staff.user?.lastName || ''}`.trim() : '',
          locationName: org.name
        };

        // Send 24-hour reminder
        if (hoursUntil <= 24 && hoursUntil > 23 && (!appointment.remindersSent || appointment.remindersSent < 1)) {
          console.log(`Sending 24-hour reminder for appointment ${appointment.id}`);
          
          await this.sendNotification({
            recipientId: client.id,
            organizationId: org.id,
            templateCategory: 'appointment',
            variables,
            channels: ['sms', 'email']
          });

          // Update reminder count
          await storage.updateAppointment(appointment.id, {
            remindersSent: (appointment.remindersSent || 0) + 1
          });
        }
        
        // Send 2-hour reminder
        if (hoursUntil <= 2 && hoursUntil > 1.5 && (!appointment.remindersSent || appointment.remindersSent < 2)) {
          console.log(`Sending 2-hour reminder for appointment ${appointment.id}`);
          
          await this.sendNotification({
            recipientId: client.id,
            organizationId: org.id,
            templateCategory: 'appointment',
            variables,
            channels: ['sms']  // Just SMS for 2-hour reminder
          });

          // Update reminder count
          await storage.updateAppointment(appointment.id, {
            remindersSent: 2
          });
        }
      }
    }
  }

  // Send birthday greetings
  async sendBirthdayGreetings(): Promise<void> {
    console.log('[NOTIFICATIONS] Checking for birthday greetings...');
    
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    // Get all organizations
    const organizations = await storage.getOrganizations();
    
    for (const org of organizations) {
      if (!org.isActive) continue;
      
      // Get all clients for this organization
      const clients = await storage.getClientsByOrganization(org.id);
      
      for (const client of clients) {
        if (!client.dateOfBirth || !client.isActive) continue;
        
        const birthMonth = client.dateOfBirth.getMonth() + 1;
        const birthDay = client.dateOfBirth.getDate();
        
        // Check if it's their birthday
        if (birthMonth === todayMonth && birthDay === todayDay) {
          console.log(`Sending birthday greeting to ${client.firstName} ${client.lastName}`);
          
          await this.sendNotification({
            recipientId: client.id,
            organizationId: org.id,
            templateCategory: 'birthday',
            variables: {
              firstName: client.firstName,
              birthMonth: format(today, 'MMMM')
            },
            channels: ['sms', 'email']
          });
        }
      }
    }
  }

  // Send membership renewal reminders
  async sendMembershipRenewals(): Promise<void> {
    console.log('[NOTIFICATIONS] Checking for membership renewals...');
    
    const today = new Date();
    const in7Days = addDays(today, 7);

    // Get all organizations
    const organizations = await storage.getOrganizations();
    
    for (const org of organizations) {
      if (!org.isActive) continue;
      
      // Get all memberships for this organization
      const memberships = await storage.getMembershipsByOrganization(org.id);
      
      for (const membership of memberships) {
        if (membership.status !== 'active' || !membership.endDate) continue;
        
        // Check if expiring in 7 days
        if (membership.endDate >= today && membership.endDate <= in7Days) {
          const client = await storage.getClient(membership.clientId);
          if (!client || !client.isActive) continue;
          
          console.log(`Sending renewal reminder for membership ${membership.id}`);
          
          const daysUntilExpiry = Math.ceil(
            (membership.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          await this.sendNotification({
            recipientId: client.id,
            organizationId: org.id,
            templateCategory: 'membership',
            variables: {
              firstName: client.firstName,
              membershipTier: membership.tierName,
              daysUntilExpiry: daysUntilExpiry.toString(),
              membershipBenefits: membership.benefits ? 
                Object.values(membership.benefits as any).map((b: any) => `<li>${b}</li>`).join('') : '',
              renewalLink: `https://aesthiq.app/c/${org.slug}/membership`
            },
            channels: ['sms', 'email']
          });
        }
      }
    }
  }

  // Send follow-up messages after services
  async sendServiceFollowUps(): Promise<void> {
    console.log('[NOTIFICATIONS] Checking for service follow-ups...');
    
    const today = new Date();
    const yesterday = addDays(today, -1);

    // Get all organizations
    const organizations = await storage.getOrganizations();
    
    for (const org of organizations) {
      if (!org.isActive) continue;
      
      // Get completed appointments from yesterday
      const appointments = await storage.getAppointmentsByOrganization(
        org.id,
        startOfDay(yesterday),
        endOfDay(yesterday)
      );

      for (const appointment of appointments) {
        if (appointment.status !== 'completed') continue;
        
        const [client, service] = await Promise.all([
          storage.getClient(appointment.clientId),
          storage.getService(appointment.serviceId)
        ]);

        if (!client || !service || !client.isActive) continue;

        console.log(`Sending follow-up for appointment ${appointment.id}`);
        
        await this.sendNotification({
          recipientId: client.id,
          organizationId: org.id,
          templateCategory: 'follow_up',
          variables: {
            firstName: client.firstName,
            serviceName: service.name,
            reviewLink: `https://aesthiq.app/c/${org.slug}/review`
          },
          channels: ['email']  // Follow-ups via email only
        });
      }
    }
  }

  // Run all automated notifications
  async runAutomatedNotifications(): Promise<void> {
    console.log('[NOTIFICATIONS] Running automated notifications...');
    
    try {
      await Promise.all([
        this.sendAppointmentReminders(),
        this.sendBirthdayGreetings(),
        this.sendMembershipRenewals(),
        this.sendServiceFollowUps()
      ]);
      
      console.log('✅ [NOTIFICATIONS] Automated notifications completed');
    } catch (error) {
      console.error('❌ [NOTIFICATIONS] Error running automated notifications:', error);
    }
  }
}

// Create singleton instance
export const notificationService = new NotificationService();

// Export for cron job or scheduled tasks
export async function runScheduledNotifications(): Promise<void> {
  await notificationService.runAutomatedNotifications();
}