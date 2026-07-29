import type { ChangeEventType, RecommendationStatus, SalonProfile, Severity } from '@/server/db/schema';

/**
 * AIコーチへの入力 (仕様08)。
 * 生のAPIレスポンスや口コミ全文は渡さず、サーバー側で構造化した要約のみを渡す。
 */

export interface CoachInputChangeEvent {
  id: string;
  eventType: ChangeEventType;
  severity: Severity;
  title: string;
  description: string;
}

export interface CoachInputKpiPoint {
  metricKey: string;
  value: number;
  observedAt: string;
}

export interface CoachInputCompetitorSummary {
  activeCount: number;
  averageRating: number | null;
  averageReviewCount: number | null;
  newThisRun: number;
  closedThisRun: number;
}

export interface CoachInputPastRecommendation {
  title: string;
  status: RecommendationStatus;
  proposedAt: string;
}

export interface CoachInputParams {
  salonName: string;
  salonProfile: SalonProfile;
  tradeAreaRadiusM: number;
  changeEvents: CoachInputChangeEvent[];
  ownKpiSeries: CoachInputKpiPoint[];
  competitorSummary: CoachInputCompetitorSummary;
  pastRecommendations: CoachInputPastRecommendation[];
  dataNotes: string[];
}

export interface CoachInput {
  salon: {
    name: string;
    type: string;
    target_customer: string;
    price_band: string;
    strengths: string;
    trade_area_radius_m: number;
  };
  change_events: {
    id: string;
    event_type: string;
    severity: string;
    title: string;
    description: string;
  }[];
  own_kpi_series: { metric: string; value: number; observed_at: string }[];
  competitor_summary: {
    active_count: number;
    average_rating: number | null;
    average_review_count: number | null;
    new_this_run: number;
    closed_this_run: number;
  };
  past_recommendations: { title: string; status: string; proposed_at: string }[];
  data_notes: string[];
}

const MAX_EVENTS = 20;
const MAX_KPI_POINTS = 16;
const MAX_PAST_RECOMMENDATIONS = 12;
const MAX_TEXT_LENGTH = 200;

function clip(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text;
}

export function buildCoachInput(params: CoachInputParams): CoachInput {
  return {
    salon: {
      name: params.salonName,
      type: params.salonProfile.salonType,
      target_customer: params.salonProfile.targetCustomer,
      price_band: params.salonProfile.priceBand,
      strengths: clip(params.salonProfile.strengths),
      trade_area_radius_m: params.tradeAreaRadiusM,
    },
    change_events: params.changeEvents.slice(0, MAX_EVENTS).map((event) => ({
      id: event.id,
      event_type: event.eventType,
      severity: event.severity,
      title: clip(event.title),
      description: clip(event.description),
    })),
    own_kpi_series: params.ownKpiSeries.slice(0, MAX_KPI_POINTS).map((point) => ({
      metric: point.metricKey,
      value: point.value,
      observed_at: point.observedAt,
    })),
    competitor_summary: {
      active_count: params.competitorSummary.activeCount,
      average_rating: params.competitorSummary.averageRating,
      average_review_count: params.competitorSummary.averageReviewCount,
      new_this_run: params.competitorSummary.newThisRun,
      closed_this_run: params.competitorSummary.closedThisRun,
    },
    past_recommendations: params.pastRecommendations
      .slice(0, MAX_PAST_RECOMMENDATIONS)
      .map((rec) => ({
        title: clip(rec.title),
        status: rec.status,
        proposed_at: rec.proposedAt,
      })),
    data_notes: params.dataNotes.map(clip),
  };
}
