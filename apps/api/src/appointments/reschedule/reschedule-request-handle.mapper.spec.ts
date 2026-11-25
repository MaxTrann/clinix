import {
  toApprovedResult,
  toRejectedResult,
} from './reschedule-request-handle.mapper.js';
import type { RescheduleOutcome } from './reschedule.types.js';

// reschedule B9 — BDL-12 phần mapper (danh sách trắng khoá của hai phản hồi) và M18/M19: kiểu và giá trị từng khoá. Mapper THUẦN: không DB, không đồng hồ (giờ máy chủ do người gọi truyền).
const OLD_CODE = 'CLX-20261110-AAA01';
const NEW_CODE = 'CLX-20261110-AAA02';
const OUTCOME: Extract<RescheduleOutcome, { kind: 'Rescheduled' }> = {
  kind: 'Rescheduled',
  maLichHenCu: OLD_CODE,
  maLichHenMoi: NEW_CODE,
  thoiGianMoi: new Date('2026-11-10T02:30:00.789Z'),
};
const SERVER_TIME = new Date('2026-11-02T01:00:03.456Z');

describe('BDL-12 toApprovedResult: ĐÚNG ba khoá, kiểu từng khoá', () => {
  const result = toApprovedResult(OUTCOME, SERVER_TIME);

  it('đúng ba khoá cấp 1 và đúng ba khoá của lichHenMoi; không khoá nào khác', () => {
    expect(Object.keys(result).sort()).toEqual([
      'lichHenMoi',
      'thoiGianMayChu',
      'yeuCau',
    ]);
    expect(Object.keys(result.yeuCau)).toEqual(['trangThai']);
    expect(Object.keys(result.lichHenMoi).sort()).toEqual([
      'maLichHen',
      'thoiGian',
      'trangThai',
    ]);
  });

  it('giá trị: DaDuyet; mã lịch MỚI; giờ lịch mới ISO 8601 UTC giữ mili giây; lịch mới luôn DaXacNhan; thoiGianMayChu là giờ người gọi truyền', () => {
    expect(result).toStrictEqual({
      yeuCau: { trangThai: 'DaDuyet' },
      lichHenMoi: {
        maLichHen: NEW_CODE,
        thoiGian: '2026-11-10T02:30:00.789Z',
        trangThai: 'DaXacNhan',
      },
      thoiGianMayChu: '2026-11-02T01:00:03.456Z',
    });
    for (const text of [result.lichHenMoi.thoiGian, result.thoiGianMayChu])
      expect(typeof text).toBe('string');
  });

  it('M19 KHÔNG lộ mã lịch CŨ, id nội bộ hay ghi chú dù kết quả của B4 có thêm khoá lạ', () => {
    const noisy = {
      ...OUTCOME,
      lichHenMoiId: '9007199254740993',
      lichHenId: '77',
      ghiChu: 'Ghi chú riêng tư',
    };
    const text = JSON.stringify(toApprovedResult(noisy, SERVER_TIME));
    expect(text).not.toContain(OLD_CODE);
    expect(text).not.toContain('9007199254740993');
    expect(text).not.toContain('Ghi chú riêng tư');
    expect(text).not.toMatch(/lich_?hen_?id|lichHenId|yeuCauId/i);
  });

  it('M18 thoiGianMayChu là đối số của người gọi (lấy SAU commit), không phải giờ lúc gọi hàm', () => {
    const early = toApprovedResult(
      OUTCOME,
      new Date('2026-11-02T01:00:00.000Z'),
    );
    const late = toApprovedResult(
      OUTCOME,
      new Date('2026-11-02T01:00:09.000Z'),
    );
    expect(early.thoiGianMayChu).toBe('2026-11-02T01:00:00.000Z');
    expect(late.thoiGianMayChu).toBe('2026-11-02T01:00:09.000Z');
  });
});

describe('BDL-12 toRejectedResult: ĐÚNG hai khoá', () => {
  it('chỉ { yeuCau: { trangThai: TuChoi }, thoiGianMayChu }; không lichHenMoi, không id, không ghi chú', () => {
    const result = toRejectedResult(SERVER_TIME);
    expect(result).toStrictEqual({
      yeuCau: { trangThai: 'TuChoi' },
      thoiGianMayChu: '2026-11-02T01:00:03.456Z',
    });
    expect(Object.keys(result).sort()).toEqual(['thoiGianMayChu', 'yeuCau']);
    expect('lichHenMoi' in result).toBe(false);
  });
});
