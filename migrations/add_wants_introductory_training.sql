-- Add wants_introductory_training column to users table
-- Tracks whether a user selected "Ознакомительная тренировка" during registration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS wants_introductory_training BOOLEAN NOT NULL DEFAULT false;
