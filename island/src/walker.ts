// 歩き回るためのカメラ。ゴールも競争も無いので、操作は移動と見回すだけ。

import * as THREE from 'three';
import { sampleHeight, type Field } from './heightfield';

export type ViewName = 'beach' | 'overlook' | 'shallows' | 'reef';

/** 決め打ちの視点。批評用のスクリーンショットもここを基準に撮る。 */
export const VIEWS: Record<ViewName, {
  pos: [number, number, number]; yaw: number; pitch: number; fov: number;
  /** 目線の高さ（省略時 1.68m）。岬の岩の上に立つ視点だけ高くしている */
  eye?: number;
}> = {
  // 砂浜に立って湾の外を見る。参考画像1枚目の構図
  // 汀線の 8m ほど手前に立ち、浜に沿って斜め沖を見る。
  // 目線 1.72m だと水面は猛烈に圧縮されるので、水平線が画面の 45% に来る
  // ように俯角をごく浅く（-2.7°）取って、湾の水面を画面の帯として見せる。
  beach: { pos: [-45.90, 1.72, 86.80], yaw: -0.34, pitch: -0.050, fov: 55 },
  // 右の岬の中腹から湾を見下ろす。参考画像2・4枚目の構図
  overlook: { pos: [256, 32.0, 26], yaw: 1.325, pitch: -0.205, fov: 58, eye: 10.5 },
  // 波打ち際。砂と泡と浅瀬だけが見える
  shallows: { pos: [4, 1.55, 80], yaw: -0.20, pitch: -0.26, fov: 58 },
  // リーフ縁の白波を沖から見る
  reef: { pos: [-40, 2.4, 20], yaw: 3.05, pitch: -0.03, fov: 55 }
};

export class Walker {
  yaw = 0;
  pitch = 0;
  eyeHeight = 1.68;
  readonly pos = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private moveTouch: { id: number; x: number; y: number; dx: number; dy: number } | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly field: Field) {}

  applyView(name: ViewName): void {
    const v = VIEWS[name];
    this.pos.set(v.pos[0], v.pos[1], v.pos[2]);
    this.yaw = v.yaw;
    this.pitch = v.pitch;
    this.eyeHeight = v.eye ?? 1.68;
    this.camera.fov = v.fov;
    this.camera.updateProjectionMatrix();
    this.sync();
  }

  attach(el: HTMLElement): void {
    window.addEventListener('keydown', e => {
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));

    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.4) {
        this.moveTouch = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
        return;
      }
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (this.moveTouch && e.pointerId === this.moveTouch.id) {
        this.moveTouch.dx = (e.clientX - this.moveTouch.x) / 60;
        this.moveTouch.dy = (e.clientY - this.moveTouch.y) / 60;
        return;
      }
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.lastX) * 0.0032;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.lastY) * 0.0032, -1.35, 1.15);
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (this.moveTouch && e.pointerId === this.moveTouch.id) this.moveTouch = null;
      this.dragging = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  update(dt: number): void {
    let fwd = 0, side = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) fwd += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) fwd -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) side += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) side -= 1;
    if (this.moveTouch) {
      fwd -= THREE.MathUtils.clamp(this.moveTouch.dy, -1, 1);
      side += THREE.MathUtils.clamp(this.moveTouch.dx, -1, 1);
    }

    const speed = (this.keys.has('shift') ? 16 : 5.2) * dt;
    if (fwd !== 0 || side !== 0) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const nx = (-sin * fwd + cos * side);
      const nz = (-cos * fwd - sin * side);
      const len = Math.hypot(nx, nz) || 1;
      const step = new THREE.Vector3(this.pos.x + (nx / len) * speed, 0, this.pos.z + (nz / len) * speed);
      // 腰より深いところへは行かない
      const gh = sampleHeight(this.field, step.x, step.z);
      if (gh > -1.15) { this.pos.x = step.x; this.pos.z = step.z; }
    }

    const ground = sampleHeight(this.field, this.pos.x, this.pos.z);
    const eye = Math.max(ground, 0) + this.eyeHeight;
    this.pos.y += (eye - this.pos.y) * Math.min(1, dt * 9);
    this.sync();
  }

  private sync(): void {
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }
}
