import { describe, expect, it } from 'vitest';
import { APPOINTMENT_STATES } from './appointment-status';
import {
  buildStatusSteps,
  STATUS_STEP_TEXT,
  type UnknownStatusMode,
} from './status-steps';

// booking F13 (issue #550): hàm thuần dựng các bước của thanh trạng thái, MỘT hàm cho Bác sĩ, Bệnh nhân và Quản trị viên. Mã STL là [đề xuất] (PLAN booking mục 7.49).
// Gộp hai bộ ca cũ mà KHÔNG mất giá trị kỳ vọng nào: `doctor/detail/timeline-steps.test.ts` (DAD-09 ×4, từ vựng `done`/`ended`) và `patient/detail/detail-timeline-steps.test.ts` (LCT-01 ×3, từ vựng `passed`/`terminal`).
// Bảng: DAD-09 luồng ⇒ STL-01; DAD-09 Chờ thanh toán ⇒ STL-01, STL-02; DAD-09 Hủy và Vắng mặt ⇒ STL-03; DAD-09 mã lạ ⇒ STL-04; LCT-01 mỗi trạng thái ⇒ STL-01; LCT-01 Hủy và Vắng mặt ⇒ STL-03; LCT-01 mã lạ ⇒ STL-05.
const summary = (state: string, unknown: UnknownStatusMode) =>
  buildStatusSteps(state, unknown)?.steps.map(
    (step) => `${step.label}:${step.state}`,
  );

const MODES: readonly UnknownStatusMode[] = ['hide', 'upcoming'];
const UNKNOWN_CODES = [
  'DaDoiLich',
  '',
  'constructor',
  '__proto__',
  'daxacnhan',
  'XYZ',
  'Bậy',
];

describe('booking F13 — các bước của thanh trạng thái dùng chung', () => {
  it.each(MODES)(
    'STL-01 sáu trạng thái ra đúng nhãn và `state` (tham số `unknown` = %s không ảnh hưởng mã đã biết)',
    (mode) => {
      expect(summary('ChoThanhToan', mode)).toEqual([
        'Đã xác nhận:upcoming',
        'Đã tiếp đón:upcoming',
        'Hoàn thành:upcoming',
      ]);
      expect(summary('DaXacNhan', mode)).toEqual([
        'Đã xác nhận:current',
        'Đã tiếp đón:upcoming',
        'Hoàn thành:upcoming',
      ]);
      expect(summary('DaTiepDon', mode)).toEqual([
        'Đã xác nhận:passed',
        'Đã tiếp đón:current',
        'Hoàn thành:upcoming',
      ]);
      expect(summary('HoanThanh', mode)).toEqual([
        'Đã xác nhận:passed',
        'Đã tiếp đón:passed',
        'Hoàn thành:current',
      ]);
      expect(summary('DaHuy', mode)).toEqual([
        'Đã xác nhận:upcoming',
        'Đã tiếp đón:upcoming',
        'Hoàn thành:upcoming',
        'Đã hủy:terminal',
      ]);
      expect(summary('VangMat', mode)).toEqual([
        'Đã xác nhận:upcoming',
        'Đã tiếp đón:upcoming',
        'Hoàn thành:upcoming',
        'Vắng mặt:terminal',
      ]);
    },
  );

  it('STL-02 dải chờ thanh toán: `pendingPayment` đúng ở Chờ thanh toán, sai ở mọi trạng thái khác (kể cả mã lạ)', () => {
    expect(buildStatusSteps('ChoThanhToan', 'hide')?.pendingPayment).toBe(true);
    expect(buildStatusSteps('ChoThanhToan', 'upcoming')?.pendingPayment).toBe(
      true,
    );
    for (const state of [
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
    ]) {
      expect(buildStatusSteps(state, 'hide')?.pendingPayment, state).toBe(
        false,
      );
    }
    for (const code of UNKNOWN_CODES) {
      expect(buildStatusSteps(code, 'upcoming')?.pendingPayment, code).toBe(
        false,
      );
    }
  });

  it('STL-03 Đã hủy và Vắng mặt: ba bước chưa tới rồi bước `terminal` mang đúng mã và nhãn của trạng thái thật (Figma `692:2`, `691:2`; Vắng mặt không có frame)', () => {
    for (const [code, label] of [
      ['DaHuy', 'Đã hủy'],
      ['VangMat', 'Vắng mặt'],
    ] as const) {
      const steps = buildStatusSteps(code, 'hide')?.steps ?? [];
      expect(steps).toHaveLength(4);
      expect(steps.slice(0, 3).map((step) => step.state)).toEqual([
        'upcoming',
        'upcoming',
        'upcoming',
      ]);
      expect(steps[3]).toEqual({ code, label, state: 'terminal' });
    }
  });

  it('STL-04 mã lạ với `unknown: "hide"` (Bác sĩ) ⇒ `null`, không dựng bước nào; không lộ mã thô', () => {
    for (const code of UNKNOWN_CODES) {
      expect(buildStatusSteps(code, 'hide'), code).toBeNull();
    }
  });

  it('STL-05 mã lạ với `unknown: "upcoming"` (Bệnh nhân, Quản trị viên) ⇒ cả ba bước chưa tới, không dải chờ thanh toán, không bước `terminal`, không lộ mã thô', () => {
    for (const code of UNKNOWN_CODES) {
      const result = buildStatusSteps(code, 'upcoming');
      expect(result?.steps.map((step) => `${step.code}:${step.state}`)).toEqual(
        ['DaXacNhan:upcoming', 'DaTiepDon:upcoming', 'HoanThanh:upcoming'],
      );
      if (code !== '') expect(JSON.stringify(result)).not.toContain(code);
    }
  });

  it('STL-06 mọi trạng thái của `APPOINTMENT_STATES` đều dựng được ở cả hai chế độ (thêm trạng thái mới mà quên bước thì đỏ): đúng ba hoặc bốn bước, nhiều nhất một bước hiện tại, mã bước không trùng', () => {
    for (const state of APPOINTMENT_STATES) {
      for (const mode of MODES) {
        const steps = buildStatusSteps(state, mode)?.steps;
        expect(steps, `${state}/${mode}`).toBeDefined();
        expect([3, 4]).toContain(steps?.length);
        expect(
          steps?.filter((step) => step.state === 'current').length,
        ).toBeLessThanOrEqual(1);
        expect(new Set(steps?.map((step) => step.code)).size).toBe(
          steps?.length,
        );
      }
    }
  });

  it('STL-06 chữ chung: "Chưa đến", "Đã qua", "Hiện tại" (chữ của Bệnh nhân đã duyệt ở F2) và câu của dải chờ thanh toán', () => {
    expect(STATUS_STEP_TEXT).toEqual({
      upcoming: 'Chưa đến',
      passed: 'Đã qua',
      current: 'Hiện tại',
      pendingPayment: 'Chờ xác nhận thanh toán cọc',
    });
  });
});
