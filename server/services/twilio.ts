import twilio from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message';

// Configuration
const TWILIO_CONFIG = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  fromNumber: process.env.TWILIO_PHONE_NUMBER,
  isConfigured: false,
  debugMode: process.env.NODE_ENV === 'development'
};

// Initialize Twilio client
let twilioClient: ReturnType<typeof twilio> | null = null;

// Initialize Twilio
if (TWILIO_CONFIG.accountSid && TWILIO_CONFIG.authToken && TWILIO_CONFIG.fromNumber) {
  try {
    twilioClient = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
    TWILIO_CONFIG.isConfigured = true;
    console.log('✅ [TWILIO] SMS service initialized successfully');
    console.log(`📱 [TWILIO] From number: ${TWILIO_CONFIG.fromNumber}`);
    if (TWILIO_CONFIG.debugMode) {
      console.log('🔍 [TWILIO] Debug Mode: Enabled');
    }
  } catch (error) {
    console.error('❌ [TWILIO] Failed to initialize SMS service:', error);
  }
} else {
  console.warn('⚠️ [TWILIO] SMS service not configured. Missing required environment variables:');
  if (!TWILIO_CONFIG.accountSid) console.log('   - TWILIO_ACCOUNT_SID');
  if (!TWILIO_CONFIG.authToken) console.log('   - TWILIO_AUTH_TOKEN');
  if (!TWILIO_CONFIG.fromNumber) console.log('   - TWILIO_PHONE_NUMBER');
}

// Phone number validation
export async function validatePhoneNumber(phoneNumber: string): Promise<{
  valid: boolean;
  formatted?: string;
  error?: string;
}> {
  if (!TWILIO_CONFIG.isConfigured || !twilioClient) {
    return { valid: false, error: 'SMS service not configured' };
  }

  try {
    // Basic phone number formatting and validation
    // Remove all non-numeric characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Check if it's a valid format (basic check)
    if (cleaned.length < 10) {
      return { valid: false, error: 'Phone number too short' };
    }
    
    // Add country code if not present (assuming US)
    let formatted = cleaned;
    if (!formatted.startsWith('+')) {
      if (formatted.startsWith('1') && formatted.length === 11) {
        formatted = `+${formatted}`;
      } else if (formatted.length === 10) {
        formatted = `+1${formatted}`;
      } else {
        formatted = `+${formatted}`;
      }
    }
    
    // Use Twilio's lookup API for more thorough validation
    try {
      const phoneNumberLookup = await twilioClient.lookups.v2
        .phoneNumbers(formatted)
        .fetch();
      
      return {
        valid: phoneNumberLookup.valid || false,
        formatted: phoneNumberLookup.phoneNumber
      };
    } catch (lookupError) {
      // If lookup fails, do basic validation
      if (TWILIO_CONFIG.debugMode) {
        console.log(`[TWILIO] Lookup API failed, using basic validation: ${lookupError}`);
      }
      
      // Basic regex for international phone numbers
      const phoneRegex = /^\+[1-9]\d{10,14}$/;
      if (phoneRegex.test(formatted)) {
        return { valid: true, formatted };
      }
      
      return { valid: false, error: 'Invalid phone number format' };
    }
  } catch (error) {
    console.error('[TWILIO] Phone validation error:', error);
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Failed to validate phone number' 
    };
  }
}

// Send single SMS
export async function sendSMS(options: {
  to: string;
  message: string;
  mediaUrl?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}> {
  const startTime = Date.now();
  
  if (!TWILIO_CONFIG.isConfigured || !twilioClient) {
    console.warn('[TWILIO] SMS service not configured, message not sent');
    return { 
      success: false, 
      error: 'SMS service not configured' 
    };
  }

  try {
    // Validate phone number first
    const validation = await validatePhoneNumber(options.to);
    if (!validation.valid) {
      console.error(`[TWILIO] Invalid phone number: ${options.to} - ${validation.error}`);
      return {
        success: false,
        error: `Invalid phone number: ${validation.error}`
      };
    }

    // Log the attempt
    console.log(`[TWILIO] Sending SMS to ${validation.formatted}`);
    if (TWILIO_CONFIG.debugMode) {
      console.log(`[TWILIO] Message preview: ${options.message.substring(0, 50)}...`);
    }

    // Send the message
    const message: MessageInstance = await twilioClient.messages.create({
      body: options.message,
      from: TWILIO_CONFIG.fromNumber!,
      to: validation.formatted!,
      ...(options.mediaUrl && { mediaUrl: [options.mediaUrl] })
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [TWILIO] SMS sent successfully to ${validation.formatted} (${duration}ms)`);
    console.log(`   Message ID: ${message.sid}`);
    console.log(`   Status: ${message.status}`);
    
    return {
      success: true,
      messageId: message.sid,
      details: {
        status: message.status,
        dateCreated: message.dateCreated,
        price: message.price,
        priceUnit: message.priceUnit,
        duration
      }
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [TWILIO] SMS send failed (${duration}ms):`, error);
    
    // Handle specific Twilio error codes
    let errorMessage = 'Failed to send SMS';
    if (error.code) {
      switch (error.code) {
        case 21211: // Invalid phone number
          errorMessage = 'Invalid phone number';
          break;
        case 21408: // Permission denied for the country
          errorMessage = 'SMS not supported for this country';
          break;
        case 21610: // Unsubscribed recipient
          errorMessage = 'Recipient has unsubscribed from SMS';
          break;
        case 21614: // Invalid mobile number
          errorMessage = 'Not a mobile phone number';
          break;
        case 20003: // Authentication error
          errorMessage = 'SMS authentication failed - check credentials';
          break;
        case 20429: // Rate limit exceeded
          errorMessage = 'Too many requests - please try again later';
          break;
        default:
          errorMessage = error.message || 'Failed to send SMS';
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      details: {
        code: error.code,
        moreInfo: error.moreInfo,
        duration
      }
    };
  }
}

// Send bulk SMS
export async function sendBulkSMS(options: {
  recipients: Array<{
    to: string;
    message: string;
    variables?: Record<string, string>;
  }>;
  template?: string;
  throttleMs?: number; // Delay between messages to avoid rate limits
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
  if (!TWILIO_CONFIG.isConfigured || !twilioClient) {
    console.warn('[TWILIO] SMS service not configured, bulk send aborted');
    return {
      success: false,
      sent: 0,
      failed: options.recipients.length,
      results: options.recipients.map(r => ({
        to: r.to,
        success: false,
        error: 'SMS service not configured'
      }))
    };
  }

  console.log(`[TWILIO] Starting bulk SMS send to ${options.recipients.length} recipients`);
  const startTime = Date.now();
  const results: Array<{
    to: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }> = [];
  
  let sent = 0;
  let failed = 0;
  const throttleMs = options.throttleMs || 100; // Default 100ms between messages

  for (const recipient of options.recipients) {
    try {
      // Apply template variables if template is provided
      let finalMessage = options.template || recipient.message;
      if (recipient.variables) {
        Object.entries(recipient.variables).forEach(([key, value]) => {
          finalMessage = finalMessage.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
      }

      const result = await sendSMS({
        to: recipient.to,
        message: finalMessage
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
  
  console.log(`[TWILIO] Bulk SMS completed in ${duration}ms`);
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
        month: 'short',
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

// Get SMS service status
export function getSMSServiceStatus(): {
  configured: boolean;
  provider: string;
  fromNumber?: string;
  debugMode: boolean;
} {
  return {
    configured: TWILIO_CONFIG.isConfigured,
    provider: 'Twilio',
    fromNumber: TWILIO_CONFIG.isConfigured ? TWILIO_CONFIG.fromNumber : undefined,
    debugMode: TWILIO_CONFIG.debugMode
  };
}

// Export config for testing
export { TWILIO_CONFIG };