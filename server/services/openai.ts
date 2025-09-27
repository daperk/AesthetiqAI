import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable must be set");
}

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ClientInsight {
  clientId: string;
  insights: string[];
  recommendations: string[];
  churnRisk: number;
  upsellOpportunities: string[];
}

export interface MarketingCopy {
  subject: string;
  body: string;
  cta: string;
}

export interface PricingRecommendation {
  serviceId: string;
  currentPrice: number;
  suggestedPrice: number;
  reasoning: string;
}

export async function generateClientInsights(clientData: {
  appointments: any[];
  spending: number;
  lastVisit: Date;
  preferences: any;
}): Promise<ClientInsight> {
  const prompt = `Analyze this client data and provide insights:
  
  Appointments: ${JSON.stringify(clientData.appointments)}
  Total Spending: $${clientData.spending}
  Last Visit: ${clientData.lastVisit}
  Preferences: ${JSON.stringify(clientData.preferences)}
  
  Please provide:
  1. Key insights about client behavior
  2. Personalized recommendations
  3. Churn risk score (0-100)
  4. Specific upsell opportunities
  
  Respond in JSON format with keys: insights, recommendations, churnRisk, upsellOpportunities`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an AI expert in beauty and wellness business analytics. Provide actionable insights for client relationship management."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      clientId: "",
      insights: result.insights || [],
      recommendations: result.recommendations || [],
      churnRisk: Math.max(0, Math.min(100, result.churnRisk || 0)),
      upsellOpportunities: result.upsellOpportunities || []
    };
  } catch (error) {
    console.error("Failed to generate client insights:", error);
    throw new Error("Failed to generate client insights");
  }
}

export async function generateMarketingCopy(campaign: {
  type: string;
  target: string;
  service?: string;
  offer?: string;
}): Promise<MarketingCopy> {
  const prompt = `Create marketing copy for a luxury beauty/wellness business:
  
  Campaign Type: ${campaign.type}
  Target Audience: ${campaign.target}
  Service: ${campaign.service || "general"}
  Special Offer: ${campaign.offer || "none"}
  
  Create compelling marketing copy with:
  1. Attention-grabbing subject line
  2. Persuasive body text (2-3 paragraphs)
  3. Clear call-to-action
  
  Tone should be luxurious, professional, and personalized. Focus on benefits and transformation.
  
  Respond in JSON format with keys: subject, body, cta`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert copywriter specializing in luxury beauty and wellness marketing. Create compelling, conversion-focused copy."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      subject: result.subject || "Transform Your Beauty Experience",
      body: result.body || "Discover the luxury you deserve...",
      cta: result.cta || "Book Your Appointment Today"
    };
  } catch (error) {
    console.error("Failed to generate marketing copy:", error);
    throw new Error("Failed to generate marketing copy");
  }
}

export async function analyzePricingStrategy(serviceData: {
  services: any[];
  competitorPricing?: any[];
  marketPosition: string;
}): Promise<PricingRecommendation[]> {
  const prompt = `Analyze pricing strategy for beauty/wellness services:
  
  Current Services: ${JSON.stringify(serviceData.services)}
  Competitor Pricing: ${JSON.stringify(serviceData.competitorPricing || [])}
  Market Position: ${serviceData.marketPosition}
  
  For each service, provide:
  1. Current price analysis
  2. Suggested optimal price
  3. Reasoning for recommendation
  
  Consider luxury positioning, market demand, and profit optimization.
  
  Respond in JSON format with array of objects having keys: serviceId, currentPrice, suggestedPrice, reasoning`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a pricing strategy expert for luxury beauty and wellness businesses. Optimize for profitability while maintaining premium positioning."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return result.recommendations || [];
  } catch (error) {
    console.error("Failed to analyze pricing strategy:", error);
    throw new Error("Failed to analyze pricing strategy");
  }
}

export async function generateGrowthRecommendations(businessData: {
  revenue: number;
  clientCount: number;
  appointments: number;
  services: any[];
  trends: any;
}): Promise<string[]> {
  const prompt = `Analyze business performance and generate growth recommendations:
  
  Monthly Revenue: $${businessData.revenue}
  Client Count: ${businessData.clientCount}
  Monthly Appointments: ${businessData.appointments}
  Services Offered: ${JSON.stringify(businessData.services)}
  Trends: ${JSON.stringify(businessData.trends)}
  
  Provide 5-7 specific, actionable growth recommendations focusing on:
  - Revenue optimization
  - Client retention
  - Service expansion
  - Operational efficiency
  - Marketing opportunities
  
  Respond in JSON format with key: recommendations (array of strings)`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a business growth consultant specializing in beauty and wellness practices. Provide data-driven, actionable recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return result.recommendations || [];
  } catch (error) {
    console.error("Failed to generate growth recommendations:", error);
    throw new Error("Failed to generate growth recommendations");
  }
}

export async function generateBookingChatResponse(message: string, context: {
  clientName?: string;
  availableServices: any[];
  availableSlots: any[];
  membershipStatus?: string;
}): Promise<string> {
  const prompt = `You are an AI concierge for a luxury beauty and wellness spa. A client is asking: "${message}"
  
  Context:
  Client Name: ${context.clientName || "Guest"}
  Available Services: ${JSON.stringify(context.availableServices)}
  Available Slots: ${JSON.stringify(context.availableSlots)}
  Membership: ${context.membershipStatus || "None"}
  
  Respond in a helpful, professional, and luxurious tone. If they're asking about booking, guide them through available options. If they need service recommendations, suggest based on their history or needs.
  
  Keep responses concise but warm and personal.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a luxury spa's AI concierge. Be helpful, knowledgeable, and maintain an elegant, professional tone."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    return response.choices[0].message.content || "I'd be happy to help you with your booking. How may I assist you today?";
  } catch (error) {
    console.error("Failed to generate chat response:", error);
    return "I apologize, but I'm having trouble processing your request right now. Please try again or contact our team directly.";
  }
}
