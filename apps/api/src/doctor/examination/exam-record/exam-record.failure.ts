import {
  AppException,
  type FieldError,
} from '../../../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  INVALID_DATA_MESSAGE,
} from '../../../common/errors/error-codes.js';
import {
  EXAM_ERROR_CODES,
  EXAM_FIELD_ERROR_CODES,
} from '../examination.constants.js';
import type { ExamRecordView } from './exam-record.dto.js';
import type { StoredRecord } from './exam-record.repository.js';

// MỘT ánh xạ duy nhất từ kết quả có kiểu của thân giao dịch sang kết quả API (doctor-exam B2; PLAN 5.5 bước 4). Bên trong giao dịch chỉ trả KẾT QUẢ CÓ KIỂU; đổi sang lỗi ở đây, SAU khi giao dịch đã đóng
// (nếp A8: ném trong giao dịch thì lần ghi đã làm bị hoàn tác theo). Hàm thuần. `HE_THONG_DANG_BAN` (503) do `withBookingTransaction` ném khi hết lượt thử lại.
//  - `Saved` ⇒ 200 `ExamRecordView` (cả ghi lần đầu, sửa, và gửi y hệt nội dung hiện có).
//  - `NotFound` ⇒ 404 `KHONG_TIM_THAY` CÙNG thân với mã sai dạng và lịch của bác sĩ khác.
//  - `WrongState` ⇒ 409 `KHONG_THE_GHI_HO_SO_KHAM` kèm `chiTiet { trangThai }`.
//  - `InvalidDate` ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' }]` (ngày so với ngày khám).
//  - `Conflict` ⇒ 409 `HO_SO_KHAM_DA_THAY_DOI` (sai token, hoặc 1062 lưới an toàn).

export type ExamRecordOutcome =
  | { kind: 'Saved'; record: StoredRecord }
  | { kind: 'NotFound' }
  | { kind: 'WrongState'; trangThai: string }
  | { kind: 'InvalidDate' }
  | { kind: 'Conflict' };

/** 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi` (chỉ tên trường và mã, không giá trị người dùng). */
export function fieldErrorsException(loi: FieldError[]): AppException {
  return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
    thongBao: INVALID_DATA_MESSAGE,
    loi,
  });
}

/** Bản trả về từ dòng đã lưu. Ba cột chữ cho NULL ở DB nhưng sau mọi lần ghi của B2 luôn là chuỗi; `?? ''` chỉ phòng dòng cũ do nguồn khác ghi. */
export function viewOf(record: StoredRecord): ExamRecordView {
  return {
    trieuChung: record.trieuChung ?? '',
    chanDoanSoBo: record.chanDoanSoBo ?? '',
    huongXuLy: record.huongXuLy ?? '',
    ngayTaiKhamDuKien: record.ngayTaiKhamDuKien,
    capNhatLanCuoi: record.capNhatLanCuoi.toISOString(),
  };
}

export function examRecordResult(outcome: ExamRecordOutcome): ExamRecordView {
  switch (outcome.kind) {
    case 'Saved':
      return viewOf(outcome.record);
    case 'NotFound':
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    case 'WrongState':
      throw new AppException(409, EXAM_ERROR_CODES.RECORD_NOT_WRITABLE, {
        chiTiet: { trangThai: outcome.trangThai },
      });
    case 'InvalidDate':
      throw fieldErrorsException([
        {
          truong: 'ngayTaiKhamDuKien',
          ma: EXAM_FIELD_ERROR_CODES.INVALID_DATE,
        },
      ]);
    case 'Conflict':
      throw new AppException(409, EXAM_ERROR_CODES.RECORD_CHANGED);
  }
}
