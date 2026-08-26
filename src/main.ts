import './ui2/tokens.css';
import { GameState, debugLoot } from './game/state';
import { Shell } from './ui2/shell';
import { titleScreen } from './ui2/screens/title';
import { baseScreen } from './ui2/screens/base';
import { dispatchScreen } from './ui2/screens/dispatch';
import { reportScreen } from './ui2/screens/report';
import { openingScreen } from './ui2/screens/opening';
import { inventoryScreen } from './ui2/screens/inventory';
import { compendiumScreen } from './ui2/screens/compendium';
import { modelbookScreen } from './ui2/screens/modelbook';
import { gardenScreen } from './ui2/screens/garden';
import { alchemyScreen } from './ui2/screens/alchemy';
import { thumbCount } from './world/thumbs';

// 入口。
//
// World層（three.js）と Interface層（DOM）を Shell が束ねる。
// 画面はどれも「HTMLを返す」「イベントを受ける」「毎フレーム更新する」の3つだけ。
//
// URLパラメータ（開発用）:
//   ?reset=1        セーブを消して始める
//   ?seed=<16進>    乱数の種を固定する
//   ?s=base         タイトルを飛ばして拠点から
//   ?devitems=<n>   所持品を水増しする（一覧の性能確認用）
//   ?timescale=<n>  時間を早送りする（帰還を待たずに確かめる用）
//   ?models=1       装備モデルの見本帳（9ベース×4レア×5属性を切り替えて見る）

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed = seedParam !== null ? (parseInt(seedParam, 16) >>> 0) : (Date.now() >>> 0);

if (params.get('reset') === '1') {
  try { localStorage.removeItem('delvers.save.v1'); } catch { /* 続行 */ }
}

const state = new GameState(seed, Date.now());

const devItems = parseInt(params.get('devitems') ?? '0', 10);
if (Number.isFinite(devItems) && devItems > 0) {
  for (let i = 0; i < Math.min(2000, devItems); i++) {
    const stageId = 1 + (i % 10);
    state.data.inventory.push(...debugLoot(seed ^ (i * 7919), stageId, 2)
      .map((it, k) => ({ ...it, id: `dev-${i}-${k}`, identified: true })));
  }
  state.data.gold += 50000;
  state.save();
}

const root = document.getElementById('app');
if (!root) throw new Error('#app が無い');

const shell = new Shell(root, state, {
  title: titleScreen,
  base: baseScreen,
  dispatch: dispatchScreen,
  inventory: inventoryScreen,
  compendium: compendiumScreen,
  garden: gardenScreen,
  alchemy: alchemyScreen,
  opening: openingScreen,
  report: reportScreen
}, params.get('s') === 'base' ? 'base' : 'title');

// 装備モデルの下見（開発用）。遊びの画面への近道ではないので、
// 通常の遷移からは辿り着けない場所に置く
if (params.get('models') === '1') {
  shell.mountAdHoc('modelbook', modelbookScreen(shell));
}

const ts = parseFloat(params.get('timescale') ?? '1');
shell.timeScale = Number.isFinite(ts) && ts >= 1 ? Math.min(20000, ts) : 1;

(window as unknown as { __delvers: unknown }).__delvers = { shell, state, thumbCount };
