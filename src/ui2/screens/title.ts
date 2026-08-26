import type { Nav, Screen } from '../shell';
import { actionBar, button, topBar } from '../components';
import { esc } from '../dom';

// タイトル（docs/UI-SPEC.md §2.1）。
// 起動直後に迷わせないため、選択肢は1つだけにする。

export function titleScreen(nav: Nav): Screen {
  const hasSave = nav.state.data.inventory.length > 2 || nav.state.data.clearedStages.length > 0;
  return {
    scene: 'base',
    render() {
      return `
${topBar({ title: '' })}
<div class="title-wrap">
  <div>
    <div class="logo en">DELVERS</div>
    <div class="sub">潜る者たち</div>
  </div>
</div>
${actionBar(button({
        label: hasSave ? 'つづきから' : 'はじめる',
        act: 'start', tier: 'primary', block: true, role: 'cta'
      }))}
<div class="seed">seed: ${esc(nav.state.data.seed.toString(16))}</div>`;
    },
    act(action) {
      if (action === 'start') nav.goBase();
    }
  };
}
