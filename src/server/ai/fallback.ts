import type { CoachInput } from './input-builder';
import type { CoachOutput, CoachRecommendation } from './schema';

/**
 * ルールベースのコーチ生成 (仕様08の提案テンプレート)。
 * - ANTHROPIC_API_KEY 未設定時、またはAI生成失敗時のフォールバック
 * - 出力は coachOutputSchema に準拠する (ユニットテストで担保)
 */

function findEvents(input: CoachInput, ...types: string[]): CoachInput['change_events'] {
  return input.change_events.filter((event) => types.includes(event.event_type));
}

function templateLowRatingReview(events: CoachInput['change_events']): CoachRecommendation {
  return {
    title: '低評価口コミへ24時間以内に返信する',
    action:
      '新しく届いた低評価口コミに対し、事実確認とお詫び、改善予定を含む返信を作成して投稿する。',
    rationale: `低評価の口コミが検知されました (${events.map((e) => e.title).join(' / ')})。返信が遅れるほど検索閲覧者への印象悪化が続くため、早期対応が必要です。`,
    evidence_event_ids: events.map((event) => event.id),
    priority: 1,
    difficulty: 'low',
    expected_effect: '口コミ閲覧者への印象改善と、既存顧客の信頼維持が期待できる方向性。',
    deadline_days: 2,
    steps: [
      '口コミ内容の事実関係をスタッフに確認する',
      'お詫びと改善予定を含む返信文を作成する (感情的な反論をしない)',
      '返信を投稿し、店内で同じ問題が起きない対策を1つ決める',
    ],
  };
}

function templateNewCompetitor(events: CoachInput['change_events']): CoachRecommendation {
  return {
    title: '新規競合の内容確認と自店の差別化を1つ明文化する',
    action:
      '新しく検知された競合のサービス・価格帯・営業時間を確認し、自店の差別化ポイントを1つ決めてGoogleビジネスプロフィールの説明文と写真を更新する。',
    rationale: `商圏内で新規競合を検知しました (${events.map((e) => e.title).join(' / ')})。開店直後は近隣顧客が比較検討しやすいタイミングです。`,
    evidence_event_ids: events.map((event) => event.id),
    priority: 1,
    difficulty: 'medium',
    expected_effect: '検索・地図上での比較時に自店の強みが伝わりやすくなる方向性。',
    deadline_days: 7,
    steps: [
      '競合のメニュー・価格帯・営業時間・口コミ傾向を確認する',
      '自店の差別化要素 (得意メニュー・雰囲気・対応客層など) を1つ明文化する',
      'Googleビジネスプロフィールの説明文を更新し、施術事例写真を1枚追加する',
    ],
  };
}

function templateOwnRatingDrop(events: CoachInput['change_events']): CoachRecommendation {
  return {
    title: '評価低下の原因を確認し、直近来店客へのフォローを行う',
    action:
      '直近の口コミと店内オペレーションを振り返り、評価低下の原因候補を特定して1つ改善する。',
    rationale: `自店舗の評価低下を検知しました (${events.map((e) => e.title).join(' / ')})。早期に原因を把握することで悪化の連鎖を防ぎます。`,
    evidence_event_ids: events.map((event) => event.id),
    priority: 2,
    difficulty: 'medium',
    expected_effect: '評価低下の原因を断ち、口コミの回復につながる方向性。',
    deadline_days: 7,
    steps: [
      '直近1か月の口コミを読み返し、不満点を分類する',
      'スタッフミーティングで原因候補を1つ特定する',
      '改善策を決めて実施し、次週の口コミ動向を確認する',
    ],
  };
}

function templateCompetitorActivity(events: CoachInput['change_events']): CoachRecommendation {
  return {
    title: '競合の動きを踏まえて口コミ獲得を1件依頼する',
    action:
      '競合の評価・口コミ数が動いているため、今週の来店客のうち満足度の高い1〜2名に口コミ投稿を依頼する。',
    rationale: `競合の評価・口コミ数の変化を検知しました (${events.map((e) => e.title).join(' / ')})。自店の口コミ数を維持・増加させることで相対的な露出低下を防ぎます。`,
    evidence_event_ids: events.map((event) => event.id),
    priority: 2,
    difficulty: 'low',
    expected_effect: '地図検索での相対的な評価・件数の見劣りを防ぐ方向性。',
    deadline_days: 7,
    steps: [
      '施術後の満足度が高かったお客様を選ぶ',
      '会計時に口コミ投稿を丁寧に依頼する (QRコード等を用意)',
      '投稿されたら返信し、次週も継続する',
    ],
  };
}

function templateInitialDiagnosis(input: CoachInput): CoachRecommendation | null {
  // 初回診断: change_events が無いため根拠を付けられない。観測不足として提案なし。
  void input;
  return null;
}

export function generateFallbackCoachOutput(input: CoachInput): CoachOutput {
  const recommendations: CoachRecommendation[] = [];

  const lowRating = findEvents(input, 'own_low_rating_review');
  if (lowRating.length > 0) recommendations.push(templateLowRatingReview(lowRating));

  const newCompetitors = findEvents(input, 'new_competitor');
  if (newCompetitors.length > 0) recommendations.push(templateNewCompetitor(newCompetitors));

  const ratingDrop = findEvents(input, 'own_rating_change');
  if (ratingDrop.length > 0 && recommendations.length < 3) {
    recommendations.push(templateOwnRatingDrop(ratingDrop));
  }

  const competitorActivity = findEvents(input, 'rating_change', 'review_count_change', 'competitor_closed');
  if (competitorActivity.length > 0 && recommendations.length < 3) {
    recommendations.push(templateCompetitorActivity(competitorActivity));
  }

  const initial = recommendations.length === 0 ? templateInitialDiagnosis(input) : null;
  if (initial) recommendations.push(initial);

  const prioritized = recommendations.slice(0, 3).map((rec, index) => ({
    ...rec,
    priority: (index + 1) as 1 | 2 | 3,
  }));

  const highSeverityCount = input.change_events.filter(
    (event) => event.severity === 'high' || event.severity === 'critical',
  ).length;
  const riskLevel: CoachOutput['risk_level'] =
    highSeverityCount >= 2 ? 'high' : highSeverityCount === 1 ? 'medium' : 'low';

  const summaryParts: string[] = [];
  if (input.change_events.length === 0) {
    summaryParts.push(
      `商圏内の競合${input.competitor_summary.active_count}店を初回観測しました。` +
        (input.competitor_summary.average_rating !== null
          ? `競合の平均評価は${input.competitor_summary.average_rating.toFixed(1)}です。`
          : ''),
    );
  } else {
    summaryParts.push(`今週は${input.change_events.length}件の変化を検知しました。`);
    if (newCompetitors.length > 0) summaryParts.push('新規競合の出店があり、競争環境が変化しています。');
    if (lowRating.length > 0) summaryParts.push('自店舗に低評価の口コミが届いており、早期対応を推奨します。');
    if (ratingDrop.length > 0) summaryParts.push('自店舗の評価が低下しています。');
  }

  const dataQualityNotes: string[] = [
    'AI生成が利用できないため、ルールベースで生成しました。',
    ...input.data_notes,
  ];
  if (input.change_events.length === 0) {
    dataQualityNotes.push('観測不足のため、根拠付きの提案はまだありません。次回の収集で変化を検知します。');
  }

  return {
    weekly_summary: summaryParts.join(''),
    risk_level: riskLevel,
    data_quality_note: dataQualityNotes.join(' '),
    recommendations: prioritized,
  };
}
