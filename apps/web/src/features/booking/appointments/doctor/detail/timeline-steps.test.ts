import { describe, expect, it } from 'vitest';
import { buildTimeline } from './timeline-steps';

// booking F11: hàm thuần dựng các bước của "Trạng thái ca khám" theo `trangThai` THẬT (DAD-09, mã `[đề xuất]`, PLAN booking mục 7.44; Figma `458:2`, `459:2`, `462:2`, `465:2`, `692:2`).
const summary = (state: string) =>
  buildTimeline(state)?.steps.map((step) => `${step.label}:${step.tone}`);

describe('booking F11 — các bước của trạng thái ca khám', () => {
  it('DAD-09 ba bước của luồng khám: bước đã qua, bước đang ở, bước chưa tới', () => {
    expect(summary('DaXacNhan')).toEqual([
      'Đã xác nhận:current',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
    ]);
    expect(summary('DaTiepDon')).toEqual([
      'Đã xác nhận:done',
      'Đã tiếp đón:current',
      'Hoàn thành:upcoming',
    ]);
    expect(summary('HoanThanh')).toEqual([
      'Đã xác nhận:done',
      'Đã tiếp đón:done',
      'Hoàn thành:current',
    ]);
  });

  it('DAD-09 Chờ thanh toán: dải cam và cả ba bước chưa tới (Figma `465:2`)', () => {
    const timeline = buildTimeline('ChoThanhToan');
    expect(timeline?.pendingPayment).toBe(true);
    expect(summary('ChoThanhToan')).toEqual([
      'Đã xác nhận:upcoming',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
    ]);
    // Các trạng thái khác không có dải cam
    for (const state of [
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
    ]) {
      expect(buildTimeline(state)?.pendingPayment).toBe(false);
    }
  });

  it('DAD-09 Đã hủy và Vắng mặt: ba bước chưa tới rồi bước thứ tư là trạng thái thật (Figma `692:2`; Vắng mặt không có frame)', () => {
    expect(summary('DaHuy')).toEqual([
      'Đã xác nhận:upcoming',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
      'Đã hủy:ended',
    ]);
    expect(summary('VangMat')).toEqual([
      'Đã xác nhận:upcoming',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
      'Vắng mặt:ended',
    ]);
  });

  it('DAD-09 mã lạ (kể cả DaDoiLich, rỗng, constructor) ⇒ không dựng bước nào, không lộ mã thô', () => {
    for (const state of ['DaDoiLich', '', 'constructor', 'daxacnhan', 'XYZ']) {
      expect(buildTimeline(state), state).toBeNull();
    }
  });
});
