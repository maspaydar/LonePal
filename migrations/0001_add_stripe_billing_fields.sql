-- Migration: Add Stripe billing fields to facilities table
-- Applied via: npm run db:push (drizzle-orm/pg-core)
-- These columns track Stripe subscription state per facility.

ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;
