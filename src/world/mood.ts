// World層に渡す「気分」の型と、両層の合意事項（docs/UI-SPEC.md §6.6）。
//
// scenes.ts から切り出してある。ここは three.js に依存しないので、
// **画面もテストも import できる**——属性の並びは 3D の見た目を決める
// 合意事項なので、ブラウザを立ち上げずに固定できることに意味がある。

/**
 * 画面ごとの「気分」（改善指示書 §3）。
 *
 * 3D 側は画面の**状態**にも反応する。派遣先を選び直せば入口の色が変わるし、
 * 誰かが潜っていれば拠点の灯りが変わる。文字は一切持たないまま、
 * 「今どうなっているか」を光と密度で言う。
 *
 * 画面が three.js に触らずに済むよう、渡すのは**数値だけ**にする。
 */
export interface Mood {
  /** 主となる色（派遣先の属性・レアリティなど） */
  accent?: number;
  /** 0〜1。深さ・強さ。塵の密度や光の強さに効く */
  intensity?: number;
  /** 0〜1。人の気配（拠点の灯り）。1 なら全員在宅 */
  presence?: number;
  /** 畑の中身。要素数がそのまま「開いている枠の数」になる */
  slots?: readonly PlotMood[];
  /** 次の枠を買えるか。買えるときだけ温室に「＋」が立つ */
  canExpand?: boolean;
}

/**
 * 畑1枠の状態。
 *
 * **ここも数値だけで喋る。** 薬草の ID を渡せば楽だが、そうすると
 * World層がゲームの語彙（`'ironleaf'`）を知ることになり、
 * 「光と形しか持たない層」という約束が崩れる。属性の**番号**だけ渡す。
 */
export interface PlotMood {
  /** 属性の番号（MOOD_ELEMENTS の添字）。-1 なら空き */
  kind: number;
  /** 育ち具合 0〜1 */
  ratio: number;
}

/**
 * Mood が運ぶ属性の並び。**両層の唯一の合意事項**。
 *
 * 添字で受け渡すので、並びが狂うと「火苔を植えたのに青い蕾が生える」
 * という壊れ方をする。しかも画面は普通に動いてしまうので気づけない。
 * 並び順に意味があることを試験で固定しておく
 * （test/run-tests.ts「薬草の見た目」）。
 */
export const MOOD_ELEMENTS = ['physical', 'fire', 'ice', 'lightning', 'poison'] as const;
export type MoodElement = typeof MOOD_ELEMENTS[number];

/** 属性名 → 番号。知らない名前は物理に寄せる（3Dが消えるよりは鈍く出るほうがよい） */
export function elementIndex(e: string): number {
  const i = MOOD_ELEMENTS.indexOf(e as MoodElement);
  return i < 0 ? 0 : i;
}
