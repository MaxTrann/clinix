// Các loại lỗi của lớp API client (task P6). Nơi gọi phân biệt bằng `instanceof`; KHÔNG gộp chúng lại,
// vì F1 xử lý khác nhau: chỉ thân JSON `LOI_HE_THONG` mới chắc giao dịch đã hoàn tác (TRACKING auth mục 5 điểm 15).

export interface FieldError {
  truong: string;
  ma: string;
}

// Thân JSON lỗi của API (bộ lọc lỗi P5, apps/api/src/common/errors/app.exception.ts)
export interface ApiErrorBody {
  maLoi: string;
  thongBao: string;
  loi?: FieldError[];
  chiTiet?: unknown;
  requestId?: string;
}

// API đã trả lời bằng JSON lỗi chuẩn. Giao diện chọn câu theo `maLoi` (và `loi[].ma`), không theo mã HTTP hay `thongBao`.
export class ApiError extends Error {
  readonly status: number;
  readonly maLoi: string;
  readonly thongBao: string;
  readonly loi?: FieldError[];
  readonly chiTiet?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.maLoi);
    this.name = 'ApiError';
    this.status = status;
    this.maLoi = body.maLoi;
    this.thongBao = body.thongBao;
    this.loi = body.loi;
    this.chiTiet = body.chiTiet;
    this.requestId = body.requestId;
  }
}

// Không có phản hồi: không biết máy chủ đã xử lý hay chưa, nên không được tự thử lại yêu cầu làm thay đổi dữ liệu.
export class NetworkError extends Error {
  constructor() {
    super('Không kết nối được tới máy chủ');
    this.name = 'NetworkError';
  }
}

// Hết hạn chờ: máy chủ có thể vẫn đã xử lý xong (ví dụ thư OTP đã gửi), cùng lưu ý như NetworkError.
export class TimeoutError extends Error {
  constructor() {
    super('Quá thời gian chờ phản hồi');
    this.name = 'TimeoutError';
  }
}

// Có phản hồi nhưng không phải JSON mong đợi (nginx 502/504, HTML, thân rỗng khi lỗi). KHÔNG giữ thân để HTML không lọt ra màn hình.
export class UnexpectedResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Phản hồi không hợp lệ (HTTP ${status})`);
    this.name = 'UnexpectedResponseError';
    this.status = status;
  }
}

// Chính nơi gọi đã huỷ (component bị gỡ, người dùng rời trang). Đây không phải lỗi để báo cho người dùng.
export class RequestAbortedError extends Error {
  constructor() {
    super('Yêu cầu đã bị huỷ');
    this.name = 'RequestAbortedError';
  }
}
