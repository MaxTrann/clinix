import type { ExamRecordFields } from './exam-record.rules.js';

// So sánh, nhật ký và quyền theo trạng thái của hồ sơ khám, HÀM THUẦN (doctor-exam B2; PLAN 5.2; Q3, Q15). Không đọc đồng hồ (nhận `now`), không DB.

type AuditKey =
  'trieu_chung' | 'chan_doan_so_bo' | 'huong_xu_ly' | 'ngay_tai_kham_du_kien';
/** Hình dạng `truoc`/`sau` mà `audit/` nhận cho `SuaGhiChuKham`: chỉ khoá CÓ ĐỔI, khoá snake_case. */
export type AuditFacts = Partial<Record<AuditKey, string | null>>;

const FIELDS: readonly (readonly [keyof ExamRecordFields, AuditKey])[] = [
  ['trieuChung', 'trieu_chung'],
  ['chanDoanSoBo', 'chan_doan_so_bo'],
  ['huongXuLy', 'huong_xu_ly'],
  ['ngayTaiKhamDuKien', 'ngay_tai_kham_du_kien'],
];

/** "Không đổi" so ở ỨNG DỤNG bằng `===` trên chuỗi đã chuẩn hoá, KHÔNG bằng SQL: collation `utf8mb4_unicode_ci` coi `a`, `A`, `á` là bằng nhau (H2; X1 M10). */
export function sameContent(
  hienCo: ExamRecordFields,
  moi: ExamRecordFields,
): boolean {
  return FIELDS.every(([field]) => hienCo[field] === moi[field]);
}

/**
 * `{ truoc, sau }` cho nhật ký `SuaGhiChuKham`: chỉ các trường CÓ ĐỔI, cùng tập khoá ở hai bên (`audit/` từ chối khoá không đổi). `hienCo` là `null` khi chưa có bản cũ (không xảy ra khi
 * `isAuditedEdit` đúng): coi mọi trường cũ là `null`.
 */
export function diffForAudit(
  hienCo: ExamRecordFields | null,
  moi: ExamRecordFields,
): { truoc: AuditFacts; sau: AuditFacts } {
  const truoc: AuditFacts = {};
  const sau: AuditFacts = {};
  for (const [field, key] of FIELDS) {
    const before = hienCo === null ? null : hienCo[field];
    if (before === moi[field]) continue;
    truoc[key] = before;
    sau[key] = moi[field];
  }
  return { truoc, sau };
}

/** Q4, Q16: chỉ ghi khi lịch `DaTiepDon` hoặc `HoanThanh`. */
export function canWriteRecord(trangThai: string): boolean {
  return trangThai === 'DaTiepDon' || trangThai === 'HoanThanh';
}

/** Q3: nhật ký khi VÀ CHỈ KHI lịch đang `HoanThanh` và đã có dòng hồ sơ ("sửa lại sau khi Hoàn thành"); ghi lần đầu và sửa khi còn `DaTiepDon` không ghi. MỘT chỗ duy nhất áp luật này. */
export function isAuditedEdit(trangThai: string, daCoHoSo: boolean): boolean {
  return trangThai === 'HoanThanh' && daCoHoSo;
}

/** Token sửa chồng (Q3): chưa có dòng thì thân phải mang `null`; có dòng thì phải đúng chuỗi ISO của `cap_nhat_lan_cuoi` hiện có. */
export function tokenMatches(
  token: string | null,
  hienCo: Date | null,
): boolean {
  return hienCo === null ? token === null : token === hienCo.toISOString();
}

/**
 * `cap_nhat_lan_cuoi` mới = `max(now, cũ + 1 giây)` (phiên kiểm duyệt 15/11/2026): cột là DATETIME giây, nên hai lần ghi trong cùng một giây sẽ cho cùng token và một lần sửa chồng lọt qua.
 * Hệ quả: ghi dồn dập thì token có thể đi trước đồng hồ vài giây (TECH_DEBT). Lần ghi đầu (không có bản cũ): `now`.
 */
export function nextRecordTime(now: Date, hienCo: Date | null): Date {
  return hienCo === null
    ? now
    : new Date(Math.max(now.getTime(), hienCo.getTime() + 1000));
}
