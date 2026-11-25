import type { AuditEntry } from '../audit-entry.js';

type EntryOf<A extends AuditEntry['action']> = Extract<
  AuditEntry,
  { action: A }
>;

// Entry hợp lệ của hai hành động reschedule P2 (PLAN reschedule 5.11; Q6, Q9), dùng chung cho spec đơn vị, int-spec của audit và test của B7, B9 (NDL-04, NDL-08, NDL-12…NDL-20).
// Mặc định id nhỏ cho spec đơn vị; int-spec truyền id thật của actor và chi nhánh. Mã lịch và lý do là dữ liệu MINH HOẠ (mã đúng mẫu `CLX-yyyyMMdd-XXXXX`).

/** `DoiLichHo`: `targetId` là id lịch CŨ, `branchId` là chi nhánh của LỊCH; `thoi_gian` dạng `toISOString()` (UTC) như B7 sẽ ghi. */
export function proxyRescheduleEntry(
  overrides: Partial<EntryOf<'DoiLichHo'>> = {},
): EntryOf<'DoiLichHo'> {
  return {
    actorId: '1',
    branchId: '2',
    action: 'DoiLichHo',
    targetType: 'lich_hen',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      truoc: {
        ma_lich_hen: 'CLX-20261201-7K3QD',
        thoi_gian: '2026-12-01T02:00:00.000Z',
      },
      sau: {
        ma_lich_hen: 'CLX-20261125-A4B9C',
        thoi_gian: '2026-12-03T07:30:00.000Z',
      },
      ly_do: 'Bệnh nhân gọi điện xin dời sang buổi chiều vì trùng lịch làm',
    },
    ...overrides,
  };
}

/** `XuLyDoiLichNgoaiChinhSach` kết quả duyệt: CÓ `ma_lich_hen_moi`. `targetId` là id yêu cầu, `branchId` là chi nhánh của lịch gốc. */
export function requestApprovedEntry(
  overrides: Partial<EntryOf<'XuLyDoiLichNgoaiChinhSach'>> = {},
): EntryOf<'XuLyDoiLichNgoaiChinhSach'> {
  return {
    actorId: '1',
    branchId: '2',
    action: 'XuLyDoiLichNgoaiChinhSach',
    targetType: 'yeu_cau_doi_lich_ngoai_chinh_sach',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      truoc: { trang_thai: 'ChoDuyet' },
      sau: { trang_thai: 'DaDuyet' },
      ghi_chu: 'Đã xếp sang khung giờ chiều cùng bác sĩ',
      ma_lich_hen_cu: 'CLX-20261201-7K3QD',
      ma_lich_hen_moi: 'CLX-20261125-A4B9C',
    },
    ...overrides,
  };
}

/** `XuLyDoiLichNgoaiChinhSach` kết quả từ chối: KHÔNG có `ma_lich_hen_moi` (khoá vắng hẳn). */
export function requestRejectedEntry(
  overrides: Partial<EntryOf<'XuLyDoiLichNgoaiChinhSach'>> = {},
): EntryOf<'XuLyDoiLichNgoaiChinhSach'> {
  return {
    actorId: '1',
    branchId: '2',
    action: 'XuLyDoiLichNgoaiChinhSach',
    targetType: 'yeu_cau_doi_lich_ngoai_chinh_sach',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      truoc: { trang_thai: 'ChoDuyet' },
      sau: { trang_thai: 'TuChoi' },
      ghi_chu: 'Bác sĩ không còn khung giờ phù hợp trong tuần đó',
      ma_lich_hen_cu: 'CLX-20261201-7K3QD',
    },
    ...overrides,
  };
}

/** Một entry hợp lệ cho mỗi biến thể (ba entry, hai hành động). */
export const rescheduleAuditEntries = (): AuditEntry[] => [
  proxyRescheduleEntry(),
  requestApprovedEntry(),
  requestRejectedEntry(),
];
