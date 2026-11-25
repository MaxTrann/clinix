import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../../../../../shared/api/errors';
import {
  RESCHEDULE_ERROR_CODES,
  RESCHEDULE_NOT_ALLOWED_MESSAGE,
  rescheduleMessageForCode,
  rescheduleMessageForError,
  rescheduleReasonMessage,
} from './reschedule-errors';

// reschedule F1, mã ca WDH-16 [đề xuất]: `maLoi` → câu của PLAN reschedule 5.13 (chữ `[đề xuất]`, Q13, Đại sửa khi duyệt PR). Giao diện chọn câu theo `maLoi`, KHÔNG theo `thongBao` hay mã HTTP.
const apiError = (maLoi: string, thongBao = 'x', chiTiet?: unknown) =>
  new ApiError(409, { maLoi, thongBao, chiTiet });

const NINE: [string, string][] = [
  [
    'LICH_HEN_KHONG_CHO_DOI',
    'Lịch hẹn này hiện không thể đổi. Chỉ lịch đã xác nhận mới đổi được.',
  ],
  ['LICH_HEN_DA_QUA_GIO', 'Đã quá giờ hẹn nên không thể đổi lịch.'],
  [
    'KHUNG_GIO_TRUNG_LICH_CU',
    'Bạn đang chọn đúng khung giờ hiện tại. Vui lòng chọn khung giờ khác.',
  ],
  [
    'KHUNG_GIO_KHAC_BAC_SI',
    'Chỉ đổi được sang khung giờ của cùng bác sĩ. Muốn đổi bác sĩ, vui lòng huỷ và đặt lại.',
  ],
  [
    'LICH_HEN_KHAC_DICH_VU_HIEN_TAI',
    'Bác sĩ đã thay đổi dịch vụ so với lúc đặt. Vui lòng huỷ và đặt lịch mới.',
  ],
  [
    'LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI',
    'Bác sĩ đã thay đổi chi nhánh so với lúc đặt. Vui lòng huỷ và đặt lịch mới.',
  ],
  [
    'VUOT_SO_LAN_TU_DOI',
    'Bạn đã dùng hết số lần tự đổi. Hãy nhập lý do để gửi yêu cầu cho lễ tân.',
  ],
  [
    'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
    'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
  ],
  [
    'CHUOI_DOI_LICH_QUA_DAI',
    'Lịch hẹn này đã đổi quá nhiều lần. Vui lòng huỷ và đặt lịch mới.',
  ],
];

describe('rescheduleMessageForCode', () => {
  it('WDH-16 hằng mã khớp đúng chín mã của PLAN 5.13 (không thêm, không thiếu)', () => {
    expect(Object.values(RESCHEDULE_ERROR_CODES).sort()).toEqual(
      NINE.map(([code]) => code).sort(),
    );
  });

  it.each(NINE)(
    'WDH-16 %s ⇒ đúng câu của 5.13, không thử lại',
    (code, text) => {
      expect(rescheduleMessageForCode(code)).toEqual({
        message: text,
        retryable: false,
      });
    },
  );

  it('WDH-16 `chiTiet` không làm đổi câu của `VUOT_SO_LAN_TU_DOI` (câu 5.13 không có số) và `chiTiet` lạ không gây lỗi', () => {
    const base = rescheduleMessageForCode('VUOT_SO_LAN_TU_DOI');
    for (const chiTiet of [
      { soLanDaDoi: 2, toiDa: 2 },
      { soLanDaDoi: 'hai' },
      null,
      'x',
      [],
    ]) {
      expect(rescheduleMessageForCode('VUOT_SO_LAN_TU_DOI', chiTiet)).toEqual(
        base,
      );
    }
  });

  it('WDH-16 mã dùng lại của booking đi qua bảng của booking (khung giờ vừa hết, bác sĩ nghỉ, chi nhánh nghỉ kèm thứ)', () => {
    expect(rescheduleMessageForCode('KHUNG_GIO_DA_DAT')?.message).toBe(
      'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
    );
    expect(rescheduleMessageForCode('BAC_SI_NGHI_PHEP')?.message).toBe(
      'Bác sĩ nghỉ vào thời gian này. Vui lòng chọn khung giờ khác.',
    );
    expect(
      rescheduleMessageForCode('CHI_NHANH_NGHI', { thuTrongTuan: 7 })?.message,
    ).toBe('Chi nhánh nghỉ vào Chủ nhật.');
  });

  it('WDH-16 `HE_THONG_CHUA_CAU_HINH` và `HE_THONG_DANG_BAN` có câu và được thử lại', () => {
    expect(rescheduleMessageForCode('HE_THONG_CHUA_CAU_HINH')).toEqual({
      message: 'Hệ thống chưa sẵn sàng nhận đặt lịch. Vui lòng thử lại sau.',
      retryable: true,
    });
    expect(rescheduleMessageForCode('HE_THONG_DANG_BAN')).toEqual({
      message:
        'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
      retryable: true,
    });
  });

  it('WDH-16 ca âm: 404, 403 và khoá no-show KHÔNG có câu ở đây (trang dùng thẻ riêng; câu của bảng booking nói về ĐẶT lịch)', () => {
    for (const code of [
      'KHONG_TIM_THAY',
      'KHONG_DU_QUYEN',
      'DAT_LICH_BI_KHOA_NO_SHOW',
      'CHUA_DANG_NHAP',
    ]) {
      expect(rescheduleMessageForCode(code)).toBeUndefined();
    }
  });

  it('WDH-16 mã lạ, rỗng hay trùng khoá của nguyên mẫu (`constructor`, `__proto__`) ⇒ không có câu', () => {
    for (const code of [
      'MA_LA',
      '',
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(rescheduleMessageForCode(code)).toBeUndefined();
    }
  });
});

describe('rescheduleMessageForError', () => {
  it('WDH-16 chọn câu theo `maLoi`, KHÔNG theo `thongBao`: thân máy chủ nói câu khác vẫn ra câu của `maLoi`', () => {
    expect(
      rescheduleMessageForError(
        apiError(
          'LICH_HEN_DA_QUA_GIO',
          'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
        ),
      )?.message,
    ).toBe('Đã quá giờ hẹn nên không thể đổi lịch.');
  });

  it('WDH-16 `thongBao` khớp một câu đã biết nhưng `maLoi` lạ ⇒ KHÔNG có câu (không đoán theo chữ)', () => {
    expect(
      rescheduleMessageForError(
        apiError('MA_LA', 'Đã quá giờ hẹn nên không thể đổi lịch.'),
      ),
    ).toBeUndefined();
  });

  it('WDH-16 không phải `ApiError` (mạng, lỗi lập trình, chuỗi) ⇒ không có câu', () => {
    expect(rescheduleMessageForError(new NetworkError())).toBeUndefined();
    expect(rescheduleMessageForError(new TypeError('x'))).toBeUndefined();
    expect(rescheduleMessageForError('LICH_HEN_DA_QUA_GIO')).toBeUndefined();
    expect(rescheduleMessageForError(null)).toBeUndefined();
  });

  it('WDH-16 mã HTTP không quyết định: cùng `maLoi` ở 409 hay 200-như-lỗi đều ra cùng câu', () => {
    const at = (status: number) =>
      new ApiError(status, {
        maLoi: 'LICH_HEN_KHONG_CHO_DOI',
        thongBao: 'x',
      });
    expect(rescheduleMessageForError(at(409))).toEqual(
      rescheduleMessageForError(at(400)),
    );
  });
});

describe('rescheduleReasonMessage (lyDoKhongDoi của preview 200)', () => {
  it('WDH-16 mã đã biết ⇒ câu của mã đó', () => {
    expect(rescheduleReasonMessage('LICH_HEN_DA_QUA_GIO')).toBe(
      'Đã quá giờ hẹn nên không thể đổi lịch.',
    );
    expect(rescheduleReasonMessage('DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET')).toBe(
      'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
    );
  });

  it('WDH-16 vắng, rỗng hay mã lạ ⇒ câu chung và KHÔNG lộ mã', () => {
    for (const reason of [undefined, '', 'MA_LA', 'constructor']) {
      const message = rescheduleReasonMessage(reason);
      expect(message).toBe(RESCHEDULE_NOT_ALLOWED_MESSAGE);
      expect(message).not.toContain('MA_LA');
    }
    expect(RESCHEDULE_NOT_ALLOWED_MESSAGE).toBe(
      'Lịch hẹn này hiện không thể đổi.',
    );
  });
});
