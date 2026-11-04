// Chi nhánh gần nhất tính ở TRÌNH DUYỆT (Q6): toạ độ người dùng không rời máy (H9).

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface BranchPoint {
  chiNhanhId: string;
  // API trả chuỗi decimal hoặc null (chi nhánh chưa có toạ độ)
  toaDoLat: string | null;
  toaDoLng: string | null;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Khoảng cách đường tròn lớn (Haversine), đơn vị km. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  // Chênh kinh độ quanh kinh tuyến 180 phải lấy đường ngắn hơn, nhưng sin² của nửa góc đã tự xử lý vì tuần hoàn
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Toạ độ hợp lệ của chi nhánh, hoặc null nếu thiếu/không đọc được (bị bỏ qua — admin Q10). */
export function branchCoordinates(branch: BranchPoint): Coordinates | null {
  if (branch.toaDoLat === null || branch.toaDoLng === null) return null;
  const lat = Number(branch.toaDoLat);
  const lng = Number(branch.toaDoLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Id chi nhánh gần nhất; bằng khoảng cách thì lấy id nhỏ hơn; không chi nhánh nào có toạ độ ⇒ null. */
export function nearestBranch(
  branches: readonly BranchPoint[],
  position: Coordinates,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const branch of branches) {
    const point = branchCoordinates(branch);
    if (!point) continue;
    const distance = haversineKm(position, point);
    const closer = distance < bestDistance;
    // So id bằng BigInt vì id là chuỗi bigint, có thể vượt số nguyên an toàn của number
    const tieWithSmallerId =
      distance === bestDistance &&
      bestId !== null &&
      BigInt(branch.chiNhanhId) < BigInt(bestId);
    if (closer || tieWithSmallerId) {
      bestId = branch.chiNhanhId;
      bestDistance = distance;
    }
  }
  return bestId;
}
