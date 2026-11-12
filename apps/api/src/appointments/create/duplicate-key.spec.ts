import { QueryFailedError } from 'typeorm';
import { duplicateKeyOf } from './duplicate-key.js';

// Task B8 — TAO-02 [đề xuất] (PLAN booking 5.11, X1 M2; TRACKING 3.21 B8-D): trích TÊN KHOÁ của lỗi 1062 để phân biệt `lich_hen.ma_lich_hen` (sinh lại mã) và `lich_hen.khung_gio_dang_giu`
// (`KHUNG_GIO_DA_DAT`). Thông điệp mẫu lấy từ số đo M2 (MySQL 8.4.11). Hàm KHÔNG được trả giá trị trùng (dữ liệu người dùng).
const DUP_CODE =
  "Duplicate entry 'CLX-20261110-ABCDE' for key 'lich_hen.ma_lich_hen'";
const DUP_SLOT = "Duplicate entry '1' for key 'lich_hen.khung_gio_dang_giu'";

const mysqlError = (sqlMessage: string | undefined, errno = 1062) => ({
  errno,
  code: errno === 1062 ? 'ER_DUP_ENTRY' : 'ER_LOCK_DEADLOCK',
  sqlMessage,
});

describe('TAO-02 duplicateKeyOf', () => {
  it.each([
    ['ma_lich_hen (có tên bảng)', DUP_CODE, 'ma_lich_hen'],
    ['khung_gio_dang_giu (có tên bảng)', DUP_SLOT, 'khung_gio_dang_giu'],
    [
      'không có tên bảng (MySQL cũ)',
      "Duplicate entry 'x' for key 'ma_lich_hen'",
      'ma_lich_hen',
    ],
    [
      'dấu nháy ngược',
      "Duplicate entry 'x' for key `lich_hen.khung_gio_dang_giu`",
      'khung_gio_dang_giu',
    ],
    [
      'khoá khác của bảng khác',
      "Duplicate entry 'x' for key 'thong_bao.thong_bao_index_lich_hen'",
      'thong_bao_index_lich_hen',
    ],
    ['có khoảng trắng cuối thông điệp', `${DUP_CODE}  `, 'ma_lich_hen'],
  ])('%s', (_name, message, expected) => {
    expect(
      duplicateKeyOf(
        new QueryFailedError('q', [], mysqlError(message) as never),
      ),
    ).toBe(expected);
  });

  it('nhận lỗi thô của mysql2 (không bọc `driverError`)', () => {
    expect(duplicateKeyOf(mysqlError(DUP_SLOT))).toBe('khung_gio_dang_giu');
  });

  it('giá trị trùng chứa chữ "for key …" không đánh lừa được: tên khoá lấy ở CUỐI thông điệp', () => {
    const tricky =
      "Duplicate entry 'x for key 'lich_hen.khung_gio_dang_giu'' for key 'lich_hen.ma_lich_hen'";

    expect(duplicateKeyOf(mysqlError(tricky))).toBe('ma_lich_hen');
  });

  it('không bao giờ trả giá trị trùng (dữ liệu người dùng): kết quả chỉ là tên khoá', () => {
    const key = duplicateKeyOf(mysqlError(DUP_CODE));

    expect(key).not.toContain('CLX');
    expect(key).not.toContain('Duplicate');
  });

  it.each([
    ['không phải 1062 (deadlock 1213)', mysqlError(DUP_CODE, 1213)],
    ['1062 nhưng không có sqlMessage', mysqlError(undefined)],
    ['1062 nhưng thông điệp không có tên khoá', mysqlError('Duplicate entry')],
    ['lỗi thường', new Error(DUP_CODE)],
    ['chuỗi', DUP_CODE],
    ['null', null],
    ['undefined', undefined],
  ])('%s ⇒ null', (_name, error) => {
    expect(duplicateKeyOf(error)).toBeNull();
  });
});
