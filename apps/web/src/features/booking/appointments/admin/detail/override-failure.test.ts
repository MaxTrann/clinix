import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { GENERIC_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import type { OverrideTarget } from '../api/admin-appointment-types';
import { OVERRIDE_TEXT } from './detail-messages';
import { describeOverrideFailure } from './override-failure';

// booking F10: bảng câu lỗi của route override (hàm thuần; bản trang ở override-flow.test.tsx). Mã AQE là [đề xuất] (PLAN booking mục 7.41). Override KHÔNG có `maLoi` riêng: dùng bảng chung
// `common/status-failure.ts`; chọn theo `maLoi`, KHÔNG theo mã HTTP.
function apiError(
  status: number,
  maLoi: string,
  extra: { chiTiet?: unknown; loi?: { truong: string; ma: string }[] } = {},
) {
  return new ApiError(status, {
    maLoi,
    thongBao: 'câu của API',
    ...extra,
  } as never);
}

const failure = (error: unknown, target: OverrideTarget = 'VangMat') =>
  describeOverrideFailure(error, target);

describe('describeOverrideFailure', () => {
  it('AQE-01 400 `DU_LIEU_KHONG_HOP_LE` kèm `LY_DO_BAT_BUOC` ⇒ câu thuộc ô lý do, bấm lại được; 400 khác ⇒ câu chung', () => {
    expect(
      failure(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
        }),
      ),
    ).toEqual({
      message: 'Vui lòng nhập lý do (tối đa 255 ký tự).',
      kind: 'retry',
      refresh: 'none',
      field: 'reason',
    });
    expect(
      failure(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'trangThai', ma: 'IS_IN' }],
        }),
      ).message,
    ).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('AQE-02 404 `KHONG_TIM_THAY` ⇒ MỘT câu, dừng, tải lại cả chi tiết và danh sách', () => {
    expect(failure(apiError(404, 'KHONG_TIM_THAY'))).toEqual({
      message: 'Không tìm thấy lịch hẹn này.',
      kind: 'final',
      refresh: 'detailAndList',
    });
  });

  it('AQE-03 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE`: câu có nhãn hai trạng thái; từ = đến ⇒ "đã ở trạng thái"; trạng thái lạ (kể cả `DaDoiLich`), vắng, sai kiểu ⇒ câu chung', () => {
    const transition = (chiTiet: unknown) =>
      failure(apiError(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', { chiTiet }))
        .message;
    expect(transition({ tuTrangThai: 'DaHuy', denTrangThai: 'VangMat' })).toBe(
      'Không thể chuyển lịch hẹn từ Đã hủy sang Vắng mặt.',
    );
    expect(transition({ tuTrangThai: 'DaHuy', denTrangThai: 'DaHuy' })).toBe(
      'Lịch hẹn đã ở trạng thái Đã hủy.',
    );
    const unknown =
      'Không thể thực hiện thao tác này với trạng thái hiện tại của lịch hẹn.';
    expect(
      transition({ tuTrangThai: 'DaDoiLich', denTrangThai: 'VangMat' }),
    ).toBe(unknown);
    expect(transition(undefined)).toBe(unknown);
    expect(transition({ tuTrangThai: 5, denTrangThai: 'VangMat' })).toBe(
      unknown,
    );
  });

  it('AQE-03 409 `LICH_HEN_KHONG_CHO_HUY` ⇒ câu có nhãn trạng thái ("đã được hủy" khi `DaHuy`); `CHI_BAC_SI_HOAN_THANH` ⇒ câu riêng; đều dừng', () => {
    expect(
      failure(
        apiError(409, 'LICH_HEN_KHONG_CHO_HUY', {
          chiTiet: { trangThai: 'HoanThanh' },
        }),
      ).message,
    ).toBe('Lịch hẹn đang ở trạng thái Hoàn thành nên không thể hủy.');
    expect(
      failure(
        apiError(409, 'LICH_HEN_KHONG_CHO_HUY', {
          chiTiet: { trangThai: 'DaHuy' },
        }),
      ).message,
    ).toBe('Lịch hẹn này đã được hủy.');
    expect(failure(apiError(409, 'CHI_BAC_SI_HOAN_THANH'))).toEqual({
      message:
        'Trạng thái Hoàn thành chỉ do Bác sĩ chuyển sau khi hoàn tất ca khám.',
      kind: 'final',
      refresh: 'detail',
    });
  });

  it('AQE-04 409 `HE_THONG_CHUA_CAU_HINH` ⇒ dừng, tải lại chi tiết', () => {
    expect(failure(apiError(409, 'HE_THONG_CHUA_CAU_HINH'))).toEqual({
      message:
        'Hệ thống chưa được cấu hình nên chưa thể thực hiện thao tác này.',
      kind: 'final',
      refresh: 'detail',
    });
  });

  it('AQE-05 503 `HE_THONG_DANG_BAN` ⇒ câu bận, bấm lại được, KHÔNG tải lại (giao dịch hoàn tác trọn)', () => {
    expect(failure(apiError(503, 'HE_THONG_DANG_BAN'))).toEqual({
      message:
        'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
      kind: 'retry',
      refresh: 'none',
    });
  });

  it('AQE-06 mạng đứt, quá giờ, 200/502 sai hình dạng ⇒ "chưa rõ" theo ĐÍCH đang gửi (bốn câu), kèm `uncertain`, không tải lại', () => {
    for (const target of [
      'DaTiepDon',
      'DaXacNhan',
      'VangMat',
      'DaHuy',
    ] as const) {
      for (const error of [
        new NetworkError(),
        new TimeoutError(),
        new UnexpectedResponseError(200),
        new UnexpectedResponseError(502),
      ]) {
        expect(failure(error, target)).toEqual({
          message: OVERRIDE_TEXT.unsure[target],
          kind: 'uncertain',
          refresh: 'none',
        });
      }
    }
    const texts = Object.values(OVERRIDE_TEXT.unsure);
    expect(new Set(texts).size).toBe(4);
  });

  it('AQE-07 401 `CHUA_DANG_NHAP` ⇒ câu hết phiên; 403 `KHONG_DU_QUYEN` ⇒ câu riêng; đều dừng, không tải lại', () => {
    expect(failure(apiError(401, 'CHUA_DANG_NHAP'))).toEqual({
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      kind: 'final',
      refresh: 'none',
    });
    expect(failure(apiError(403, 'KHONG_DU_QUYEN'))).toEqual({
      message: 'Bạn không có quyền thực hiện thao tác này.',
      kind: 'final',
      refresh: 'none',
    });
  });

  it('AQE-08 chọn theo `maLoi`, KHÔNG theo mã HTTP: cùng `maLoi` khác HTTP ⇒ cùng câu; `maLoi` lạ (kể cả trùng khoá nguyên mẫu) cùng 400, 401, 403, 404, 409, 500, 503 ⇒ câu chung', () => {
    for (const status of [400, 404, 409, 500]) {
      expect(failure(apiError(status, 'CHI_BAC_SI_HOAN_THANH')).message).toBe(
        'Trạng thái Hoàn thành chỉ do Bác sĩ chuyển sau khi hoàn tất ca khám.',
      );
    }
    for (const maLoi of ['MA_LA_XYZ', 'constructor', '__proto__', 'toString']) {
      for (const status of [400, 401, 403, 404, 409, 500, 503]) {
        const result = failure(apiError(status, maLoi));
        expect(result.message, `${maLoi} ${status}`).toBe(
          GENERIC_ERROR_MESSAGE,
        );
        expect(result.kind).toBe('retry');
      }
    }
  });

  it('AQE-08 ba mã chỉ của Lễ tân (chưa thanh toán, ngoài khung giờ, chưa qua giờ hẹn) KHÔNG có ở override (B14 bỏ qua cửa sổ tiếp đón và khoản còn phải thu) ⇒ câu chung; lỗi lạ không phải `ApiError` ⇒ câu chung bấm lại được', () => {
    for (const maLoi of [
      'CON_PHAN_CHUA_THANH_TOAN',
      'NGOAI_KHUNG_GIO_TIEP_DON',
      'CHUA_QUA_GIO_HEN',
    ]) {
      expect(failure(apiError(409, maLoi)).message).toBe(GENERIC_ERROR_MESSAGE);
    }
    const other = failure(new Error('lạ'));
    expect(other.kind).toBe('retry');
    expect(other.refresh).toBe('none');
  });
});
