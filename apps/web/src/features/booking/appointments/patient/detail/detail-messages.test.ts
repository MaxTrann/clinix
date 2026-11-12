import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import { LIST_TEXT } from '../list-messages';
import { describeCancelError, DETAIL_TEXT } from './detail-messages';

// booking F2: chọn câu lỗi theo `maLoi`, KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION; PLAN 5.14). Mã LCT, HHL là [đề xuất] (PLAN booking mục 7.33).
const api = (status: number, maLoi: string, chiTiet?: unknown) =>
  new ApiError(status, { maLoi, thongBao: 'Lỗi giả', chiTiet });

describe('describeCancelError', () => {
  it('HHL-08 409 LICH_HEN_KHONG_CHO_HUY: DaHuy có câu riêng, trạng thái khác nêu nhãn, thiếu hay lạ ⇒ câu chung; luôn dừng và tải lại chi tiết', () => {
    const cases: [unknown, string][] = [
      [{ trangThai: 'DaHuy' }, 'Lịch hẹn này đã được hủy.'],
      [
        { trangThai: 'DaTiepDon' },
        'Lịch hẹn đang ở trạng thái Đã tiếp đón nên không thể hủy.',
      ],
      [
        { trangThai: 'HoanThanh' },
        'Lịch hẹn đang ở trạng thái Hoàn thành nên không thể hủy.',
      ],
      [
        { trangThai: 'VangMat' },
        'Lịch hẹn đang ở trạng thái Vắng mặt nên không thể hủy.',
      ],
      [{ trangThai: 'DaDoiLich' }, 'Lịch hẹn này hiện không thể hủy.'],
      [{ trangThai: 'constructor' }, 'Lịch hẹn này hiện không thể hủy.'],
      [{ trangThai: 5 }, 'Lịch hẹn này hiện không thể hủy.'],
      [{}, 'Lịch hẹn này hiện không thể hủy.'],
      [undefined, 'Lịch hẹn này hiện không thể hủy.'],
      [null, 'Lịch hẹn này hiện không thể hủy.'],
      ['DaHuy', 'Lịch hẹn này hiện không thể hủy.'],
    ];
    for (const [chiTiet, message] of cases) {
      expect(
        describeCancelError(
          api(409, 'LICH_HEN_KHONG_CHO_HUY', chiTiet),
          'submit',
        ),
      ).toEqual({
        message,
        kind: 'final',
        reloadDetail: true,
      });
    }
  });

  it('HHL-10 404, 401, 403 ⇒ dừng (không thử lại), không tải lại chi tiết', () => {
    expect(describeCancelError(api(404, 'KHONG_TIM_THAY'), 'submit')).toEqual({
      message: DETAIL_TEXT.notFound,
      kind: 'final',
      reloadDetail: false,
    });
    expect(describeCancelError(api(401, 'CHUA_DANG_NHAP'), 'submit')).toEqual({
      message: LIST_TEXT.sessionExpired,
      kind: 'final',
      reloadDetail: false,
    });
    expect(
      describeCancelError(api(403, 'KHONG_DU_QUYEN'), 'submit'),
    ).toMatchObject({
      kind: 'final',
      reloadDetail: false,
    });
  });

  it('HHL-10 503 HE_THONG_DANG_BAN ⇒ thử lại được; maLoi lạ ⇒ câu chung, thử lại được; cả hai không tải lại chi tiết', () => {
    expect(
      describeCancelError(api(503, 'HE_THONG_DANG_BAN'), 'submit'),
    ).toEqual({
      message:
        'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
      kind: 'retry',
      reloadDetail: false,
    });
    expect(describeCancelError(api(500, 'MA_LA'), 'submit')).toEqual({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
      reloadDetail: false,
    });
  });

  it('HHL-10 gửi huỷ mà mạng, quá giờ, phản hồi lạ ⇒ "chưa rõ" (uncertain); xem trước thì chỉ là lỗi thử lại được', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(502),
    ]) {
      expect(describeCancelError(error, 'submit')).toEqual({
        message:
          'Mất kết nối khi đang hủy, chưa rõ lịch hẹn đã được hủy hay chưa.',
        kind: 'uncertain',
        reloadDetail: false,
      });
    }
    expect(describeCancelError(new NetworkError(), 'preview')).toEqual({
      message: NETWORK_ERROR_MESSAGE,
      kind: 'retry',
      reloadDetail: false,
    });
    expect(describeCancelError(new TimeoutError(), 'preview')).toMatchObject({
      message: TIMEOUT_ERROR_MESSAGE,
      kind: 'retry',
    });
    expect(
      describeCancelError(new UnexpectedResponseError(502), 'preview'),
    ).toMatchObject({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
    });
  });

  it('HHL-09 lỗi không phải ApiError hay lỗi của client (kể cả RequestAbortedError) ⇒ câu chung, thử lại được', () => {
    expect(
      describeCancelError(new RequestAbortedError(), 'submit'),
    ).toMatchObject({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
    });
    expect(describeCancelError('lỗi lạ', 'preview')).toMatchObject({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
    });
  });
});
