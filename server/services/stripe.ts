import Stripe from "stripe";

/**
 * IMPORTANT: PAYMENT AMOUNT CONVENTIONS
 * =====================================
 * All amount parameters in this file should be provided in CENTS (smallest currency unit).
 * For USD: $10.00 = 1000 cents
 * 
 * Examples:
 * - createPaymentIntent(1000, "usd") = charges $10.00
 * - transferFunds(500, ...) = transfers $5.00
 * 
 * Callers are responsible for converting dollar amounts to cents before calling these functions.
 * DO NOT multiply by 100 in these functions - amounts are already expected to be in cents.
 */

// Use only the secret key - never use publishable key for server-side calls
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("⚠️ [STRIPE] STRIPE_SECRET_KEY environment variable is required");
} else if (secretKey.startsWith('pk_')) {
  console.error("⚠️ [STRIPE] CRITICAL: STRIPE_SECRET_KEY contains a publishable key (starts with pk_). Server-side operations require a secret key (starts with sk_)");
} else {
  console.log("✅ [STRIPE] Secret key configured correctly");
}

const stripe = secretKey 
  ? new Stripe(secretKey, { apiVersion: "2023-10-16" })
  : null;

export interface SubscriptionResult {
  subscriptionId: string;
  clientSecret?: string;
  status: string;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export async function createCustomer(email: string, name: string, organizationId: string, connectAccountId?: string): Promise<Stripe.Customer> {
  if (!stripe) throw new Error("Stripe not configured");
  
  const customerData = {
    email,
    name,
    metadata: {
      organizationId
    }
  };
  
  // Create customer on connected account if provided
  if (connectAccountId) {
    return await stripe.customers.create(customerData, {
      stripeAccount: connectAccountId
    });
  }
  
  // Otherwise create on platform account
  return await stripe.customers.create(customerData);
}

export async function createSetupIntent(customerId: string, connectAccountId?: string): Promise<Stripe.SetupIntent> {
  if (!stripe) throw new Error("Stripe not configured");
  
  const setupIntentData = {
    customer: customerId,
    usage: 'off_session' as const,
    payment_method_types: ['card'],
  };
  
  // Create setup intent on connected account if provided
  if (connectAccountId) {
    return await stripe.setupIntents.create(setupIntentData, {
      stripeAccount: connectAccountId
    });
  }
  
  return await stripe.setupIntents.create(setupIntentData);
}

export async function attachPaymentMethodToCustomer(
  paymentMethodId: string,
  customerId: string,
  setAsDefault: boolean = true,
  connectAccountId?: string
): Promise<Stripe.PaymentMethod> {
  if (!stripe) throw new Error("Stripe not configured");
  
  // Attach payment method to customer
  const paymentMethod = connectAccountId
    ? await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      }, {
        stripeAccount: connectAccountId
      })
    : await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

  // Set as default payment method if requested
  if (setAsDefault) {
    if (connectAccountId) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      }, {
        stripeAccount: connectAccountId
      });
    } else {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }
  }

  return paymentMethod;
}

export async function createSubscription(
  customerId: string,
  priceId: string,
  trialDays?: number,
  connectAccountId?: string,
  applicationFeePercent?: number
): Promise<SubscriptionResult> {
  if (!stripe) throw new Error("Stripe not configured");
  const subscriptionData: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  };

  if (trialDays) {
    subscriptionData.trial_period_days = trialDays;
  }

  // Add application fee percentage for platform commission (Connect accounts only)
  if (connectAccountId && applicationFeePercent) {
    subscriptionData.application_fee_percent = applicationFeePercent;
  }

  const subscription = connectAccountId 
    ? await stripe.subscriptions.create(subscriptionData, {
        stripeAccount: connectAccountId
      })
    : await stripe.subscriptions.create(subscriptionData);

  return {
    subscriptionId: subscription.id,
    clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
    status: subscription.status
  };
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  if (!stripe) throw new Error("Stripe not configured");
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  return await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      price: newPriceId,
    }],
    proration_behavior: "always_invoice",
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.subscriptions.cancel(subscriptionId);
}

export async function createProduct(params: {
  name: string;
  description?: string;
  connectAccountId?: string;
}): Promise<Stripe.Product> {
  if (!stripe) throw new Error("Stripe not configured");
  
  const options: any = {
    name: params.name,
    description: params.description
  };
  
  // Create product on Connect account if provided
  if (params.connectAccountId) {
    return await stripe.products.create(options, {
      stripeAccount: params.connectAccountId
    });
  }
  
  return await stripe.products.create(options);
}

export async function createPrice(params: {
  productId: string;
  amount: number; // in cents
  interval: 'month' | 'year';
  currency?: string;
  connectAccountId?: string;
}): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  
  const options: any = {
    product: params.productId,
    unit_amount: params.amount,
    currency: params.currency || 'usd',
    recurring: {
      interval: params.interval
    }
  };
  
  // Create price on Connect account if provided
  if (params.connectAccountId) {
    const price = await stripe.prices.create(options, {
      stripeAccount: params.connectAccountId
    });
    return price.id;
  }
  
  const price = await stripe.prices.create(options);
  return price.id;
}

export async function createOneTimePrice(params: {
  productId: string;
  amount: number; // in cents
  currency?: string;
  connectAccountId?: string;
}): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  
  const options: any = {
    product: params.productId,
    unit_amount: params.amount,
    currency: params.currency || 'usd'
    // No recurring object = one-time payment
  };
  
  // Create price on Connect account if provided
  if (params.connectAccountId) {
    const price = await stripe.prices.create(options, {
      stripeAccount: params.connectAccountId
    });
    return price.id;
  }
  
  const price = await stripe.prices.create(options);
  return price.id;
}

// Stripe Connect Express account functions
export async function createConnectAccount(organization: { 
  name: string; 
  email: string; 
  organizationId: string;
}): Promise<Stripe.Account> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: organization.email,
    business_profile: {
      name: organization.name,
      support_email: organization.email,
      url: process.env.FRONTEND_URL || 'https://your-domain.com'
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    },
    metadata: {
      organizationId: organization.organizationId
    }
  });
}

export async function createAccountLink(accountId: string, organizationId: string): Promise<Stripe.AccountLink> {
  if (!stripe) throw new Error("Stripe not configured");
  
  // Build the correct base URL for Replit environment
  let baseUrl: string;
  if (process.env.FRONTEND_URL) {
    baseUrl = process.env.FRONTEND_URL;
  } else if (process.env.REPL_SLUG) {
    // Use the modern Replit domain format
    baseUrl = `https://${process.env.REPL_SLUG}--${process.env.REPL_OWNER || 'replit'}.replit.app`;
  } else {
    baseUrl = 'http://localhost:5000';
  }
  
  const refreshUrl = `${baseUrl}/clinic/payment-setup?refresh=true&org=${organizationId}`;
  const returnUrl = `${baseUrl}/clinic/setup?success=true&org=${organizationId}`;
  
  return await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}

export async function getConnectAccount(accountId: string): Promise<Stripe.Account> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.accounts.retrieve(accountId);
}

export async function checkAccountStatus(accountId: string): Promise<{
  ready: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  hasExternalAccount: boolean;
  requirements: string[];
}> {
  if (!stripe) throw new Error("Stripe not configured");
  const account = await stripe.accounts.retrieve(accountId);
  
  const payoutsEnabled = account.payouts_enabled || false;
  const transfersActive = account.capabilities?.transfers === 'active';
  const hasExternalAccount = (account.external_accounts?.data?.length ?? 0) > 0;
  const requirements = account.requirements?.currently_due || [];
  
  return {
    ready: payoutsEnabled && transfersActive && hasExternalAccount && requirements.length === 0,
    payoutsEnabled,
    transfersActive,
    hasExternalAccount,
    requirements
  };
}

export async function createPaymentIntent(
  amount: number, // Amount should be in CENTS (e.g., $10.00 = 1000)
  currency: string = "usd",
  customerId?: string,
  metadata?: Record<string, string>,
  connectAccountId?: string
): Promise<PaymentIntentResult> {
  if (!stripe) throw new Error("Stripe not configured");
  
  const paymentIntentData = {
    amount: Math.round(amount), // Amount is already in cents, just round for safety
    currency,
    customer: customerId,
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  };
  
  const paymentIntent = connectAccountId
    ? await stripe.paymentIntents.create(paymentIntentData, {
        stripeAccount: connectAccountId
      })
    : await stripe.paymentIntents.create(paymentIntentData);

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id
  };
}


export async function transferFunds(
  amount: number, // Amount should be in CENTS (e.g., $10.00 = 1000)
  destinationAccount: string,
  sourceTransaction?: string
): Promise<Stripe.Transfer> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.transfers.create({
    amount: Math.round(amount), // Amount is already in cents, just round for safety
    currency: "usd",
    destination: destinationAccount,
    source_transaction: sourceTransaction,
  });
}

export async function retrieveBalance(): Promise<Stripe.Balance> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.balance.retrieve();
}

export async function createWebhookEndpoint(url: string, events: string[]): Promise<Stripe.WebhookEndpoint> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.webhookEndpoints.create({
    url,
    enabled_events: events as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
  });
}

export async function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  if (!stripe) throw new Error("Stripe not configured");
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

export async function getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
  if (!stripe) throw new Error("Stripe not configured");
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
  });

  return subscriptions.data;
}

export async function getSubscriptionUsage(subscriptionId: string): Promise<any[]> {
  if (!stripe) throw new Error("Stripe not configured");
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"]
  });

  const usageRecords: any[] = [];
  
  for (const item of subscription.items.data) {
    if (item.price.recurring?.usage_type === "metered") {
      // Usage record summaries functionality - simplified for now
      usageRecords.push({
        id: item.id,
        quantity: 0,
        timestamp: Math.floor(Date.now() / 1000)
      });
    }
  }

  return usageRecords;
}

export async function reportUsage(
  subscriptionItemId: string,
  quantity: number,
  timestamp?: number
): Promise<any> {
  if (!stripe) throw new Error("Stripe not configured");
  // Usage reporting functionality - simplified for now
  return {
    id: `usage_${Date.now()}`,
    quantity,
    timestamp: timestamp || Math.floor(Date.now() / 1000),
    subscription_item: subscriptionItemId
  };
}

export { stripe };
