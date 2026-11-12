import { describe, expect, it } from 'vitest';
import { timelineSteps } from './detail-timeline-steps';

// booking F2: mốc "Trạng thái lịch hẹn" dựng chỉ từ `trangThai` (Figma `420:2`, `426:2`, `691:2`). Mã LCT là [đề xuất] (PLAN booking mục 7.33 sau khi duyệt).
const states = (status: string) =>
  timelineSteps(status).map((step) => `${step.label}:${step.state}`);

describe('timelineSteps', () => {
  it('LCT-01 mỗi trạng thái ra đúng các bước', () => {
    expect(states('ChoThanhToan')).toEqual([
      'Đã xác nhận:upcoming',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
    ]);
    expect(states('DaXacNhan')).toEqual([
      'Đã xác nhận:current',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
    ]);
    expect(states('DaTiepDon')).toEqual([
      'Đã xác nhận:passed',
      'Đã tiếp đón:current',
      'Hoàn thành:upcoming',
    ]);
    expect(states('HoanThanh')).toEqual([
      'Đã xác nhận:passed',
      'Đã tiếp đón:passed',
      'Hoàn thành:current',
    ]);
  });

  it('LCT-01 Đã hủy (như Figma 691:2) và Vắng mặt: ba bước chưa đến cộng một bước cuối kiểu dừng', () => {
    expect(states('DaHuy')).toEqual([
      'Đã xác nhận:upcoming',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
      'Đã hủy:terminal',
    ]);
    expect(states('VangMat')).toEqual([
      'Đã xác nhận:upcoming',
      'Đã tiếp đón:upcoming',
      'Hoàn thành:upcoming',
      'Vắng mặt:terminal',
    ]);
  });

  it('LCT-01 mã lạ và DaDoiLich ⇒ cả ba bước chưa đến, không có bước dừng, không lộ mã thô', () => {
    for (const code of ['DaDoiLich', 'Bậy', '']) {
      const steps = timelineSteps(code);
      expect(steps.map((step) => step.state)).toEqual([
        'upcoming',
        'upcoming',
        'upcoming',
      ]);
      expect(JSON.stringify(steps)).not.toContain(code === '' ? 'xx' : code);
    }
  });
});
