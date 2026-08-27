// 家の当たり判定（指示書「①家の衝突判定」）。
//
// この作品の移動は元々「地形の高さ場に足元を合わせる」だけで、壁という
// 概念自体が無かった（歩けば壁をすり抜けた）。垂直方向（どの階にいるか・
// 階段の高さ）は villa.ts の VillaFloorTracker が地形の高さ場の代わりに
// 返す値で既に解決できているので、ここで足すのは水平方向の押し返しだけに
// 絞る。指示書の「静的/動的コライダー」「軸ごとに分離して判定」という
// 考え方はそのまま踏襲しつつ、指示書の STEP_OFFSET によるよじ登り判定は
// 採用しない（階段はスロープとして既に歩けるため、ここで重ねると二重になる）。

export interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export function makeAABB(center: [number, number, number], half: [number, number, number]): AABB {
  return {
    minX: center[0] - half[0], maxX: center[0] + half[0],
    minY: center[1] - half[1], maxY: center[1] + half[1],
    minZ: center[2] - half[2], maxZ: center[2] + half[2]
  };
}

function intersects(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX
      && a.minY <= b.maxY && a.maxY >= b.minY
      && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

const PLAYER_HALF_W = 0.25;
const PLAYER_HEIGHT = 1.7;

function playerBox(x: number, feetY: number, z: number): AABB {
  return {
    minX: x - PLAYER_HALF_W, maxX: x + PLAYER_HALF_W,
    minY: feetY, maxY: feetY + PLAYER_HEIGHT,
    minZ: z - PLAYER_HALF_W, maxZ: z + PLAYER_HALF_W
  };
}

/**
 * 軸ごとに分離して判定する。x を先に試し、通ればその x で z を試すことで、
 * 壁に斜めに突っ込んでも壁沿いにスライドできる（指示書のmovePlayerと同じ考え方）。
 * groundAt は、その候補位置に立ったときの足元の高さ（＝別荘の床 or 地形）。
 */
export function resolveHorizontal(
  x: number, z: number, dx: number, dz: number,
  groundAt: (x: number, z: number) => number,
  colliders: readonly AABB[]
): { x: number; z: number } {
  let nx = x, nz = z;
  if (dx !== 0) {
    const tryX = x + dx;
    const box = playerBox(tryX, groundAt(tryX, nz), nz);
    if (!colliders.some(c => intersects(box, c))) nx = tryX;
  }
  if (dz !== 0) {
    const tryZ = z + dz;
    const box = playerBox(nx, groundAt(nx, tryZ), tryZ);
    if (!colliders.some(c => intersects(box, c))) nz = tryZ;
  }
  return { x: nx, z: nz };
}
