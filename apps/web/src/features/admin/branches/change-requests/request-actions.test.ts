import { actionsFor, isOverdue } from './request-actions';
import type { ChangeRequestListItem } from './change-request-types';

// Admin F6b — CN-111 (phần quyền hiện nút): thao tác theo vai trò và trạng thái (Q3, Q47, Q48). Máy chủ vẫn kiểm lại.

function item(
  overrides: Partial<ChangeRequestListItem> = {},
): ChangeRequestListItem {
  return {
    yeuCauThayDoiChiNhanhId: '7',
    chiNhanh: { chiNhanhId: '25', ten: 'Chi nhánh Quận 3' },
    nguoiDeXuat: { taiKhoanId: '3', hoTen: 'Phạm Thị Lan' },
    trangThai: 'ChoDuyet',
    thoiDiemTao: '2026-11-02 07:00:00',
    thoiDiemDuyet: null,
    hieuLucTu: null,
    apDungLuc: null,
    quaHanLuc: null,
    thuThayDoi: [1],
    coDoiDichVu: false,
    laCuaToi: false,
    ...overrides,
  };
}

const approved = (overrides: Partial<ChangeRequestListItem> = {}) =>
  item({
    trangThai: 'DaDuyet',
    thoiDiemDuyet: '2026-11-02 08:00:00',
    hieuLucTu: '2026-11-05 08:00:00',
    ...overrides,
  });

describe('CN-111 thao tác theo vai trò và trạng thái', () => {
  it('AF6B-22 Chờ duyệt: Toàn hệ thống Duyệt/Từ chối; người gửi thêm Rút (kể cả Toàn hệ thống tự gửi); Chi nhánh không phải người gửi không có nút', () => {
    expect(actionsFor(item(), true)).toEqual(['approve', 'reject']);
    expect(actionsFor(item({ laCuaToi: true }), true)).toEqual([
      'approve',
      'reject',
      'withdraw',
    ]);
    expect(actionsFor(item({ laCuaToi: true }), false)).toEqual(['withdraw']);
    expect(actionsFor(item(), false)).toEqual([]);
  });

  it('AF6B-22 Đã duyệt chưa áp dụng: Toàn hệ thống Hủy; quá hạn thêm Dời hiệu lực; Chi nhánh chỉ xem', () => {
    expect(actionsFor(approved(), true)).toEqual(['cancel']);
    const overdue = approved({ quaHanLuc: '2026-11-05 08:00:00' });
    expect(actionsFor(overdue, true)).toEqual(['reschedule', 'cancel']);
    expect(actionsFor(overdue, false)).toEqual([]);
  });

  it('AF6B-22 biên: đã áp dụng, Từ chối, Đã rút, Đã hủy ⇒ không còn thao tác (kể cả người gửi)', () => {
    expect(
      actionsFor(approved({ apDungLuc: '2026-11-05 08:00:00' }), true),
    ).toEqual([]);
    for (const trangThai of ['TuChoi', 'DaRut', 'DaHuy'] as const)
      expect(actionsFor(item({ trangThai, laCuaToi: true }), true)).toEqual([]);
  });

  it('AF6B-22 quá hạn chỉ khi Đã duyệt, chưa áp dụng và có qua_han_luc', () => {
    expect(isOverdue(approved({ quaHanLuc: '2026-11-05 08:00:00' }))).toBe(
      true,
    );
    expect(isOverdue(approved())).toBe(false);
    expect(
      isOverdue(
        approved({
          quaHanLuc: '2026-11-05 08:00:00',
          apDungLuc: '2026-11-12 08:00:00',
        }),
      ),
    ).toBe(false);
  });
});
