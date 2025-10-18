# Aesthiq Pricing Page Design Guidelines

## Design Approach
**Reference-Based:** Drawing from luxury digital experiences (Aesop, Net-a-Porter aesthetics) + premium SaaS clarity (Linear, Stripe). Creating a refined, opulent interface that communicates exclusivity while maintaining SaaS simplicity.

## Core Design Elements

### A. Color Palette
**Light Mode (Primary):**
- Primary Beige: 35 25% 88% (soft champagne backgrounds)
- Gold Accent: 45 65% 55% (premium highlights, CTAs)
- Rich Brown: 30 15% 25% (headings, primary text)
- Warm Gray: 40 8% 60% (secondary text)
- Pure White: 0 0% 100% (card backgrounds)
- Subtle Border: 40 15% 90% (elegant dividers)

**Dark Mode:**
- Deep Charcoal: 30 10% 12% (background)
- Dark Beige: 35 20% 20% (elevated surfaces)
- Soft Gold: 45 50% 65% (accent, glows)
- Light Cream: 40 30% 92% (text)
- Muted Gold: 45 25% 40% (borders)

### B. Typography
**Fonts:** 
- Display: Playfair Display (serif, luxury headings)
- Body: Inter (sans-serif, clarity)

**Hierarchy:**
- Hero Title: text-6xl/7xl, font-serif, tracking-tight, leading-tight
- Section Headings: text-4xl/5xl, font-serif
- Pricing Amount: text-5xl/6xl, font-sans, font-bold
- Feature Text: text-base/lg, font-sans
- Labels: text-sm, uppercase, tracking-widest, font-medium

### C. Layout System
**Spacing Primitives:** 4, 6, 8, 12, 16, 24, 32
- Consistent: py-24 sections, px-6 containers
- Max-width: max-w-7xl for content areas
- Cards: p-8 to p-12 for premium feel

### D. Component Library

**Hero Section:**
- Full-width luxury spa/clinic hero image with soft beige overlay (overlay-opacity-40)
- Centered content: max-w-4xl
- Headline + subtitle + micro-trust badge ("Trusted by 200+ premium clinics")
- Soft shadow behind text for legibility

**Pricing Cards:**
- Two cards side-by-side (grid-cols-1 lg:grid-cols-2, gap-8)
- Professional: Subtle beige card (no special styling)
- Enterprise: Gold border (border-2), subtle gold glow effect, "Most Popular" badge
- Card structure: 
  - Tier name (uppercase, tracking-wide)
  - Price (large, bold) + "/month" (muted)
  - Brief value proposition (1-2 lines)
  - Feature list (checkmark icons in gold, 8-12 features)
  - CTA button (full-width, gold for Enterprise, brown for Professional)
- Elevated cards: shadow-xl, rounded-2xl, backdrop-blur for premium depth

**Feature Comparison Table:**
- Below pricing cards
- Sticky header row with tier names
- Categories: "Core Features", "AI Capabilities", "Analytics", "Support"
- Gold checkmarks for included features
- Refined borders, alternating subtle row backgrounds

**Trust Section:**
- 2-column layout
- Left: "Join Elite Clinics Worldwide" headline + stats (200+ clinics, 50K+ appointments)
- Right: 3-4 small clinic logos (grayscale, hover: gold tint)

**FAQ Accordion:**
- 6-8 questions about pricing, features, migration
- Gold accent on active state
- Generous padding (py-6)

**Footer CTA:**
- Beige background section
- "Ready to elevate your practice?" headline
- Two buttons: "Start Free Trial" (gold) + "Schedule Demo" (outline)
- Small text: "No credit card required · 14-day trial"

### E. Visual Elements

**Icons:** Heroicons (outlined style)
- Checkmarks: Gold filled circles with white checks
- Feature icons: Outlined, subtle brown

**Buttons:**
- Primary (Gold): Rounded-lg, px-8 py-4, shadow-lg, hover:shadow-xl
- Outline (on images): backdrop-blur-md, border-2, bg-white/10

**Animations:** Minimal
- Subtle scale on card hover (scale-105)
- Smooth transitions on FAQ expand

## Images Section

**Hero Image:**
- **Placement:** Full-width top of page, h-screen/80vh
- **Description:** Minimalist luxury spa interior - clean white treatment room with beige accents, soft natural lighting, elegant product displays, calming aesthetic. Alternatively: Close-up of luxury skincare products with gold packaging on marble surface with soft shadows.
- **Treatment:** Soft beige gradient overlay (from bottom), ensures text readability

**Optional Accent Images:**
- **Testimonial Section:** Small circular clinic owner photos (if testimonials included)
- **Feature Highlights:** Product screenshots with gold frames showing dashboard UI

## Page Structure (Top to Bottom)

1. **Hero** (h-screen with image)
2. **Value Proposition** (py-24, centered, max-w-3xl)
3. **Pricing Cards** (py-32, 2-column on desktop)
4. **Feature Comparison** (py-24, full table)
5. **Trust/Social Proof** (py-20, beige background)
6. **FAQ** (py-24, max-w-4xl centered)
7. **Final CTA** (py-32, beige background)
8. **Footer** (py-16, minimal, links + social)

**Key Principle:** Luxury through restraint - generous whitespace, refined typography, strategic gold accents (not overwhelming), premium photography, and exceptional clarity in value communication.