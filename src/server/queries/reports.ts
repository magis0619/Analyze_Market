import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import {
  changeEvents,
  coachingReports,
  entities,
  observations,
  recommendations,
} from '@/server/db/schema';

export type ReportRow = typeof coachingReports.$inferSelect;
export type RecommendationRow = typeof recommendations.$inferSelect;
export type ChangeEventRow = typeof changeEvents.$inferSelect;

export interface EvidenceObservation {
  id: string;
  metricKey: string;
  numericValue: number | null;
  textValue: string | null;
  source: string;
  observedAt: Date;
  entityName: string | null;
}

export interface EventWithEvidence extends ChangeEventRow {
  evidenceObservations: EvidenceObservation[];
}

export async function listReports(salonId: string): Promise<
  (ReportRow & { recommendationCount: number })[]
> {
  const reports = await db
    .select()
    .from(coachingReports)
    .where(eq(coachingReports.salonId, salonId))
    .orderBy(desc(coachingReports.generatedAt));
  if (reports.length === 0) return [];

  const recRows = await db
    .select({ reportId: recommendations.reportId })
    .from(recommendations)
    .where(
      inArray(
        recommendations.reportId,
        reports.map((report) => report.id),
      ),
    );
  const countByReport = new Map<string, number>();
  for (const row of recRows) {
    countByReport.set(row.reportId, (countByReport.get(row.reportId) ?? 0) + 1);
  }

  return reports.map((report) => ({
    ...report,
    recommendationCount: countByReport.get(report.id) ?? 0,
  }));
}

async function attachEvidence(events: ChangeEventRow[]): Promise<EventWithEvidence[]> {
  const observationIds = [...new Set(events.flatMap((event) => event.evidenceObservationIds))];
  if (observationIds.length === 0) {
    return events.map((event) => ({ ...event, evidenceObservations: [] }));
  }
  const obsRows = await db
    .select({
      id: observations.id,
      metricKey: observations.metricKey,
      numericValue: observations.numericValue,
      textValue: observations.textValue,
      source: observations.source,
      observedAt: observations.observedAt,
      entityName: entities.name,
    })
    .from(observations)
    .leftJoin(entities, eq(observations.entityId, entities.id))
    .where(inArray(observations.id, observationIds));
  const obsById = new Map(obsRows.map((row) => [row.id, row]));

  return events.map((event) => ({
    ...event,
    evidenceObservations: event.evidenceObservationIds
      .map((id) => obsById.get(id))
      .filter((row): row is (typeof obsRows)[number] => row !== undefined),
  }));
}

export interface ReportDetail {
  report: ReportRow;
  events: EventWithEvidence[];
  recommendations: RecommendationRow[];
}

export async function getReportDetail(
  salonId: string,
  reportId: string,
): Promise<ReportDetail | null> {
  const [report] = await db
    .select()
    .from(coachingReports)
    .where(and(eq(coachingReports.id, reportId), eq(coachingReports.salonId, salonId)))
    .limit(1);
  if (!report) return null;

  const recs = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.reportId, report.id))
    .orderBy(recommendations.priority);

  // レポート期間内 (period_start 00:00 〜 生成時刻) の変化イベント
  const periodStart = new Date(`${report.periodStart}T00:00:00+09:00`);
  const eventRows = await db
    .select()
    .from(changeEvents)
    .where(eq(changeEvents.salonId, salonId))
    .orderBy(desc(changeEvents.detectedAt));
  const inPeriod = eventRows.filter(
    (event) => event.detectedAt >= periodStart && event.detectedAt <= report.generatedAt,
  );
  const relatedIds = new Set(recs.flatMap((rec) => rec.evidenceEventIds));
  const events = eventRows.filter(
    (event) => inPeriod.includes(event) || relatedIds.has(event.id),
  );

  return {
    report,
    events: await attachEvidence(events),
    recommendations: recs,
  };
}

export interface RecommendationDetail {
  recommendation: RecommendationRow;
  report: ReportRow | null;
  evidenceEvents: EventWithEvidence[];
}

export async function getRecommendationDetail(
  salonId: string,
  recommendationId: string,
): Promise<RecommendationDetail | null> {
  const [rec] = await db
    .select()
    .from(recommendations)
    .where(
      and(eq(recommendations.id, recommendationId), eq(recommendations.salonId, salonId)),
    )
    .limit(1);
  if (!rec) return null;

  const [report] = await db
    .select()
    .from(coachingReports)
    .where(eq(coachingReports.id, rec.reportId))
    .limit(1);

  const eventRows =
    rec.evidenceEventIds.length > 0
      ? await db
          .select()
          .from(changeEvents)
          .where(inArray(changeEvents.id, rec.evidenceEventIds))
      : [];

  return {
    recommendation: rec,
    report: report ?? null,
    evidenceEvents: await attachEvidence(eventRows),
  };
}
