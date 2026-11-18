import type { AuditEntry } from '../audit-entry.js';

type EntryOf<A extends AuditEntry['action']> = Extract<
  AuditEntry,
  { action: A }
>;

// Entry hợp lệ của bốn hành động payment P5 (PLAN payment 5.6, 5.8; Q17), dùng chung cho spec đơn vị và int-spec (TDT-06, TDT-07, MGT-10).
// Mặc định id nhỏ cho spec đơn vị; int-spec truyền id thật của Quản trị viên và chi nhánh. Số tiền và lý do là dữ liệu MINH HOẠ.

/** `HoanTienDacBiet`: chỉ số tiền và lý do. `targetId` là khoản thanh toán được hoàn, `branchId` là chi nhánh của LỊCH GỐC. */
export function specialRefundEntry(
  overrides: Partial<EntryOf<'HoanTienDacBiet'>> = {},
): EntryOf<'HoanTienDacBiet'> {
  return {
    actorId: '1',
    branchId: '2',
    action: 'HoanTienDacBiet',
    targetType: 'giao_dich_thanh_toan',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      so_tien: '150000.00',
      ly_do: 'Bác sĩ đến muộn 40 phút, hoàn một phần',
    },
    ...overrides,
  };
}

/** `XuLyNapViChuaCong` kết quả `ThanhCong` (Quản trị viên cộng ví): không có `ly_do`. `branchId` null. */
export function topupCreditedEntry(
  overrides: Partial<EntryOf<'XuLyNapViChuaCong'>> = {},
): EntryOf<'XuLyNapViChuaCong'> {
  return {
    actorId: '1',
    branchId: null,
    action: 'XuLyNapViChuaCong',
    targetType: 'giao_dich_thanh_toan',
    targetId: '3',
    result: 'ThanhCong',
    changes: { ket_qua: 'ThanhCong', so_tien: '200000.00' },
    ...overrides,
  };
}

/** `XuLyNapViChuaCong` kết quả `KhongTheXuLy`: `ly_do` bắt buộc 10–255. */
export function topupUnprocessableEntry(
  overrides: Partial<EntryOf<'XuLyNapViChuaCong'>> = {},
): EntryOf<'XuLyNapViChuaCong'> {
  return {
    ...topupCreditedEntry(),
    changes: {
      ket_qua: 'KhongTheXuLy',
      so_tien: '200000.00',
      ly_do: 'Cổng báo hoàn tiền về thẻ, không cộng ví',
    },
    ...overrides,
  };
}

/** `DuyetRutTien`: `ChoDuyet` → `DaDuyet`, số tiền, ghi chú tuỳ chọn. `targetId` là yêu cầu rút tiền, `branchId` null. */
export function withdrawalApprovedEntry(
  overrides: Partial<EntryOf<'DuyetRutTien'>> = {},
): EntryOf<'DuyetRutTien'> {
  return {
    actorId: '1',
    branchId: null,
    action: 'DuyetRutTien',
    targetType: 'yeu_cau_rut_tien',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      truoc: { trang_thai: 'ChoDuyet' },
      sau: { trang_thai: 'DaDuyet' },
      so_tien: '500000.00',
      ly_do: 'Đã chuyển khoản',
    },
    ...overrides,
  };
}

/** `TuChoiRutTien`: `ChoDuyet` → `TuChoi`; ở đây KHÔNG có ghi chú (khoá `ly_do` vắng hẳn). */
export function withdrawalRejectedEntry(
  overrides: Partial<EntryOf<'TuChoiRutTien'>> = {},
): EntryOf<'TuChoiRutTien'> {
  return {
    actorId: '1',
    branchId: null,
    action: 'TuChoiRutTien',
    targetType: 'yeu_cau_rut_tien',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      truoc: { trang_thai: 'ChoDuyet' },
      sau: { trang_thai: 'TuChoi' },
      so_tien: '500000.00',
    },
    ...overrides,
  };
}

/** Một entry hợp lệ cho mỗi biến thể (năm entry, bốn hành động). */
export const paymentAuditEntries = (): AuditEntry[] => [
  specialRefundEntry(),
  topupCreditedEntry(),
  topupUnprocessableEntry(),
  withdrawalApprovedEntry(),
  withdrawalRejectedEntry(),
];
