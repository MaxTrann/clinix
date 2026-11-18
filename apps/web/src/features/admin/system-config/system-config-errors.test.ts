import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  FORBIDDEN_MESSAGE,
  GENERIC_SAVE_ERROR_MESSAGE,
  INVALID_FORM_MESSAGE,
  NOT_CONFIGURED_MESSAGE,
  SERVER_ERROR_MESSAGE,
  UNKNOWN_RESULT_HINT,
  describeSaveFailure,
} from './system-config-errors';
import {
  NO_CHANGE_MESSAGE,
  REASON_REQUIRED_MESSAGE,
  REQUIRED_MESSAGE,
  WEIGHT_SUM_MESSAGE,
  invalidValueMessage,
} from './system-config-validation';

// admin F5, ánh xạ mã lỗi của API sang chữ và ô (TRACKING admin 9A.1 mục 2.2; mã CHF5-12 là [đề xuất], 9A.8 mục 3).

const api = (
  status: number,
  maLoi: string,
  loi?: { truong: string; ma: string }[],
) => new ApiError(status, { maLoi, thongBao: 'câu của API', loi });

describe('CHF5-12 ánh xạ MỌI mã lỗi của PUT /admin/system-config', () => {
  it('CHF5-12 CAU_HINH_GIA_TRI_KHONG_HOP_LE gắn đúng ô, liệt kê nhiều ô một lượt; hộp xác nhận đóng', () => {
    const failure = describeSaveFailure(
      api(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'thoiGianGiuCho', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' },
        { truong: 'thoiDiemNhacLich', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' },
      ]),
    );
    expect(failure).toEqual({
      fields: {
        thoiGianGiuCho: invalidValueMessage('thoiGianGiuCho'),
        thoiDiemNhacLich: invalidValueMessage('thoiDiemNhacLich'),
      },
      keepDialogOpen: false,
    });
  });

  it('CHF5-12 TONG_TRONG_SO_KHAC_1 ở cả hai ô trọng số; CAU_HINH_THIEU_GIA_TRI là "Vui lòng nhập giá trị."', () => {
    expect(
      describeSaveFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'trongSoW1', ma: 'TONG_TRONG_SO_KHAC_1' },
          { truong: 'trongSoW2', ma: 'TONG_TRONG_SO_KHAC_1' },
        ]),
      ).fields,
    ).toEqual({ trongSoW1: WEIGHT_SUM_MESSAGE, trongSoW2: WEIGHT_SUM_MESSAGE });
    expect(
      describeSaveFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'checkInSauPhut', ma: 'CAU_HINH_THIEU_GIA_TRI' },
        ]),
      ).fields,
    ).toEqual({ checkInSauPhut: REQUIRED_MESSAGE });
  });

  it('CHF5-12 LY_DO_BAT_BUOC (và bí danh THIEU_LY_DO của PLAN 5.9) ⇒ lỗi ở ô lý do, hộp VẪN MỞ', () => {
    const expected = {
      fields: {},
      reason: REASON_REQUIRED_MESSAGE,
      keepDialogOpen: true,
    };
    expect(
      describeSaveFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
        ]),
      ),
    ).toEqual(expected);
    expect(describeSaveFailure(api(400, 'THIEU_LY_DO'))).toEqual(expected);
    expect(
      describeSaveFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'lyDo', ma: 'THIEU_LY_DO' },
        ]),
      ),
    ).toEqual(expected);
  });

  it('CHF5-12 lỗi vừa ở ô tham số vừa ở lý do: ưu tiên ô tham số (hộp đóng)', () => {
    const failure = describeSaveFailure(
      api(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
        { truong: 'nguongNoShow', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' },
      ]),
    );
    expect(Object.keys(failure.fields)).toEqual(['nguongNoShow']);
    expect(failure.keepDialogOpen).toBe(false);
  });

  it('CHF5-12 loi[] rỗng, khoá lạ, khoá là thuộc tính của Object, mã lạ ⇒ câu chung, không vỡ', () => {
    for (const loi of [
      undefined,
      [],
      [{ truong: 'id', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      [{ truong: 'constructor', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' }],
      [{ truong: 'thoiGianGiuCho', ma: 'MA_LA' }],
    ]) {
      expect(
        describeSaveFailure(api(400, 'DU_LIEU_KHONG_HOP_LE', loi)),
        JSON.stringify(loi),
      ).toEqual({
        fields: {},
        banner: INVALID_FORM_MESSAGE,
        keepDialogOpen: false,
      });
    }
  });

  it('CHF5-12 KHONG_CO_THAY_DOI, 403 KHONG_DU_QUYEN, HE_THONG_CHUA_CAU_HINH: câu của PLAN 5.9, hộp đóng', () => {
    expect(describeSaveFailure(api(400, 'KHONG_CO_THAY_DOI'))).toEqual({
      fields: {},
      banner: NO_CHANGE_MESSAGE,
      keepDialogOpen: false,
    });
    expect(describeSaveFailure(api(403, 'KHONG_DU_QUYEN'))).toEqual({
      fields: {},
      banner: FORBIDDEN_MESSAGE,
      keepDialogOpen: false,
    });
    expect(describeSaveFailure(api(403, 'MA_KHAC'))).toMatchObject({
      banner: FORBIDDEN_MESSAGE,
    });
    expect(describeSaveFailure(api(409, 'HE_THONG_CHUA_CAU_HINH'))).toEqual({
      fields: {},
      banner: NOT_CONFIGURED_MESSAGE,
      keepDialogOpen: false,
    });
    expect(FORBIDDEN_MESSAGE).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(NOT_CONFIGURED_MESSAGE).toBe('Hệ thống chưa được cấu hình.');
    expect(NO_CHANGE_MESSAGE).toBe('Không có thay đổi nào để lưu.');
    expect(REASON_REQUIRED_MESSAGE).toBe('Vui lòng nhập lý do thay đổi.');
  });

  it('CHF5-12 500 LOI_HE_THONG: nói chắc cấu hình CHƯA đổi, hộp mở để bấm lại; lỗi HTTP khác thì câu chung', () => {
    expect(describeSaveFailure(api(500, 'LOI_HE_THONG'))).toEqual({
      fields: {},
      banner: SERVER_ERROR_MESSAGE,
      keepDialogOpen: true,
    });
    for (const error of [
      api(502, 'BAD_GATEWAY'),
      api(401, 'CHUA_DANG_NHAP'),
      api(500, 'constructor'),
    ]) {
      expect(describeSaveFailure(error)).toEqual({
        fields: {},
        banner: GENERIC_SAVE_ERROR_MESSAGE,
        keepDialogOpen: true,
      });
    }
  });

  it('CHF5-12 mất mạng, hết hạn chờ, phản hồi lạ: câu của client + "Chưa rõ cấu hình đã được lưu hay chưa."; hộp mở', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(502),
      new Error('lạ'),
    ]) {
      const failure = describeSaveFailure(error);
      expect(failure.keepDialogOpen).toBe(true);
      expect(failure.banner).toContain(UNKNOWN_RESULT_HINT);
      expect(failure.fields).toEqual({});
    }
    expect(describeSaveFailure(new NetworkError()).banner).toContain(
      'Không có kết nối mạng',
    );
    expect(describeSaveFailure(new TimeoutError()).banner).toContain(
      'mất quá nhiều thời gian',
    );
  });
});
