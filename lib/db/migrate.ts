// Auto-migrate database schema on app startup
// Creates tables if they don't exist - matches lib/db/schema.ts exactly

import { sql } from 'drizzle-orm';
import { db } from './client';

let migrationRun = false;

export async function ensureSchema() {
  if (migrationRun) return;

  try {
    // Check if users table exists
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      );
    `);

    const tableExists = result.rows[0]?.exists;

    if (!tableExists) {
      console.log('📦 Creating database schema...');

      // Create all tables - EXACTLY matching schema.ts
      await db.execute(sql`
        -- Core User Tables
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          full_name TEXT,
          date_of_birth DATE,
          phone TEXT,
          user_type TEXT NOT NULL DEFAULT 'senior',
          onboarding_complete BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
        CREATE INDEX IF NOT EXISTS users_type_idx ON users(user_type);

        CREATE TABLE IF NOT EXISTS auth_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS sessions_token_idx ON auth_sessions(token);
        CREATE INDEX IF NOT EXISTS sessions_user_idx ON auth_sessions(user_id);

        -- Relationships
        CREATE TABLE IF NOT EXISTS relationships (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          senior_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          caretaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          notification_preferences JSONB DEFAULT '{}',
          quiet_hours_start TEXT,
          quiet_hours_end TEXT,
          timezone TEXT DEFAULT 'America/Chicago',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS relationships_senior_idx ON relationships(senior_id, status);
        CREATE INDEX IF NOT EXISTS relationships_caretaker_idx ON relationships(caretaker_id, status);

        CREATE TABLE IF NOT EXISTS invites (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          senior_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          label TEXT,
          token TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'pending',
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS invites_token_idx ON invites(token);
        CREATE INDEX IF NOT EXISTS invites_senior_idx ON invites(senior_id, status);

        -- Health Data
        CREATE TABLE IF NOT EXISTS check_ins (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          feeling_ok BOOLEAN NOT NULL,
          voice_note_url TEXT,
          voice_note_text TEXT,
          caretaker_notified BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS checkins_user_date_idx ON check_ins(user_id, created_at);

        CREATE TABLE IF NOT EXISTS medications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          simple_schedule TEXT,
          status TEXT DEFAULT 'active',
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS medications_user_idx ON medications(user_id, status);

        CREATE TABLE IF NOT EXISTS medication_reminders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
          scheduled_time TEXT NOT NULL,
          timezone TEXT DEFAULT 'America/Chicago',
          reminder_sent_at TIMESTAMP WITH TIME ZONE,
          taken_at TIMESTAMP WITH TIME ZONE,
          missed BOOLEAN DEFAULT false,
          caretaker_notified BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS med_reminders_user_sched_idx ON medication_reminders(user_id, scheduled_time);
        CREATE INDEX IF NOT EXISTS med_reminders_pending_idx ON medication_reminders(user_id);

        CREATE TABLE IF NOT EXISTS conditions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS conditions_user_idx ON conditions(user_id, status);
      `);

      console.log('✅ Database schema created');
    }

    migrationRun = true;
  } catch (error) {
    console.error('❌ Schema migration failed:', error);
    // Don't throw - allow app to start even if migration fails
    // Tables might already exist or there might be a connection issue
  }
}
