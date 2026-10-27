import { HttpException } from '@nestjs/common';
import { ERROR_CODE_PATTERN, defaultsForStatus } from './error-codes.js';

// Một lỗi của MỘT trường dữ liệu vào (plan admin 5.9: loi[{truong, ma}])
export interface FieldError {
  truong: string;
  ma: string;
}

// Dạng JSON của MỌI lỗi API trả về (PLAN auth mục 5.5). Không bao giờ có stack, thông điệp lỗi gốc, SQL hay `cause`.
export interface ErrorBody {
  maLoi: string;
  thongBao: string;
  /** Chỉ lỗi kiểm dữ liệu */
  loi?: FieldError[];
  /** Dữ liệu nghiệp vụ kèm theo (ví dụ danh sách lỗi lịch hoạt động); phải là JSON thuần, không chứa bí mật */
  chiTiet?: unknown;
  /** Chỉ lỗi 5xx: khớp với dòng log ERROR của chính request này */
  requestId?: string;
}

export interface AppExceptionOptions {
  thongBao?: string;
  loi?: FieldError[];
  chiTiet?: unknown;
  cause?: unknown;
}

// Cách ném lỗi nghiệp vụ có mã ổn định: `throw new AppException(409, 'YEU_CAU_DANG_CHO', { thongBao: '…' })`.
// Chỉ dùng cho lỗi 4xx đã lường trước; lỗi hệ thống cứ để Error thường lan ra, bộ lọc sẽ trả 500 `LOI_HE_THONG`.
// `message` của ngoại lệ đặt bằng mã, để test ở mức ngoại lệ so mã như với UnauthorizedException(mã) của A3/A4.
export class AppException extends HttpException {
  readonly maLoi: string;

  constructor(
    status: number,
    maLoi: string,
    options: AppExceptionOptions = {},
  ) {
    if (!Number.isInteger(status) || status < 400 || status > 499) {
      throw new Error(
        `AppException chỉ dành cho lỗi 4xx, nhận ${String(status)}`,
      );
    }
    if (!ERROR_CODE_PATTERN.test(maLoi)) {
      throw new Error(
        `Mã lỗi phải viết HOA_VA_GACH_DUOI (không phải câu tự do), nhận "${maLoi}"`,
      );
    }
    const body: ErrorBody = {
      maLoi,
      thongBao: options.thongBao ?? defaultsForStatus(status).thongBao,
    };
    if (options.loi !== undefined) body.loi = options.loi;
    if (options.chiTiet !== undefined) body.chiTiet = options.chiTiet;
    super(
      body,
      status,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.maLoi = maLoi;
    this.message = maLoi;
  }
}
