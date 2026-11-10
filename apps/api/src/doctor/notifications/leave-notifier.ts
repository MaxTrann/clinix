import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { toSingleLine } from '../../mail/mail-safety.js';
import { nowVN, toSecond } from '../../common/time/time.js';

// Doctor B10 — thông báo trong ứng dụng cho luồng nghỉ phép (PLAN doctor Q33, 5.12).
// Chỉ ghi `thong_bao`, KHÔNG ghi `email_thong_bao` (chưa có worker gửi thư: [CHỜ notification]).
// Ghi bằng `em` của NGƯỜI GỌI để thông báo và thao tác nghỉ phép cùng commit/cùng rollback (H12).

/** Độ dài tối đa của `thong_bao.noi_dung`. */
export const LEAVE_NOTIFICATION_MAX_LENGTH = 500;

/** Mã sự kiện (`thong_bao.loai_su_kien`). */
export const LEAVE_EVENTS = {
  /** Bác sĩ nhận: yêu cầu đã gửi, đang chờ duyệt. */
  Submitted: 'NghiPhepDaGui',
  /** Admin có thẩm quyền nhận: có yêu cầu mới. */
  Pending: 'NghiPhepChoDuyet',
  /** Bác sĩ nhận: đã được duyệt. */
  Approved: 'NghiPhepDaDuyet',
  /** Bác sĩ nhận: bị từ chối (kèm lý do của Admin nếu có). */
  Rejected: 'NghiPhepTuChoi',
} as const;
export type LeaveEventCode = (typeof LEAVE_EVENTS)[keyof typeof LEAVE_EVENTS];

const SHIFT_LABELS = {
  CaSang: 'ca sáng',
  CaChieu: 'ca chiều',
  CaToi: 'ca tối',
} as const;

/** Thông tin yêu cầu nghỉ mà thông báo cần. Cố ý KHÔNG có `ly_do` của Bác sĩ (H10). */
export interface LeaveNotificationInput {
  bacSiId: string;
  /** Chi nhánh HIỆN TẠI của bác sĩ: quyết định Admin Chi nhánh nào nhận. */
  chiNhanhId: string;
  tenBacSi: string;
  /** `YYYY-MM-DD`. */
  ngayBatDau: string;
  ngayKetThuc: string;
  /** `null` = nghỉ cả ngày. */
  ca: keyof typeof SHIFT_LABELS | null;
}

export type LeaveEvent =
  | ({ loaiSuKien: typeof LEAVE_EVENTS.Submitted } & LeaveNotificationInput)
  | ({ loaiSuKien: typeof LEAVE_EVENTS.Pending } & LeaveNotificationInput)
  | ({ loaiSuKien: typeof LEAVE_EVENTS.Approved } & LeaveNotificationInput)
  | ({
      loaiSuKien: typeof LEAVE_EVENTS.Rejected;
      /** Lý do TỪ CHỐI do Admin nhập (không phải lý do xin nghỉ của Bác sĩ). */
      lyDoTuChoi?: string | null;
    } & LeaveNotificationInput);

/** `2026-11-10` → `10/11/2026`. Cắt chuỗi, không qua `Date` nên không lệch múi giờ. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function describePeriod(input: LeaveNotificationInput): string {
  const from = formatDate(input.ngayBatDau);
  const shift = input.ca ? `${SHIFT_LABELS[input.ca]} ` : '';
  if (input.ngayBatDau === input.ngayKetThuc) return `${shift}ngày ${from}`;
  return `từ ${from} đến ${formatDate(input.ngayKetThuc)}`;
}

/** Hàm thuần dựng nội dung: một dòng, không ký tự điều khiển, ≤ 500 ký tự. */
export function buildLeaveMessage(event: LeaveEvent): string {
  const period = describePeriod(event);
  let text: string;
  switch (event.loaiSuKien) {
    case LEAVE_EVENTS.Submitted:
      text = `Yêu cầu nghỉ phép ${period} đã được gửi, đang chờ duyệt.`;
      break;
    case LEAVE_EVENTS.Pending:
      text = `Bác sĩ ${toSingleLine(event.tenBacSi)} gửi yêu cầu nghỉ phép ${period}.`;
      break;
    case LEAVE_EVENTS.Approved:
      text = `Yêu cầu nghỉ phép ${period} đã được duyệt.`;
      break;
    case LEAVE_EVENTS.Rejected: {
      const reason = toSingleLine(
        event.lyDoTuChoi ?? '',
        LEAVE_NOTIFICATION_MAX_LENGTH,
      );
      text = `Yêu cầu nghỉ phép ${period} đã bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`;
      break;
    }
  }
  return toSingleLine(text, LEAVE_NOTIFICATION_MAX_LENGTH);
}

@Injectable()
export class LeaveNotifier {
  /** Ghi thông báo vào giao dịch của người gọi. Không tự mở giao dịch, không nuốt lỗi (lỗi ⇒ người gọi hoàn tác). */
  async notify(em: EntityManager, event: LeaveEvent): Promise<void> {
    const recipients =
      event.loaiSuKien === LEAVE_EVENTS.Pending
        ? await this.findAdminRecipients(em, event.chiNhanhId)
        : [event.bacSiId];
    if (recipients.length === 0) return;

    const content = buildLeaveMessage(event);
    const now = toSecond(nowVN());
    const placeholders = recipients.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params = recipients.flatMap((id) => [
      id,
      content,
      event.loaiSuKien,
      false,
      now,
    ]);
    await em.query(
      `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao)
       VALUES ${placeholders}`,
      params,
    );
  }

  /** Admin Toàn hệ thống + Admin Chi nhánh đúng chi nhánh của bác sĩ, chỉ tài khoản đang hoạt động (TYN b6). */
  private async findAdminRecipients(
    em: EntityManager,
    chiNhanhId: string,
  ): Promise<string[]> {
    const rows: { id: string }[] = await em.query(
      `SELECT CAST(q.tai_khoan_id AS CHAR) AS id
         FROM quan_tri_vien q
         JOIN tai_khoan t ON t.tai_khoan_id = q.tai_khoan_id
        WHERE t.trang_thai = 'DangHoatDong'
          AND (q.pham_vi_quan_tri = 'ToanHeThong'
               OR (q.pham_vi_quan_tri = 'ChiNhanh' AND q.chi_nhanh_id = ?))
        ORDER BY q.tai_khoan_id`,
      [chiNhanhId],
    );
    return rows.map((r) => r.id);
  }
}
