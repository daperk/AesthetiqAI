import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" })
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

export async function createConnectAccount(organizationId: string, email: string): Promise<Stripe.Account> {
  if (!stripe) throw new Error("Stripe not configured");
  return await stripe.accounts.create({
    type: "standard",
    email,
    metadata: {
      organizationId
    }
  });
}

export async function createAccountLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return accountLink.url;
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

export async function getSubscriptionUsage(subscriptionId: string): Promise<Stripe.UsageRecord[]> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"]
  });

  const usageRecords: Stripe.UsageRecord[] = [];
  
  for (const item of subscription.items.data) {
    if (item.price.recurring?.usage_type === "metered") {
      const usage = await stripe.subscriptionItems.listUsageRecordSummaries(item.id);
      usageRecords.push(...usage.data);
    }
  }

  return usageRecords;
}

export async function reportUsage(
  subscriptionItemId: string,
  quantity: number,
  timestamp?: number
): Promise<Stripe.UsageRecord> {
  return await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    quantity,
    timestamp: timestamp || Math.floor(Date.now() / 1000),
  });
}

export { stripe };
