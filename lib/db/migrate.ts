// Auto-migrate database schema on app startup
// Creates tables if they don't exist

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

      // Create all tables
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          role TEXT NOT NULL DEFAULT 'senior',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS check_ins (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          feeling_ok BOOLEAN NOT NULL,
          voice_note_text TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS medications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          simple_schedule TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS medication_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
          taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS relationships (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          senior_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          caretaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
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
