import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { salons } from './salons';

export const coachingReports = pgTable('coaching_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  salonId: uuid('salon_id')
    .notNull()
    .references(() => salons.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  summary: text('summary').notNull(),
  riskLevel: text('risk_level', { enum: ['low', 'medium', 'high'] })
    .notNull()
    .default('low'),
  dataQualityNote: text('data_quality_note'),
  confidence: doublePrecision('confidence'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  /** 生成方式の記録: 'anthropic:<model>' または 'rule-based-fallback' */
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
});

export type RecommendationStatus =
  | 'proposed'
  | 'accepted'
  | 'on_hold'
  | 'rejected'
  | 'completed';

export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => coachingReports.id, { onDelete: 'cascade' }),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id),
    title: text('title').notNull(),
    action: text('action').notNull(),
    rationale: text('rationale').notNull(),
    evidenceEventIds: uuid('evidence_event_ids').array().notNull(),
    priority: integer('priority').notNull(),
    difficulty: text('difficulty', { enum: ['low', 'medium', 'high'] }).notNull(),
    expectedEffect: text('expected_effect').notNull(),
    steps: jsonb('steps').$type<string[]>().notNull().default([]),
    dueDate: date('due_date'),
    status: text('status')
      .$type<RecommendationStatus>()
      .notNull()
      .default('proposed'),
    ownerNote: text('owner_note'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    outcomeRating: integer('outcome_rating'),
  },
  (t) => [index('recommendations_salon_status_due_idx').on(t.salonId, t.status, t.dueDate)],
);
