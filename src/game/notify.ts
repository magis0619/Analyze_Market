// 帰還時のローカル通知（仕様書 §7.2「帰還時にローカル通知を送る」）。
//
// ネイティブの通知チャネルは無いので Web の Notification API を使う。
// 許可は「初めて派遣を出した瞬間」にだけ求める。起動直後に求めると
// 何のための許可か分からず、まず拒否されるため。
// 許可が無い／API が無い環境でも、ゲーム進行には一切影響させないこと。

const ASKED_KEY = 'delvers.notify.asked';

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 通知を出せる状態か（許可済みか）。 */
export function notifyGranted(): boolean {
  return supported() && Notification.permission === 'granted';
}

/** 許可を一度だけ求める。すでに求めた／拒否された場合は何もしない。 */
export function requestNotifyPermission(): void {
  if (!supported()) return;
  if (Notification.permission !== 'default') return;
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // localStorage が使えなくても許可要求自体は試す
  }
  try {
    void Notification.requestPermission();
  } catch {
    // 古い実装は Promise を返さない。失敗しても無視する
  }
}

/**
 * 帰還を知らせる。
 * 画面を見ている最中に通知を出すと二重に知らせることになるので、
 * タブが隠れているときだけ出す。
 */
export function notifyReturn(jobName: string, stageName: string, outcome: string): void {
  if (!notifyGranted()) return;
  if (typeof document !== 'undefined' && !document.hidden) return;
  try {
    new Notification('DELVERS', {
      body: `${jobName}が${stageName}から帰還した（${outcome}）`,
      tag: 'delvers-return',
      silent: false
    });
  } catch {
    // 通知が出せなくても進行は止めない
  }
}
