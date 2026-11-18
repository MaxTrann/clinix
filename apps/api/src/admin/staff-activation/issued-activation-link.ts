import { inspect } from 'node:util';
import type {
  ActivationLinkKind,
  StaffLoaiTaiKhoan,
} from './activation-link.types.js';

// Kết quả của pha 1 (ActivationLinkService.issue): liên kết kích hoạt vừa tạo. URL (có token) chỉ được giữ trong MỘT trường riêng `#` của
// lớp này để chuyền cho ActivationLinkService.deliver dựng thư; nó KHÔNG xuất hiện khi JSON.stringify, trải (`...`), liệt kê khoá, String()
// hay in ra bằng console/inspect. Nhờ vậy nếu B15 hay B20 lỡ đưa cả đối tượng này vào phản hồi hay log thì token vẫn không lộ (NS-21).
export class IssuedActivationLink {
  readonly maXacThucId: string;
  readonly taiKhoanId: string;
  readonly kind: ActivationLinkKind;
  readonly loaiTaiKhoan: StaffLoaiTaiKhoan;
  readonly hetHanLuc: Date;
  /** Số giờ hiệu lực ĐÃ dùng để tính `hetHanLuc` (thư in đúng số này, không đọc lại cấu hình, nên không thể lệch hạn thật). */
  readonly ttlHours: number;
  readonly #url: string;
  #revealed = false;

  constructor(
    fields: {
      maXacThucId: string;
      taiKhoanId: string;
      kind: ActivationLinkKind;
      loaiTaiKhoan: StaffLoaiTaiKhoan;
      hetHanLuc: Date;
      ttlHours: number;
    },
    url: string,
  ) {
    this.maXacThucId = fields.maXacThucId;
    this.taiKhoanId = fields.taiKhoanId;
    this.kind = fields.kind;
    this.loaiTaiKhoan = fields.loaiTaiKhoan;
    this.hetHanLuc = fields.hetHanLuc;
    this.ttlHours = fields.ttlHours;
    this.#url = url;
  }

  /** Chỉ ActivationLinkService.deliver gọi, đúng một lần: lấy URL để đưa vào thư. Gọi lần hai là lỗi lập trình (gửi trùng một liên kết). */
  static revealForDelivery(issued: IssuedActivationLink): string {
    if (issued.#revealed) {
      throw new Error(
        `Liên kết kích hoạt ${issued.maXacThucId} đã được lấy để gửi một lần rồi`,
      );
    }
    issued.#revealed = true;
    return issued.#url;
  }

  toJSON(): object {
    return {
      maXacThucId: this.maXacThucId,
      taiKhoanId: this.taiKhoanId,
      kind: this.kind,
      loaiTaiKhoan: this.loaiTaiKhoan,
      hetHanLuc: this.hetHanLuc,
      ttlHours: this.ttlHours,
    };
  }

  toString(): string {
    return `IssuedActivationLink { maXacThucId: ${this.maXacThucId}, kind: ${this.kind} }`;
  }

  [inspect.custom](): string {
    return this.toString();
  }
}
