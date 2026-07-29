import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './auth';

/** 自店舗データの取得方法。demo=モックアダプタ / manual=オーナー手入力 / gbp=GBP連携 */
export type OwnSalonDataMode = 'demo' | 'manual' | 'gbp';

export interface SalonProfile {
  salonType: string;
  targetCustomer: string;
  priceBand: string;
  strengths: string;
  dataMode: OwnSalonDataMode;
}

export const salons = pgTable('salons', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  address: text('address').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  googlePlaceId: text('google_place_id'),
  tradeAreaRadiusM: integer('trade_area_radius_m').notNull().default(500),
  salonProfile: jsonb('salon_profile').$type<SalonProfile>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  salonId: uuid('salon_id')
    .notNull()
    .references(() => salons.id),
  provider: text('provider', { enum: ['google_places', 'own_salon', 'gbp'] }).notNull(),
  status: text('status', { enum: ['active', 'error', 'disconnected'] })
    .notNull()
    .default('active'),
  // 実APIの認証情報を保存する場合は暗号化して格納する (GBP OAuth は BACKLOG)
  encryptedCredentials: text('encrypted_credentials'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
});
