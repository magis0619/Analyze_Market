import 'server-only';
import { FALLBACK_GENERATOR_KIND } from '@/server/ai';
import { getAiMode } from '@/server/integrations/modes';
import {
  DISPLAY_SOURCES,
  GBP_SOURCE,
  OWN_SALON_SOURCE,
} from '@/server/domain/collection/sources';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import {
  changeEvents,
  coachingReports,
  collectionRuns,
  entities,
  observations,
  recommendations,
  type ChangeEventType,
  type OwnSalonDataMode,
  type RecommendationStatus,
  type Severity,
} from '@/server/db/schema';

export interface DashboardEvent {
  id: string;
  eventType: ChangeEventType;
  severity: Severity;
  title: string;
  detectedAt: Date;
}

export interface DashboardRecommendation {
  id: string;
  title: string;
  action: string;
  priority: number;
  difficulty: string;
  dueDate: string | null;
  status: RecommendationStatus;
  evidence: { id: string; title: string }[];
}

export interface DashboardReport {
  id: string;
  summary: string;
  riskLevel: string;
  dataQualityNote: string | null;
  generatedAt: Date;
  model: string;
}

export interface KpiPoint {
  value: number;
  observedAt: Date;
}

export interface DashboardKpi {
  rating: { current: KpiPoint | null; previous: KpiPoint | null };
  reviewCount: { current: KpiPoint | null; previous: KpiPoint | null };
}

export interface CompetitorStats {
  activeCount: number;
  averageRating: number | null;
  averageReviewCount: number | null;
  priorityCount: number;
}

export interface SourceFreshness {
  source: string;
  status: string | null;
  completedAt: Date | null;
  errorSummary: string | null;
}

export interface DashboardData {
  report: DashboardReport | null;
  /** 実AI生成が期待されているのに直近レポートがフォールバックだった場合 true */
  aiDegraded: boolean;
  recommendations: DashboardRecommendation[];
  events: DashboardEvent[];
  kpi: DashboardKpi;
  competitorStats: CompetitorStats;
  freshness: SourceFreshness[];
}

async function loadLatestReport(salonId: string): Promise<DashboardReport | null> {
  const [report] = await db
    .select({
      id: coachingReports.id,
      summary: coachingReports.summary,
      riskLevel: coachingReports.riskLevel,
      dataQualityNote: coachingReports.dataQualityNote,
      generatedAt: coachingReports.generatedAt,
      model: coachingReports.model,
    })
    .from(coachingReports)
    .where(eq(coachingReports.salonId, salonId))
    .orderBy(desc(coachingReports.generatedAt))
    .limit(1);
  return report ?? null;
}

async function loadRecommendations(
  salonId: string,
  reportId: string | null,
): Promise<DashboardRecommendation[]> {
  if (!reportId) return [];
  const rows = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.salonId, salonId), eq(recommendations.reportId, reportId)))
    .orderBy(recommendations.priority);

  const evidenceIds = [...new Set(rows.flatMap((row) => row.evidenceEventIds))];
  const evidenceEvents =
    evidenceIds.length > 0
      ? await db
          .select({ id: changeEvents.id, title: changeEvents.title })
          .from(changeEvents)
          .where(inArray(changeEvents.id, evidenceIds))
      : [];
  const evidenceById = new Map(evidenceEvents.map((event) => [event.id, event]));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    action: row.action,
    priority: row.priority,
    difficulty: row.difficulty,
    dueDate: row.dueDate,
    status: row.status,
    evidence: row.evidenceEventIds
      .map((id) => evidenceById.get(id))
      .filter((event): event is { id: string; title: string } => event !== undefined),
  }));
}

async function loadRecentEvents(salonId: string): Promise<DashboardEvent[]> {
  return db
    .select({
      id: changeEvents.id,
      eventType: changeEvents.eventType,
      severity: changeEvents.severity,
      title: changeEvents.title,
      detectedAt: changeEvents.detectedAt,
    })
    .from(changeEvents)
    .where(eq(changeEvents.salonId, salonId))
    .orderBy(desc(changeEvents.detectedAt))
    .limit(30);
}

async function loadKpi(salonId: string): Promise<DashboardKpi> {
  const kpi: DashboardKpi = {
    rating: { current: null, previous: null },
    reviewCount: { current: null, previous: null },
  };
  const [ownEntity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.salonId, salonId), eq(entities.entityType, 'own_salon')))
    .limit(1);
  if (!ownEntity) return kpi;

  for (const [field, metric] of [
    ['rating', 'rating'],
    ['reviewCount', 'review_count'],
  ] as const) {
    const rows = await db
      .select({ value: observations.numericValue, observedAt: observations.observedAt })
      .from(observations)
      .where(and(eq(observations.entityId, ownEntity.id), eq(observations.metricKey, metric)))
      .orderBy(desc(observations.observedAt))
      .limit(10);
    const points = rows.filter((row) => row.value !== null);
    const current = points[0];
    // 「前回」は値が同じでも直前の観測を採用すると変化なし表示になるため、直前の観測を使う
    const previous = points[1];
    if (current) kpi[field].current = { value: current.value as number, observedAt: current.observedAt };
    if (previous) kpi[field].previous = { value: previous.value as number, observedAt: previous.observedAt };
  }
  return kpi;
}

async function loadCompetitorStats(salonId: string): Promise<CompetitorStats> {
  const competitorRows = await db
    .select({ id: entities.id, isPriority: entities.isPriority })
    .from(entities)
    .where(
      and(
        eq(entities.salonId, salonId),
        eq(entities.entityType, 'competitor'),
        eq(entities.isActive, true),
        eq(entities.isExcluded, false),
      ),
    );
  const ids = competitorRows.map((row) => row.id);
  const latest = new Map<string, number>();
  if (ids.length > 0) {
    const rows = await db
      .select({
        entityId: observations.entityId,
        metricKey: observations.metricKey,
        value: observations.numericValue,
      })
      .from(observations)
      .where(
        and(
          inArray(observations.entityId, ids),
          inArray(observations.metricKey, ['rating', 'review_count']),
        ),
      )
      .orderBy(desc(observations.observedAt));
    for (const row of rows) {
      const key = `${row.entityId}:${row.metricKey}`;
      if (!latest.has(key) && row.value !== null) latest.set(key, row.value);
    }
  }
  const collect = (metric: string): number[] =>
    ids
      .map((id) => latest.get(`${id}:${metric}`))
      .filter((value): value is number => value !== undefined);
  const average = (values: number[]): number | null =>
    values.length > 0
      ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2))
      : null;

  return {
    activeCount: ids.length,
    averageRating: average(collect('rating')),
    averageReviewCount: average(collect('review_count')),
    priorityCount: competitorRows.filter((row) => row.isPriority).length,
  };
}

async function loadFreshness(
  salonId: string,
  dataMode: OwnSalonDataMode,
): Promise<SourceFreshness[]> {
  // GBP連携中は自店舗データの行が source='gbp' で書かれるため、
  // own_salon のまま引くと連携前の古い時刻が「最終更新」に出てしまう
  const sources = DISPLAY_SOURCES.map((source) =>
    source === OWN_SALON_SOURCE && dataMode === 'gbp' ? GBP_SOURCE : source,
  );
  const result: SourceFreshness[] = [];
  for (const source of sources) {
    const [row] = await db
      .select({
        status: collectionRuns.status,
        completedAt: collectionRuns.completedAt,
        errorSummary: collectionRuns.errorSummary,
      })
      .from(collectionRuns)
      .where(and(eq(collectionRuns.salonId, salonId), eq(collectionRuns.source, source)))
      .orderBy(desc(collectionRuns.startedAt))
      .limit(1);
    result.push({
      source,
      status: row?.status ?? null,
      completedAt: row?.completedAt ?? null,
      errorSummary: row?.errorSummary ?? null,
    });
  }
  return result;
}

export async function getDashboardData(
  salonId: string,
  dataMode: OwnSalonDataMode,
): Promise<DashboardData> {
  const report = await loadLatestReport(salonId);
  const [recs, events, kpi, competitorStats, freshness] = await Promise.all([
    loadRecommendations(salonId, report?.id ?? null),
    loadRecentEvents(salonId),
    loadKpi(salonId),
    loadCompetitorStats(salonId),
    loadFreshness(salonId, dataMode),
  ]);
  // 実AI経路が期待されているのにフォールバックで生成された = 実APIが壊れている
  const aiDegraded =
    getAiMode() === 'anthropic' && report !== null && report.model === FALLBACK_GENERATOR_KIND;

  return { report, aiDegraded, recommendations: recs, events, kpi, competitorStats, freshness };
}
