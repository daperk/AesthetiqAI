# Aesthiq - AI-Powered Beauty & Wellness SaaS Platform

## Overview
Aesthiq is an AI-powered SaaS platform for luxury beauty and wellness practices, inspired by RepeatMD. It offers a premium marketing site and multi-tenant clinic management. The platform supports super administrators (Aesthiq HQ), clinic administrators/staff, and patients with dedicated dashboards. Key capabilities include appointment scheduling, membership management, rewards programs, and client relationship management, all enhanced with AI insights. It features a 2-tier pricing model (Professional and Enterprise) with a 30-day free trial, designed to optimize clinic operations and patient engagement.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Technology Stack**: React with TypeScript, Wouter for routing, Vite for fast builds.
- **UI/UX**: Shadcn/ui + Radix UI for accessible components, Tailwind CSS with a custom luxury beige/gold theme.
- **Data Management**: TanStack Query for server state management, React Hook Form for form handling.

### Backend Architecture
- **Technology Stack**: Express.js with Node.js and TypeScript.
- **API**: RESTful API with middleware for authentication, logging, and error handling.
- **Multi-tenancy**: Organization-based data isolation with role-based access control.

### Database Design
- **Database**: PostgreSQL with Drizzle ORM, hosted on Neon Database.
- **Schema**: Comprehensive schema covering users, organizations, subscriptions, appointments, memberships, rewards, transactions, and audit logs.
- **Access Control**: Four distinct user roles (super_admin, clinic_admin, staff, patient) with granular data access.

### Authentication & Authorization
- **Authentication**: Session-based authentication using Passport.js (Local Strategy for email/password) and Express Session with PostgreSQL store.
- **Security**: Secure cookie-based sessions with CSRF protection, bcrypt for password hashing (12 rounds for passwords, 10 for reset tokens).
- **Authorization**: Role-based Access Control (RBAC) and multi-tenant security for data isolation.
- **Password Reset**: Secure token-based system with email verification (24-hour expiry) and single-use enforcement.
- **Patient Invitation**: Immediate account creation with a "Set Your Password" email (7-day token expiry).

### AI Integration Strategy
- **OpenAI GPT**: Used for client insights, upsell suggestions, churn prediction, marketing copy, and automated content generation.
- **AI-Powered Recommendations**: Dynamic pricing and predictive analytics for customer behavior and retention.

### Payment Processing & Multi-Tenant Money Flow
- **Stripe Connect**: Utilizes Destination Charges for bookings (platform collects commission, transfers remainder to clinic) and Direct Charges with Application Fees for memberships (clinic collects, platform deducts commission).
- **Commission Rates**: 12% for Professional Plan, 10% for Enterprise Plan.
- **Platform Billing**: Clinic subscriptions are managed separately on the platform's Stripe account.
- **Security**: Content Security Policy (CSP) configured according to Stripe's requirements for secure payment processing.

## External Dependencies

### Core Infrastructure
- **Database**: Neon Database (PostgreSQL).
- **Hosting**: Vercel/Railway for deployment.
- **CDN**: For static asset storage.

### Payment & Billing
- **Stripe**: Comprehensive payment processing, subscriptions, Connect marketplace, and webhooks.
- **Stripe Elements**: Secure payment forms.

### AI & Machine Learning
- **OpenAI API**: GPT models.
- **Custom Analytics Engine**: Business intelligence and predictive modeling.

### Communication Services
- **SendGrid**: Transactional emails and marketing campaigns.
- **Twilio**: SMS notifications and 2FA.
- **Push Notifications**: In-app and mobile alerts.

### Development & Monitoring
- **TypeScript**: End-to-end type safety.
- **ESLint & Prettier**: Code quality and formatting.
- **Replit**: Integrated development environment.

### UI & Design System
- **Google Fonts**: Playfair Display and Inter.
- **Lucide Icons**: Iconography.
- **Radix UI Primitives**: Accessible component foundations.