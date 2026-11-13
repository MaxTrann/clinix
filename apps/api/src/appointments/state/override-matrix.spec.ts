import { describe, expect, it } from 'vitest';
import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { allowedTargets, canTransition } from './appointment-state.matrix.js';

// Task B14 — MT-01 chạy lại cho Quản trị viên và nền của CT-14 và CT-16 (PLAN booking 5.2, 7.5, Q24; TRACKING 3.31 B14-D): MA TRẬN ĐẦY ĐỦ 7 × 7 = 49 ô của `QuanTriVien`, SINH từ `canTransition` rồi đối chiếu với danh sách
// viết tay của Q24, nên ma trận đổi (thêm nguồn `HoanThanh`, thêm đích `ChoThanhToan`…) thì ca đỏ. Ma trận KHÔNG đổi ở B14 (đã đủ 10 ô từ P1). Cách phân loại lỗi ở route (`LICH_HEN_KHONG_CHO_HUY` cho đích `DaHuy`,
// `CHUYEN_TRANG_THAI_KHONG_HOP_LE` cho đích khác) nằm ở dịch vụ override (viết SAU khi Đại cho phép `[ĐỤNG audit]` và `onChanged` của `markNoShow`, `cancel`) và được kiểm ở spec của dịch vụ đó (OVR-06, OVR-07).

/** Q24: nguồn ∈ {ChoThanhToan, DaXacNhan, DaTiepDon, VangMat}, đích ∈ {DaHuy, VangMat, DaTiepDon, DaXacNhan}; từ `ChoThanhToan` chỉ tới `DaHuy`; cùng trạng thái không phải chuyển. */
const Q24_ALLOWED: Record<string, readonly TrangThaiLichHen[]> = {
  ChoThanhToan: ['DaHuy'],
  DaXacNhan: ['DaHuy', 'DaTiepDon', 'VangMat'],
  DaTiepDon: ['DaHuy', 'DaXacNhan', 'VangMat'],
  VangMat: ['DaHuy', 'DaXacNhan', 'DaTiepDon'],
};

const cells = TRANG_THAI_LICH_HEN.flatMap((from) =>
  TRANG_THAI_LICH_HEN.map((to) => ({
    from,
    to,
    decision: canTransition({ actor: 'QuanTriVien', from, to }),
  })),
);

describe('MT-01 (Quản trị viên) ma trận Q24 đầy đủ 49 ô, sinh từ canTransition', () => {
  it('có đủ 7 × 7 = 49 ô', () => {
    expect(TRANG_THAI_LICH_HEN).toHaveLength(7);
    expect(cells).toHaveLength(49);
  });

  it('đúng 10 ô được, và là đúng các ô của Q24 (không thừa, không thiếu)', () => {
    const allowed = cells
      .filter(({ decision }) => decision.ok)
      .map(({ from, to }) => `${from}>${to}`)
      .sort();
    const expected = Object.entries(Q24_ALLOWED)
      .flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`))
      .sort();
    expect(expected).toHaveLength(10);
    expect(allowed).toEqual(expected);
  });

  it('đích HoanThanh: cả 7 nguồn (kể cả HoanThanh) ⇒ ChiBacSiHoanThanh (MT-03: kể cả Quản trị viên, mọi nguồn)', () => {
    const toDone = cells.filter(({ to }) => to === 'HoanThanh');
    expect(toDone).toHaveLength(7);
    for (const { from, decision } of toDone)
      expect(decision, from).toEqual({
        ok: false,
        reason: 'ChiBacSiHoanThanh',
      });
  });

  it('39 ô bị từ chối = 7 ô đích HoanThanh (ChiBacSiHoanThanh) + 32 ô KhongHopLe; không ô nào từ chối vì lý do khác (cửa sổ, tiền, thiếu dữ liệu: override không có điều kiện, quy tắc 40, 47)', () => {
    const refused = cells.filter(({ decision }) => !decision.ok);
    expect(refused).toHaveLength(39);
    const reasons = refused.map(({ decision }) =>
      decision.ok ? '' : decision.reason,
    );
    expect(reasons.filter((r) => r === 'ChiBacSiHoanThanh')).toHaveLength(7);
    expect(reasons.filter((r) => r === 'KhongHopLe')).toHaveLength(32);
  });

  it('đích DaHuy mà bị từ chối: đúng 3 ô, nguồn HoanThanh, DaHuy, DaDoiLich (route trả LICH_HEN_KHONG_CHO_HUY, B10-G); 29 ô còn lại ra CHUYEN_TRANG_THAI_KHONG_HOP_LE', () => {
    const refusedToCancel = cells
      .filter(({ to, decision }) => to === 'DaHuy' && !decision.ok)
      .map(({ from }) => from)
      .sort();
    expect(refusedToCancel).toEqual(['DaDoiLich', 'DaHuy', 'HoanThanh']);
    const invalid = cells.filter(
      ({ to, decision }) =>
        !decision.ok && decision.reason === 'KhongHopLe' && to !== 'DaHuy',
    );
    expect(invalid).toHaveLength(29);
  });

  it('không ô nào cho đích ChoThanhToan hay DaDoiLich; không ô nào cho nguồn HoanThanh, DaHuy, DaDoiLich (Q24: không khôi phục từ DaHuy)', () => {
    for (const { from, to, decision } of cells) {
      if (to === 'ChoThanhToan' || to === 'DaDoiLich')
        expect(decision.ok, `${from}>${to}`).toBe(false);
      if (from === 'HoanThanh' || from === 'DaHuy' || from === 'DaDoiLich')
        expect(decision.ok, `${from}>${to}`).toBe(false);
    }
  });

  it('allowedTargets của Quản trị viên khớp Q24 từng nguồn, theo thứ tự TRANG_THAI_LICH_HEN (nguồn của chuyenDuoc[] cho F10)', () => {
    for (const from of TRANG_THAI_LICH_HEN) {
      const expected = TRANG_THAI_LICH_HEN.filter((to) =>
        (Q24_ALLOWED[from] ?? []).includes(to),
      );
      expect(allowedTargets('QuanTriVien', from), from).toEqual(expected);
    }
  });
});
