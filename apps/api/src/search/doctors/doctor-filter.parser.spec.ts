import 'reflect-metadata';
import { AppException } from '../../common/errors/app.exception.js';
import { parseDoctorFilters } from './doctor-filter.parser.js';
import { PublicDoctorQueryDto } from './public-doctor.dto.js';

// B5 — TBS-06, TBS-07, TBS-15, BMS-03: kiểm tham số lọc, báo hết lỗi một lượt.
const query = (raw: Partial<PublicDoctorQueryDto> = {}) =>
  Object.assign(new PublicDoctorQueryDto(), raw);

function errorsOf(raw: Partial<PublicDoctorQueryDto>) {
  try {
    parseDoctorFilters(query(raw));
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(400);
    return JSON.stringify(exception.getResponse());
  }
  throw new Error('Mong đợi lỗi nhưng không có');
}

describe('B5 — parseDoctorFilters', () => {
  it('không tham số ⇒ không lọc, sắp mặc định kinhNghiem', () => {
    expect(parseDoctorFilters(query())).toEqual({
      dichVuKhamId: null,
      chuyenKhoaId: null,
      chiNhanhId: null,
      likePattern: null,
      giaTuCents: null,
      giaDenCents: null,
      diemTuTenths: null,
      sapXep: 'kinhNghiem',
    });
  });

  it('TBS-06: giá hợp lệ đổi sang đơn vị 0,01; giaTu = giaDen được phép (biên)', () => {
    const f = parseDoctorFilters(query({ giaTu: '0', giaDen: '300000' }));
    expect(f.giaTuCents).toBe(0n);
    expect(f.giaDenCents).toBe(30000000n);
    expect(
      parseDoctorFilters(query({ giaTu: '5', giaDen: '5' })).giaTuCents,
    ).toBe(500n);
  });

  it.each(['-1', '100.5', 'abc', '', '1e3', ' 5', '9999999999999'])(
    'TBS-06: giaTu=%j ⇒ 400 BO_LOC_KHONG_HOP_LE / GIA_KHONG_HOP_LE',
    (giaTu) => {
      const body = errorsOf({ giaTu });
      expect(body).toContain('BO_LOC_KHONG_HOP_LE');
      expect(body).toContain('GIA_KHONG_HOP_LE');
      expect(body).toContain('giaTu');
    },
  );

  it('TBS-06: giaTu > giaDen ⇒ 400 KHOANG_GIA_KHONG_HOP_LE ở giaTu', () => {
    const body = errorsOf({ giaTu: '300', giaDen: '200' });
    expect(body).toContain('KHOANG_GIA_KHONG_HOP_LE');
  });

  it.each([
    ['4', 40],
    ['4.5', 45],
    ['0.1', 1],
    ['5', 50],
    ['3.0', 30],
  ])('TBS-07: diemTu=%s ⇒ %i phần mười', (diemTu, tenths) => {
    expect(parseDoctorFilters(query({ diemTu })).diemTuTenths).toBe(tenths);
  });

  it.each(['0', '0.0', '5.1', '6', '-1', '4.55', 'abc', ''])(
    'TBS-07: diemTu=%j ngoài miền ⇒ 400 DIEM_KHONG_HOP_LE',
    (diemTu) => {
      expect(errorsOf({ diemTu })).toContain('DIEM_KHONG_HOP_LE');
    },
  );

  it.each(['rating', "kinhNghiem'; DROP TABLE tai_khoan;--", ''])(
    'TBS-15, BMS-03: sapXep=%j ngoài danh sách trắng ⇒ 400 SAP_XEP_KHONG_HOP_LE',
    (sapXep) => {
      expect(errorsOf({ sapXep })).toContain('SAP_XEP_KHONG_HOP_LE');
    },
  );

  it.each(['kinhNghiem', 'giaTangDan', 'danhGiaCao'] as const)(
    'sapXep=%s hợp lệ',
    (sapXep) => {
      expect(parseDoctorFilters(query({ sapXep })).sapXep).toBe(sapXep);
    },
  );

  it('id lọc sai dạng ⇒ 400 ID_LOC_KHONG_HOP_LE; id đúng dạng giữ nguyên chuỗi', () => {
    expect(errorsOf({ chiNhanhId: 'abc' })).toContain('ID_LOC_KHONG_HOP_LE');
    expect(
      parseDoctorFilters(query({ dichVuKhamId: '99999999' })).dichVuKhamId,
    ).toBe('99999999');
  });

  it('báo nhiều lỗi cùng lúc để FE gắn đúng từng ô', () => {
    const body = errorsOf({ giaTu: 'x', diemTu: '9', sapXep: 'y' });
    expect(body).toContain('giaTu');
    expect(body).toContain('diemTu');
    expect(body).toContain('sapXep');
  });
});
