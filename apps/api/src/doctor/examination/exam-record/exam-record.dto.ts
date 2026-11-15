import { IsOptional, IsString } from 'class-validator';
import { EXAM_FIELD_ERROR_CODES } from '../examination.constants.js';

// Thân và kết quả của `PUT /doctor/appointments/:maLichHen/exam-record` (doctor-exam B2; PLAN 5.5, 5.11; Q2, Q3).

/**
 * Thân: DTO CHỈ KIỂM KIỂU (X1 M9: `ValidationPipe` không phân biệt vắng với sai và đếm điểm mã nên không dùng `@MaxLength`/`@MinLength`). Mọi quy tắc nội dung (`BAT_BUOC`, `QUA_DAI`, `NOI_DUNG_KHONG_HOP_LE`,
 * `NGAY_KHONG_HOP_LE` về dạng ngày) ở `validateRecordInput` (`exam-record.input.ts`), TRƯỚC giao dịch. `message` = mã để `loi[].ma` ổn định. Khoá lạ (`bacSiId`, `lichHenId`, `benhNhanId`…) bị `forbidNonWhitelisted`
 * từ chối bằng `TRUONG_KHONG_DUOC_PHEP` (HSK-15, QHK-02): bác sĩ chỉ lấy từ access token.
 */
export class ExamRecordDto {
  /** Vắng, `null`, số, mảng đều ra `BAT_BUOC` */
  @IsString({ message: EXAM_FIELD_ERROR_CODES.REQUIRED })
  trieuChung!: string;

  @IsString({ message: EXAM_FIELD_ERROR_CODES.REQUIRED })
  chanDoanSoBo!: string;

  @IsString({ message: EXAM_FIELD_ERROR_CODES.REQUIRED })
  huongXuLy!: string;

  /** Tuỳ chọn: vắng hoặc `null` hợp lệ (xoá ngày cũ khi sửa) */
  @IsOptional()
  @IsString({ message: EXAM_FIELD_ERROR_CODES.INVALID_DATE })
  ngayTaiKhamDuKien?: string | null;

  /** Token sửa chồng: chuỗi ISO của `capNhatLanCuoi` đã thấy; vắng hoặc `null` = chưa thấy hồ sơ nào. Không phải chuỗi ⇒ 400 `IS_STRING` */
  @IsOptional()
  @IsString()
  capNhatLanCuoi?: string | null;
}

/** 200: đúng năm khoá (PLAN 5.5). `ngayTaiKhamDuKien` là `YYYY-MM-DD` hay `null`; `capNhatLanCuoi` là chuỗi ISO, dùng làm token cho lần sửa sau. */
export interface ExamRecordView {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
  ngayTaiKhamDuKien: string | null;
  capNhatLanCuoi: string;
}
