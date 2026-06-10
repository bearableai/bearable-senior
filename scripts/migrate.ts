#!/usr/bin/env tsx
// Database migration script
// Run with: tsx scripts/migrate.ts

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../lib/db/schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigrations() {
  console.log('🔄 Running database migrations...');

  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // Push schema directly (no migration files needed)
    console.log('📦 Pushing schema to database...');

    // Create tables manually by executing SQL
    await client`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'senior',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await client`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await client`
      CREATE TABLE IF NOT EXISTS check_ins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feeling_ok BOOLEAN NOT NULL,
        voice_note_text TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await client`
      CREATE TABLE IF NOT EXISTS medications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        simple_schedule TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await client`
      CREATE TABLE IF NOT EXISTS medication_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
        taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await client`
      CREATE TABLE IF NOT EXISTS relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        senior_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        caretaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
