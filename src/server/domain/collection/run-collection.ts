import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import {
  changeEvents,
  collectionRuns,
  entities,
  integrations,
  observations,
  salons,
} from '@/server/db/schema';
import { getGooglePlacesAdapter } from '@/server/integrations/google-places';
import { getOwnSalonAdapter } from '@/server/integrations/own-salon';
import type { NormalizedCollection } from '@/server/integrations/types';
import { detectChanges } from '@/server/domain/diff/diff-engine';
import { loadDiffInputs } from '@/server/domain/diff/snapshot';
import { generateAndPersistReport } from '@/server/domain/coaching/generate-report';

/** パイプライン全体を表す collection_runs.source の値 */
const PIPELINE_SOURCE = 'pipeline';
const RUNNING_GUARD_MINUTES = 5;

export interface CollectionResult {
  ok: boolean;
  message: string;
  newEventCount: number;
}

async function countSuccessRuns(salonId: string, source: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.salonId, salonId),
        eq(collectionRuns.source, source),
        eq(collectionRuns.status, 'success'),
      ),
    );
  return row?.value ?? 0;
}

/** 正規化済みコレクションを entities upsert + observations insert で永続化する */
async function persistCollection(
  salonId: string,
  collection: NormalizedCollection,
): Promise<void> {
  const entityIdByKey = new Map<string, string>();

  for (const entity of collection.entities) {
    const [row] = await db
      .insert(entities)
      .values({
        salonId,
        entityType: entity.entityType,
        externalSource: entity.externalSource,
        externalId: entity.externalId,
        name: entity.name,
        latitude: entity.latitude,
        longitude: entity.longitude,
        attributes: entity.attributes,
      })
      .onConflictDoUpdate({
        target: [entities.salonId, entities.externalSource, entities.externalId],
        set: {
          name: entity.name,
          latitude: entity.latitude,
          longitude: entity.longitude,
          attributes: entity.attributes,
          lastSeenAt: sql`now()`,
          isActive: true,
        },
      })
      .returning({ id: entities.id });
    if (row) {
      entityIdByKey.set(`${entity.externalSource}:${entity.externalId}`, row.id);
    }
  }

  const rows = collection.observations
    .map((obs) => {
      const entityId = entityIdByKey.get(`${obs.externalSource}:${obs.externalId}`);
      if (!entityId) return null;
      return {
        salonId,
        entityId,
        source: obs.source,
        metricKey: obs.metricKey,
        numericValue: obs.numericValue ?? null,
        textValue: obs.textValue ?? null,
        jsonValue: obs.jsonValue ?? null,
        sourceUpdatedAt: obs.sourceUpdatedAt ?? null,
        confidence: obs.confidence ?? 1,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (rows.length > 0) {
    await db.insert(observations).values(rows);
  }
}

interface SourceRunOutcome {
  source: string;
  ok: boolean;
  error?: string;
}

async function runSource(
  salonId: string,
  source: string,
  execute: () => Promise<NormalizedCollection>,
): Promise<SourceRunOutcome> {
  const [run] = await db
    .insert(collectionRuns)
    .values({ salonId, source, status: 'running' })
    .returning({ id: collectionRuns.id });
  if (!run) return { source, ok: false, error: 'failed to create run row' };

  try {
    const collection = await execute();
    await persistCollection(salonId, collection);
    await db
      .update(collectionRuns)
      .set({
        status: 'success',
        completedAt: sql`now()`,
        costMetadata: collection.costMetadata,
      })
      .where(eq(collectionRuns.id, run.id));
    return { source, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(collectionRuns)
      .set({ status: 'failed', completedAt: sql`now()`, errorSummary: message.slice(0, 500) })
      .where(eq(collectionRuns.id, run.id));
    return { source, ok: false, error: message };
  }
}

/**
 * 収集パイプライン (仕様05 週次監視フローの cron なし版)。
 * 1. 実行中ガード
 * 2. ソース毎に収集→正規化→保存 (失敗はソース単位で分離)
 * 3. 前回スナップショットとの差分検知 → change_events
 * 4. AIコーチ生成 → coaching_reports / recommendations
 */
export async function runCollection(salonId: string): Promise<CollectionResult> {
  const [salon] = await db.select().from(salons).where(eq(salons.id, salonId)).limit(1);
  if (!salon) {
    return { ok: false, message: '店舗が見つかりません', newEventCount: 0 };
  }

  // 実行中ガード: 直近5分以内に running のパイプラインがあれば中断
  const guardAfter = new Date(Date.now() - RUNNING_GUARD_MINUTES * 60 * 1000);
  const [running] = await db
    .select({ id: collectionRuns.id })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.salonId, salonId),
        eq(collectionRuns.source, PIPELINE_SOURCE),
        eq(collectionRuns.status, 'running'),
        gte(collectionRuns.startedAt, guardAfter),
      ),
    )
    .limit(1);
  if (running) {
    return { ok: false, message: '収集は既に実行中です。しばらく待ってください。', newEventCount: 0 };
  }

  // 前回の差分基準時刻 = 直近に差分検知まで完了したパイプラインの完了時刻。
  // (開始時刻を使うと、その実行自身が挿入した観測が prev に含まれず差分を取り逃す。
  //  完了時刻なら、収集間にオーナーが手入力した観測も次回の curr 側に入る)
  const [lastPipeline] = await db
    .select({ completedAt: collectionRuns.completedAt })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.salonId, salonId),
        eq(collectionRuns.source, PIPELINE_SOURCE),
        inArray(collectionRuns.status, ['success', 'partial']),
      ),
    )
    .orderBy(desc(collectionRuns.completedAt))
    .limit(1);
  const cutoff = lastPipeline?.completedAt ?? null;

  const [pipelineRun] = await db
    .insert(collectionRuns)
    .values({ salonId, source: PIPELINE_SOURCE, status: 'running' })
    .returning({ id: collectionRuns.id, startedAt: collectionRuns.startedAt });
  if (!pipelineRun) {
    return { ok: false, message: '収集ジョブの開始に失敗しました', newEventCount: 0 };
  }

  const outcomes: SourceRunOutcome[] = [];
  const dataNotes: string[] = [];

  // 競合 (Google Places / モック)
  const placesRunIndex = await countSuccessRuns(salonId, 'google_places');
  const placesAdapter = getGooglePlacesAdapter(salonId, placesRunIndex);
  outcomes.push(
    await runSource(salonId, 'google_places', async () => {
      const raw = await placesAdapter.collect({
        latitude: salon.latitude,
        longitude: salon.longitude,
        radiusM: salon.tradeAreaRadiusM,
      });
      return placesAdapter.normalize(raw);
    }),
  );
  if (placesAdapter.mode === 'mock') {
    dataNotes.push('競合データはデモデータです (GOOGLE_MAPS_API_KEY 未設定)。');
  }

  // 自店舗 (デモモードのみアダプタ収集。手入力は保存済み観測を使う)
  const ownAdapter = getOwnSalonAdapter(
    salon.salonProfile.dataMode,
    salonId,
    await countSuccessRuns(salonId, 'own_salon'),
  );
  if (ownAdapter) {
    outcomes.push(
      await runSource(salonId, 'own_salon', async () => {
        const raw = await ownAdapter.collect({ salonName: salon.name });
        return ownAdapter.normalize(raw);
      }),
    );
    dataNotes.push('自店舗データはデモデータです。');
  } else {
    dataNotes.push('自店舗データはオーナーの手入力値です。');
  }

  for (const outcome of outcomes) {
    if (!outcome.ok) {
      dataNotes.push(`${outcome.source} の取得に失敗したため前回値を使用しています。`);
    }
  }

  // integrations.last_synced_at を更新
  await db
    .update(integrations)
    .set({ lastSyncedAt: sql`now()`, status: outcomes.every((o) => o.ok) ? 'active' : 'error' })
    .where(eq(integrations.salonId, salonId));

  let newEventCount = 0;
  let coachError: string | null = null;
  try {
    // 差分検知
    const diffInputs = await loadDiffInputs(
      salonId,
      { latitude: salon.latitude, longitude: salon.longitude },
      cutoff,
    );
    const drafts = detectChanges(diffInputs.entities, diffInputs.prev, diffInputs.curr);
    let insertedEvents: (typeof changeEvents.$inferSelect)[] = [];
    if (drafts.length > 0) {
      insertedEvents = await db
        .insert(changeEvents)
        .values(
          drafts.map((draft) => ({
            salonId,
            entityId: draft.entityId,
            eventType: draft.eventType,
            severity: draft.severity,
            title: draft.title,
            description: draft.description,
            evidenceObservationIds: draft.evidenceObservationIds,
          })),
        )
        .returning();
    }
    newEventCount = insertedEvents.length;

    // AIコーチ生成 (失敗しても観測・イベントは確定済み)
    try {
      await generateAndPersistReport(
        salon,
        insertedEvents,
        cutoff ?? salon.createdAt,
        dataNotes,
      );
    } catch (error) {
      coachError = error instanceof Error ? error.message : String(error);
      console.error('レポート生成に失敗しました:', error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(collectionRuns)
      .set({ status: 'failed', completedAt: sql`now()`, errorSummary: message.slice(0, 500) })
      .where(eq(collectionRuns.id, pipelineRun.id));
    return { ok: false, message: `差分検知に失敗しました: ${message}`, newEventCount: 0 };
  }

  const allOk = outcomes.every((outcome) => outcome.ok) && !coachError;
  await db
    .update(collectionRuns)
    .set({
      status: allOk ? 'success' : 'partial',
      completedAt: sql`now()`,
      errorSummary: coachError
        ? `レポート生成失敗: ${coachError.slice(0, 300)}`
        : (outcomes.find((o) => !o.ok)?.error?.slice(0, 300) ?? null),
    })
    .where(eq(collectionRuns.id, pipelineRun.id));

  return {
    ok: true,
    message:
      newEventCount > 0
        ? `収集が完了しました。${newEventCount}件の変化を検知しました。`
        : '収集が完了しました。新しい変化はありません。',
    newEventCount,
  };
}
