#!/usr/bin/env python3
"""スクリーンショットを画素で測る。**目で見た印象を点にしない**ための道具。

  ・白飛び   … 3D が文字を邪魔していないか（基準 D2）
  ・暗すぎ   … 「夜」と「見えない」は別（絵が読めているか）
  ・画面の差 … 画面ごとに違う場所に見えるか（基準 D1）

    python3 ios/Tools/pixels.py /tmp/delvers-shots
"""
import sys
import pathlib
from PIL import Image


def stats(path: pathlib.Path):
    im = Image.open(path).convert("RGB")
    # 上から 45%（3D が主に映る帯）だけを見る。下は板と文字なので、
    # そこまで混ぜると「板が明るい」と「3D が白飛び」の区別がつかなくなる
    w, h = im.size
    band = im.crop((0, int(h * 0.06), w, int(h * 0.50)))
    px = list(band.getdata())
    n = len(px)
    blown = sum(1 for r, g, b in px if r > 245 and g > 245 and b > 245)
    bright = sum(1 for r, g, b in px if (r + g + b) / 3 > 200)
    dark = sum(1 for r, g, b in px if (r + g + b) / 3 < 12)
    mean = sum((r + g + b) / 3 for r, g, b in px) / n
    return {
        "blown": blown / n,
        "bright": bright / n,
        "dark": dark / n,
        "mean": mean,
    }


def signature(path: pathlib.Path, band: bool):
    """画面どうしが見分けられるかを測るための粗い指紋（8x8 の明度）。

    **画面全体と、3D の帯だけの2通りで取る。**
    板と行の並びは画面をまたいで**わざと**同じ形にしてあるので、
    画面全体だけで測ると「作りが揃っている」ことが「同じ場所に見える」
    として減点されてしまう。実際、所持品と錬金工房は全体では 10.9 しか
    離れていないのに、帯だけなら 18.2 離れている——並べて見れば
    一覧と大鍋を取り違える人はいない。どちらかで離れていれば見分けられる。
    """
    im = Image.open(path).convert("L")
    if band:
        w, h = im.size
        im = im.crop((0, int(h * 0.06), w, int(h * 0.50)))
    return list(im.resize((8, 8)).getdata())


def main():
    d = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/delvers-shots")
    # **数える画面を名指しする。** glob だと、あとで切り出した画像や
    # 縮小した画像まで「画面」として採点表に混ざる（実際に混ざった）
    names = ["title", "base", "dispatch", "inventory", "opening",
             "garden", "alchemy", "compendium", "report", "away"]
    shots = [d / f"{n}.png" for n in names if (d / f"{n}.png").exists()]
    print(f"{'画面':<12} {'白飛び':>7} {'明るい':>7} {'真っ暗':>7} {'平均輝度':>8}   判定")
    sigs = {}
    worst = []
    for p in shots:
        s = stats(p)
        sigs[p.stem] = (signature(p, False), signature(p, True))
        flags = []
        if s["blown"] > 0.03:
            flags.append("白飛び")
        if s["dark"] > 0.72:
            flags.append("暗すぎ")
        if s["bright"] > 0.30:
            flags.append("明るすぎ")
        print(f"{p.stem:<12} {s['blown']*100:6.2f}% {s['bright']*100:6.2f}% "
              f"{s['dark']*100:6.2f}% {s['mean']:8.1f}   {'／'.join(flags) or 'ok'}")
        if flags:
            worst.append((p.stem, flags))

    # 画面どうしの違い。似すぎていると「どこも同じ場所」に見える
    # 派遣中の拠点（away）は**拠点と同じ場所**。D1（違う場所に見えるか）で
    # 比べる相手ではない。同じ組を D3（状態が光で伝わるか）では逆向きに使う——
    # あちらは「十分に違って見えなければならない」。
    if "base" in sigs and "away" in sigs:
        w = sum(abs(x - y) for x, y in zip(sigs["base"][0], sigs["away"][0])) / 64
        b = sum(abs(x - y) for x, y in zip(sigs["base"][1], sigs["away"][1])) / 64
        ok = b >= 4.0
        print(f"\n派遣中の見え方（D3）  拠点 × 派遣中  全体 {w:.1f} / 3Dの帯 {b:.1f}"
              f"   {'ok' if ok else '← 変化が弱い（3Dの帯で 4.0 以上ほしい）'}")

    print("\n画面どうしの見分け（8x8 明度の平均差。小さいほど似ている）")
    names = [n for n in sigs if n != "away"]
    pairs = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            whole = sum(abs(x - y) for x, y in zip(sigs[a][0], sigs[b][0])) / 64
            band = sum(abs(x - y) for x, y in zip(sigs[a][1], sigs[b][1])) / 64
            pairs.append((max(whole, band), whole, band, a, b))
    pairs.sort()
    for best, whole, band, a, b in pairs[:4]:
        mark = "  ← 似すぎ" if best < 12 else ""
        print(f"  {a:<11} × {b:<11} 全体 {whole:5.1f} / 3Dの帯 {band:5.1f}{mark}")

    print()
    if worst:
        print("直すもの:")
        for name, flags in worst:
            print(f"  {name}: {'／'.join(flags)}")
    else:
        print("画素の判定はすべて ok")


if __name__ == "__main__":
    main()
