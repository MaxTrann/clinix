import type { EntityManager } from 'typeorm';
import type { LoaiTaiKhoan } from '../../auth/entities/enums.js';
import type { IssuedActivationLink } from './issued-activation-link.js';

// Kiểu dùng chung của ActivationLinkService (task B14). Lỗi nghiệp vụ được TRẢ VỀ (ok: false), không ném, như OtpService.

/** TaoMoi: thư 674:2, gửi lần đầu khi tạo tài khoản (B15). GuiLai: thư 675:2, Admin bấm "Gửi lại" (B20). */
export type ActivationLinkKind = 'TaoMoi' | 'GuiLai';

/** Vai trò nhân sự của tài khoản được cấp liên kết (không bao giờ là BenhNhan). */
export type StaffLoaiTaiKhoan = Exclude<LoaiTaiKhoan, 'BenhNhan'>;

export interface IssueActivationLinkInput {
  taiKhoanId: string;
  kind: ActivationLinkKind;
}

export interface TransactionOptions {
  /** Giao dịch của người gọi; không truyền thì ActivationLinkService tự mở một giao dịch riêng. */
  manager?: EntityManager;
}

// Lý do chi tiết chỉ để ghi log và test; KHÔNG đưa ra HTTP
export type IssueFailure =
  | {
      code: 'GUI_LAI_QUA_SOM';
      reason: 'TOO_SOON' | 'HOURLY_LIMIT';
      /** Số giây phải chờ (đưa ra HTTP ở chiTiet.soGiayCho để FE đếm ngược) */
      retryAfterSeconds: number;
    }
  | {
      code: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT';
      reason: 'NOT_PENDING_STAFF';
    };

export type IssueActivationLinkResult =
  | { ok: true; issued: IssuedActivationLink }
  | { ok: false; failure: IssueFailure };

export interface ActivationRecipient {
  email: string;
  /** Họ tên in ở lời chào; thiếu thì chào chung */
  fullName?: string | null;
}

export type DeliverActivationLinkResult =
  | { ok: true; maXacThucId: string; hetHanLuc: Date }
  | {
      /** Gửi thư lỗi (MailSendError, mọi loại): hàng mới đã bị thu hồi, liên kết cũ còn hạn được GIỮ NGUYÊN. */
      ok: false;
      maLoi: 'GUI_MAIL_LOI';
      maXacThucId: string;
    };
