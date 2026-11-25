import { toSingleLine } from '../../mail/mail-safety.js';
import { RESCHEDULE_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { AppointmentEvent } from '../ports/appointment-notifier.port.js';
import { formatVnDateTime, truncateWithEllipsis } from './mail-format.js';
import type { NotificationContext } from './notification-context.query.js';
import { NOTIFICATION_MAX_LENGTH } from './notification-text.js';

// Chữ của `thong_bao.noi_dung` cho bốn sự kiện đổi lịch (reschedule B3; PLAN reschedule 5.10; Q9, Q10, Q13 `[đề xuất]`). Hàm THUẦN, không đọc DB.
//
// An toàn (NDL-06, BDL-04): ≤ 500 ký tự, MỘT dòng. KHÔNG có `ly_do_kham` và `ly_do_yeu_cau`: hàm chỉ nhận `NotificationContext` (không có hai thứ đó) và các trường của sự kiện (cũng không có). Chữ người nhập (ghi chú xử
// lý, lý do đổi hộ) được lưu NGUYÊN (không thoát HTML ở đây: thoát khi dựng thư, `escapeHtml`) nhưng qua `toSingleLine` để không xuống dòng.
//
// Quy tắc cắt: PHẦN CỐ ĐỊNH của câu (mã, giờ, tên bác sĩ, chi nhánh) không bao giờ bị cắt; chữ tự do của người nhập nhận phần còn lại của 500 đơn vị UTF-16 và bị cắt (kèm "…", không chẻ cặp thay thế)
// khi vượt. Trường hợp xấu nhất của đổi hộ (tên bác sĩ và chi nhánh đều 100 ký tự) có phần cố định 337 ký tự nên lý do 255 ký tự không còn vừa.

type DoiLichFacts = NonNullable<AppointmentEvent['doiLich']>;
type YeuCauFacts = NonNullable<AppointmentEvent['yeuCau']>;

const { RESCHEDULED, REQUEST_PENDING, REQUEST_APPROVED, REQUEST_REJECTED } =
  RESCHEDULE_NOTIFICATION_EVENTS;

export type RescheduleTextInput =
  | {
      loai: typeof RESCHEDULED;
      /** Ngữ cảnh của lịch MỚI (mã mới, bác sĩ, chi nhánh) */
      context: NotificationContext;
      doiLich: DoiLichFacts;
    }
  | {
      loai:
        | typeof REQUEST_PENDING
        | typeof REQUEST_APPROVED
        | typeof REQUEST_REJECTED;
      /** Ngữ cảnh của lịch CŨ của yêu cầu (mã và giờ hiện tại) */
      context: NotificationContext;
      yeuCau: YeuCauFacts;
    };

const ma = (value: string): string => toSingleLine(value, 20);

/** Câu = phần cố định `lead` + (tuỳ chọn) `label` + chữ tự do + `.`; chữ tự do nhận phần còn lại của `NOTIFICATION_MAX_LENGTH`. Không có chữ tự do thì chỉ còn `lead`. */
function withFreeText(
  lead: string,
  label: string,
  free: string | undefined,
): string {
  const text =
    free === undefined ? '' : toSingleLine(free, NOTIFICATION_MAX_LENGTH);
  if (text === '') return lead;
  const fixed = `${lead} ${label} `;
  const budget = NOTIFICATION_MAX_LENGTH - fixed.length - 1;
  if (budget < 1) return lead;
  return `${fixed}${truncateWithEllipsis(text, budget)}.`;
}

function rescheduledText(
  context: NotificationContext,
  doiLich: DoiLichFacts,
): string {
  const lead = `Lịch hẹn ${ma(doiLich.maLichHenCu)} đã đổi sang ${ma(context.maLichHen)}: ${formatVnDateTime(doiLich.thoiGianCu)} → ${formatVnDateTime(doiLich.thoiGianMoi)}, bác sĩ ${toSingleLine(context.tenBacSi)}, ${toSingleLine(context.chiNhanh)}.`;
  // Đổi hộ (Q9): Lễ tân đã đổi, kèm lý do để bệnh nhân đọc
  return doiLich.via === 'DoiHo'
    ? withFreeText(`${lead} Lễ tân đã đổi hộ.`, 'Lý do:', doiLich.lyDo)
    : lead;
}

function requestText(
  loai:
    typeof REQUEST_PENDING | typeof REQUEST_APPROVED | typeof REQUEST_REJECTED,
  context: NotificationContext,
  yeuCau: YeuCauFacts,
): string {
  const current = `${context.gio} ${context.ngay}`;
  switch (loai) {
    case REQUEST_PENDING:
      return `Yêu cầu đổi lịch hẹn ${ma(context.maLichHen)} sang ${formatVnDateTime(yeuCau.thoiGianMongMuon)} đã được gửi. Lịch hẹn giữ nguyên ${current} cho tới khi có kết quả.`;
    case REQUEST_APPROVED: {
      const maMoi = yeuCau.maLichHenMoi;
      const gioMoi = yeuCau.thoiGianMoi ?? yeuCau.thoiGianMongMuon;
      if (maMoi === undefined)
        throw new Error('thiếu maLichHenMoi khi ghi thông báo duyệt yêu cầu');
      return withFreeText(
        `Yêu cầu đổi lịch hẹn ${ma(context.maLichHen)} đã được duyệt. Lịch mới ${ma(maMoi)}: ${formatVnDateTime(gioMoi)}.`,
        'Ghi chú:',
        yeuCau.ghiChu,
      );
    }
    case REQUEST_REJECTED:
      return withFreeText(
        `Yêu cầu đổi lịch hẹn ${ma(context.maLichHen)} bị từ chối. Lịch hẹn giữ nguyên ${current}.`,
        'Ghi chú:',
        yeuCau.ghiChu,
      );
  }
}

/** `noi_dung` của sự kiện đổi lịch: một dòng, ≤ `NOTIFICATION_MAX_LENGTH`. */
export function buildRescheduleText(input: RescheduleTextInput): string {
  const text =
    input.loai === RESCHEDULED
      ? rescheduledText(input.context, input.doiLich)
      : requestText(input.loai, input.context, input.yeuCau);
  // Lưới an toàn (phần cố định tối đa 337 ký tự nên không bao giờ cắt ở đây); hai bước trên đã giữ ≤ 500
  return toSingleLine(text, NOTIFICATION_MAX_LENGTH);
}
