import Stripe from "stripe";

// FIX: Environment variables are swapped - use VITE_STRIPE_PUBLIC_KEY as secret key (contains sk_test_...)
const actualSecretKey = process.env.VITE_STRIPE_PUBLIC_KEY; // This actually contains the secret key
const stripe = actualSecretKey 
  ? new Stripe(actualSecretKey, { apiVersion: "2023-10-16" })
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

export async function createCustomer(email: string, name: string, organizationId: string): Promise<Stripe.Customer> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.customers.create({
    email,
    name,
    metadata: {
      organizationId
    }
  });
}

export async function createSubscription(
  customerId: string,
  priceId: string,
  trialDays?: number
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

  const subscription = await stripe.subscriptions.create(subscriptionData);

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
}): Promise<Stripe.Product> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.products.create({
    name: params.name,
    description: params.description
  });
}

export async function createPrice(params: {
  productId: string;
  amount: number; // in cents
  interval: 'month' | 'year';
  currency?: string;
}): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  const price = await stripe.prices.create({
    product: params.productId,
    unit_amount: params.amount,
    currency: params.currency || 'usd',
    recurring: {
      interval: params.interval
    }
  });
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
  // Use Replit public URL instead of localhost for development
  const baseUrl = process.env.FRONTEND_URL || process.env.REPL_SLUG ? 
    `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER || 'replit'}.repl.co` : 
    'http://localhost:5000';
  
  const refreshUrl = `${baseUrl}/clinic/payment-setup?refresh=true&org=${organizationId}`;
  const returnUrl = `${baseUrl}/clinic/payment-setup?success=true&org=${organizationId}`;
  
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
  amount: number,
  currency: string = "usd",
  customerId?: string,
  metadata?: Record<string, string>
): Promise<PaymentIntentResult> {
  if (!stripe) throw new Error("Stripe not configured");
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency,
    customer: customerId,
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id
  };
}


export async function transferFunds(
  amount: number,
  destinationAccount: string,
  sourceTransaction?: string
): Promise<Stripe.Transfer> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.transfers.create({
    amount: Math.round(amount * 100),
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
