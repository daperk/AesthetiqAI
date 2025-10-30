# Aesthiq - Local Development Setup Guide

## 📦 Step 1: Download Your Code

### Option A: Export as ZIP (Fastest)
1. Click the **three dots menu (⋮)** in the top-right corner of Replit
2. Select **"Download as zip"**
3. Extract the files to your local machine

### Option B: Clone to GitHub (Recommended)
```bash
# In Replit Shell, run:
git init
git add .
git commit -m "Export Aesthiq project"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main

# Then on your local machine:
git clone YOUR_GITHUB_REPO_URL
cd your-repo-name
```

## 🗄️ Step 2: Set Up Your Database

### Option A: Use Neon (Recommended - Same as Replit)
1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project
3. Copy the connection string

### Option B: Local PostgreSQL
```bash
# macOS (with Homebrew)
brew install postgresql
brew services start postgresql
createdb aesthiq

# Ubuntu/Debian
sudo apt-get install postgresql
sudo service postgresql start
sudo -u postgres createdb aesthiq
```

### Option C: Other Hosted Options
- [Supabase](https://supabase.com) - Free tier available
- [Railway](https://railway.app) - PostgreSQL hosting
- [Render](https://render.com) - Free PostgreSQL

## 📥 Step 3: Import Your Database

Your complete database has been exported to `/tmp/aesthiq_database_export.sql` (279KB)

**To download it:**
1. In Replit, navigate to `/tmp/` folder
2. Download `aesthiq_database_export.sql`

**To import on your new database:**
```bash
# Replace with your new database connection string
psql "YOUR_NEW_DATABASE_URL" < aesthiq_database_export.sql
```

## 🔧 Step 4: Install Dependencies

```bash
npm install
```

## 🔐 Step 5: Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Stripe (Get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_xxxxx
VITE_STRIPE_PUBLIC_KEY=pk_test_xxxxx

# SendGrid (Get from https://app.sendgrid.com/settings/api_keys)
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=your-email@example.com

# Twilio (Get from https://console.twilio.com)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890

# Session Secret (generate a random string)
SESSION_SECRET=your-random-secret-here-make-it-long-and-secure

# Environment
NODE_ENV=development
```

## 🚀 Step 6: Run the Application

### Push Database Schema (First Time Only)
```bash
npm run db:push
```

### Start Development Server
```bash
npm run dev
```

The app will run on `http://localhost:5000`

## 📝 Important Notes

### Database Schema
- The database schema is defined in `shared/schema.ts`
- Use `npm run db:push` to sync schema changes (NEVER manually write migrations)
- If you get conflicts, use `npm run db:push --force`

### Architecture
- **Frontend:** React + TypeScript + Vite (runs on port 5000)
- **Backend:** Express.js (serves on same port 5000)
- **Database:** PostgreSQL with Drizzle ORM
- **Styling:** Tailwind CSS + Shadcn UI

### Key Features Already Implemented
✅ Multi-tenant architecture with organization isolation
✅ Stripe Connect integration for clinic payments
✅ Session-based authentication (Passport.js)
✅ Role-based access control (super_admin, clinic_admin, staff, patient)
✅ Appointment scheduling system
✅ Membership management with tiered pricing
✅ Rewards and credits system
✅ Email notifications (SendGrid)
✅ SMS notifications (Twilio)
✅ AI-powered insights (OpenAI integration)

## 🔄 Deployment Options

### Deploy to Vercel
```bash
npm install -g vercel
vercel
```

Add environment variables in Vercel dashboard.

### Deploy to Railway
1. Connect your GitHub repo
2. Add PostgreSQL service
3. Add environment variables
4. Deploy!

### Deploy to Render
1. Create a new Web Service
2. Connect your GitHub repo
3. Add PostgreSQL database
4. Add environment variables
5. Deploy!

## 🐛 Troubleshooting

### Database Connection Issues
- Make sure PostgreSQL is running
- Verify connection string format: `postgresql://user:password@host:port/database`
- Check that database exists: `psql "DATABASE_URL" -c "SELECT 1"`

### Port Already in Use
```bash
# Find and kill process on port 5000
lsof -ti:5000 | xargs kill -9
```

### TypeScript Errors
```bash
# Rebuild TypeScript
npm run build
```

## 📚 Additional Resources

- **Drizzle ORM Docs:** https://orm.drizzle.team
- **Stripe Connect Guide:** https://stripe.com/docs/connect
- **Tailwind CSS:** https://tailwindcss.com
- **Shadcn UI:** https://ui.shadcn.com

## 💡 Development Tips

1. **Database Changes:** Always update `shared/schema.ts` then run `npm run db:push`
2. **API Routes:** Backend routes are in `server/routes.ts`
3. **Frontend Pages:** React pages are in `client/src/pages/`
4. **Styling:** Theme colors are in `client/src/index.css`
5. **Type Safety:** Schema types are auto-generated from database schema

## 🆘 Need Help?

If you encounter issues:
1. Check the console logs for errors
2. Verify all environment variables are set correctly
3. Make sure the database connection works
4. Ensure all dependencies are installed

---

**Built with ❤️ using Replit**
