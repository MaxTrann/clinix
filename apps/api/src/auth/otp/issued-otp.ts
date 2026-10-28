import { inspect } from 'node:util';
import type { OtpLoai } from './otp.types.js';

// Kết quả của pha 1 (OtpService.issue): mã OTP vừa cấp. Mã rõ chỉ được giữ trong MỘT trường riêng của lớp này để chuyền cho
// OtpService.deliver dựng thư; nó KHÔNG xuất hiện khi JSON.stringify, trải (`...`), liệt kê khoá hay in ra bằng console/inspect.
// Nhờ vậy nếu một controller lỡ đưa cả đối tượng này vào phản hồi hay log thì OTP vẫn không lộ (DK-40, SE-04).
export class IssuedOtp {
  readonly maXacThucId: string;
  readonly taiKhoanId: string;
  readonly loai: OtpLoai;
  readonly hetHanLuc: Date;
  readonly #code: string;
  #revealed = false;

  constructor(
    fields: {
      maXacThucId: string;
      taiKhoanId: string;
      loai: OtpLoai;
      hetHanLuc: Date;
    },
    code: string,
  ) {
    this.maXacThucId = fields.maXacThucId;
    this.taiKhoanId = fields.taiKhoanId;
    this.loai = fields.loai;
    this.hetHanLuc = fields.hetHanLuc;
    this.#code = code;
  }

  /** Chỉ OtpService.deliver gọi, đúng một lần: lấy mã rõ để đưa vào thư. Gọi lần hai là lỗi lập trình (gửi trùng một mã). */
  static revealForDelivery(issued: IssuedOtp): string {
    if (issued.#revealed) {
      throw new Error(
        `Mã OTP ${issued.maXacThucId} đã được lấy để gửi một lần rồi`,
      );
    }
    issued.#revealed = true;
    return issued.#code;
  }

  toJSON(): object {
    return {
      maXacThucId: this.maXacThucId,
      taiKhoanId: this.taiKhoanId,
      loai: this.loai,
      hetHanLuc: this.hetHanLuc,
    };
  }

  [inspect.custom](): string {
    return `IssuedOtp { maXacThucId: ${this.maXacThucId}, loai: ${this.loai} }`;
  }
}
