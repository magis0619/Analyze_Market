import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import {
  changeEvents,
  coachingReports,
  entities,
  observations,
  recommendations,
  salons,
} from '@/server/db/schema';
import { getCoachGenerator } from '@/server/ai';
import { COACH_PROMPT_VERSION } from '@/server/ai/prompt';
import {
  buildCoachInput,
  type CoachInputChangeEvent,
  type CoachInputKpiPoint,
} from '@/server/ai/input-builder';

type SalonRow = typeof salons.$inferSelect;
type ChangeEventRow = typeof changeEvents.$inferSelect;

const KPI_SERIES_LIMIT = 16;
const PAST_RECOMMENDATION_DAYS = 28;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * AIコーチ入力を組み立てて生成し、coaching_reports + recommendations を保存する。
 * 同一 period_end (同日) の既存レポートは置換するが、実施ステータスが付いた提案は残す。
 */
export async function generateAndPersistReport(
  salon: SalonRow,
  newEvents: ChangeEventRow[],
  periodStart: Date,
  dataNotes: string[],
): Promise<{ reportId: string }> {
  const now = new Date();

  // 自店舗KPI時系列
  const [ownEntity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.salonId, salon.id), eq(entities.entityType, 'own_salon')))
    .limit(1);

  let ownKpiSeries: CoachInputKpiPoint[] = [];
  if (ownEntity) {
    const kpiRows = await db
      .select({
        metricKey: observations.metricKey,
        numericValue: observations.numericValue,
        observedAt: observations.observedAt,
      })
      .from(observations)
      .where(
        and(
          eq(observations.entityId, ownEntity.id),
          inArray(observations.metricKey, ['rating', 'review_count']),
        ),
      )
      .orderBy(desc(observations.observedAt))
      .limit(KPI_SERIES_LIMIT);
    ownKpiSeries = kpiRows
      .filter((row) => row.numericValue !== null)
      .map((row) => ({
        metricKey: row.metricKey,
        value: row.numericValue as number,
        observedAt: row.observedAt.toISOString(),
      }))
      .reverse();
  }

  // 競合サマリ: 最新観測をエンティティ毎に集計
  const competitorRows = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.salonId, salon.id),
        eq(entities.entityType, 'competitor'),
        eq(entities.isActive, true),
        eq(entities.isExcluded, false),
      ),
    );
  const competitorIds = competitorRows.map((row) => row.id);

  const latestByEntityMetric = new Map<string, number>();
  if (competitorIds.length > 0) {
    const metricRows = await db
      .select({
        entityId: observations.entityId,
        metricKey: observations.metricKey,
        numericValue: observations.numericValue,
        observedAt: observations.observedAt,
      })
      .from(observations)
      .where(
        and(
          inArray(observations.entityId, competitorIds),
          inArray(observations.metricKey, ['rating', 'review_count']),
        ),
      )
      .orderBy(desc(observations.observedAt));
    for (const row of metricRows) {
      const key = `${row.entityId}:${row.metricKey}`;
      if (!latestByEntityMetric.has(key) && row.numericValue !== null) {
        latestByEntityMetric.set(key, row.numericValue);
      }
    }
  }
  const ratings = competitorIds
    .map((id) => latestByEntityMetric.get(`${id}:rating`))
    .filter((v): v is number => v !== undefined);
  const reviewCounts = competitorIds
    .map((id) => latestByEntityMetric.get(`${id}:review_count`))
    .filter((v): v is number => v !== undefined);
  const average = (values: number[]): number | null =>
    values.length > 0
      ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2))
      : null;

  // 過去4週間の提案と実施状況 (US-005: 実施履歴を次回生成に反映)
  const pastRecs = await db
    .select({
      title: recommendations.title,
      status: recommendations.status,
      reportGeneratedAt: coachingReports.generatedAt,
    })
    .from(recommendations)
    .innerJoin(coachingReports, eq(recommendations.reportId, coachingReports.id))
    .where(
      and(
        eq(recommendations.salonId, salon.id),
        gte(coachingReports.generatedAt, addDays(now, -PAST_RECOMMENDATION_DAYS)),
      ),
    )
    .orderBy(desc(coachingReports.generatedAt));

  const coachEvents: CoachInputChangeEvent[] = newEvents.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    severity: event.severity,
    title: event.title,
    description: event.description,
  }));

  const input = buildCoachInput({
    salonName: salon.name,
    salonProfile: salon.salonProfile,
    tradeAreaRadiusM: salon.tradeAreaRadiusM,
    changeEvents: coachEvents,
    ownKpiSeries,
    competitorSummary: {
      activeCount: competitorIds.length,
      averageRating: average(ratings),
      averageReviewCount: average(reviewCounts),
      newThisRun: newEvents.filter((e) => e.eventType === 'new_competitor').length,
      closedThisRun: newEvents.filter((e) => e.eventType === 'competitor_closed').length,
    },
    pastRecommendations: pastRecs.map((rec) => ({
      title: rec.title,
      status: rec.status,
      proposedAt: isoDate(rec.reportGeneratedAt),
    })),
    dataNotes,
  });

  const { output, generatorKind } = await getCoachGenerator().generate(input);

  return db.transaction(async (tx) => {
    // 同日レポートの置換: 実施ステータス付きの提案は保持する
    const [existing] = await tx
      .select({ id: coachingReports.id })
      .from(coachingReports)
      .where(
        and(eq(coachingReports.salonId, salon.id), eq(coachingReports.periodEnd, isoDate(now))),
      )
      .limit(1);
    if (existing) {
      await tx
        .delete(recommendations)
        .where(
          and(eq(recommendations.reportId, existing.id), eq(recommendations.status, 'proposed')),
        );
      const [kept] = await tx
        .select({ id: recommendations.id })
        .from(recommendations)
        .where(eq(recommendations.reportId, existing.id))
        .limit(1);
      if (!kept) {
        await tx.delete(coachingReports).where(eq(coachingReports.id, existing.id));
      }
    }

    const [report] = await tx
      .insert(coachingReports)
      .values({
        salonId: salon.id,
        periodStart: isoDate(periodStart),
        periodEnd: isoDate(now),
        summary: output.weekly_summary,
        riskLevel: output.risk_level,
        dataQualityNote: output.data_quality_note || null,
        model: generatorKind,
        promptVersion: COACH_PROMPT_VERSION,
      })
      .returning({ id: coachingReports.id });
    if (!report) throw new Error('failed to insert coaching report');

    if (output.recommendations.length > 0) {
      await tx.insert(recommendations).values(
        output.recommendations.map((rec) => ({
          reportId: report.id,
          salonId: salon.id,
          title: rec.title,
          action: rec.action,
          rationale: rec.rationale,
          evidenceEventIds: rec.evidence_event_ids,
          priority: rec.priority,
          difficulty: rec.difficulty,
          expectedEffect: rec.expected_effect,
          steps: rec.steps,
          dueDate: isoDate(addDays(now, rec.deadline_days)),
        })),
      );
    }

    return { reportId: report.id };
  });
}
