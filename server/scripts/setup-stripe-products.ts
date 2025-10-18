/**
 * Setup Script: Create Stripe Products and Prices for Subscription Plans
 * 
 * This script creates the necessary Stripe products and prices for the 2-tier subscription model:
 * - Professional: $79/month or $790/year (12% commission)
 * - Enterprise: $149/month or $1,490/year (10% commission)
 * 
 * Run this script once to set up Stripe products, then update the database with the generated price IDs.
 * 
 * Usage: tsx server/scripts/setup-stripe-products.ts
 */

import Stripe from "stripe";
import { db } from "../db";
import { subscriptionPlans } from "../../shared/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

interface PlanConfig {
  tier: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
}

const plans: PlanConfig[] = [
  {
    tier: "professional",
    name: "Professional",
    monthlyPrice: 79,
    yearlyPrice: 790,
    description: "Core features for beauty clinics: appointments, clients, memberships, rewards",
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    monthlyPrice: 149,
    yearlyPrice: 1490,
    description: "All features including AI insights, white-label, SMS, and advanced analytics",
  },
];

async function setupStripeProducts() {
  console.log("🚀 Starting Stripe product setup...\n");

  for (const plan of plans) {
    console.log(`📦 Creating product: ${plan.name}`);

    try {
      // Create Stripe Product
      const product = await stripe.products.create({
        name: `Aesthiq ${plan.name}`,
        description: plan.description,
        metadata: {
          tier: plan.tier,
        },
      });

      console.log(`✅ Product created: ${product.id}`);

      // Create Monthly Price
      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthlyPrice * 100, // Convert to cents
        currency: "usd",
        recurring: {
          interval: "month",
        },
        metadata: {
          tier: plan.tier,
          billingCycle: "monthly",
        },
      });

      console.log(`💵 Monthly price created: ${monthlyPrice.id} ($${plan.monthlyPrice}/month)`);

      // Create Yearly Price
      const yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.yearlyPrice * 100, // Convert to cents
        currency: "usd",
        recurring: {
          interval: "year",
        },
        metadata: {
          tier: plan.tier,
          billingCycle: "yearly",
        },
      });

      console.log(`💵 Yearly price created: ${yearlyPrice.id} ($${plan.yearlyPrice}/year)`);

      // Update database with Stripe IDs
      await db
        .update(subscriptionPlans)
        .set({
          stripePriceIdMonthly: monthlyPrice.id,
          stripePriceIdYearly: yearlyPrice.id,
        })
        .where(eq(subscriptionPlans.tier, plan.tier));

      console.log(`✅ Database updated for ${plan.name}\n`);
    } catch (error) {
      console.error(`❌ Error setting up ${plan.name}:`, error);
      throw error;
    }
  }

  // Create Additional Location add-on product
  console.log("📦 Creating Additional Location add-on product");

  try {
    const locationProduct = await stripe.products.create({
      name: "Additional Location",
      description: "Add extra locations to your Aesthiq subscription",
      metadata: {
        type: "addon",
        category: "location",
      },
    });

    const locationPrice = await stripe.prices.create({
      product: locationProduct.id,
      unit_amount: 6000, // $60.00
      currency: "usd",
      recurring: {
        interval: "month",
      },
      metadata: {
        type: "addon",
      },
    });

    console.log(`✅ Additional Location product created: ${locationProduct.id}`);
    console.log(`💵 Additional Location price: ${locationPrice.id} ($60/month)\n`);

    // Note: You may want to save this to an add_ons table
    console.log(`📝 Save this price ID for additional locations: ${locationPrice.id}`);
  } catch (error) {
    console.error("❌ Error setting up Additional Location product:", error);
    throw error;
  }

  console.log("✅ Stripe product setup complete!");
  console.log("\n📋 Summary:");
  console.log("- Professional: $79/month (12% commission)");
  console.log("- Enterprise: $149/month (10% commission)");
  console.log("- Additional Location: $60/month");
  console.log("\n✨ Database has been updated with new Stripe price IDs");
}

// Run the setup
setupStripeProducts()
  .then(() => {
    console.log("\n🎉 Setup complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Setup failed:", error);
    process.exit(1);
  });
