import { describe, expect, it } from 'vitest';
import {
  activePreset,
  defaultRange,
  filterFromSearch,
  filterToSearch,
  presetRange,
  rangeProblem,
} from './filter';

// dashboard F1 — phần hàm thuần của DWB-04 (kiểm tại chỗ), DWB-05 (Chi nhánh không gửi `chiNhanhId`), DWB-10 (khôi phục từ URL) và bốn nút kỳ
// (PLAN dashboard 5.5, 5.11, 7.6; nút kỳ là mục "làm sau" 6.5 làm sớm theo quyết định của Trung 28/11/2026).

const params = (query: string) => new URLSearchParams(query);

describe('dashboard F1 — bộ lọc (hàm thuần)', () => {
  it('DWB-04: kiểm tại chỗ thiếu một đầu, đảo ngược, quá 366 ngày, ngày không có thật; 366 ngày và một ngày hợp lệ', () => {
    expect(rangeProblem('', '2026-12-07')).toBe('THIEU_NGAY');
    expect(rangeProblem('2026-12-01', '')).toBe('THIEU_NGAY');
    expect(rangeProblem('2026-12-07', '2026-12-01')).toBe('DAO_NGUOC');
    expect(rangeProblem('2027-02-28', '2028-02-29')).toBe('QUA_DAI');
    expect(rangeProblem('2026-02-30', '2026-03-05')).toBe('NGAY_SAI');
    expect(rangeProblem('2027-03-01', '2028-02-29')).toBeNull();
    expect(rangeProblem('2026-12-04', '2026-12-04')).toBeNull();
  });

  it('DWB-10: URL đủ hai ngày hợp lệ và id chi nhánh ⇒ khôi phục; tham số hỏng ⇒ bỏ (dùng mặc định)', () => {
    expect(
      filterFromSearch(
        params('tuNgay=2026-12-01&denNgay=2026-12-07&chiNhanhId=7'),
        true,
      ),
    ).toStrictEqual({
      tuNgay: '2026-12-01',
      denNgay: '2026-12-07',
      chiNhanhId: '7',
    });
    for (const broken of [
      'tuNgay=2026-12-01',
      'tuNgay=2026-12-07&denNgay=2026-12-01',
      'tuNgay=2026-02-30&denNgay=2026-03-01',
      'tuNgay=abc&denNgay=2026-03-01',
      'chiNhanhId=abc',
      'chiNhanhId=0',
      'chiNhanhId=-1',
    ])
      expect(filterFromSearch(params(broken), true)).toStrictEqual({
        tuNgay: null,
        denNgay: null,
        chiNhanhId: null,
      });
  });

  it('DWB-05: Quản trị viên Chi nhánh không bao giờ gửi `chiNhanhId`, kể cả khi URL có', () => {
    expect(
      filterFromSearch(params('chiNhanhId=7'), false).chiNhanhId,
    ).toBeNull();
  });

  it('URL ⇔ bộ lọc: bỏ giá trị null; chỉ ghi ngày khi đủ cặp', () => {
    expect(
      filterToSearch({
        tuNgay: null,
        denNgay: null,
        chiNhanhId: null,
      }).toString(),
    ).toBe('');
    expect(
      filterToSearch({
        tuNgay: '2026-12-01',
        denNgay: '2026-12-07',
        chiNhanhId: '7',
      }).toString(),
    ).toBe('tuNgay=2026-12-01&denNgay=2026-12-07&chiNhanhId=7');
  });

  it('nút kỳ: 7 ngày, 30 ngày (mặc định), tháng này, năm nay đều kết thúc ở hôm nay; qua đầu năm vẫn đúng', () => {
    const today = '2026-12-04';
    expect(presetRange('7-ngay', today)).toStrictEqual({
      tuNgay: '2026-11-28',
      denNgay: today,
    });
    expect(presetRange('30-ngay', today)).toStrictEqual(defaultRange(today));
    expect(defaultRange(today)).toStrictEqual({
      tuNgay: '2026-11-05',
      denNgay: today,
    });
    expect(presetRange('thang-nay', today)).toStrictEqual({
      tuNgay: '2026-12-01',
      denNgay: today,
    });
    expect(presetRange('nam-nay', today)).toStrictEqual({
      tuNgay: '2026-01-01',
      denNgay: today,
    });
    expect(presetRange('7-ngay', '2027-01-03').tuNgay).toBe('2026-12-28');
    // "Năm nay" của ngày cuối năm nhuận vẫn trong 366 ngày
    const lastDay = presetRange('nam-nay', '2028-12-31');
    expect(rangeProblem(lastDay.tuNgay, lastDay.denNgay)).toBeNull();
  });

  it('nút kỳ đang sáng: khớp đúng khoảng; khoảng tự chọn thì không nút nào sáng', () => {
    const today = '2026-12-20';
    expect(activePreset(defaultRange(today), today)).toBe('30-ngay');
    expect(activePreset(presetRange('nam-nay', today), today)).toBe('nam-nay');
    expect(
      activePreset({ tuNgay: '2026-12-02', denNgay: '2026-12-05' }, today),
    ).toBeNull();
  });
});
