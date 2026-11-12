import { expectTypeOf } from 'vitest';
import {
  CANCEL_REASON_MAX_LENGTH,
  LEAVE_CANCEL_REASON,
  PATIENT_CANCEL_REASON,
} from '../appointments.constants.js';
import { resolveCancelReason } from './cancel-reason.js';
import type { CancelInput, CancelOutcome } from './cancel.types.js';

// Task B10 — CNL-01: chữ `ly_do_huy` theo `reason` (Q27) và hợp đồng KIỂU của `CancelInput` (PLAN 7.29 `[đề xuất]`; TRACKING 3.23 B10-C). Hàm thuần, không DB. Phần kiểu do `tsc --noEmit` kiểm (spec nằm trong
// tsconfig): `expectTypeOf(...).not.toExtend` là LỖI BIÊN DỊCH nếu một cặp (actor, reason) sai lại được chấp nhận; lúc chạy vitest các dòng đó là no-op.
const CODE = 'CLX-20261110-AAA01';
const LE_TAN = { kind: 'LeTan', accountId: '5', chiNhanhId: '2' } as const;
const QTV = {
  kind: 'QuanTriVien',
  accountId: '6',
  scope: { kind: 'ToanHeThong' },
} as const;
const BENH_NHAN = { kind: 'BenhNhan', accountId: '7' } as const;
const text = (length: number) => 'a'.repeat(length);

describe('CNL-01 chữ ly_do_huy theo reason (Q27)', () => {
  it('hằng đúng chữ của Q27 và vừa varchar(255)', () => {
    expect(PATIENT_CANCEL_REASON).toBe('Bệnh nhân hủy lịch hẹn');
    expect(CANCEL_REASON_MAX_LENGTH).toBe(255);
    expect(PATIENT_CANCEL_REASON.length).toBeLessThanOrEqual(
      CANCEL_REASON_MAX_LENGTH,
    );
    expect(LEAVE_CANCEL_REASON.length).toBeLessThanOrEqual(
      CANCEL_REASON_MAX_LENGTH,
    );
    expect(LEAVE_CANCEL_REASON).not.toBe(PATIENT_CANCEL_REASON);
  });

  it('Bệnh nhân: vắng, rỗng hay chỉ khoảng trắng ⇒ hằng "Bệnh nhân hủy lịch hẹn"; có chữ ⇒ chữ đã cắt khoảng trắng hai đầu', () => {
    const base = {
      maLichHen: CODE,
      actor: BENH_NHAN,
      reason: 'BenhNhanHuy',
    } as const;
    expect(resolveCancelReason(base)).toBe(PATIENT_CANCEL_REASON);
    expect(resolveCancelReason({ ...base, lyDo: '' })).toBe(
      PATIENT_CANCEL_REASON,
    );
    expect(resolveCancelReason({ ...base, lyDo: '  \t ' })).toBe(
      PATIENT_CANCEL_REASON,
    );
    expect(resolveCancelReason({ ...base, lyDo: '  Bận việc đột xuất ' })).toBe(
      'Bận việc đột xuất',
    );
  });

  it('Lễ tân và Quản trị viên: lý do BẮT BUỘC 1 đến 255 ký tự (thiếu hay chỉ khoảng trắng thì ném RangeError); trả chữ đã cắt khoảng trắng', () => {
    for (const [actor, reason] of [
      [LE_TAN, 'LeTanHuy'],
      [QTV, 'QtvOverride'],
    ] as const) {
      const make = (lyDo: string): CancelInput =>
        ({ maLichHen: CODE, actor, reason, lyDo }) as CancelInput;
      expect(resolveCancelReason(make(' Bệnh nhân gọi điện '))).toBe(
        'Bệnh nhân gọi điện',
      );
      expect(resolveCancelReason(make(text(255)))).toHaveLength(255);
      expect(() => resolveCancelReason(make(''))).toThrow(RangeError);
      expect(() => resolveCancelReason(make('   '))).toThrow(RangeError);
      expect(() => resolveCancelReason(make(text(256)))).toThrow(RangeError);
    }
  });

  it('Bệnh nhân gửi lý do dài hơn 255 ký tự: ném RangeError (DTO đã chặn ở HTTP; đây là lưới an toàn trước lỗi 1406 của MySQL)', () => {
    expect(() =>
      resolveCancelReason({
        maLichHen: CODE,
        actor: BENH_NHAN,
        reason: 'BenhNhanHuy',
        lyDo: text(256),
      }),
    ).toThrow(RangeError);
    // độ dài đếm sau khi cắt khoảng trắng: 255 ký tự bao quanh bởi khoảng trắng vẫn hợp lệ
    expect(
      resolveCancelReason({
        maLichHen: CODE,
        actor: BENH_NHAN,
        reason: 'BenhNhanHuy',
        lyDo: ` ${text(255)} `,
      }),
    ).toHaveLength(255);
  });

  it('HeThong và BacSiNghiPhep: LUÔN là hằng, KHÔNG đọc lyDo (quyền riêng tư: lý do nghỉ phép của bác sĩ không được chảy vào ly_do_huy)', () => {
    const input = {
      maLichHen: CODE,
      actor: { kind: 'HeThong' },
      reason: 'BacSiNghiPhep',
    } as const;
    expect(resolveCancelReason(input)).toBe(LEAVE_CANCEL_REASON);
    // người gọi JS (hay `as`) lỡ gửi lyDo: vẫn bị bỏ qua
    const sneaky = { ...input, lyDo: 'Khám bệnh riêng của bác sĩ' };
    expect(resolveCancelReason(sneaky as unknown as CancelInput)).toBe(
      LEAVE_CANCEL_REASON,
    );
  });
});

describe('CNL-01 hợp đồng KIỂU: actor và reason là MỘT union gắn với nhau (kiểm bằng tsc)', () => {
  it('cặp đúng biên dịch được; cặp sai KHÔNG (not.toExtend là lỗi biên dịch nếu cặp sai lọt qua)', () => {
    type Base = { maLichHen: string };
    expectTypeOf<
      Base & {
        actor: { kind: 'BenhNhan'; accountId: string };
        reason: 'BenhNhanHuy';
      }
    >().toExtend<CancelInput>();
    expectTypeOf<
      Base & { actor: { kind: 'HeThong' }; reason: 'BacSiNghiPhep' }
    >().toExtend<CancelInput>();

    // Hệ thống không huỷ "thay" Bệnh nhân; Bệnh nhân không huỷ với lý do nghỉ phép; Lễ tân không mang lý do của Quản trị viên
    expectTypeOf<
      Base & { actor: { kind: 'HeThong' }; reason: 'BenhNhanHuy' }
    >().not.toExtend<CancelInput>();
    expectTypeOf<
      Base & {
        actor: { kind: 'BenhNhan'; accountId: string };
        reason: 'BacSiNghiPhep';
      }
    >().not.toExtend<CancelInput>();
    expectTypeOf<
      Base & {
        actor: { kind: 'LeTan'; accountId: string; chiNhanhId: string };
        reason: 'QtvOverride';
        lyDo: string;
      }
    >().not.toExtend<CancelInput>();
    // `HetHanGiuCho` là việc của `expire`, không phải của `cancel`
    expectTypeOf<
      Base & { actor: { kind: 'HeThong' }; reason: 'HetHanGiuCho' }
    >().not.toExtend<CancelInput>();
    // Lễ tân và Quản trị viên BẮT BUỘC có lyDo (Q27)
    expectTypeOf<
      Base & {
        actor: { kind: 'LeTan'; accountId: string; chiNhanhId: string };
        reason: 'LeTanHuy';
      }
    >().not.toExtend<CancelInput>();
    expectTypeOf<
      Base & {
        actor: {
          kind: 'QuanTriVien';
          accountId: string;
          scope: { kind: 'ToanHeThong' };
        };
        reason: 'QtvOverride';
      }
    >().not.toExtend<CancelInput>();
    // Chỉ `maLichHen` (không `lichHenId`) và HeThong KHÔNG có lyDo
    expectTypeOf<
      Base & {
        actor: { kind: 'HeThong' };
        reason: 'BacSiNghiPhep';
        lyDo: string;
      }
    >().not.toExtend<CancelInput>();
    expectTypeOf<
      { lichHenId: string } & {
        actor: { kind: 'HeThong' };
        reason: 'BacSiNghiPhep';
      }
    >().not.toExtend<CancelInput>();
  });

  it('CancelOutcome đúng bốn nhánh, không có Failed (lỗi hệ thống thì ném)', () => {
    expectTypeOf<CancelOutcome['kind']>().toEqualTypeOf<
      'Cancelled' | 'AlreadyCancelled' | 'NotCancellable' | 'NotFound'
    >();
    expectTypeOf<
      Extract<CancelOutcome, { kind: 'Cancelled' }>['hoanCoc']
    >().toEqualTypeOf<{ tyLe: number; soTien: string } | null>();
  });
});
