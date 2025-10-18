# Aesthiq - AI-Powered Beauty & Wellness SaaS Platform

## Overview

Aesthiq is a comprehensive AI-powered SaaS platform designed for luxury beauty and wellness practices. Inspired by RepeatMD but enhanced with advanced features, it combines a premium marketing site with multi-tenant clinic management capabilities. The platform serves three distinct user types: super administrators (Aesthiq HQ), clinic administrators/staff, and patients, each with their own dedicated dashboard and feature set.

The system enables beauty clinics to manage appointments, memberships, rewards programs, and client relationships while providing patients with booking capabilities, membership management, and rewards tracking. The platform features a simplified 2-tier pricing model: Professional ($79/month or $790/year with 12% commission) for core features, and Enterprise ($149/month or $1,490/year with 10% commission) for premium features including AI insights, white-label branding, and advanced analytics. Additional locations are available for $60/month or $600/year. All plans include a 30-day free trial.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React with TypeScript**: Modern component-based architecture using functional components and hooks
- **Wouter**: Lightweight client-side routing for navigation between different user dashboards
- **Vite**: Fast build tool and development server with hot module replacement
- **Shadcn/ui + Radix UI**: Component library providing accessible, customizable UI components
- **Tailwind CSS**: Utility-first CSS framework with custom luxury beige/gold theme configuration
- **TanStack Query**: Server state management for API calls, caching, and data synchronization
- **React Hook Form**: Form handling with validation and error management

### Backend Architecture
- **Express.js**: RESTful API server with middleware for authentication, logging, and error handling
- **Node.js with TypeScript**: Type-safe server-side development with ES modules
- **Passport.js with Local Strategy**: Session-based authentication using email/password
- **Express Session with PostgreSQL Store**: Secure session management with database persistence
- **Multi-tenant Architecture**: Organization-based data isolation with role-based access control

### Database Design
- **PostgreSQL with Drizzle ORM**: Type-safe database interactions with schema-first approach
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Comprehensive Schema**: Users, organizations, subscriptions, appointments, memberships, rewards, transactions, and audit logs
- **Role-based Access**: Four distinct user roles (super_admin, clinic_admin, staff, patient) with appropriate data access

### Authentication & Authorization
- **Session-based Authentication**: Secure cookie-based sessions with CSRF protection
- **Role-based Access Control**: Hierarchical permissions based on user roles and organization membership
- **Multi-tenant Security**: Data isolation ensuring users only access their organization's data
- **Password Hashing**: bcrypt for secure password storage and verification

### AI Integration Strategy
- **OpenAI GPT Integration**: Client insights, upsell suggestions, churn prediction, and marketing copy generation
- **Dynamic Pricing Recommendations**: AI-powered service pricing optimization
- **Predictive Analytics**: Customer behavior analysis and retention modeling
- **Automated Content Generation**: Marketing materials and client communication templates

### Payment Processing
- **Stripe Integration**: Subscription billing, one-time payments, and platform fee collection
- **Stripe Connect**: Marketplace functionality for clinic payouts and revenue sharing
- **Multi-tier Pricing**: Dynamic subscription plans with usage-based add-ons
- **Automated Dunning**: Failed payment recovery and subscription management

## External Dependencies

### Core Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting with built-in connection pooling and scaling
- **Vercel/Railway Deployment**: Production hosting with automatic deployments and SSL
- **CDN for Static Assets**: Image and file storage with global distribution

### Payment & Billing
- **Stripe**: Complete payment processing including subscriptions, Connect marketplace, and webhooks
- **Stripe Elements**: Secure payment form components and PCI compliance

### AI & Machine Learning
- **OpenAI API**: GPT models for natural language processing and content generation
- **Custom Analytics Engine**: Business intelligence and predictive modeling

### Communication Services
- **SendGrid**: Transactional emails, appointment reminders, and marketing campaigns
- **Twilio**: SMS notifications, appointment confirmations, and two-factor authentication
- **Push Notifications**: In-app alerts and mobile notifications

### Development & Monitoring
- **TypeScript**: End-to-end type safety across frontend, backend, and shared schemas
- **ESLint & Prettier**: Code quality and formatting consistency
- **Replit Development Environment**: Integrated development with live preview capabilities

### UI & Design System
- **Google Fonts**: Custom typography with Playfair Display and Inter font families
- **Lucide Icons**: Consistent iconography throughout the application
- **Radix UI Primitives**: Accessible component foundations with custom styling