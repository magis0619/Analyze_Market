// 静的検査（仕様書 §11.3）:
//  C2:  src/sim/ と src/data/ に Math.random が混入していないか（1件でも不合格）
//  C6:  src/sim/ が Canvas / DOM / render / ui を import していないか
//  C9:  回復アフィックスが武器側に無いか（データ定義の検査）
//  C11: 破棄したはずの v1(OUTFITTER) コードが残存していないか
//  補助: imageSmoothingEnabled = true を書いていないか（§9.3）
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
let failures = 0;
function fail(msg) { console.error(msg); failures++; }

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const simFiles = walk(join(root, 'src/sim'));
const dataFiles = walk(join(root, 'src/data'));
const allSrc = walk(join(root, 'src'));

/**
 * コメントを取り除いた本文を返す。
 * 検査対象は「実際に実行されるコード」であって、禁止事項を説明した
 * コメントまで拾ってしまうと誤検出になるため。
 */
function codeOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

// ---------------------------------------------------------------- C2 / C6
for (const f of [...simFiles, ...dataFiles]) {
  const src = codeOf(f);
  if (/Math\.random/.test(src)) fail(`[C2] FAIL: 非決定的な乱数が ${f} にある`);
  if (/import[^;]*from\s+['"][^'"]*(render|\bui\b|canvas)[^'"]*['"]/.test(src)) {
    fail(`[C6] FAIL: 描画層への import が ${f} にある`);
  }
  if (/\b(document|window|localStorage|HTMLCanvasElement|CanvasRenderingContext2D)\b/.test(src)) {
    fail(`[C6] FAIL: DOM/Canvas 参照が ${f} にある`);
  }
  // 実時間そのものへの依存も禁止（時刻は必ず注入する。C4/C5 の前提）
  if (/Date\.now\(\)|new Date\(/.test(src)) {
    fail(`[C4/C5] FAIL: 実時計への直接依存が ${f} にある（時刻は引数で注入すること）`);
  }
}

// ---------------------------------------------------------------- C9
{
  const affixSrc = readFileSync(join(root, 'src/data/affixes.ts'), 'utf8');
  const weaponBlock = (affixSrc.split('--- 防具用')[0] ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  if (/killHeal/.test(weaponBlock)) {
    fail('[C9] FAIL: 回復アフィックスが武器側の定義に含まれている');
  }
}

// ---------------------------------------------------------------- C11
// §1.2 で破棄した v1 の資産が残っていないか。コメント内の言及は除外するため、
// 実体（識別子・ファイル）の存在を見る。
const bannedFiles = [
  'src/ui/negotiation.ts', 'src/ui/sendoff.ts', 'src/ui/spectate.ts',
  'src/game/shop.ts', 'src/game/estimate.ts',
  'src/data/personalities.ts', 'src/data/adventurers.ts',
  'src/data/equipment.ts', 'src/data/loot.ts',
  'src/sim/simulate.ts'
];
for (const rel of bannedFiles) {
  if (existsSync(join(root, rel))) fail(`[C11] FAIL: 破棄対象のファイルが残っている: ${rel}`);
}

const bannedIdents = [
  'weightLimit', 'isOverweight', 'totalWeight',   // 重量ルール・重装判定
  'PERSONALITIES', 'personalityDef',              // 性格3種
  'RegularState', 'createRegular', 'questDepthFor', // 常連・系譜・世代交代
  'estimateTilt',                                  // 見送りの天秤
  'OfferedOption', 'PendingChoice'                 // 観戦中の選択UI
];
for (const f of allSrc) {
  const body = codeOf(f);
  for (const id of bannedIdents) {
    if (new RegExp(`\\b${id}\\b`).test(body)) {
      fail(`[C11] FAIL: 破棄対象の識別子 ${id} が ${f} に残っている`);
    }
  }
}

// ---------------------------------------------------------------- §9.3
for (const f of allSrc) {
  const src = codeOf(f);
  if (/imageSmoothingEnabled\s*=\s*true/.test(src)) {
    fail(`[§9.3] FAIL: imageSmoothingEnabled=true が ${f} にある`);
  }
}

// ---------------------------------------------------------------- §9.3 色数
// 「同時に使う色は32色まで」。数え上げを人任せにすると必ず膨らむので、
// (1) パレットの定義が32色以内か、(2) パレットの外で色リテラルを
// 書いていないか、の2点を機械的に見る。
{
  const palettePath = join(root, 'src/render/palette.ts');
  const paletteSrc = readFileSync(palettePath, 'utf8');
  const colorsBlock = paletteSrc.slice(
    paletteSrc.indexOf('export const COLORS'),
    paletteSrc.indexOf('} as const;')
  );
  const defined = new Set((colorsBlock.match(/#[0-9a-fA-F]{6}/g) ?? []).map(c => c.toLowerCase()));
  if (defined.size === 0) fail('[§9.3] FAIL: COLORS から色を1つも読み取れなかった');
  if (defined.size > 32) {
    fail(`[§9.3] FAIL: パレットが ${defined.size} 色ある（上限32）`);
  }

  // パレット以外のファイルに直書きされた色。混色を生む rgba() も禁止する
  const stray = [];
  for (const f of allSrc) {
    if (f.endsWith('render/palette.ts')) continue;
    const body = codeOf(f);
    for (const lit of body.match(/#[0-9a-fA-F]{6}/g) ?? []) {
      if (!defined.has(lit.toLowerCase())) stray.push(`${lit} @ ${f}`);
    }
    if (/rgba\s*\(/.test(body)) {
      fail(`[§9.3] FAIL: rgba() による混色が ${f} にある（fillScrim を使うこと）`);
    }
  }
  if (stray.length > 0) {
    fail(`[§9.3] FAIL: パレット外の色が ${stray.length} 件ある\n  ${stray.join('\n  ')}`);
  }
  console.log(`  palette: ${defined.size} colors`);
}

// ---------------------------------------------------------------- §9.2 フォント
// ソースに書いた文字がビットマップアトラスに入っているか。
// 入っていない文字は画面で四角い箱になる（実際に「損」「触」「頼」が
// 箱になっていた）。文言を足したら node scripts/gen-font.mjs を回すこと。
{
  const fontData = readFileSync(join(root, 'src/render/fontdata.ts'), 'utf8');
  const covered = new Set();
  for (const m of fontData.matchAll(/chars: "((?:[^"\\]|\\.)*)"/g)) {
    for (const ch of JSON.parse(`"${m[1]}"`)) covered.add(ch);
  }
  if (covered.size === 0) fail('[§9.2] FAIL: フォントアトラスから収録文字を読み取れなかった');
  const missing = new Set();
  for (const f of allSrc) {
    if (f.endsWith('render/fontdata.ts')) continue;
    for (const ch of readFileSync(f, 'utf8')) {
      const code = ch.codePointAt(0);
      if (code > 0x2000 && !covered.has(ch)) missing.add(ch);
    }
  }
  if (missing.size > 0) {
    fail(`[§9.2] FAIL: アトラスに無い文字が ${missing.size} 種ある: ${[...missing].join('')}\n`
      + '       node scripts/gen-font.mjs を実行して再生成すること');
  }
}

if (failures > 0) {
  console.error(`static checks: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`static checks: OK (sim: ${simFiles.length}, data: ${dataFiles.length}, src: ${allSrc.length})`);
