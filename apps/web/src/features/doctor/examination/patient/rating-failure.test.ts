import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { describeRatingFailure } from './rating-failure';
import { RATING_TEXT } from './rating-text';

// doctor-exam F6, WDG-05 và WDG-14 [đề xuất]: ánh xạ lỗi của `POST …/rating` theo `maLoi` và `loi[].ma` (PLAN 5.14; chữ do Đại duyệt 16/11/2026). Hàm thuần. Chọn câu theo mã, KHÔNG theo mã HTTP hay `thongBao`; không bao giờ in `thongBao`.
const api = (
  status: number,
  maLoi: string,
  extra: { loi?: unknown; chiTiet?: unknown } = {},
) =>
  new ApiError(status, {
    maLoi,
    thongBao: 'THONG-BAO-KHONG-DUOC-IN',
    ...(extra as object),
  });
const invalid = (loi: unknown) => api(400, 'DU_LIEU_KHONG_HOP_LE', { loi });

describe('WDG-14 400 DU_LIEU_KHONG_HOP_LE theo trường', () => {
  it('soSao SO_SAO_BAT_BUOC và SO_SAO_KHONG_HOP_LE ⇒ kind `field`, lỗi ở trường soSao, KHÔNG dải chung', () => {
    for (const ma of ['SO_SAO_BAT_BUOC', 'SO_SAO_KHONG_HOP_LE']) {
      expect(describeRatingFailure(invalid([{ truong: 'soSao', ma }]))).toEqual(
        {
          message: null,
          kind: 'field',
          fields: { soSao: ma },
        },
      );
    }
  });

  it('nhanXet QUA_DAI ⇒ lỗi ở trường nhanXet; cả hai trường cùng lúc ⇒ cả hai', () => {
    expect(
      describeRatingFailure(invalid([{ truong: 'nhanXet', ma: 'QUA_DAI' }])),
    ).toEqual({ message: null, kind: 'field', fields: { nhanXet: 'QUA_DAI' } });
    expect(
      describeRatingFailure(
        invalid([
          { truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' },
          { truong: 'nhanXet', ma: 'QUA_DAI' },
        ]),
      ).fields,
    ).toEqual({ soSao: 'SO_SAO_BAT_BUOC', nhanXet: 'QUA_DAI' });
  });

  it('mã lạ, mã không ghép đúng trường, khoá lạ, `loi` rỗng hay sai dạng ⇒ KHÔNG ánh xạ được: dải chung `retry`', () => {
    const generic = {
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
      fields: {},
    };
    for (const loi of [
      [{ truong: 'nhanXet', ma: 'IS_STRING' }],
      [{ truong: 'bacSiId', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      [{ truong: 'soSao', ma: 'QUA_DAI' }],
      [{ truong: 'nhanXet', ma: 'SO_SAO_BAT_BUOC' }],
      [{ truong: 'soSao', ma: 'MA_LA' }],
      [],
      'khong-phai-mang',
      null,
      undefined,
      [null, 7, { truong: 5, ma: 'QUA_DAI' }, { truong: 'nhanXet' }],
    ]) {
      expect(describeRatingFailure(invalid(loi))).toEqual(generic);
    }
  });

  it('cùng một trường lặp: giữ lỗi ĐẦU; phần tử sai dạng bị bỏ nhưng phần tử đúng vẫn nhận', () => {
    expect(
      describeRatingFailure(
        invalid([
          null,
          { truong: 'soSao', ma: 'SO_SAO_KHONG_HOP_LE' },
          { truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' },
        ]),
      ).fields,
    ).toEqual({ soSao: 'SO_SAO_KHONG_HOP_LE' });
  });
});

describe('WDG-05 các mã lỗi còn lại theo `maLoi`', () => {
  it('409 DA_DANH_GIA ⇒ `already` (nơi gọi tải lại chi tiết), câu "Bạn đã đánh giá buổi khám này."', () => {
    expect(describeRatingFailure(api(409, 'DA_DANH_GIA'))).toEqual({
      message: 'Bạn đã đánh giá buổi khám này.',
      kind: 'already',
      fields: {},
    });
  });

  it('409 LICH_HEN_CHUA_HOAN_THANH ⇒ `final`, câu riêng (bỏ qua chiTiet.trangThai)', () => {
    for (const chiTiet of [{ trangThai: 'DaXacNhan' }, undefined, 'la']) {
      expect(
        describeRatingFailure(
          api(409, 'LICH_HEN_CHUA_HOAN_THANH', { chiTiet }),
        ),
      ).toEqual({
        message: 'Chỉ đánh giá được ca khám đã hoàn thành.',
        kind: 'final',
        fields: {},
      });
    }
  });

  it('404, 403, 401 ⇒ `final` với đúng câu; 503 ⇒ `retry` (bấm lại được)', () => {
    expect(describeRatingFailure(api(404, 'KHONG_TIM_THAY'))).toMatchObject({
      message: 'Không tìm thấy ca khám này.',
      kind: 'final',
    });
    expect(describeRatingFailure(api(403, 'KHONG_DU_QUYEN'))).toMatchObject({
      message: 'Bạn không có quyền thực hiện thao tác này.',
      kind: 'final',
    });
    expect(describeRatingFailure(api(401, 'CHUA_DANG_NHAP'))).toMatchObject({
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      kind: 'final',
    });
    expect(describeRatingFailure(api(503, 'HE_THONG_DANG_BAN'))).toMatchObject({
      message: 'Hệ thống đang bận, thử lại sau ít phút.',
      kind: 'retry',
    });
  });

  it('maLoi lạ (kể cả tên trùng nguyên mẫu như constructor, __proto__, toString) ⇒ câu chung `retry`', () => {
    for (const maLoi of [
      'LOI_LA',
      'constructor',
      '__proto__',
      'toString',
      '',
    ]) {
      expect(describeRatingFailure(api(500, maLoi))).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        fields: {},
      });
    }
  });

  it('chọn theo `maLoi`, không theo mã HTTP: 409 mang maLoi lạ vẫn là câu chung; DA_DANH_GIA ở mã HTTP khác vẫn là `already`', () => {
    expect(describeRatingFailure(api(409, 'MA_LA')).kind).toBe('retry');
    expect(describeRatingFailure(api(500, 'DA_DANH_GIA')).kind).toBe('already');
  });

  it('KHÔNG BAO GIỜ in `thongBao` của máy chủ ở bất kỳ nhánh nào', () => {
    for (const maLoi of [
      'DA_DANH_GIA',
      'LICH_HEN_CHUA_HOAN_THANH',
      'KHONG_TIM_THAY',
      'HE_THONG_DANG_BAN',
      'KHONG_DU_QUYEN',
      'CHUA_DANG_NHAP',
      'DU_LIEU_KHONG_HOP_LE',
      'LOI_LA',
    ]) {
      const result = describeRatingFailure(api(400, maLoi));
      expect(result.message ?? '').not.toContain('THONG-BAO-KHONG-DUOC-IN');
    }
  });
});

describe('WDG-07 không biết máy chủ đã xử lý chưa ⇒ "chưa rõ" (`uncertain`)', () => {
  it('mất mạng, hết giờ, 200 sai hình dạng (kể cả nginx 502 không phải JSON)', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(502),
      new UnexpectedResponseError(200),
    ]) {
      expect(describeRatingFailure(error)).toEqual({
        message: RATING_TEXT.unsure,
        kind: 'uncertain',
        fields: {},
      });
    }
    expect(RATING_TEXT.unsure).toBe(
      'Chưa rõ đánh giá đã được gửi chưa (mất kết nối hoặc quá thời gian chờ). Nội dung của bạn vẫn còn ở đây. Bấm Gửi đánh giá để thử lại.',
    );
  });

  it('lỗi lạ không phải của lớp client (RequestAbortedError, Error thường) ⇒ `retry`, không "chưa rõ"', () => {
    expect(describeRatingFailure(new RequestAbortedError()).kind).toBe('retry');
    expect(describeRatingFailure(new Error('x')).kind).toBe('retry');
    expect(describeRatingFailure('chuoi').kind).toBe('retry');
  });
});
