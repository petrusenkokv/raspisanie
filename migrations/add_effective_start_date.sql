-- Add effective_start_date column to membership_payments table
-- This allows early CV payments with the new period starting from the next day after the current period ends.

ALTER TABLE membership_payments ADD COLUMN IF NOT EXISTS effective_start_date TEXT;
