// 時刻・天候と、それらから決まる共有ユニフォーム。
// 空／水／地形／植生のマテリアルはすべて同じユニフォーム実体を参照する。

import * as THREE from 'three';

const LAT = 0.62;   // 観測地の緯度っぽい定数（約35°）
const DECL = 0.15;  // 太陽赤緯。少し夏寄り

export type EnvUniforms = Record<string, THREE.IUniform>;

/** sRGB の 16進 → THREE.Color（線形変換はシェーダ側でやるので生値のまま渡す） */
function srgb(hex: number): THREE.Color {
  const c = new THREE.Color();
  c.setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  return c;
}

/** sRGB 値を線形に直したベクトル（シェーダで直接使う色用） */
function lin(hex: number): THREE.Color {
  const c = srgb(hex);
  return new THREE.Color(Math.pow(c.r, 2.2), Math.pow(c.g, 2.2), Math.pow(c.b, 2.2));
}

export class Env {
  /** 0..24 */
  time = 11.5;
  /** 0=快晴 1=曇天 */
  weather = 0;
  /** 経過秒（波・雲のアニメーション用） */
  clock = 0;

  /**
   * 到着の度合い 0..1。指示書の「到着の演出」と「終わり方も設計する」。
   * 起動直後は 0 から始めてゆっくり満ち、画面から離れると静かに引く。
   * 何かを達成して上がる値ではないので、UI には一切出さない。
   */
  arrive = 0;
  /** 目標値。1 = 居る、0 = 離れた */
  arriveTarget = 1;
  /** 満ちるのは遅く、引くのはそれより少し速い（帰り道は短い） */
  private static readonly ARRIVE_IN = 6.5;
  private static readonly ARRIVE_OUT = 2.8;

  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();

  readonly uniforms: EnvUniforms = {
    uTime: { value: 0 },
    uCloudTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uSunElev: { value: 1 },
    uDay: { value: 1 },
    uCamPos: { value: new THREE.Vector3() },

    // --- 空のパレット（参考画像の実測値に合わせてある）---
    uZenith: { value: lin(0x0250cc).clone() },
    uSkyMid: { value: lin(0x0473e0).clone() },
    uHorizon: { value: lin(0xa9cff2).clone() },
    uNightZenith: { value: lin(0x030a1e).clone() },
    uNightHorizon: { value: lin(0x102a4d).clone() },
    uTwilightCol: { value: lin(0xf09a52).clone() },
    uSunGlow: { value: lin(0xfff0cf).clone() },
    uSunColor: { value: lin(0xfff6e2).clone() },
    uMoonColor: { value: lin(0xd8e6ff).clone() },

    uWeather: { value: 0 },
    uPixelRatio: { value: 1 },
    // 0 = オフィスの残響 / 1 = 島に着いた状態
    uArrive: { value: 0 },
    uCloudCover: { value: 0.22 },
    uFogDensity: { value: 0.00062 },

    // --- 水 ---
    // 吸光係数(1/m)。赤から先に失われるので、深いほど青緑に寄る
    uExtinction: { value: new THREE.Vector3(4.20, 0.175, 0.058) },
    // 散乱係数。深海の色は結局 scatter/(2*extinction) に収束する
    uScatterCoef: { value: new THREE.Vector3(0.0012, 0.011, 0.020) },
    uSunLight: { value: new THREE.Color(1, 1, 1) },
    uAmbLight: { value: new THREE.Color(0.4, 0.5, 0.6) },
    // 主光源。昼は太陽、夜は月。空の描画は uSunDir / uMoonDir をそのまま使い、
    // 地形・水・植生の陰影だけがこちらを見る。
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyLight: { value: new THREE.Color(1, 1, 1) },

    // --- 波（Gerstner: 方向x, 方向z, 波長, 尖り）---
    uWaveAmp: { value: 1.0 },
    uWave0: { value: new THREE.Vector4(0.10, 1.00, 38.0, 0.055) },
    uWave1: { value: new THREE.Vector4(-0.35, 1.00, 22.0, 0.045) },
    uWave2: { value: new THREE.Vector4(0.55, 1.00, 12.5, 0.032) },
    uWave3: { value: new THREE.Vector4(-0.80, 0.60, 7.0, 0.022) }
  };

  update(dt: number): void {
    this.clock += dt;
    const u = this.uniforms;

    // 到着／退出。ease-in-out で、始まりと終わりに角が立たないようにする
    const rate = this.arriveTarget > this.arrive ? Env.ARRIVE_IN : Env.ARRIVE_OUT;
    const step = dt / rate;
    if (this.arrive < this.arriveTarget) this.arrive = Math.min(this.arriveTarget, this.arrive + step);
    else if (this.arrive > this.arriveTarget) this.arrive = Math.max(this.arriveTarget, this.arrive - step);
    const a = this.arrive;
    u.uArrive!.value = a * a * (3 - 2 * a);
    u.uTime!.value = this.clock;
    u.uCloudTime!.value = this.clock;

    // --- 太陽 ---
    // 観測者座標 (東, 上, 北) で求めてから、世界座標 (+X=東, +Y=上, +Z=南) に写す
    const H = ((this.time - 12) / 12) * Math.PI;
    const e = -Math.cos(DECL) * Math.sin(H);
    const up = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
    const n = Math.cos(LAT) * Math.sin(DECL) - Math.sin(LAT) * Math.cos(DECL) * Math.cos(H);
    this.sunDir.set(e, up, -n).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    // 月は太陽の真裏だと満月固定になるので少しずらす
    this.moonDir.applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.35).normalize();

    (u.uSunDir!.value as THREE.Vector3).copy(this.sunDir);
    (u.uMoonDir!.value as THREE.Vector3).copy(this.moonDir);
    u.uSunElev!.value = this.sunDir.y;

    const day = THREE.MathUtils.smoothstep(this.sunDir.y, -0.18, 0.10);
    u.uDay!.value = day;
    u.uWeather!.value = this.weather;
    u.uCloudCover!.value = 0.22 + this.weather * 0.66;
    u.uFogDensity!.value = 0.00060 + this.weather * 0.0022;

    // 直射光。真昼に「白砂 × 直射」がちょうど飽和しない強さに合わせてある
    // （トーンマッピングを使わない分、ここの絶対値が画面の露出そのものになる）
    const alt = Math.max(this.sunDir.y, 0);
    const warm = Math.pow(1 - alt, 3);
    const sl = u.uSunLight!.value as THREE.Color;
    sl.setRGB(0.95, 0.95 - 0.22 * warm, 0.95 - 0.44 * warm);
    const strength = THREE.MathUtils.smoothstep(this.sunDir.y, -0.10, 0.26) * (1 - this.weather * 0.72);
    sl.multiplyScalar(0.97 * strength);

    // 環境光: 空全体からの回り込み
    const al = u.uAmbLight!.value as THREE.Color;
    const nightAmb = 0.040;
    al.setRGB(0.30, 0.40, 0.58).multiplyScalar(nightAmb + (0.47 - nightAmb) * day * (1 - this.weather * 0.30));

    // 主光源の切り替え。太陽が沈みきったら月に渡す
    const kd = u.uKeyDir!.value as THREE.Vector3;
    const kl = u.uKeyLight!.value as THREE.Color;
    if (day < 0.05 && this.moonDir.y > 0.02) {
      kd.copy(this.moonDir);
      const m = THREE.MathUtils.smoothstep(this.moonDir.y, 0.0, 0.35);
      kl.setRGB(0.68, 0.76, 1.0).multiplyScalar(0.085 * m * (1 - this.weather * 0.85));
    } else {
      kd.copy(this.sunDir);
      kl.copy(sl);
    }
  }
}
