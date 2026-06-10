// Bearable Senior - Database Schema
import {
  pgTable, uuid, text, timestamp, boolean, date, jsonb, index,
} from 'drizzle-orm/pg-core';

// ══════════════════════════════════════════════════════════════════════════════
// Core User Tables
// ══════════════════════════════════════════════════════════════════════════════

export const users = pgTable('users', {
  id:               uuid('id').primaryKey().defaultRandom(),
  email:            text('email').notNull().unique(),
  passwordHash:     text('password_hash'),
  fullName:         text('full_name'),
  dateOfBirth:      date('date_of_birth'),
  phone:            text('phone'),
  userType:         text('user_type').notNull().default('senior'), // 'senior' | 'caretaker'
  onboardingComplete: boolean('onboarding_complete').default(false),
  createdAt:        timestamp('created_at').defaultNow(),
}, (t) => [
  index('users_email_idx').on(t.email),
  index('users_type_idx').on(t.userType),
]);

export const authSessions = pgTable('auth_sessions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token:      text('token').notNull().unique(),
  expiresAt:  timestamp('expires_at').notNull(),
  createdAt:  timestamp('created_at').defaultNow(),
}, (t) => [
  index('sessions_token_idx').on(t.token),
  index('sessions_user_idx').on(t.userId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// Relationships
// ══════════════════════════════════════════════════════════════════════════════

export const relationships = pgTable('relationships', {
  id:             uuid('id').primaryKey().defaultRandom(),
  seniorId:       uuid('senior_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  caretakerId:    uuid('caretaker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label:          text('label'), // "My daughter Sarah"
  status:         text('status').notNull().default('active'), // 'active' | 'paused' | 'ended'
  // Communication preferences
  notificationPreferences: jsonb('notification_preferences').default({}),
  quietHoursStart: text('quiet_hours_start'), // "22:00"
  quietHoursEnd:   text('quiet_hours_end'),   // "07:00"
  timezone:        text('timezone').default('America/Chicago'),
  createdAt:      timestamp('created_at').defaultNow(),
}, (t) => [
  index('relationships_senior_idx').on(t.seniorId, t.status),
  index('relationships_caretaker_idx').on(t.caretakerId, t.status),
]);

export const invites = pgTable('invites', {
  id:            uuid('id').primaryKey().defaultRandom(),
  seniorId:      uuid('senior_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email:         text('email').notNull(),
  label:         text('label'),
  token:         text('token').notNull().unique(),
  status:        text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'expired'
  expiresAt:     timestamp('expires_at').notNull(),
  createdAt:     timestamp('created_at').defaultNow(),
}, (t) => [
  index('invites_token_idx').on(t.token),
  index('invites_senior_idx').on(t.seniorId, t.status),
]);

// ══════════════════════════════════════════════════════════════════════════════
// Health Data
// ══════════════════════════════════════════════════════════════════════════════

export const checkIns = pgTable('check_ins', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  feelingOk:         boolean('feeling_ok').notNull(),
  voiceNoteUrl:      text('voice_note_url'),
  voiceNoteText:     text('voice_note_text'),
  caretakerNotified: boolean('caretaker_notified').default(false),
  createdAt:         timestamp('created_at').defaultNow(),
}, (t) => [
  index('checkins_user_date_idx').on(t.userId, t.createdAt),
]);

export const medications = pgTable('medications', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:           text('name').notNull(),
  simpleSchedule: text('simple_schedule'), // "every morning with breakfast"
  status:         text('status').default('active'), // 'active' | 'paused' | 'discontinued'
  notes:          text('notes'),
  createdAt:      timestamp('created_at').defaultNow(),
}, (t) => [
  index('medications_user_idx').on(t.userId, t.status),
]);

export const medicationReminders = pgTable('medication_reminders', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  medicationId:      uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
  scheduledTime:     text('scheduled_time').notNull(), // "08:00"
  timezone:          text('timezone').default('America/Chicago'),
  reminderSentAt:    timestamp('reminder_sent_at'),
  takenAt:           timestamp('taken_at'),
  missed:            boolean('missed').default(false),
  caretakerNotified: boolean('caretaker_notified').default(false),
  createdAt:         timestamp('created_at').defaultNow(),
}, (t) => [
  index('med_reminders_user_sched_idx').on(t.userId, t.scheduledTime),
  index('med_reminders_pending_idx').on(t.userId),
]);

export const conditions = pgTable('conditions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  status:    text('status').default('active'),
  notes:     text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('conditions_user_idx').on(t.userId, t.status),
]);
