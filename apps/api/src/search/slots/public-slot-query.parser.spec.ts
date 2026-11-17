import 'reflect-metadata';
import { AppException } from '../../common/errors/app.exception.js';
import { SLOT_MAX_DOCTORS } from '../search.constants.js';
import { parseSlotQuery } from './public-slot-query.parser.js';

// Search Slots PR-C1 — KGC-01 đến KGC-06: kiểm `bacSiIds`, `ngay` của `GET /public/doctor-slots`; báo hết lỗi một lượt (PLAN search 5.6).
const TODAY = '2026-11-18'; // thứ Tư

interface Raw {
  bacSiIds?: string;
  ngay?: string;
}
const ok = (bacSiIds: string, ngay = TODAY, today = TODAY) =>
  parseSlotQuery({ bacSiIds, ngay }, today);

function errorsOf(raw: Raw, today = TODAY) {
  try {
    parseSlotQuery(raw, today);
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(400);
    const body = exception.getResponse() as {
      maLoi: string;
      loi: { truong: string; ma: string }[];
    };
    expect(body.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
    return body.loi;
  }
  throw new Error('Mong đợi lỗi nhưng không có');
}

const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => String(i + 1));

describe('KGC-01 tách bacSiIds', () => {
  it('một id và nhiều id, giữ thứ tự', () => {
    expect(ok('12').bacSiIds).toEqual(['12']);
    expect(ok('12,15,31')).toEqual({
      bacSiIds: ['12', '15', '31'],
      ngay: TODAY,
    });
  });

  it('bỏ trùng và giữ thứ tự xuất hiện ĐẦU TIÊN', () => {
    expect(ok('3,1,3,2,1').bacSiIds).toEqual(['3', '1', '2']);
  });

  it('id lớn nhất của BIGINT vẫn hợp lệ và không mất độ chính xác (là chuỗi)', () => {
    expect(ok('9223372036854775807').bacSiIds).toEqual(['9223372036854775807']);
  });
});

describe('KGC-02 bacSiIds sai ⇒ DANH_SACH_BAC_SI_KHONG_HOP_LE', () => {
  it.each([
    ['rỗng', ''],
    ['token rỗng ở giữa', '1,,2'],
    ['dấu phẩy đầu', ',1'],
    ['dấu phẩy cuối', '1,'],
    ['khoảng trắng sau dấu phẩy', '1, 2'],
    ['khoảng trắng đầu', ' 1'],
    ['chữ', 'abc'],
    ['số 0', '0'],
    ['số âm', '-1'],
    ['số 0 đứng đầu', '01'],
    ['số thập phân', '1.5'],
    ['ký hiệu khoa học', '1e3'],
    ['vượt BIGINT', '9223372036854775808'],
    ['dấu chấm phẩy', '1;2'],
    ['chữ số toàn góc', '１'],
    ['một id sai giữa các id đúng', '1,x,3'],
  ])('%s', (_name, raw) => {
    expect(errorsOf({ bacSiIds: raw, ngay: TODAY })).toEqual([
      { truong: 'bacSiIds', ma: 'DANH_SACH_BAC_SI_KHONG_HOP_LE' },
    ]);
  });

  it('thiếu tham số', () => {
    expect(errorsOf({ ngay: TODAY })).toEqual([
      { truong: 'bacSiIds', ma: 'DANH_SACH_BAC_SI_KHONG_HOP_LE' },
    ]);
  });
});

describe('KGC-03 trần số bác sĩ (tính trên id KHÁC NHAU)', () => {
  it('đúng 100 id khác nhau đạt', () => {
    expect(SLOT_MAX_DOCTORS).toBe(100);
    expect(ok(ids(100).join(',')).bacSiIds).toHaveLength(100);
  });

  it('101 id khác nhau ⇒ QUA_NHIEU_BAC_SI', () => {
    expect(errorsOf({ bacSiIds: ids(101).join(','), ngay: TODAY })).toEqual([
      { truong: 'bacSiIds', ma: 'QUA_NHIEU_BAC_SI' },
    ]);
  });

  it('101 token nhưng chỉ 100 id khác nhau (lặp id) vẫn đạt, kết quả có 100 phần tử', () => {
    const raw = [...ids(100), '1', '2'].join(',');
    expect(raw.split(',')).toHaveLength(102);
    expect(ok(raw).bacSiIds).toEqual(ids(100));
  });
});

describe('KGC-04 ngay sai dạng ⇒ NGAY_KHONG_HOP_LE', () => {
  it.each([
    ['rỗng', ''],
    ['tháng một chữ số', '2026-1-5'],
    ['dấu gạch chéo', '2026/11/18'],
    ['đảo thứ tự', '18-11-2026'],
    ['ngày không có thật', '2026-02-30'],
    ['29/02 năm không nhuận', '2026-02-29'],
    ['tháng 13', '2026-13-01'],
    ['có giờ', '2026-11-18T00:00'],
    ['khoảng trắng đầu', ' 2026-11-18'],
    ['khoảng trắng cuối', '2026-11-18 '],
    ['chữ số toàn góc', '２０２６-１１-１８'],
    ['ngày một chữ số', '2026-11-1'],
    ['dấu cộng đầu', '+2026-11-18'],
  ])('%s', (_name, raw) => {
    expect(errorsOf({ bacSiIds: '1', ngay: raw })).toEqual([
      { truong: 'ngay', ma: 'NGAY_KHONG_HOP_LE' },
    ]);
  });

  it('thiếu tham số', () => {
    expect(errorsOf({ bacSiIds: '1' })).toEqual([
      { truong: 'ngay', ma: 'NGAY_KHONG_HOP_LE' },
    ]);
  });
});

describe('KGC-05 biên cửa sổ [hôm nay, hôm nay + 6]', () => {
  const edges: [string, string, 'OK' | 'NGOAI'][] = [
    [TODAY, TODAY, 'OK'],
    [TODAY, '2026-11-19', 'OK'],
    [TODAY, '2026-11-24', 'OK'], // +6
    [TODAY, '2026-11-25', 'NGOAI'], // +7
    [TODAY, '2026-11-17', 'NGOAI'], // hôm qua
    [TODAY, '2020-01-01', 'NGOAI'],
    [TODAY, '2099-12-31', 'NGOAI'],
    [TODAY, '0001-01-01', 'NGOAI'],
    ['2026-12-28', '2027-01-03', 'OK'], // qua ranh năm, +6
    ['2026-12-28', '2027-01-04', 'NGOAI'], // +7
    ['2026-12-31', '2026-12-31', 'OK'],
    ['2028-02-28', '2028-02-29', 'OK'], // năm nhuận
    ['2028-02-28', '2028-03-05', 'OK'], // +6 qua 29/02
    ['2028-02-28', '2028-03-06', 'NGOAI'], // +7
    ['2027-02-28', '2027-03-06', 'OK'], // năm không nhuận, +6
    ['2027-02-28', '2027-03-07', 'NGOAI'], // +7
  ];

  it.each(edges)('hôm nay %s, ngày %s ⇒ %s', (today, ngay, expected) => {
    if (expected === 'OK') {
      expect(ok('1', ngay, today).ngay).toBe(ngay);
    } else {
      expect(errorsOf({ bacSiIds: '1', ngay }, today)).toEqual([
        { truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' },
      ]);
    }
  });
});

describe('KGC-06 báo MỌI lỗi một lượt', () => {
  it('cả hai tham số sai: hai phần tử, bacSiIds trước ngay', () => {
    expect(errorsOf({ bacSiIds: 'abc', ngay: '2026-11-25' })).toEqual([
      { truong: 'bacSiIds', ma: 'DANH_SACH_BAC_SI_KHONG_HOP_LE' },
      { truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' },
    ]);
  });

  it('quá nhiều bác sĩ và ngày sai dạng', () => {
    expect(errorsOf({ bacSiIds: ids(101).join(','), ngay: 'x' })).toEqual([
      { truong: 'bacSiIds', ma: 'QUA_NHIEU_BAC_SI' },
      { truong: 'ngay', ma: 'NGAY_KHONG_HOP_LE' },
    ]);
  });

  it('thiếu cả hai', () => {
    expect(errorsOf({})).toEqual([
      { truong: 'bacSiIds', ma: 'DANH_SACH_BAC_SI_KHONG_HOP_LE' },
      { truong: 'ngay', ma: 'NGAY_KHONG_HOP_LE' },
    ]);
  });
});
