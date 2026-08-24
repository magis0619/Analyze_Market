import type { PersonalityId } from '../sim/types';

export interface PersonalityDef {
  id: PersonalityId;
  name: string;
  /** 観戦フェーズでの効果（客カード開示用の説明文） */
  effect: string;
  /** 質問への回答で性格を匂わせる一言 */
  tell: { style: string; nearDeath: string; want: string };
}

// 性格3種（仕様 §3.2）— プレイヤーの選択を制限する装置。
export const PERSONALITIES: readonly PersonalityDef[] = [
  {
    id: 'timid', name: '臆病',
    effect: '深度5以降、HPが半分を切ると自動で撤退する',
    tell: {
      style: '「深追いはしない主義だ。危なくなったらすぐ戻る」',
      nearDeath: '「傷が浅いうちに逃げた。だから生きてる」',
      want: '「命あっての物種さ。確実に持ち帰れる物がいい」'
    }
  },
  {
    id: 'greedy', name: '強欲',
    effect: '鉱脈を見つけると必ず掘る。時間を消費する',
    tell: {
      style: '「稼げる戦いしかしない。光る石には目がなくてね」',
      nearDeath: '「鉱脈に夢中で、時間を忘れて掘りすぎた」',
      want: '「金になる鉱石だ。見つけたら全部掘る」'
    }
  },
  {
    id: 'hasty', name: '短気',
    effect: '「逃げる」の選択肢が選べない',
    tell: {
      style: '「背中を見せるのは性に合わない。全部叩き斬る」',
      nearDeath: '「引き際を間違えた。だが逃げるよりマシだ」',
      want: '「強敵の証だ。逃げた奴には手に入らない」'
    }
  }
] as const;

export function personalityDef(id: PersonalityId): PersonalityDef {
  const def = PERSONALITIES.find(p => p.id === id);
  if (!def) throw new Error(`unknown personality: ${id}`);
  return def;
}
