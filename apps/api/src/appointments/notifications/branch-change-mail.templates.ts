import { toSingleLine } from '../../mail/mail-safety.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import type { BranchChangeMailContext } from './branch-change-context.query.js';
import { renderMailSpec } from './booking-mail.templates.js';
import type { ClinicFooter } from './clinic-footer.query.js';

// Bốn mẫu thư của yêu cầu thay đổi chi nhánh (admin C4; PLAN admin Q9, 4.2a ý 5; Figma "Admin - Email Preview" `689:2`, `690:2`). Hàm THUẦN dựng trên `renderMailSpec` của booking (cùng vỏ, cùng cách in
// `text` và `html` từ MỘT bộ chữ, cùng màu đã đo tương phản), đúng cách payment B17 đã làm.
//
// TOÀN BỘ CHỮ LÀ [đề xuất] (Trung chốt 21/11/2026: dựng tạm, đối chiếu Figma 689:2 và 690:2 trước khi merge). Thư hủy và thư dời không có frame: biến thể của 690:2.
// NGUỒN DỮ LIỆU: chi tiết của thư là CHÍNH `thong_bao.noi_dung` (người gọi soạn: kết quả, lý do từ chối, các lịch bị ảnh hưởng…), như "phương án P" của thư payment; bảng chỉ có dữ kiện đọc lại được
// tại lúc gửi: tên, địa chỉ chi nhánh, thời điểm hiệu lực, lúc ghi thông báo. Thư kết quả KHÔNG đọc trạng thái hiện tại của yêu cầu (lúc gửi có thể đã bị hủy, in "Đã duyệt" sẽ sai).
// AN TOÀN (TB-04): mọi chữ từ DB qua `toSingleLine` ở đây, rồi `renderMailSpec` `escapeHtml` khi in html; không liên kết, không script, không ảnh.

// Dải đầu: xanh như thư hoàn tất, vàng đậm như thư vắng mặt (đã đo tương phản với chữ trắng ở `booking-mail.templates.ts`), xám đậm `#475569` cho thư kết quả trung tính [đề xuất]
const BANDS = {
  neutral: '#475569',
  amber: '#D97706',
  green: '#16A34A',
} as const;

export const BRANCH_CHANGE_SUBJECTS = {
  result: '[CLINIX] Kết quả yêu cầu thay đổi thông tin chi nhánh',
  affected: '[CLINIX] Thay đổi tại chi nhánh ảnh hưởng lịch hẹn của bạn',
  rescheduled: '[CLINIX] Thời điểm thay đổi tại chi nhánh đã được dời',
  cancelled: '[CLINIX] Thay đổi thông tin chi nhánh đã được hủy',
} as const;

/** Dữ liệu chung của bốn mẫu: người nhận là chủ tài khoản của dòng `thong_bao`. */
export interface BranchChangeMailCommon {
  recipientName: string;
  /** `thong_bao.noi_dung` (≤ 500 ký tự) */
  noiDung: string;
  /** Lúc ghi thông báo "dd/MM/yyyy — HH:mm" giờ Việt Nam */
  thoiDiem: string;
  context: BranchChangeMailContext;
  footer: ClinicFooter | null;
}

const one = (value: string, max = 100): string => toSingleLine(value, max);
const detail = (noiDung: string): string => one(noiDung, 500);
const branchRow = (p: BranchChangeMailCommon) => ({
  label: 'Chi nhánh',
  value: one(p.context.tenChiNhanh, 255),
});
// Yêu cầu đã duyệt luôn có `hieu_luc_tu` (CHECK `chk_yc_chi_nhanh_xu_ly`); thiếu thì in chữ trung tính thay vì bỏ dòng
const effectiveRow = (p: BranchChangeMailCommon) => ({
  label: 'Có hiệu lực từ',
  value:
    p.context.hieuLucTu === null
      ? 'Đang cập nhật'
      : one(p.context.hieuLucTu, 30),
  emphasis: 'bold' as const,
});

/** `689:2` Kết quả yêu cầu (duyệt hay từ chối) cho người đề xuất (`KetQuaYeuCauThayDoiChiNhanh`). */
export function renderBranchChangeResultMail(
  p: BranchChangeMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: BRANCH_CHANGE_SUBJECTS.result,
    band: BANDS.neutral,
    title: 'Kết quả yêu cầu thay đổi thông tin chi nhánh',
    name: one(p.recipientName),
    intro: [
      { text: 'Yêu cầu thay đổi thông tin chi nhánh của bạn đã được xử lý.' },
    ],
    tables: [
      {
        tone: 'slate',
        rows: [
          branchRow(p),
          { label: 'Thời gian xử lý', value: one(p.thoiDiem, 30) },
        ],
      },
    ],
    notice: { tone: 'slate', text: detail(p.noiDung) },
    closing:
      'Bạn có thể xem chi tiết yêu cầu tại mục Chi nhánh trong trang quản trị.',
    footer: p.footer,
  });
}

/** `690:2` Thay đổi chi nhánh ảnh hưởng lịch hẹn của bệnh nhân (`ThayDoiChiNhanhAnhHuongLichHen:v{n}`). */
export function renderBranchChangeAffectedMail(
  p: BranchChangeMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: BRANCH_CHANGE_SUBJECTS.affected,
    band: BANDS.amber,
    title: 'Thay đổi tại chi nhánh ảnh hưởng lịch hẹn của bạn',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Chi nhánh nơi bạn có lịch hẹn sắp thay đổi giờ làm việc hoặc dịch vụ khám.',
      },
    ],
    tables: [
      {
        tone: 'amber',
        rows: [
          branchRow(p),
          { label: 'Địa chỉ', value: one(p.context.diaChiChiNhanh, 255) },
          effectiveRow(p),
        ],
      },
    ],
    notice: { tone: 'amber', text: detail(p.noiDung) },
    closing:
      'Vui lòng đổi lịch hoặc liên hệ chi nhánh trước thời điểm có hiệu lực để được hỗ trợ.',
    footer: p.footer,
  });
}

/** Biến thể của `690:2`: thời điểm hiệu lực được dời (`DoiHieuLucThayDoiChiNhanh:v{n}`). */
export function renderBranchChangeRescheduledMail(
  p: BranchChangeMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: BRANCH_CHANGE_SUBJECTS.rescheduled,
    band: BANDS.amber,
    title: 'Thời điểm thay đổi tại chi nhánh đã được dời',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Thay đổi đã thông báo trước đây tại chi nhánh nơi bạn có lịch hẹn nay có thời điểm hiệu lực mới.',
      },
    ],
    tables: [
      {
        tone: 'amber',
        rows: [
          branchRow(p),
          { label: 'Địa chỉ', value: one(p.context.diaChiChiNhanh, 255) },
          effectiveRow(p),
        ],
      },
    ],
    notice: { tone: 'amber', text: detail(p.noiDung) },
    closing:
      'Thông báo này thay cho thông báo trước. Vui lòng đổi lịch hoặc liên hệ chi nhánh trước thời điểm có hiệu lực mới.',
    footer: p.footer,
  });
}

/** Biến thể của `690:2`: yêu cầu đã duyệt bị hủy, gửi người đề xuất và bệnh nhân đã được báo (`HuyThayDoiChiNhanh`). */
export function renderBranchChangeCancelledMail(
  p: BranchChangeMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: BRANCH_CHANGE_SUBJECTS.cancelled,
    band: BANDS.green,
    title: 'Thay đổi thông tin chi nhánh đã được hủy',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Thay đổi đã thông báo trước đây tại chi nhánh dưới đây sẽ không được áp dụng.',
      },
    ],
    tables: [
      {
        tone: 'green',
        rows: [
          branchRow(p),
          { label: 'Thời gian', value: one(p.thoiDiem, 30) },
        ],
      },
    ],
    notice: { tone: 'slate', text: detail(p.noiDung) },
    closing:
      'Thông tin chi nhánh giữ nguyên như hiện tại. Bạn không cần thực hiện thêm thao tác nào.',
    footer: p.footer,
  });
}
