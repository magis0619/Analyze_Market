// ビットマップフォントのアトラスを生成して src/render/fontdata.ts に書き出す。
//
// なぜ生成するのか:
// システムフォントを実行時に描いて2値化する方式は、端末に何のフォントが
// 入っているかで見え方が変わる（同じコードでも別物になる）。仕様書 §9.2 は
// 「ビットマップフォント。TrueType のアンチエイリアス表示は禁止」と定めており、
// 1bit のグリフを自前で持つのが本来の姿。ここでビルド時に固めてしまう。
//
// 使い方: node scripts/gen-font.mjs   （dev サーバ不要）
import { chromium } from 'playwright';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

// ---------------------------------------------------------------- 収集
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const chars = new Set();
// ASCII の印字可能文字は全部入れる（数値表示・英字ラベル用）
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
// ひらがな・カタカナは全部入れる（動的に組む文字列でも欠けないように）
for (let c = 0x3040; c <= 0x30ff; c++) chars.add(String.fromCharCode(c));
// よく使う記号
for (const c of '　、。・ー〜…！？（）「」『』【】／＋－±×÷％★☆◎○●▲▼◀▶←→↑↓⚠♪℃§±') chars.add(c);
// 全角英数（見出しで使う可能性）
for (let c = 0xff01; c <= 0xff5e; c++) chars.add(String.fromCharCode(c));

// ソースに現れる文字（漢字はここから拾う）
for (const f of walk(join(root, 'src'))) {
  for (const ch of readFileSync(f, 'utf8')) {
    const code = ch.codePointAt(0);
    if (code > 0x2000) chars.add(ch);
  }
}

const list = [...chars].filter(c => c.codePointAt(0) >= 0x20).sort();
console.log(`glyphs: ${list.length}`);

// ---------------------------------------------------------------- 数字の差し替え
//
// 数字だけはシステムフォントの2値化に任せない。
// 12px セルの半角（6px幅）に落とすと 0 と 6、1 と l の判別が1倍では厳しく、
// 批評で実際に「106」を「186」と誤読された。ここだけ手で点を打つ。
// 0 は斜線を渡さず、内側に短い対角を1本入れて 8 と分ける。

const DIGITS_5x7 = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..']
};

const DIGITS_6x9 = {
  '0': ['.####.', '#....#', '#...##', '#..#.#', '#..#.#', '#.#..#', '##...#', '#....#', '.####.'],
  '1': ['..##..', '.###..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  '2': ['.####.', '#....#', '.....#', '....#.', '...#..', '..#...', '.#....', '#.....', '######'],
  '3': ['#####.', '.....#', '.....#', '.####.', '.....#', '.....#', '.....#', '#....#', '.####.'],
  '4': ['....#.', '...##.', '..#.#.', '.#..#.', '#...#.', '######', '....#.', '....#.', '....#.'],
  '5': ['######', '#.....', '#.....', '#####.', '.....#', '.....#', '.....#', '#....#', '.####.'],
  '6': ['..###.', '.#....', '#.....', '#####.', '#....#', '#....#', '#....#', '#....#', '.####.'],
  '7': ['######', '.....#', '....#.', '....#.', '...#..', '...#..', '..#...', '..#...', '..#...'],
  '8': ['.####.', '#....#', '#....#', '.####.', '#....#', '#....#', '#....#', '#....#', '.####.'],
  '9': ['.####.', '#....#', '#....#', '#....#', '.#####', '.....#', '....#.', '...#..', '.###..']
};

/** 手打ちの点を、そのサイズのセルに収めた1bit列（行優先・幅 w）にする。 */
function digitBits(ch, size) {
  const art = size >= 16 ? DIGITS_6x9[ch] : DIGITS_5x7[ch];
  if (!art) return null;
  const w = Math.floor(size / 2);
  const gw = art[0].length;
  const gh = art.length;
  const ox = Math.floor((w - gw) / 2);
  const oy = Math.floor((size - gh) / 2) + (size >= 16 ? 1 : 1);
  const bits = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < w; x++) {
      const ay = y - oy, ax = x - ox;
      const on = ay >= 0 && ay < gh && ax >= 0 && ax < gw && art[ay][ax] === '#';
      bits.push(on ? 1 : 0);
    }
  }
  return { w, bits };
}

// ---------------------------------------------------------------- 描画
const SIZES = [12, 16];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<canvas id="c" width="64" height="64"></canvas>');

const result = await page.evaluate(({ list, SIZES }) => {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const out = {};
  for (const size of SIZES) {
    const box = size;               // グリフの高さ = セル高
    const glyphs = [];
    ctx.font = `${size}px 'IPAGothic','Noto Sans CJK JP','Hiragino Kaku Gothic ProN',sans-serif`;
    for (const ch of list) {
      ctx.clearRect(0, 0, 64, 64);
      ctx.font = `${size}px 'IPAGothic','Noto Sans CJK JP','Hiragino Kaku Gothic ProN',sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff';
      ctx.fillText(ch, 0, 0);
      const adv = Math.round(ctx.measureText(ch).width);
      const w = Math.max(1, Math.min(box * 2, adv));
      const img = ctx.getImageData(0, 0, box * 2, box + 4);
      // 1bit へ。行ごとに w ビット
      const bits = [];
      for (let y = 0; y < box; y++) {
        for (let x = 0; x < w; x++) {
          const a = img.data[(y * box * 2 + x) * 4 + 3];
          bits.push(a >= 110 ? 1 : 0);
        }
      }
      glyphs.push({ ch, w, bits });
    }
    out[size] = glyphs;
  }
  return out;
}, { list, SIZES });

await browser.close();

// 数字だけを手打ちの点で上書きする（ブラウザ内では使えないのでここで差し替える）
let patched = 0;
for (const size of SIZES) {
  const gs = result[size];
  if (!gs) continue;
  for (const g of gs) {
    const d = digitBits(g.ch, size);
    if (!d) continue;
    g.w = d.w;
    g.bits = d.bits;
    patched++;
  }
}
console.log(`digits patched: ${patched}`);

// ---------------------------------------------------------------- 書き出し
function packBits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return Buffer.from(bytes).toString('base64');
}

let ts = `// 自動生成。手で編集しないこと（生成: node scripts/gen-font.mjs）。
//
// 1bit のビットマップグリフ。実行時にシステムフォントを描いて2値化するのではなく、
// ここに固めた点データを展開して描く。どの端末でも同じドットになる（仕様書 §9.2）。
//
// 形式: サイズごとに「文字の並び」「各文字の幅」「行優先で詰めた1bitの点」。

export interface GlyphAtlas {
  /** セルの高さ = フォントサイズ */
  size: number;
  /** 収録文字を連結したもの */
  chars: string;
  /** 各文字の送り幅 */
  widths: number[];
  /** 各文字のビット列（base64, 行優先, 幅×高さビット） */
  data: string[];
}

export const ATLASES: GlyphAtlas[] = [
`;
for (const size of SIZES) {
  const glyphs = result[size];
  ts += `  {\n    size: ${size},\n`;
  ts += `    chars: ${JSON.stringify(glyphs.map(g => g.ch).join(''))},\n`;
  ts += `    widths: [${glyphs.map(g => g.w).join(',')}],\n`;
  ts += `    data: [\n`;
  for (const g of glyphs) ts += `      '${packBits(g.bits)}',\n`;
  ts += `    ]\n  },\n`;
}
ts += `];\n`;

writeFileSync(join(root, 'src/render/fontdata.ts'), ts);
console.log(`wrote src/render/fontdata.ts (${(ts.length / 1024).toFixed(0)} KB)`);
