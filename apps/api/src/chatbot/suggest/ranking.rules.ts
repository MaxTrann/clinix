import type { HocViBacSi } from '../../admin/entities/enums.js';

// Luật xếp hạng bác sĩ của API gợi ý (chatbot B4; PLAN chatbot 5.11 bước 6, 1.2.1, Q10). Hàm thuần: không DB, không đồng hồ, không Nest.
//
//   điểm = w1 × rating_norm + w2 × kinhNghiem_norm
//
// Tính HOÀN TOÀN bằng số nguyên để hai máy không bao giờ lệch do số thực:
//   - trọng số: phần trăm ("0.60" ⇒ 60), tách từ chuỗi decimal của MySQL, không qua `Number("0.60")`;
//   - rating_norm: điểm tính bằng phần mười ("4.5" ⇒ 45), chia 5 ra phần trăm là nhân 2 (45 ⇒ 90 phần trăm), chính xác;
//   - kinhNghiem_norm: min(số năm + quy đổi học vị, 20) / 20 ra phần trăm là nhân 5.
// Học vị CHỈ được dùng ở đây (phía máy chủ); không hàm nào trả học vị hay điểm ra ngoài (GOI-09).

/** Số năm quy đổi cộng vào số năm kinh nghiệm theo học vị (PLAN 5.11, 1.2.1). */
export const DEGREE_BONUS_YEARS: Readonly<Record<HocViBacSi, number>> = {
  BS: 0,
  ThS: 2,
  TS: 5,
  PGS: 8,
  GS: 12,
};

/** Trần kinh nghiệm quy đổi, tính bằng năm (PLAN 5.11). */
export const EXPERIENCE_CAP_YEARS = 20;

/** Từ chừng này lượt đánh giá (chưa ẩn) trở lên mới dùng điểm riêng; dưới thì dùng điểm trung bình hệ thống (1.2.1, MH5). */
export const MIN_REVIEWS_FOR_OWN_AVERAGE = 5;

/** Điểm tối đa là 5 sao = 50 phần mười. */
const MAX_RATING_TENTHS = 50;

// `decimal(3,2)` của MySQL: một chữ số nguyên, tuỳ chọn một hay hai chữ số thập phân ("0.60", "1.00", "0.4").
const WEIGHT_PATTERN = /^(\d)(?:\.(\d{1,2}))?$/;
// Điểm sao: một chữ số nguyên, tuỳ chọn một chữ số thập phân ("4.5", "4.0", "5").
const TENTHS_PATTERN = /^(\d)(?:\.(\d))?$/;

/**
 * Trọng số dạng chuỗi ⇒ phần trăm nguyên ("0.60" ⇒ 60, "1.00" ⇒ 100). Sai dạng ⇒ `RangeError`: cấu hình hỏng không được âm thầm cho điểm 0.
 * Không nêu giá trị trong thông báo.
 */
export function parseWeight(text: string): number {
  const match = WEIGHT_PATTERN.exec(text);
  if (!match) throw new RangeError('Trọng số xếp hạng sai dạng');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Điểm sao dạng chuỗi ⇒ phần mười nguyên ("4.5" ⇒ 45). Sai dạng hay quá 5,0 ⇒ `RangeError`. */
export function parseTenths(text: string): number {
  const match = TENTHS_PATTERN.exec(text);
  const tenths = match
    ? Number(match[1]) * 10 + Number(match[2] ?? '0')
    : Number.NaN;
  if (!(tenths <= MAX_RATING_TENTHS)) {
    throw new RangeError('Điểm đánh giá sai dạng');
  }
  return tenths;
}

/** Một ứng viên đã đủ dữ kiện để chấm. `hocVi` là `null` khi không đọc được (quy đổi 0). */
export interface RankCandidate {
  readonly bacSiId: string;
  readonly hoTen: string;
  readonly soNamKinhNghiem: number;
  readonly hocVi: HocViBacSi | null;
  readonly soDanhGia: number;
  readonly diemTrungBinh: string | null;
}

/** Trọng số đã đổi sang phần trăm nguyên (`parseWeight`). */
export interface RankWeights {
  readonly w1: number;
  readonly w2: number;
}

/**
 * Điểm sao dùng để xếp hạng, phần mười: từ 5 lượt trở lên là điểm riêng; ít hơn là điểm hệ thống;
 * hệ thống chưa có đánh giá nào (`null`) thì 0 cho mọi người (MH5).
 */
export function ratingTenthsOf(
  candidate: RankCandidate,
  systemTenths: number | null,
): number {
  if (
    candidate.soDanhGia >= MIN_REVIEWS_FOR_OWN_AVERAGE &&
    candidate.diemTrungBinh !== null
  ) {
    return parseTenths(candidate.diemTrungBinh);
  }
  return systemTenths ?? 0;
}

/** Số năm kinh nghiệm đã cộng quy đổi học vị và cắt ở trần. */
export function experienceYearsOf(candidate: RankCandidate): number {
  const bonus =
    candidate.hocVi === null ? 0 : (DEGREE_BONUS_YEARS[candidate.hocVi] ?? 0);
  return Math.min(candidate.soNamKinhNghiem + bonus, EXPERIENCE_CAP_YEARS);
}

/** Điểm số nguyên: `w1 × rating% + w2 × kinhNghiem%` (mỗi vế 0 đến 100). */
export function scoreOf(
  candidate: RankCandidate,
  weights: RankWeights,
  systemTenths: number | null,
): number {
  const ratingPercent = ratingTenthsOf(candidate, systemTenths) * 2;
  const experiencePercent = experienceYearsOf(candidate) * 5;
  return weights.w1 * ratingPercent + weights.w2 * experiencePercent;
}

// So sánh id BIGINT đúng ở mọi cỡ (id lớn hơn 2^53 không được qua `Number`).
function compareIds(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Xếp điểm giảm dần; hoà điểm: số năm kinh nghiệm GỐC giảm dần (không cộng học vị), rồi họ tên (`localeCompare` tiếng Việt như
 * `search/doctors/doctor-list.rules.ts`), rồi id số tăng dần. Trả mảng MỚI, không đổi đầu vào.
 */
export function rankDoctors<T extends RankCandidate>(
  items: readonly T[],
  weights: RankWeights,
  systemTenths: number | null,
): T[] {
  const scored = items.map((item) => ({
    item,
    score: scoreOf(item, weights, systemTenths),
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.item.soNamKinhNghiem - a.item.soNamKinhNghiem ||
      a.item.hoTen.localeCompare(b.item.hoTen, 'vi') ||
      compareIds(a.item.bacSiId, b.item.bacSiId),
  );
  return scored.map((entry) => entry.item);
}
