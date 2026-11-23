import { describe, expect, it } from 'vitest';
import {
  BLOCKING_LEAVE_STATES,
  leaveCoversShift,
  pickBlockingLeave,
  type LeaveWindow,
} from './leave-overlap.rules.js';

// Doctor B5 — HD-03 (phần thuần): một (ngày, ca) có thuộc khoảng nghỉ của yêu cầu hay không.
const wholeDays = (from: string, to: string): LeaveWindow => ({
  hinhThucNghi: 'CaNgay',
  ngayBatDau: from,
  ngayKetThuc: to,
  ca: null,
});
const oneShift = (day: string, ca: 'CaSang' | 'CaChieu'): LeaveWindow => ({
  hinhThucNghi: 'TheoCa',
  ngayBatDau: day,
  ngayKetThuc: day,
  ca,
});

describe('leaveCoversShift', () => {
  it('HD-03 CaNgay phủ cả hai ca của mọi ngày trong khoảng, gồm cả hai biên', () => {
    const leave = wholeDays('2026-12-10', '2026-12-12');
    for (const ngay of ['2026-12-10', '2026-12-11', '2026-12-12'])
      for (const ca of ['CaSang', 'CaChieu'] as const)
        expect(leaveCoversShift(leave, { ngay, ca }), `${ngay} ${ca}`).toBe(
          true,
        );
  });

  it('HD-03 biên ngày: ngày liền trước và liền sau khoảng CaNgay không bị phủ', () => {
    const leave = wholeDays('2026-12-10', '2026-12-12');
    expect(leaveCoversShift(leave, { ngay: '2026-12-09', ca: 'CaSang' })).toBe(
      false,
    );
    expect(leaveCoversShift(leave, { ngay: '2026-12-13', ca: 'CaChieu' })).toBe(
      false,
    );
  });

  it('HD-03 CaNgay một ngày (bắt đầu = kết thúc) phủ đúng ngày đó', () => {
    const leave = wholeDays('2026-12-10', '2026-12-10');
    expect(leaveCoversShift(leave, { ngay: '2026-12-10', ca: 'CaChieu' })).toBe(
      true,
    );
    expect(leaveCoversShift(leave, { ngay: '2026-12-11', ca: 'CaChieu' })).toBe(
      false,
    );
  });

  it('HD-03 TheoCa chỉ phủ đúng ca đó của đúng ngày đó', () => {
    const leave = oneShift('2026-12-10', 'CaSang');
    expect(leaveCoversShift(leave, { ngay: '2026-12-10', ca: 'CaSang' })).toBe(
      true,
    );
    expect(leaveCoversShift(leave, { ngay: '2026-12-10', ca: 'CaChieu' })).toBe(
      false,
    );
    expect(leaveCoversShift(leave, { ngay: '2026-12-11', ca: 'CaSang' })).toBe(
      false,
    );
    expect(leaveCoversShift(leave, { ngay: '2026-12-09', ca: 'CaSang' })).toBe(
      false,
    );
  });
});

// UX7: `TheoCa` có thể là khoảng nhiều ngày + một ca (CHECK cho `ngay_bat_dau <= ngay_ket_thuc`).
describe('DUX7-11 leaveCoversShift với TheoCa nhiều ngày', () => {
  const leave: LeaveWindow = {
    hinhThucNghi: 'TheoCa',
    ngayBatDau: '2026-12-24',
    ngayKetThuc: '2026-12-28',
    ca: 'CaSang',
  };

  it('phủ đúng ca đã chọn ở MỌI ngày trong khoảng, gồm cả hai biên', () => {
    for (const ngay of [
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
      '2026-12-27',
      '2026-12-28',
    ])
      expect(leaveCoversShift(leave, { ngay, ca: 'CaSang' }), ngay).toBe(true);
  });

  it('KHÔNG phủ ca kia ở bất kỳ ngày nào trong khoảng (kể cả hai biên)', () => {
    for (const ngay of ['2026-12-24', '2026-12-26', '2026-12-28'])
      expect(leaveCoversShift(leave, { ngay, ca: 'CaChieu' }), ngay).toBe(
        false,
      );
  });

  it('DUX7-12 biên ngày: ngày liền trước và liền sau khoảng không bị phủ dù đúng ca', () => {
    expect(leaveCoversShift(leave, { ngay: '2026-12-23', ca: 'CaSang' })).toBe(
      false,
    );
    expect(leaveCoversShift(leave, { ngay: '2026-12-29', ca: 'CaSang' })).toBe(
      false,
    );
  });
});

describe('pickBlockingLeave', () => {
  const pending = { yeuCauNghiPhepId: '5', trangThai: 'ChoDuyet' as const };
  const approved = { yeuCauNghiPhepId: '9', trangThai: 'DaDuyet' as const };

  it('HD-03 không có yêu cầu nào ⇒ null', () => {
    expect(pickBlockingLeave([])).toBeNull();
  });

  it('HD-03 có cả ChoDuyet và DaDuyet cùng chặn ⇒ ưu tiên DaDuyet (kết quả cố định, không phụ thuộc thứ tự đầu vào)', () => {
    expect(pickBlockingLeave([pending, approved])).toEqual(approved);
    expect(pickBlockingLeave([approved, pending])).toEqual(approved);
  });

  it('HD-03 cùng trạng thái ⇒ lấy mã nhỏ nhất, so như số (9 < 10)', () => {
    const a = { yeuCauNghiPhepId: '10', trangThai: 'ChoDuyet' as const };
    const b = { yeuCauNghiPhepId: '9', trangThai: 'ChoDuyet' as const };
    expect(pickBlockingLeave([a, b])).toEqual(b);
  });

  it('HD-03 chỉ ChoDuyet và DaDuyet chặn; TuChoi không nằm trong tập chặn', () => {
    expect([...BLOCKING_LEAVE_STATES]).toEqual(['ChoDuyet', 'DaDuyet']);
  });
});
