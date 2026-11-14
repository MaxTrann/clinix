import type { AuditEntry } from '../audit-entry.js';

type EntryOf<A extends AuditEntry['action']> = Extract<
  AuditEntry,
  { action: A }
>;

// Entry hợp lệ của hai hành động doctor-exam P2, dùng chung cho spec đơn vị (HDK-09) và int-spec (TDK-04, TDK-05).
// Mặc định dùng id nhỏ cho spec đơn vị; int-spec truyền id thật của actor, chi nhánh của lịch và đối tượng.

/** `SuaGhiChuKham`: chỉ các trường có đổi, hai bên cùng tập khoá. `branchId` là chi nhánh của LỊCH. */
export function editRecordEntry(
  overrides: Partial<EntryOf<'SuaGhiChuKham'>> = {},
): EntryOf<'SuaGhiChuKham'> {
  return {
    actorId: '1',
    branchId: '2',
    action: 'SuaGhiChuKham',
    targetType: 'ho_so_kham',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      truoc: { chan_doan_so_bo: 'Viêm họng cấp', ngay_tai_kham_du_kien: null },
      sau: {
        chan_doan_so_bo: 'Viêm amiđan cấp',
        ngay_tai_kham_du_kien: '2026-12-15',
      },
    },
    ...overrides,
  };
}

/** `AnDanhGia`: không nhận xét, không tên người đánh giá. `branchId` là chi nhánh của LỊCH. */
export function hideRatingEntry(
  overrides: Partial<EntryOf<'AnDanhGia'>> = {},
): EntryOf<'AnDanhGia'> {
  return {
    actorId: '1',
    branchId: '2',
    action: 'AnDanhGia',
    targetType: 'danh_gia_bac_si',
    targetId: '3',
    result: 'ThanhCong',
    changes: {
      truoc: { bi_an: false },
      sau: { bi_an: true },
      ly_do: 'Nội dung quảng cáo, không liên quan đến buổi khám',
      bac_si_id: '5',
    },
    ...overrides,
  };
}
