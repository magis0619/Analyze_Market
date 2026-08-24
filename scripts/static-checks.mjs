// 静的検査:
//  C2: src/sim/ に Math.random が混入していないか（1件でも不合格）
//  C5: src/sim/ が Canvas / DOM / render / ui を import していないか
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
let failures = 0;

function walk(dir) {
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

for (const f of [...simFiles, ...dataFiles]) {
  const src = readFileSync(f, 'utf8');
  if (/Math\.random/.test(src)) {
    console.error(`[C2] FAIL: Math.random in ${f}`);
    failures++;
  }
  const badImport = /import[^;]*from\s+['"][^'"]*(render|\bui\b|canvas)[^'"]*['"]/;
  if (badImport.test(src)) {
    console.error(`[C5] FAIL: forbidden import in ${f}`);
    failures++;
  }
  if (/\b(document|window|HTMLCanvasElement|CanvasRenderingContext2D)\b/.test(src)) {
    console.error(`[C5] FAIL: DOM/Canvas reference in ${f}`);
    failures++;
  }
}

// 全体: imageSmoothingEnabled = true を書いていないか（C1系の事故防止）
for (const f of walk(join(root, 'src'))) {
  const src = readFileSync(f, 'utf8');
  if (/imageSmoothingEnabled\s*=\s*true/.test(src)) {
    console.error(`[C1] FAIL: imageSmoothingEnabled=true in ${f}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`static checks: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`static checks: OK (sim files: ${simFiles.length}, data files: ${dataFiles.length})`);
