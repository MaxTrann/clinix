import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { classifyDetailError, classifyListError } from './error-kinds';

// booking F1 (LHL-08, LHL-07) và F2 (LCT-06), chuyển lên `common/` ở F8: câu lỗi chọn theo `maLoi`, KHÔNG theo mã HTTP hay `thongBao`. Hai khối test giữ nguyên văn.
const api = (
  status: number,
  maLoi: string,
  loi?: { truong: string; ma: string }[],
) => new ApiError(status, { maLoi, thongBao: 'câu của API', loi });

describe('booking F1 — phân loại lỗi của danh sách', () => {
  it('LHL-08 theo `maLoi`, bất kể mã HTTP: CHUA_DANG_NHAP ⇒ session, KHONG_DU_QUYEN ⇒ forbidden', () => {
    for (const status of [401, 403, 500]) {
      expect(classifyListError(api(status, 'CHUA_DANG_NHAP'))).toBe('session');
      expect(classifyListError(api(status, 'KHONG_DU_QUYEN'))).toBe(
        'forbidden',
      );
    }
  });

  it('LHL-08 `maLoi` lạ ⇒ other, dù HTTP là 401, 403, 409 hay 500', () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      expect(classifyListError(api(status, 'MA_LOI_LA'))).toBe('other');
    }
  });

  it('LHL-07 chỉ lỗi 400 `DU_LIEU_KHONG_HOP_LE` có `loi[].ma` là TU_KHOA_KHONG_HOP_LE mới là lỗi từ khoá', () => {
    expect(
      classifyListError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'tuNgay', ma: 'IS_CALENDAR_DATE' },
          { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
        ]),
      ),
    ).toBe('keyword');
    // Ca âm: cùng `maLoi` mà không có `loi`, `loi` rỗng hay `loi` của trường khác
    expect(classifyListError(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toBe('other');
    expect(classifyListError(api(400, 'DU_LIEU_KHONG_HOP_LE', []))).toBe(
      'other',
    );
    expect(
      classifyListError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', [{ truong: 'page', ma: 'MIN' }]),
      ),
    ).toBe('other');
    // `loi[].ma` đúng nhưng `maLoi` khác
    expect(
      classifyListError(
        api(400, 'MA_LOI_LA', [{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }]),
      ),
    ).toBe('other');
  });

  it('LHL-08 không phải ApiError (mạng, quá giờ, phản hồi lạ, ngoại lệ bất kỳ) ⇒ other', () => {
    for (const error of [
      new NetworkError(),
      new UnexpectedResponseError(502),
      new Error('KHONG_DU_QUYEN'),
      'CHUA_DANG_NHAP',
      null,
      undefined,
    ]) {
      expect(classifyListError(error)).toBe('other');
    }
  });

  // Dùng bảng tra theo `maLoi` mà `maLoi` lạ trùng tên thuộc tính của Object thì phải không trúng (bài học của `knownBookingError`)
  it('LHL-08 `maLoi` trùng tên thuộc tính của Object (constructor, toString, __proto__) ⇒ other', () => {
    for (const maLoi of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(classifyListError(api(500, maLoi))).toBe('other');
    }
  });
});

describe('classifyDetailError', () => {
  it('LCT-06 theo maLoi: KHONG_TIM_THAY, CHUA_DANG_NHAP, KHONG_DU_QUYEN; còn lại là other', () => {
    expect(classifyDetailError(api(404, 'KHONG_TIM_THAY'))).toBe('notFound');
    expect(classifyDetailError(api(401, 'CHUA_DANG_NHAP'))).toBe('session');
    expect(classifyDetailError(api(403, 'KHONG_DU_QUYEN'))).toBe('forbidden');
    expect(classifyDetailError(new NetworkError())).toBe('other');
    expect(classifyDetailError(new TimeoutError())).toBe('other');
    expect(classifyDetailError(new UnexpectedResponseError(502))).toBe('other');
    expect(classifyDetailError('lỗi lạ')).toBe('other');
  });

  it('LCT-06 maLoi lạ cùng HTTP 404, 403, 401 hay 500 ⇒ other (không theo mã HTTP)', () => {
    for (const status of [401, 403, 404, 409, 500, 503]) {
      expect(classifyDetailError(api(status, 'MA_LA'))).toBe('other');
    }
    // Ngược lại: KHONG_TIM_THAY dù HTTP khác 404 vẫn là notFound (chọn theo maLoi)
    expect(classifyDetailError(api(500, 'KHONG_TIM_THAY'))).toBe('notFound');
  });
});
