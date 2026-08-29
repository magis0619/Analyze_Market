#!/usr/bin/env python3
"""Swift 移植の**論理**を、ここで走らせて確かめる。

この環境には Swift のツールチェーンが無く（download.swift.org はプロキシに塞がれている）、
書いた Swift を一度もコンパイルできない。だからといって「たぶん合っている」で
渡すわけにはいかないので、次の形に分ける:

    ・**論理が合っているか** … ここで確かめる（このファイル）
    ・**Swift として通るか** … あなたの Xcode で確かめる（swift test）

やり方は「Swift のコードを Python へ機械的に写して、ゴールデンベクタに当てる」。
写す元は **swift/Sources/DelversCore/*.swift** であって TypeScript ではない。
TS から写したらこの検査は何も言っていないのと同じになる——
確かめたいのは「私が Swift に書き写すときに間違えなかったか」なので。

    python3 tools/verify-port.py

落ちたら、Swift 側の同じ行が間違っている。
"""
import json
import math
import pathlib
import sys

GOLDEN = pathlib.Path(__file__).parent.parent / "swift/Tests/DelversCoreTests/Resources/golden.json"

fails: list[str] = []
checks = 0


def eq(want, got, where):
    global checks
    checks += 1
    if want != got:
        fails.append(f"{where}: 期待 {want!r} / 実際 {got!r}")
        return False
    return True


# ---------------------------------------------------------------- Prng.swift

MASK = 0xFFFFFFFF


def _step(x: int) -> int:
    # x ^= x &<< 13
    x = (x ^ (x << 13)) & MASK
    # x ^= UInt32(bitPattern: Int32(bitPattern: x) >> 17)
    signed = x - 0x100000000 if x >= 0x80000000 else x
    x = (x ^ ((signed >> 17) & MASK)) & MASK
    # x ^= x &<< 5
    x = (x ^ (x << 5)) & MASK
    return x


class Prng:
    def __init__(self, seed: int):
        start = 0x9E3779B9 if (seed & MASK) == 0 else (seed & MASK)
        self.s = _step(start)

    def next(self) -> int:
        self.s = _step(self.s)
        return self.s

    def float(self) -> float:
        return self.next() / 4294967296.0

    def int(self, n: int) -> int:
        if n <= 0:
            return 0
        return self.next() % n

    def range(self, a: int, b: int) -> int:
        return a + self.int(b - a + 1)

    def pick(self, arr):
        assert arr, "pick from empty array"
        return arr[self.int(len(arr))]


# ---------------------------------------------------------------- Types.swift


def js_round(x: float) -> float:
    return math.floor(x + 0.5)


def js_round_int(x: float) -> int:
    return int(js_round(x))


def dominant_element(shares):
    best, best_val = "physical", -1.0
    for e, v in shares:
        if v > best_val:
            best_val, best = v, e
    return best


# ---------------------------------------------------------------- Tables.swift

G = json.loads(GOLDEN.read_text())
BASE_TYPES = G["data"]["bases"]
AFFIXES = G["data"]["affixes"]
UNIQUES = G["data"]["uniques"]
JOBS = {j["id"]: j for j in G["data"]["jobs"]}
RULES = {r["id"]: r for r in G["data"]["retreatRules"]}
STAGES = {s["id"]: s for s in G["data"]["stages"]}
ENEMIES = [
    {"id": e["id"], "name": e["name"], "minStage": e["minStage"], "maxStage": e["maxStage"]}
    for e in json.loads(
        json.dumps(
            # 敵表は golden に無いので tables から名前だけ復元する
            [{"id": "", "name": nm, "minStage": 0, "maxStage": 0} for nm in []]
        )
    )
]

BASE_BY_ID = {b["id"]: b for b in BASE_TYPES}


def base_def(bid):
    return BASE_BY_ID[bid]


def affix_pool_for(slot, tags):
    return [a for a in AFFIXES if a["slot"] == slot and any(t in tags for t in a["tags"])]


def uniques_for_slot(slot):
    return [u for u in UNIQUES if u["slot"] == slot or u["slot"] == "both"]


def int_pow(base: float, exp: int) -> float:
    r = 1.0
    for _ in range(exp):
        r *= base
    return r


def difficulty_mul(tier: int) -> float:
    return int_pow(2.2, tier - 1)


def item_power_for(stage_id: int, tier: int) -> int:
    return js_round_int((80 + stage_id * 24) * int_pow(1.35, tier - 1))


# 敵の名前はステージごとに golden から引く（Generated.swift と同じ帯）
ENEMY_NAMES = {row["stageId"]: row["names"] for row in G["tables"]["enemiesForStage"]}
BOSS_NAMES = {row["stageId"]: row["name"] for row in G["tables"]["bossName"]}

PLOT_COST_TABLE = [0, 0, 400, 1200, 3000, 7000]


def plot_cost(nth: int) -> int:
    return PLOT_COST_TABLE[nth] if 0 <= nth < len(PLOT_COST_TABLE) else 7000


# ---------------------------------------------------------------- Items.swift

POWER_CAP = 999

RARITY_RULES = [
    {"rarity": "common", "weight": 60, "affixMin": 0, "affixMax": 0, "hasUnique": False},
    {"rarity": "fine", "weight": 28, "affixMin": 1, "affixMax": 2, "hasUnique": False},
    {"rarity": "rare", "weight": 9, "affixMin": 3, "affixMax": 4, "hasUnique": False},
    {"rarity": "relic", "weight": 3, "affixMin": 2, "affixMax": 3, "hasUnique": True},
]

SPLIT_SHAPES = [
    {"physical": 1.0, "weight": 18, "casterWeight": 4},
    {"physical": 0.7, "weight": 22, "casterWeight": 12},
    {"physical": 0.5, "weight": 22, "casterWeight": 22},
    {"physical": 0.3, "weight": 20, "casterWeight": 30},
    {"physical": 0.0, "weight": 18, "casterWeight": 32},
]

NON_PHYSICAL = ["fire", "lightning", "poison", "ice"]


def affix_slot_max(slot):
    return 4 if slot == "weapon" else 3


def roll_rarity(rng, rarity_bonus):
    weights = [
        r["weight"] * rarity_bonus if r["rarity"] in ("rare", "relic") else r["weight"]
        for r in RARITY_RULES
    ]
    total = 0.0
    for w in weights:
        total += w
    roll = rng.float() * total
    for i in range(len(RARITY_RULES)):
        roll -= weights[i]
        if roll < 0:
            return RARITY_RULES[i]
    return RARITY_RULES[0]


def roll_element_split(rng, is_caster):
    weights = [s["casterWeight"] if is_caster else s["weight"] for s in SPLIT_SHAPES]
    total = 0.0
    for w in weights:
        total += w
    roll = rng.float() * total
    shape = SPLIT_SHAPES[0]
    for i in range(len(SPLIT_SHAPES)):
        roll -= weights[i]
        if roll < 0:
            shape = SPLIT_SHAPES[i]
            break
    split = []  # 順序を保つ（Swift の ElementSplit と同じ）
    if shape["physical"] > 0:
        split.append(["physical", shape["physical"]])
    rest = 1 - shape["physical"]
    if rest > 0:
        split.append([rng.pick(NON_PHYSICAL), rest])
    return split


def tier_of(value, lo, hi):
    if hi <= lo:
        return 1
    t = (value - lo) / (hi - lo)
    return max(1, min(5, math.floor(t * 5) + 1))


def roll_affixes(rng, pool, count):
    picked = []
    remaining = list(pool)
    n = min(count, len(remaining))
    for _ in range(n):
        idx = rng.int(len(remaining))
        d = remaining.pop(idx)
        value = d["min"] + rng.float() * (d["max"] - d["min"])
        element = rng.pick(NON_PHYSICAL) if d["elemental"] else None
        picked.append(
            {"kind": d["kind"], "value": value, "tier": tier_of(value, d["min"], d["max"]),
             "element": element}
        )
    return picked


def generate_item(rng, item_power, slot, stage_id, rarity_bonus, item_id, force_rarity=None):
    candidates = [b for b in BASE_TYPES if b["slot"] == slot]
    base = rng.pick(candidates)

    rule = None
    if force_rarity is not None:
        rule = next((r for r in RARITY_RULES if r["rarity"] == force_rarity), None)
    if rule is None:
        rule = roll_rarity(rng, rarity_bonus)

    t = rng.float()
    center = item_power * base["mul"]
    speed_raw = 0.0
    crit_raw = 0.0
    if slot == "weapon":
        power_raw = center * (1.10 - 0.20 * t)
        speed_raw = base["speed"] * (0.952 + 0.096 * t)
        crit_raw = base["critMin"] + rng.float() * (base["critMax"] - base["critMin"])
    else:
        power_raw = center * (0.90 + 0.20 * rng.float())
    power = min(POWER_CAP, js_round_int(power_raw))
    speed = js_round(speed_raw * 100) / 100
    crit = js_round(crit_raw * 10) / 10

    element = roll_element_split(rng, "elemental" in base["tags"]) if slot == "weapon" else []

    pool = affix_pool_for(slot, base["tags"])
    wanted = rule["affixMin"] + rng.int(rule["affixMax"] - rule["affixMin"] + 1)
    count = min(wanted, affix_slot_max(slot))
    affixes = roll_affixes(rng, pool, count)

    unique = rng.pick(uniques_for_slot(slot))["kind"] if rule["hasUnique"] else None

    return {
        "id": item_id, "baseId": base["id"], "slot": slot, "rarity": rule["rarity"],
        "power": power, "speed": speed, "crit": crit,
        "element": element, "affixes": affixes, "unique": unique,
        "identified": False, "fromStage": stage_id,
    }


def sell_value(item):
    mul = {"common": 1, "fine": 2.5, "rare": 7, "relic": 20}[item["rarity"]]
    return max(1, js_round_int(item["power"] * 0.25 * mul))


def base36(v: int) -> str:
    if v == 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while v:
        out = digits[v % 36] + out
        v //= 36
    return out


# ---------------------------------------------------------------- Combat.swift

TUNING = {
    "enemyHp": 46.0, "enemyAttack": 6.0, "enemyDefense": 4.2, "enemyInterval": 2.2,
    "bossHp": 200.0, "bossAttack": 8.0, "defenseConst": 30.0, "defenseCap": 0.8,
}
DT = 0.25
ENCOUNTER_TIMEOUT = 180.0
MAX_LOOT = 10
MIN_TRIP_RATIO = 0.25
PITY_MIN_LOOT = 4
BALANCED_PIERCE = 0.35

ELEM_NAME = {"physical": "物理", "fire": "炎", "lightning": "雷", "poison": "毒", "ice": "氷"}


class Enemy:
    __slots__ = ("name", "hp", "maxHp", "attack", "defense", "interval", "isBoss")

    def __init__(self, name, hp, max_hp, attack, defense, interval, is_boss):
        self.name, self.hp, self.maxHp = name, hp, max_hp
        self.attack, self.defense, self.interval, self.isBoss = attack, defense, interval, is_boss


def enemy_scale(stage, tier, enc_idx):
    depth = enc_idx / max(1, stage["encounters"] - 1)
    return (0.85 + 0.20 * stage["id"]) * difficulty_mul(tier) * (1 + depth * 0.5)


def attrition_norm(stage):
    return 9.0 / stage["encounters"]


def make_enemies(rng, stage, tier, enc_idx, is_boss_fight):
    scale = enemy_scale(stage, tier, enc_idx)
    if is_boss_fight:
        return [Enemy(BOSS_NAMES[stage["id"]],
                      TUNING["bossHp"] * scale, TUNING["bossHp"] * scale,
                      TUNING["bossAttack"] * scale * attrition_norm(stage),
                      TUNING["enemyDefense"] * 1.3 * scale, 2.0, True)]
    count = 3 + rng.int(3)
    pool = ENEMY_NAMES[stage["id"]]
    label = rng.pick(pool) if pool else "魔物"
    out = []
    for _ in range(count):
        jitter = 0.85 + rng.float() * 0.3
        out.append(Enemy(label,
                         TUNING["enemyHp"] * scale * jitter, TUNING["enemyHp"] * scale * jitter,
                         TUNING["enemyAttack"] * scale * attrition_norm(stage),
                         TUNING["enemyDefense"] * scale, TUNING["enemyInterval"], False))
    return out


def element_mul(stage, elem):
    if elem in stage["resists"]:
        return 0.5
    if stage["weakTo"] == elem:
        return 1.5
    return 1.0


class Tally:
    """挿入順を保つ集計。同率なら先に入ったほうが勝つ（JS の Object.entries と同じ）。"""

    def __init__(self):
        self.d = {}

    def add(self, k, v):
        self.d[k] = self.d.get(k, 0.0) + v

    def top(self):
        best = None
        for k, v in self.d.items():
            if best is None or v > best[1]:
                best = (k, v)
        return best


def build_loadout(weapon, armor, potion):
    w_base = base_def(weapon["baseId"])
    lo = {
        "attack": float(weapon["power"]),
        "speed": weapon["speed"] if weapon["speed"] != 0 else w_base["speed"],
        "critRate": weapon["crit"] / 100,
        "critMul": 1.5,
        "split": [], "flatElem": [],
        "attackPct": 0.0, "lowHpPct": 0.0, "comboSpeedPct": 0.0,
        "defense": float(armor["power"]), "defensePct": 0.0,
        "resist": {}, "killHeal": 0.0,
    }
    for e, v in weapon["element"]:
        if v > 0:
            lo["split"].append((e, v))
    if not lo["split"]:
        lo["split"].append(("physical", 1))

    for a in weapon["affixes"]:
        k = a["kind"]
        if k == "attackPct":
            lo["attackPct"] += a["value"]
        elif k == "critDmgPct":
            lo["critMul"] += a["value"] / 100
        elif k == "elementFlat":
            lo["flatElem"].append((a["element"] or "fire", a["value"]))
        elif k == "lowHpPct":
            lo["lowHpPct"] += a["value"]
        elif k == "comboSpeedPct":
            lo["comboSpeedPct"] += a["value"]
    for a in armor["affixes"]:
        k = a["kind"]
        if k == "defensePct":
            lo["defensePct"] += a["value"]
        elif k == "resistPct":
            e = a["element"] or "fire"
            lo["resist"][e] = lo["resist"].get(e, 0.0) + a["value"] / 100
        elif k == "killHeal":
            lo["killHeal"] += a["value"]

    if potion:
        e = potion["element"]
        lo["resist"][e] = lo["resist"].get(e, 0.0) + potion["resist"]

    if weapon["unique"] == "noCritFlatPower":
        lo["critRate"] = 0
        lo["attackPct"] += 25
    if weapon["unique"] == "slowTriple":
        lo["speed"] *= 0.5
    return lo


def simulate_run(seed, job, weapon, armor, rule, stage, tier, potion):
    rng = Prng(seed)
    lo = build_loadout(weapon, armor, potion)
    potion_elem = potion["element"] if potion else None
    potion_rate = potion["resist"] if potion else 0

    tm = {
        "damageByElement": Tally(), "damageByAffix": Tally(),
        "resistedLoss": 0.0, "weaknessGain": 0.0, "totalDealt": 0.0, "totalTaken": 0.0,
        "takenByElement": Tally(), "resistSaved": 0.0, "potionSaved": 0.0,
        "lastStandSaved": 0.0, "thornsDealt": 0.0, "healed": 0.0,
        "crits": 0, "hits": 0, "kills": 0, "biggestHit": 0.0, "evaded": 0,
    }

    max_hp = job["hp"]
    st = {"hp": max_hp, "killStack": 0.0}
    hp_curve = [1]

    w_tags = base_def(weapon["baseId"])["tags"]
    cleaves = "heavy" in w_tags
    armor_pierce = BALANCED_PIERCE if "balanced" in w_tags else 0

    ward_stack = armor["unique"] == "wardStack"
    last_stand = armor["unique"] == "lastStand"
    thorns = armor["unique"] == "thorns"

    greedy = weapon["unique"] == "greedyGlass" or armor["unique"] == "greedyGlass"
    taken_mul = job["damageTakenMul"] * (1.25 if greedy else 1)

    ward_bonus = 0.0
    outcome = "clear"
    depth = 0
    boss_defeated = False
    death_cause = ""

    split_muls = [(e, p, element_mul(stage, e)) for (e, p) in lo["split"]]
    bailed = False

    def on_kill():
        tm["kills"] += 1
        if weapon["unique"] == "killStack":
            st["killStack"] += 1
        if lo["killHeal"] > 0 and st["hp"] > 0:
            before = st["hp"]
            st["hp"] = min(max_hp, st["hp"] + lo["killHeal"])
            tm["healed"] += st["hp"] - before

    for enc_idx in range(stage["encounters"]):
        is_boss_fight = enc_idx == stage["encounters"] - 1
        enemies = make_enemies(rng, stage, tier, enc_idx, is_boss_fight)
        combo = 0
        attack_accum = 0.0
        enemy_accum = [0.0] * len(enemies)
        t = 0.0

        while t < ENCOUNTER_TIMEOUT:
            if all(e.hp <= 0 for e in enemies):
                break
            if st["hp"] <= 0:
                break
            if rule["threshold"] > 0 and not is_boss_fight and st["hp"] / max_hp < rule["threshold"]:
                bailed = True
                break

            combo_mul = 1 + (min(5, combo) * lo["comboSpeedPct"]) / 100
            attack_accum += lo["speed"] * combo_mul * DT
            while attack_accum >= 1:
                attack_accum -= 1
                target = next((e for e in enemies if e.hp > 0), None)
                if target is None:
                    break

                low_hp = lo["lowHpPct"] if st["hp"] / max_hp <= 0.5 else 0
                pct_mul = 1 + (lo["attackPct"] + low_hp) / 100
                atk_base = lo["attack"] + st["killStack"]

                raw = 0.0
                per_element = []
                for (e, p, mul) in split_muls:
                    d = atk_base * p * mul * pct_mul
                    raw += d
                    per_element.append((e, d))
                    flat = atk_base * p * pct_mul
                    if mul < 1:
                        tm["resistedLoss"] += flat - d
                    if mul > 1:
                        tm["weaknessGain"] += d - flat
                flat_affix = 0.0
                for (e, v) in lo["flatElem"]:
                    d = v * element_mul(stage, e) * pct_mul
                    raw += d
                    flat_affix += d
                    per_element.append((e, d))

                unique_mul = 3.0 if weapon["unique"] == "slowTriple" else 1.0
                dmg = max(1, raw * unique_mul - target.defense * (1 - armor_pierce))

                is_crit = False
                if lo["critRate"] > 0 and rng.float() < lo["critRate"]:
                    is_crit = True
                    dmg *= lo["critMul"]
                    tm["crits"] += 1

                scale = dmg / raw if raw > 0 else 0
                for (e, d) in per_element:
                    tm["damageByElement"].add(e, d * scale)
                if lo["attackPct"] > 0:
                    tm["damageByAffix"].add("attackPct", dmg * (lo["attackPct"] / 100) / pct_mul)
                if low_hp > 0:
                    tm["damageByAffix"].add("lowHpPct", dmg * (low_hp / 100) / pct_mul)
                if flat_affix > 0:
                    tm["damageByAffix"].add("elementFlat", flat_affix * scale)
                if is_crit:
                    tm["damageByAffix"].add("critDmgPct", dmg * (1 - 1 / lo["critMul"]))
                if combo > 0 and lo["comboSpeedPct"] > 0:
                    tm["damageByAffix"].add("comboSpeedPct", dmg * (combo_mul - 1))
                tm["totalDealt"] += dmg
                tm["hits"] += 1
                tm["biggestHit"] = max(tm["biggestHit"], dmg)
                combo = min(5, combo + 1)

                if weapon["unique"] == "slowTriple":
                    for e in enemies:
                        if e.hp <= 0:
                            continue
                        e.hp -= dmg
                        if e.hp <= 0:
                            on_kill()
                elif cleaves:
                    carry = dmg
                    for e in enemies:
                        if carry <= 0:
                            break
                        if e.hp <= 0:
                            continue
                        applied = min(e.hp, carry)
                        e.hp -= applied
                        carry -= applied
                        if e.hp <= 0:
                            on_kill()
                        else:
                            break
                else:
                    target.hp -= dmg
                    if target.hp <= 0:
                        on_kill()

            for i in range(len(enemies)):
                e = enemies[i]
                if e.hp <= 0:
                    continue
                enemy_accum[i] += DT / e.interval
                while enemy_accum[i] >= 1:
                    enemy_accum[i] -= 1
                    if job["evasion"] > 0 and rng.float() < job["evasion"]:
                        tm["evaded"] += 1
                        continue
                    if stage["enemyElement"] == "mixed":
                        elem = ["fire", "ice", "lightning", "poison"][rng.int(4)]
                    else:
                        elem = stage["enemyElement"]
                    def_total = (lo["defense"] + ward_bonus) * (1 + lo["defensePct"] / 100)
                    def_rate = min(
                        TUNING["defenseCap"],
                        def_total / (def_total + TUNING["defenseConst"] * enemy_scale(stage, tier, enc_idx)),
                    )
                    res = min(0.75, lo["resist"].get(elem, 0))
                    before_res = e.attack * (1 - def_rate) * taken_mul
                    if potion_elem == elem and potion_rate > 0:
                        without = min(0.75, max(0, lo["resist"].get(elem, 0) - potion_rate))
                        tm["potionSaved"] += before_res * ((1 - without) - (1 - res))
                    last_stand_mul = 0.5 if (last_stand and st["hp"] / max_hp <= 0.25) else 1.0
                    taken = before_res * (1 - res) * last_stand_mul
                    tm["resistSaved"] += before_res - taken
                    if last_stand_mul < 1:
                        tm["lastStandSaved"] += before_res * (1 - res) - taken
                    st["hp"] -= taken
                    tm["totalTaken"] += taken
                    tm["takenByElement"].add(elem, taken)
                    if ward_stack:
                        ward_bonus += 2
                    if thorns and taken > 0:
                        back = taken * 0.4
                        e.hp -= back
                        tm["thornsDealt"] += back
                        if e.hp <= 0:
                            on_kill()
                    if st["hp"] <= 0:
                        death_cause = e.name
                        break
                if st["hp"] <= 0:
                    break

            t += DT

        if bailed:
            outcome = "retreat"
            depth = enc_idx
            hp_curve.append(max(0, st["hp"] / max_hp))
            break
        if st["hp"] <= 0:
            outcome = "death"
            depth = enc_idx
            hp_curve.append(0)
            break
        depth = enc_idx + 1
        hp_curve.append(max(0, st["hp"] / max_hp))
        if is_boss_fight:
            boss_defeated = True
        if rule["threshold"] > 0 and st["hp"] / max_hp < rule["threshold"] and not is_boss_fight:
            outcome = "retreat"
            break

    if outcome == "clear" and depth < stage["encounters"]:
        outcome = "retreat"

    loot = []
    if outcome != "death":
        count = js_round_int(2 + (depth / stage["encounters"]) * (MAX_LOOT - 2))
        count += job["bonusDrops"]
        if greedy:
            count = js_round_int(count * 1.5)
        count = max(0, min(MAX_LOOT, count))
        power = item_power_for(stage["id"], tier)
        for i in range(count):
            p = 0.65 if stage["dropBias"] == "weapon" else (0.35 if stage["dropBias"] == "armor" else 0.5)
            slot = "weapon" if rng.float() < p else "armor"
            loot.append(generate_item(rng, power, slot, stage["id"], stage["rarityBonus"],
                                      f"{base36(seed)}-{i}"))
        if len(loot) >= PITY_MIN_LOOT and not any(
            it["rarity"] in ("rare", "relic") for it in loot
        ):
            idx = rng.int(len(loot))
            victim = loot[idx]
            loot[idx] = generate_item(rng, power, victim["slot"], stage["id"],
                                      stage["rarityBonus"], f"{base36(seed)}-p{idx}",
                                      force_rarity="rare")

    gold = 0 if outcome == "death" else js_round_int(
        depth * (6 + stage["id"] * 3) * difficulty_mul(tier)
    )
    full = (stage["minutes"] * 60) * job["timeMul"]
    duration = max(js_round_int(full * MIN_TRIP_RATIO),
                   js_round_int(full * (depth / stage["encounters"])))

    return {
        "outcome": outcome, "depth": depth, "encountersTotal": stage["encounters"],
        "bossDefeated": boss_defeated, "loot": loot, "gold": gold,
        "headline": build_headline(outcome, depth, stage, boss_defeated, death_cause),
        "highlights": build_highlights(tm, weapon, armor, outcome, split_muls, death_cause,
                                       depth, stage["encounters"], stage,
                                       potion["name"] if potion else None),
        "hpCurve": hp_curve,
        "durationSec": max(1, duration),
        "stats": {
            "dealt": js_round_int(tm["totalDealt"]), "taken": js_round_int(tm["totalTaken"]),
            "kills": tm["kills"], "hits": tm["hits"], "crits": tm["crits"],
            "biggestHit": js_round_int(tm["biggestHit"]), "evaded": tm["evaded"],
            "potionSaved": js_round_int(tm["potionSaved"]),
        },
    }


def build_headline(outcome, depth, stage, boss_defeated, death_cause):
    if outcome == "death":
        return f"深度{depth}で力尽きた／{death_cause or '力及ばず'}"
    if outcome == "clear":
        return f"{stage['name']}を踏破／ボス『{BOSS_NAMES[stage['id']]}』撃破"
    return (f"深度{depth}で撤退／ボス『{BOSS_NAMES[stage['id']]}』撃破" if boss_defeated
            else f"深度{depth}で撤退／{stage['name']}")


AFFIX_NAME = {a["kind"]: a["name"] for a in AFFIXES}
UNIQUE_NAME = {u["kind"]: u["name"] for u in UNIQUES}


def build_highlights(tm, weapon, armor, outcome, split_muls, death_cause,
                     depth, total, stage, potion_name):
    lines = []
    dealt = max(1, tm["totalDealt"])
    taken = max(1, tm["totalTaken"])

    resisted = [s for s in split_muls if s[2] < 1]
    weak = [s for s in split_muls if s[2] > 1]
    if resisted and tm["resistedLoss"] > dealt * 0.10:
        names = "と".join(ELEM_NAME[s[0]] for s in resisted)
        lost = js_round_int((tm["resistedLoss"] / (dealt + tm["resistedLoss"])) * 100)
        lines.append(f"{names}が効かない敵に{names}武器で挑み、火力を約{lost}%捨てていた")
    elif weak and tm["weaknessGain"] > dealt * 0.05:
        names = "と".join(ELEM_NAME[s[0]] for s in weak)
        gain = js_round_int((tm["weaknessGain"] / max(1, dealt - tm["weaknessGain"])) * 100)
        lines.append(f"{names}が弱点を突き、火力を約{gain}%上乗せできた")
    elif resisted:
        names = "と".join(ELEM_NAME[s[0]] for s in resisted)
        lines.append(f"{names}は半減される相手だったが、配分が小さく実害は軽かった")
    else:
        per_hit = js_round_int(dealt / max(1, tm["hits"]))
        lines.append(
            f"属性は等倍。1撃あたり{per_hit}を{tm['hits']}回通して{tm['kills']}体を仕留めた"
            if tm["hits"] > 0 else "属性は等倍。攻撃を1度も当てられないまま終わった")

    if armor["unique"] == "lastStand" and tm["lastStandSaved"] > taken * 0.05:
        lines.append(f"《背水の鎧》が瀕死の間に被弾を{js_round_int(tm['lastStandSaved'])}肩代わりした")
    elif armor["unique"] == "thorns" and tm["thornsDealt"] > dealt * 0.05:
        lines.append(f"《棘の外套》が受けた分を{js_round_int(tm['thornsDealt'])}返し、"
                     f"総火力の{js_round_int((tm['thornsDealt'] / dealt) * 100)}%を稼いだ")
    elif armor["unique"] == "wardStack":
        lines.append("《積年の盾》が被弾のたび硬くなり、後半ほど削られにくくなった")
    elif weapon["unique"]:
        lines.append(f"遺物《{UNIQUE_NAME[weapon['unique']]}》の効果が乗り、{tm['hits']}回の攻撃を支えた")
    elif armor["unique"] == "greedyGlass" or weapon["unique"] == "greedyGlass":
        lines.append("《強欲の器》がドロップを増やす代わりに、被弾を25%増やしていた")
    else:
        top = tm["damageByAffix"].top()
        if top and top[1] > dealt * 0.05:
            lines.append(f"「{AFFIX_NAME[top[0]]}」が総ダメージの{js_round_int((top[1] / dealt) * 100)}%を稼いだ")
        elif not weapon["affixes"]:
            lines.append("武器にアフィックスが無く、素の攻撃力だけで押していた")
        else:
            rate = js_round_int((tm["crits"] / tm["hits"]) * 100) if tm["hits"] > 0 else 0
            lines.append(f"{tm['hits']}回中{tm['crits']}回が会心。会心が火力の柱だった"
                         if rate >= 20 else
                         f"会心は{tm['hits']}回中{tm['crits']}回（{rate}%）で、勝敗にはほぼ関与していない")

    if tm["potionSaved"] > taken * 0.04 and potion_name:
        lines.append(f"《{potion_name}》が被弾を{js_round_int(tm['potionSaved'])}肩代わりした"
                     f"（受けた分の{js_round_int((tm['potionSaved'] / (taken + tm['potionSaved'])) * 100)}%）")
    elif potion_name is None and stage["enemyElement"] != "mixed" and taken > 0:
        lines.append(f"{ELEM_NAME[stage['enemyElement']]}耐性の薬を持たせていれば、"
                     "被弾を1割ほど抑えられたかもしれない")

    if outcome == "death":
        e = tm["takenByElement"].top()
        en = ELEM_NAME[e[0]] if e else "敵"
        has_resist = any(a["kind"] == "resistPct" and a["element"] == (e[0] if e else None)
                         for a in armor["affixes"])
        if not has_resist and tm["resistSaved"] < taken * 0.05:
            lines.append(f"{en}属性の攻撃に耐性が無く、{death_cause or '数に押し切られて'}倒れた")
        elif tm["hits"] > 0 and dealt / max(1, tm["kills"]) > 0:
            lines.append("防具は仕事をしたが、火力が足りず長期戦になって削り切られた")
        else:
            lines.append(f"{death_cause or '敵'}に押し切られた")
    elif outcome == "retreat":
        if tm["healed"] > 0:
            reason = f"撃破時回復が計{js_round_int(tm['healed'])}を戻したが追いつかなかった"
        elif tm["resistSaved"] > taken * 0.10:
            reason = f"属性耐性が被弾を約{js_round_int((tm['resistSaved'] / (taken + tm['resistSaved'])) * 100)}%減らした"
        elif tm["evaded"] > 0:
            reason = f"回避が{tm['evaded']}回。被弾は抑えたが決め手に欠けた"
        else:
            reason = "防御の支えが無く、HPの残量だけが頼りだった"
        lines.append(f"{depth}/{total}で撤退ラインに触れた。{reason}")
    else:
        if tm["healed"] > 0:
            lines.append(f"撃破時回復が計{js_round_int(tm['healed'])}を戻し、最後まで余力を保った")
        elif tm["resistSaved"] > taken * 0.10:
            lines.append(f"属性耐性が被弾を約{js_round_int((tm['resistSaved'] / (taken + tm['resistSaved'])) * 100)}%減らし、踏破を支えた")
        else:
            lines.append("被弾を正面から受け切って踏破した")

    return lines[:3]


# ---------------------------------------------------------------- Offline.swift

OFFLINE_CAP_SEC = 8 * 3600


def dispatch_progress(started_at, duration_sec, last_seen):
    raw = (last_seen - started_at) / 1000
    elapsed = max(0, min(raw, OFFLINE_CAP_SEC))
    return {
        "elapsedSec": elapsed,
        "remainingSec": max(0, duration_sec - elapsed),
        "completed": elapsed >= duration_sec,
        "ratio": 1 if duration_sec <= 0 else max(0, min(1, elapsed / duration_sec)),
    }


def advance_clock(last_seen, now):
    return last_seen if now < last_seen else now


# ---------------------------------------------------------------- 突き合わせ


def cmp_item(want, got, where):
    eq(want["id"], got["id"], f"{where} の id")
    eq(want["baseId"], got["baseId"], f"{where} のベース")
    eq(want["rarity"], got["rarity"], f"{where} のレアリティ")
    eq(want["power"], got["power"], f"{where} の攻撃/防御")
    eq(want["speed"], got["speed"], f"{where} の速度")
    eq(want["crit"], got["crit"], f"{where} の会心")
    eq(want["unique"], got["unique"], f"{where} のユニーク")
    eq(want["sellValue"], sell_value(got), f"{where} の売値")
    eq([list(x) for x in want["element"]], [list(x) for x in got["element"]],
       f"{where} の属性配分（並び順まで）")
    eq(len(want["affixes"]), len(got["affixes"]), f"{where} のアフィックス数")
    for k, (wa, ga) in enumerate(zip(want["affixes"], got["affixes"])):
        eq(wa["kind"], ga["kind"], f"{where} のアフィックス[{k}] の種類")
        eq(wa["value"], ga["value"], f"{where} のアフィックス[{k}] の値")
        eq(wa["tier"], ga["tier"], f"{where} のアフィックス[{k}] のティア")
        eq(wa["element"], ga["element"], f"{where} のアフィックス[{k}] の属性")


def main():
    # 1. 乱数
    for vec in G["prng"]:
        seed = vec["seed"]
        r = Prng(seed)
        for k, want in enumerate(vec["next"]):
            if not eq(want, r.next(), f"Prng(seed {seed}) の next[{k}]"):
                break
        r2 = Prng(seed)
        for k, want in enumerate(vec["floats"]):
            eq(want, r2.float(), f"Prng(seed {seed}) の float[{k}]")
        r3 = Prng(seed)
        for n, want in zip([1, 2, 3, 4, 5, 7, 10, 16, 100], vec["ints"]):
            eq(want, r3.int(n), f"Prng(seed {seed}) の int({n})")
        r4 = Prng(seed)
        for (a, b), want in zip([(0, 0), (0, 1), (3, 5), (-2, 2), (1, 100)], vec["ranges"]):
            eq(want, r4.range(a, b), f"Prng(seed {seed}) の range({a},{b})")

    # 2. 表
    for row in G["tables"]["difficultyMul"]:
        eq(row["value"], difficulty_mul(row["tier"]), f"difficultyMul({row['tier']})")
    for row in G["tables"]["itemPowerFor"]:
        eq(row["value"], item_power_for(row["stageId"], row["tier"]),
           f"itemPowerFor({row['stageId']},{row['tier']})")
    for row in G["tables"]["tierOf"]:
        eq(row["tier"], tier_of(row["value"], row["min"], row["max"]),
           f"tierOf({row['value']},{row['min']},{row['max']})")
    for row in G["tables"]["plotCost"]:
        eq(row["cost"], plot_cost(row["nth"]), f"plotCost({row['nth']})")
    for row in G["tables"]["affixPoolFor"]:
        base = base_def(row["baseId"])
        eq(row["kinds"], [a["kind"] for a in affix_pool_for(base["slot"], base["tags"])],
           f"affixPoolFor({row['baseId']}) の並び")
    for row in G["tables"]["uniquesForSlot"]:
        eq(row["kinds"], [u["kind"] for u in uniques_for_slot(row["slot"])],
           f"uniquesForSlot({row['slot']})")

    # 3. 装備生成
    for vec in G["items"]:
        seed, slot, stage_id = vec["seed"], vec["slot"], vec["stageId"]
        stage = STAGES[stage_id]
        rng = Prng(seed)
        where0 = f"seed {seed}/{slot}/stage {stage_id}"
        for k in range(5):
            got = generate_item(rng, item_power_for(stage_id, 1), slot, stage_id,
                                stage["rarityBonus"], f"{base36(seed)}-{k}")
            cmp_item(vec["items"][k], got, f"{where0} の {k} 個目")
        forced = generate_item(rng, item_power_for(stage_id, 1), slot, stage_id,
                               stage["rarityBonus"], f"{base36(seed)}-forced",
                               force_rarity="rare")
        cmp_item(vec["items"][5], forced, f"{where0} の救済枠")
        eq(vec["stateAfter"], rng.next(), f"{where0}: 乱数を引いた回数")

    # 4. 派遣（通し）
    for vec in G["runs"]:
        inp = vec["input"]
        seed, stage_id = inp["seed"], inp["stageId"]
        stage = STAGES[stage_id]
        label = f"seed {seed}/{inp['job']}/{inp['rule']}/stage {stage_id}"

        ws = (seed ^ 0x11) & MASK
        weapon = generate_item(Prng(ws), item_power_for(stage_id, 1), "weapon", stage_id,
                               stage["rarityBonus"], f"fix-{ws}-weapon")
        as_ = (seed ^ 0x22) & MASK
        armor = generate_item(Prng(as_), item_power_for(stage_id, 1), "armor", stage_id,
                              stage["rarityBonus"], f"fix-{as_}-armor")
        cmp_item(vec["weapon"], weapon, f"{label} の武器")
        cmp_item(vec["armor"], armor, f"{label} の防具")

        got = simulate_run(seed, JOBS[inp["job"]], weapon, armor, RULES[inp["rule"]],
                           stage, inp["tier"], inp["potion"])
        want = vec["result"]
        eq(want["outcome"], got["outcome"], f"{label} の結末")
        eq(want["depth"], got["depth"], f"{label} の到達深度")
        eq(want["bossDefeated"], got["bossDefeated"], f"{label} のボス撃破")
        eq(want["gold"], got["gold"], f"{label} の金")
        eq(want["durationSec"], got["durationSec"], f"{label} の所要時間")
        eq(want["headline"], got["headline"], f"{label} の見出し")
        eq(want["highlights"], got["highlights"], f"{label} の見どころ")
        eq(want["hpCurve"], got["hpCurve"], f"{label} の HP 推移")
        eq(want["stats"], got["stats"], f"{label} の数字")
        eq(len(want["loot"]), len(got["loot"]), f"{label} の戦利品の数")
        for k, (wl, gl) in enumerate(zip(want["loot"], got["loot"])):
            cmp_item(wl, gl, f"{label} の戦利品[{k}]")

    # 5. オフライン
    for row in G["offline"]:
        p = dispatch_progress(row["startedAt"], row["durationSec"], row["lastSeen"])
        for key in ("elapsedSec", "remainingSec", "completed", "ratio"):
            eq(row[key], p[key], f"オフライン進行 {row['lastSeen']} の {key}")
    for row in G["clock"]:
        eq(row["next"], advance_clock(row["lastSeen"], row["now"]),
           f"巻き戻し検知 {row['lastSeen']}→{row['now']}")

    print(f"移植した論理の照合: {checks} 件中 {len(fails)} 件が不一致")
    if fails:
        print("\n不一致:")
        for f in fails[:40]:
            print("  " + f)
        if len(fails) > 40:
            print(f"  ...ほか {len(fails) - 40} 件")
        sys.exit(1)
    print("すべて一致（＝Swift に書き写した論理は TS と同じ）")


if __name__ == "__main__":
    main()
