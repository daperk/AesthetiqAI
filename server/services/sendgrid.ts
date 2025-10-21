import sgMail from '@sendgrid/mail';
import type { MailDataRequired } from '@sendgrid/mail';

// Configuration
const SENDGRID_CONFIG = {
  apiKey: process.env.SENDGRID_API_KEY,
  fromEmail: process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'aesthiqhere@gmail.com',
  fromName: process.env.SENDGRID_FROM_NAME || 'Aesthiq',
  isConfigured: false,
  debugMode: process.env.NODE_ENV === 'development'
};

// Initialize SendGrid
if (SENDGRID_CONFIG.apiKey) {
  try {
    sgMail.setApiKey(SENDGRID_CONFIG.apiKey);
    SENDGRID_CONFIG.isConfigured = true;
    console.log('✅ [SENDGRID] Email service initialized successfully');
    console.log(`📧 [SENDGRID] Default sender: ${SENDGRID_CONFIG.fromEmail}`);
    if (SENDGRID_CONFIG.debugMode) {
      console.log('🔍 [SENDGRID] Debug Mode: Enabled');
    }
  } catch (error) {
    console.error('❌ [SENDGRID] Failed to initialize email service:', error);
  }
} else {
  console.warn('⚠️ [SENDGRID] Email service not configured. Missing SENDGRID_API_KEY');
}

// Email template types
export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
  variables?: string[];
}

// Default email templates
export const DEFAULT_EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  appointment_reminder: {
    subject: 'Appointment Reminder - {{serviceName}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Appointment Reminder</h1>
        </div>
        <div style="padding: 40px 20px; background: #f7f7f7;">
          <p style="font-size: 16px; color: #333;">Hi {{firstName}},</p>
          <p style="font-size: 16px; color: #333;">This is a friendly reminder about your upcoming appointment:</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Service:</strong> {{serviceName}}</p>
            <p style="margin: 10px 0;"><strong>Date:</strong> {{appointmentDate}}</p>
            <p style="margin: 10px 0;"><strong>Time:</strong> {{appointmentTime}}</p>
            <p style="margin: 10px 0;"><strong>Location:</strong> {{locationName}}</p>
            <p style="margin: 10px 0;"><strong>Provider:</strong> {{staffName}}</p>
          </div>
          <p style="font-size: 14px; color: #666;">If you need to reschedule or cancel, please contact us as soon as possible.</p>
          <div style="text-align: center; margin-top: 30px;">
            <a href="{{bookingLink}}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Manage Appointment</a>
          </div>
        </div>
        <div style="padding: 20px; background: #333; color: #999; text-align: center; font-size: 12px;">
          <p style="margin: 5px 0;">{{organizationName}}</p>
          <p style="margin: 5px 0;">{{organizationPhone}} | {{organizationEmail}}</p>
        </div>
      </div>
    `,
    variables: ['firstName', 'serviceName', 'appointmentDate', 'appointmentTime', 'locationName', 'staffName', 'bookingLink', 'organizationName', 'organizationPhone', 'organizationEmail']
  },
  birthday_greeting: {
    subject: 'Happy Birthday, {{firstName}}! 🎉',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 36px;">🎂 Happy Birthday! 🎉</h1>
        </div>
        <div style="padding: 40px 20px; background: #fff5f5;">
          <p style="font-size: 18px; color: #333;">Dear {{firstName}},</p>
          <p style="font-size: 16px; color: #333;">Wishing you a wonderful birthday filled with joy and happiness!</p>
          <div style="background: white; padding: 30px; border-radius: 8px; margin: 30px 0; text-align: center; border: 2px dashed #f5576c;">
            <h2 style="color: #f5576c; margin: 0 0 10px 0;">🎁 Birthday Gift</h2>
            <p style="font-size: 24px; color: #333; margin: 10px 0;"><strong>20% OFF</strong></p>
            <p style="font-size: 16px; color: #666;">Any service this month</p>
            <p style="font-size: 14px; color: #999; margin-top: 15px;">Use code: <strong>BIRTHDAY{{birthMonth}}</strong></p>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <a href="{{bookingLink}}" style="background: #f5576c; color: white; padding: 15px 40px; text-decoration: none; border-radius: 25px; display: inline-block; font-size: 16px;">Book Your Birthday Treat</a>
          </div>
        </div>
        <div style="padding: 20px; background: #333; color: #999; text-align: center; font-size: 12px;">
          <p style="margin: 5px 0;">{{organizationName}}</p>
          <p style="margin: 5px 0;">{{organizationPhone}} | {{organizationEmail}}</p>
        </div>
      </div>
    `,
    variables: ['firstName', 'birthMonth', 'bookingLink', 'organizationName', 'organizationPhone', 'organizationEmail']
  },
  membership_renewal: {
    subject: 'Your {{membershipTier}} Membership Renewal Reminder',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Membership Renewal</h1>
        </div>
        <div style="padding: 40px 20px; background: #f7f7f7;">
          <p style="font-size: 16px; color: #333;">Hi {{firstName}},</p>
          <p style="font-size: 16px; color: #333;">Your <strong>{{membershipTier}}</strong> membership will expire in <strong>{{daysUntilExpiry}} days</strong>.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">Don't lose your benefits:</h3>
            <ul style="color: #333; line-height: 1.8;">
              {{membershipBenefits}}
            </ul>
          </div>
          <p style="font-size: 16px; color: #333;">Renew now to continue enjoying exclusive member privileges!</p>
          <div style="text-align: center; margin-top: 30px;">
            <a href="{{renewalLink}}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Renew Membership</a>
          </div>
        </div>
        <div style="padding: 20px; background: #333; color: #999; text-align: center; font-size: 12px;">
          <p style="margin: 5px 0;">{{organizationName}}</p>
          <p style="margin: 5px 0;">{{organizationPhone}} | {{organizationEmail}}</p>
        </div>
      </div>
    `,
    variables: ['firstName', 'membershipTier', 'daysUntilExpiry', 'membershipBenefits', 'renewalLink', 'organizationName', 'organizationPhone', 'organizationEmail']
  },
  follow_up: {
    subject: 'Thank you for visiting {{organizationName}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Thank You!</h1>
        </div>
        <div style="padding: 40px 20px; background: #f7f7f7;">
          <p style="font-size: 16px; color: #333;">Hi {{firstName}},</p>
          <p style="font-size: 16px; color: #333;">Thank you for visiting us for your <strong>{{serviceName}}</strong> appointment.</p>
          <p style="font-size: 16px; color: #333;">We hope you had a wonderful experience!</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="color: #667eea;">How was your experience?</h3>
            <p style="color: #666;">We'd love to hear your feedback</p>
            <a href="{{reviewLink}}" style="background: #667eea; color: white; padding: 10px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Leave a Review</a>
          </div>
          <p style="font-size: 14px; color: #666;">Ready for your next appointment? Book online or call us anytime.</p>
          <div style="text-align: center; margin-top: 30px;">
            <a href="{{bookingLink}}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Book Next Appointment</a>
          </div>
        </div>
        <div style="padding: 20px; background: #333; color: #999; text-align: center; font-size: 12px;">
          <p style="margin: 5px 0;">{{organizationName}}</p>
          <p style="margin: 5px 0;">{{organizationPhone}} | {{organizationEmail}}</p>
        </div>
      </div>
    `,
    variables: ['firstName', 'serviceName', 'reviewLink', 'bookingLink', 'organizationName', 'organizationPhone', 'organizationEmail']
  },
  promotion: {
    subject: '{{promotionTitle}} - Limited Time Offer!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">{{promotionTitle}}</h1>
        </div>
        <div style="padding: 40px 20px; background: #fffbf0;">
          <p style="font-size: 16px; color: #333;">Hi {{firstName}},</p>
          <div style="background: white; padding: 30px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #fa709a; margin-top: 0; text-align: center;">{{promotionHeadline}}</h2>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">{{promotionDescription}}</p>
            <div style="background: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #fa709a;">
              <p style="margin: 0; color: #333;"><strong>Offer Details:</strong></p>
              <p style="margin: 10px 0 0 0; color: #666;">{{offerDetails}}</p>
            </div>
            <p style="text-align: center; color: #999; font-size: 14px;">Valid until {{expiryDate}}</p>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <a href="{{ctaLink}}" style="background: #fa709a; color: white; padding: 15px 40px; text-decoration: none; border-radius: 25px; display: inline-block; font-size: 16px;">{{ctaText}}</a>
          </div>
        </div>
        <div style="padding: 20px; background: #333; color: #999; text-align: center; font-size: 12px;">
          <p style="margin: 5px 0;">{{organizationName}}</p>
          <p style="margin: 5px 0;">{{organizationPhone}} | {{organizationEmail}}</p>
        </div>
      </div>
    `,
    variables: ['firstName', 'promotionTitle', 'promotionHeadline', 'promotionDescription', 'offerDetails', 'expiryDate', 'ctaLink', 'ctaText', 'organizationName', 'organizationPhone', 'organizationEmail']
  }
};

// Helper function to replace template variables
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | number | Date>
): string {
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    let formattedValue = '';
    
    if (value instanceof Date) {
      // Format dates nicely
      formattedValue = value.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } else if (typeof value === 'number') {
      formattedValue = value.toString();
    } else {
      formattedValue = value || '';
    }
    
    // Replace all occurrences of the variable
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), formattedValue);
  });
  
  return result;
}

// Send email with template support
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
  }>;
  categories?: string[];
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
}): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}> {
  const startTime = Date.now();
  
  if (!SENDGRID_CONFIG.isConfigured) {
    console.warn('[SENDGRID] Email service not configured, email not sent');
    return {
      success: false,
      error: 'Email service not configured'
    };
  }

  try {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    
    console.log(`[SENDGRID] Sending email to ${recipients.join(', ')}`);
    if (SENDGRID_CONFIG.debugMode) {
      console.log(`[SENDGRID] Subject: ${options.subject}`);
    }

    const msg: MailDataRequired = {
      to: recipients,
      from: {
        email: options.from || SENDGRID_CONFIG.fromEmail,
        name: options.fromName || SENDGRID_CONFIG.fromName
      },
      subject: options.subject,
      html: options.html,
      ...(options.text && { text: options.text }),
      ...(options.replyTo && { replyTo: options.replyTo }),
      ...(options.attachments && { attachments: options.attachments }),
      ...(options.categories && { categories: options.categories }),
      ...(options.templateId && { templateId: options.templateId }),
      ...(options.dynamicTemplateData && { dynamicTemplateData: options.dynamicTemplateData })
    };

    const [response] = await sgMail.send(msg);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [SENDGRID] Email sent successfully (${duration}ms)`);
    console.log(`   Message ID: ${response.headers['x-message-id']}`);
    
    return {
      success: true,
      messageId: response.headers['x-message-id'] as string,
      details: {
        statusCode: response.statusCode,
        duration
      }
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [SENDGRID] Email send failed (${duration}ms):`, error);
    
    let errorMessage = 'Failed to send email';
    if (error.response?.body?.errors?.[0]) {
      errorMessage = error.response.body.errors[0].message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
      details: {
        code: error.code,
        response: error.response?.body,
        duration
      }
    };
  }
}

// Send bulk emails
export async function sendBulkEmail(options: {
  recipients: Array<{
    to: string;
    variables?: Record<string, any>;
  }>;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  categories?: string[];
  throttleMs?: number;
}): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  results: Array<{
    to: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}> {
  if (!SENDGRID_CONFIG.isConfigured) {
    console.warn('[SENDGRID] Email service not configured, bulk send aborted');
    return {
      success: false,
      sent: 0,
      failed: options.recipients.length,
      results: options.recipients.map(r => ({
        to: r.to,
        success: false,
        error: 'Email service not configured'
      }))
    };
  }

  console.log(`[SENDGRID] Starting bulk email send to ${options.recipients.length} recipients`);
  const startTime = Date.now();
  const results: Array<{
    to: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }> = [];
  
  let sent = 0;
  let failed = 0;
  const throttleMs = options.throttleMs || 100;

  // SendGrid supports batch sending, but for better error tracking we'll send individually
  for (const recipient of options.recipients) {
    try {
      // Apply template variables
      let finalHtml = options.html;
      let finalSubject = options.subject;
      let finalText = options.text;
      
      if (recipient.variables) {
        finalHtml = replaceTemplateVariables(finalHtml, recipient.variables);
        finalSubject = replaceTemplateVariables(finalSubject, recipient.variables);
        if (finalText) {
          finalText = replaceTemplateVariables(finalText, recipient.variables);
        }
      }

      const result = await sendEmail({
        to: recipient.to,
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
        from: options.from,
        fromName: options.fromName,
        categories: options.categories
      });

      if (result.success) {
        sent++;
        results.push({
          to: recipient.to,
          success: true,
          messageId: result.messageId
        });
      } else {
        failed++;
        results.push({
          to: recipient.to,
          success: false,
          error: result.error
        });
      }

      // Throttle to avoid rate limits
      if (throttleMs > 0 && options.recipients.indexOf(recipient) < options.recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, throttleMs));
      }
    } catch (error) {
      failed++;
      results.push({
        to: recipient.to,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const duration = Date.now() - startTime;
  const success = failed === 0;
  
  console.log(`[SENDGRID] Bulk email completed in ${duration}ms`);
  console.log(`   ✅ Sent: ${sent}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Success rate: ${((sent / options.recipients.length) * 100).toFixed(1)}%`);

  return {
    success,
    sent,
    failed,
    results
  };
}

// Send email using template
export async function sendEmailWithTemplate(options: {
  to: string | string[];
  templateName: keyof typeof DEFAULT_EMAIL_TEMPLATES;
  variables: Record<string, any>;
  customTemplate?: EmailTemplate;
  from?: string;
  fromName?: string;
  categories?: string[];
}): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const template = options.customTemplate || DEFAULT_EMAIL_TEMPLATES[options.templateName];
  
  if (!template) {
    return {
      success: false,
      error: `Template '${options.templateName}' not found`
    };
  }

  // Replace variables in subject and content
  const subject = replaceTemplateVariables(template.subject, options.variables);
  const html = replaceTemplateVariables(template.html, options.variables);
  const text = template.text ? replaceTemplateVariables(template.text, options.variables) : undefined;

  return sendEmail({
    to: options.to,
    subject,
    html,
    text,
    from: options.from,
    fromName: options.fromName,
    categories: options.categories || [options.templateName]
  });
}

// Get email service status
export function getEmailServiceStatus(): {
  configured: boolean;
  provider: string;
  fromEmail?: string;
  debugMode: boolean;
} {
  return {
    configured: SENDGRID_CONFIG.isConfigured,
    provider: 'SendGrid',
    fromEmail: SENDGRID_CONFIG.isConfigured ? SENDGRID_CONFIG.fromEmail : undefined,
    debugMode: SENDGRID_CONFIG.debugMode
  };
}

// Export config for testing
export { SENDGRID_CONFIG };