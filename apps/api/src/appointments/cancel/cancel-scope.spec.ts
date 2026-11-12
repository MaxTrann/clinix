import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { isInCancelScope, type CancelTarget } from './cancel-scope.js';
import type { CancelActor } from './cancel.types.js';

// Task B10 — CNL-06 (phần ĐƠN VỊ): sở hữu và phạm vi theo actor, hàm thuần (PLAN booking 5.3 quy tắc 2; TRACKING 3.23 B10-D, quyết định (j)). Phần MySQL thật: appointment-cancellation.service.int-spec.ts.
const policy = new BranchAccessPolicy();
const TARGET: CancelTarget = {
  benhNhanId: '7',
  chiNhanhId: '2',
  trangThai: 'DaXacNhan',
};
const BENH_NHAN: CancelActor = { kind: 'BenhNhan', accountId: '7' };
const LE_TAN: CancelActor = {
  kind: 'LeTan',
  accountId: '5',
  chiNhanhId: '2',
};
const QTV_ALL: CancelActor = {
  kind: 'QuanTriVien',
  accountId: '6',
  scope: { kind: 'ToanHeThong' },
};
const QTV_BRANCH = (chiNhanhId: string): CancelActor => ({
  kind: 'QuanTriVien',
  accountId: '6',
  scope: { kind: 'ChiNhanh', chiNhanhId },
});

describe('CNL-06 isInCancelScope: sở hữu và phạm vi theo actor', () => {
  it('BenhNhan: chỉ lịch có benh_nhan_id = tài khoản của token (kể cả lịch của hồ sơ người thân của mình, vì benh_nhan_id là người ĐẶT)', () => {
    expect(isInCancelScope(BENH_NHAN, TARGET, policy)).toBe(true);
    expect(
      isInCancelScope({ kind: 'BenhNhan', accountId: '8' }, TARGET, policy),
    ).toBe(false);
  });

  it('BenhNhan KHÔNG thấy DaDoiLich (nhất quán B1, B2: ngoài PATIENT_VISIBLE_STATES) ⇒ 404 ở route Bệnh nhân; mọi trạng thái còn lại thấy được', () => {
    for (const trangThai of TRANG_THAI_LICH_HEN) {
      expect(isInCancelScope(BENH_NHAN, { ...TARGET, trangThai }, policy)).toBe(
        trangThai !== 'DaDoiLich',
      );
    }
  });

  it('LeTan, QuanTriVien và HeThong vẫn THẤY DaDoiLich (rồi ma trận cho NotCancellable ⇒ 409, không phải 404)', () => {
    const replaced = { ...TARGET, trangThai: 'DaDoiLich' } as const;
    for (const actor of [
      LE_TAN,
      QTV_ALL,
      QTV_BRANCH('2'),
      { kind: 'HeThong' } as const,
    ])
      expect(isInCancelScope(actor, replaced, policy)).toBe(true);
  });

  it('LeTan: chỉ lịch của chi nhánh mình (so chuỗi id, không ép số)', () => {
    expect(isInCancelScope(LE_TAN, TARGET, policy)).toBe(true);
    expect(
      isInCancelScope(LE_TAN, { ...TARGET, chiNhanhId: '3' }, policy),
    ).toBe(false);
    expect(
      isInCancelScope(
        { ...LE_TAN, chiNhanhId: '9007199254740993' } as CancelActor,
        { ...TARGET, chiNhanhId: '9007199254740992' },
        policy,
      ),
    ).toBe(false);
  });

  it('QuanTriVien: Toàn hệ thống thấy mọi chi nhánh; Chi nhánh chỉ thấy chi nhánh của mình', () => {
    expect(isInCancelScope(QTV_ALL, TARGET, policy)).toBe(true);
    expect(isInCancelScope(QTV_BRANCH('2'), TARGET, policy)).toBe(true);
    expect(isInCancelScope(QTV_BRANCH('3'), TARGET, policy)).toBe(false);
  });

  it('HeThong: không giới hạn (duyệt nghỉ phép tự chọn lịch qua findAffectedByLeave)', () => {
    expect(
      isInCancelScope(
        { kind: 'HeThong' },
        { benhNhanId: '1', chiNhanhId: '99', trangThai: 'ChoThanhToan' },
        policy,
      ),
    ).toBe(true);
  });
});
