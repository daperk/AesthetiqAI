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
- **Password Hashing**: bcrypt for secure password storage and verification (12 rounds for passwords, 10 rounds for reset tokens)
- **Password Reset System**: Secure token-based password reset with email verification
  - Tokens generated using `crypto.randomBytes(32)` for cryptographic randomness
  - Tokens hashed with bcrypt before database storage (prevents token theft via DB breach)
  - 24-hour expiration for forgot password flows
  - 7-day expiration for patient invitation flows
  - Single-use enforcement (tokens marked as used after successful reset)
  - Email delivery via centralized SendGrid service with professional branding
- **Patient Invitation Flow**: Create user account immediately → generate reset token → send "Set Your Password" email
- **Login Field**: Uses `emailOrUsername` field (Passport Local Strategy configuration) for flexibility

### AI Integration Strategy
- **OpenAI GPT Integration**: Client insights, upsell suggestions, churn prediction, and marketing copy generation
- **Dynamic Pricing Recommendations**: AI-powered service pricing optimization
- **Predictive Analytics**: Customer behavior analysis and retention modeling
- **Automated Content Generation**: Marketing materials and client communication templates

### Payment Processing & Multi-Tenant Money Flow

**Architecture Overview:**
Aesthiq uses Stripe Connect's **Destination Charges** pattern for bookings and **Direct Charges with Application Fees** for memberships to ensure proper multi-tenant isolation and commission collection.

**Money Flow - Booking Payments (Destination Charges):**
1. Patient pays for service (e.g., $150)
2. Payment created on **platform Stripe account** using destination charge
3. Platform automatically collects commission (10-12% based on subscription tier)
4. Remaining funds ($132-135) automatically transferred to **clinic's Connect account**
5. Charge appears on clinic's Stripe dashboard (via `on_behalf_of`)

**Money Flow - Membership Subscriptions (Direct Charges):**
1. Patient subscribes to membership tier (e.g., $100/month)
2. Customer and subscription created on **clinic's Connect account**
3. Payment collected directly on clinic's Connect account
4. Platform automatically collects commission percentage (10-12%) via `application_fee_percent`
5. Clinic receives net amount after commission

**Commission Rates:**
- Professional Plan: 12% commission
- Enterprise Plan: 10% commission

**Platform Billing (Clinic Subscriptions):**
- Clinics pay platform $79-149/month subscription fee
- Created on **platform Stripe account** (separate from patient payments)
- Organization-level Stripe customer/subscription IDs stored in database

**Technical Implementation:**
- **Frontend**: Uses platform publishable key for both bookings and memberships
  - Bookings: Standard initialization (platform account)
  - Memberships: Initialize with `stripeAccount` option pointing to clinic's Connect account
- **Backend**: 
  - Bookings: `stripe.paymentIntents.create()` with `transfer_data.destination` and `application_fee_amount`
  - Memberships: `stripe.subscriptions.create()` with `stripeAccount` and `application_fee_percent`
- **API Endpoint**: `GET /api/organizations/:slug/stripe-connect` returns clinic's Connect account ID
- **Tenant Isolation**: Each clinic has unique Connect account ID, ensuring payment/customer data never mixes

**Content Security Policy**: Configured following Stripe's official requirements (https://docs.stripe.com/security/guide#content-security-policy):
  - `https://api.stripe.com` and `https://m.stripe.network` for API calls and 3DS/SCA telemetry
  - `https://js.stripe.com` and `https://*.js.stripe.com` for Stripe.js library and Elements iframes
  - `https://hooks.stripe.com` for payment method redirects and 3D Secure
  - `style-src 'unsafe-inline'` to allow Stripe's inline styles
  - CSP configured in both client/index.html (meta tag for Vite dev server) and server/index.ts (HTTP header for production)

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

## Recent Changes

### October 2025 - Authentication & Security Enhancements

**Password Reset System**
- Implemented secure token-based password reset with cryptographic token generation
- Added database table `password_reset_tokens` with proper UUID foreign keys
- All reset tokens are hashed with bcrypt before storage (prevents database breach attacks)
- Token validation uses bcrypt.compare for secure comparison
- 24-hour expiry for forgot password, 7-day expiry for patient invitations
- Single-use enforcement with token invalidation after use
- Professional email templates with luxury branding via SendGrid

**Patient Invitation Improvements**
- Changed from registration link to immediate account creation
- Creates user account with cryptographically secure random password
- Sends "Set Your Password" email with 7-day reset token
- Patient accounts visible in system immediately after invitation
- Consistent password reset flow for all user types

**Bug Fixes & Improvements**
- Fixed OpenAI business insights API (removed unsupported response_format parameter)
- Fixed forgot password endpoint (removed duplicate sendEmail function)
- Enhanced Stripe product creation logging for better diagnostics
- Cleaned up obsolete plaintext token storage methods
- Verified multi-tenant data isolation for all patient endpoints

**Timezone-Aware Appointment Availability**
- Fixed same-day appointment filtering to respect clinic's local timezone
- Converts current UTC time to clinic timezone using `toLocaleString('en-US', { timeZone })`
- Compares slot hour/minute directly with current hour/minute in clinic's local time
- Resolves issue where Miami clinic (America/New_York) only showed afternoon slots instead of morning slots
- Example: At 10:18 AM Miami time, slots now correctly show from 10:30 AM onwards (not 2:30 PM)
- Note: Edge cases around midnight boundaries and DST transitions documented for future enhancement

**Technical Details**
- Login uses `emailOrUsername` field (Passport Local Strategy)
- Password hashing: 12 rounds for passwords, 10 rounds for reset tokens
- Token generation: `crypto.randomBytes(32).toString('hex')` (64 hex characters)
- Centralized email service in `server/services/sendgrid.ts`
- All authentication endpoints tested and verified working