import { toSingleLine } from '../../mail/mail-safety.js';
import {
  escapeHtml,
  MAIL_COLORS,
  renderMailShell,
} from '../../mail/templates/mail-html.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import {
  formatAppointmentTime,
  formatDoctorName,
  formatVnd,
  isZeroMoney,
  remainingAfterDeposit,
} from './mail-format.js';
import type { NotificationContext } from './notification-context.query.js';

// Bốn mẫu thư của booking (task B15; PLAN booking 5.12, Q30, Q46; Figma "Admin - Email Preview" `573:2`, `676:2`, `686:2`, `687:2`; TRACKING 3.37 B15-D, B15-I). Hàm THUẦN dựng trên `renderMailShell` (vỏ chung của A14, KHÔNG sửa).
// Mỗi thư dựng từ MỘT cấu trúc `MailSpec` rồi in ra `text` và `html` từ cùng bộ chữ (như `renderOtpMail`): hai bản không thể lệch nhau.
//
// AN TOÀN (TB-04, H10, H12): MỌI chữ từ DB đi qua `toSingleLine` rồi `escapeHtml` (html) hay chỉ `toSingleLine` (text). Không script, ảnh, font ngoài, liên kết, thẻ `style` (chỉ thuộc tính `style` nội tuyến); không nút nào (Figma không có).
// Mẫu không biết `ly_do_kham`, `ly_do_huy`, `so_dien_thoai`: các kiểu đầu vào không có trường nào như vậy.
//
// Màu theo Figma, trừ ba chỗ đã ĐO tương phản (14/11/2026; hiệu chuẩn: chữ trắng trên dải xanh Figma 3,30:1 và đỏ 3,76:1 đạt ngưỡng chữ lớn 3:1 như A14): (1) dải vàng `#F59E0B` của `686:2` chỉ 2,15:1 với chữ trắng nên dùng
// `#D97706` (3,19:1) `[đề xuất]`; (2) chữ xanh nhấn `#16A34A` trên nền `#F0FDF4` chỉ 3,15:1 nên dùng `#15803D` (4,79:1); (3) chữ đỏ `#EF4444` và `#DC2626` trên nền `#FEF2F2` thấp hơn 4,5:1 nên dùng `#B91C1C` (5,91:1), như `OTP_NOTICE_COLORS`.

const BRAND_DEFAULT = 'CLINIX Clinic';
const AUTOMATED_NOTE =
  'Email này được gửi tự động. Vui lòng không trả lời trực tiếp email này.';
const SUBJECTS = {
  confirmation: '[CLINIX] Lịch hẹn của bạn đã được xác nhận',
  cancellation: '[CLINIX] Lịch hẹn đã bị hủy',
  noShow: '[CLINIX] Ghi nhận vắng mặt tại lịch hẹn',
  restriction: '[CLINIX] Tài khoản bị hạn chế đặt lịch',
} as const;

type Tone = 'green' | 'red' | 'amber' | 'slate';
interface ToneColors {
  background: string;
  border: string;
  accent: string;
}
const TONES: Readonly<Record<Tone, ToneColors>> = {
  green: { background: '#F0FDF4', border: '#BBF7D0', accent: '#15803D' },
  red: { background: '#FEF2F2', border: '#FECACA', accent: '#B91C1C' },
  amber: { background: '#FFFBEB', border: '#FDE68A', accent: '#92620C' },
  // Bảng tiền của thư xác nhận (Figma: "Tiền cọc đã thanh toán" màu xanh); cũng là nền của ô lưu ý trung tính ở thư huỷ (ô đó dùng chữ `muted`, không dùng `accent`)
  slate: {
    background: MAIL_COLORS.supportBackground,
    border: MAIL_COLORS.supportBorder,
    accent: '#15803D',
  },
};
// Dải đầu theo Figma: xanh (xác nhận), đỏ (huỷ, hạn chế), vàng đậm hơn Figma (vắng mặt; xem chú thích màu ở đầu file)
const BANDS = {
  confirmation: '#16A34A',
  cancellation: '#EF4444',
  noShow: '#D97706',
  restriction: '#EF4444',
} as const;
const NOTICE_TEXT = '#92620C';

/** Một dòng của bảng: `emphasis` 'bold' đậm, 'accent' đậm và màu nhấn của bảng; `suffix` chữ phụ nhạt ngay sau giá trị ("(đặt hộ)"). */
interface Row {
  label: string;
  value: string;
  emphasis?: 'bold' | 'accent';
  suffix?: string;
}
interface Table {
  tone: Tone;
  rows: readonly Row[];
}
/** Đoạn chữ của câu mở đầu; `bold` để in đậm một cụm (Figma `687:2`). */
interface Segment {
  text: string;
  bold?: boolean;
}
interface Notice {
  tone: Tone;
  text: string;
}

interface MailSpec {
  subject: string;
  band: string;
  title: string;
  name: string;
  intro: readonly Segment[];
  tables: readonly Table[];
  notice: Notice | null;
  /** Dòng nhạt cuối phần thân (lời nhắc hay hướng dẫn) */
  closing: string | null;
  footer: ClinicFooter | null;
}

/** Dữ liệu chung của cả bốn mẫu. `recipientName` là họ tên TÀI KHOẢN ĐẶT (người nhận thư), kể cả khi đặt hộ người thân. */
export interface MailCommon {
  recipientName: string;
  context: NotificationContext;
  footer: ClinicFooter | null;
}

const one = (value: string, max = 100): string => toSingleLine(value, max);
const money = (amount: string): string => `${formatVnd(amount)} VNĐ`;

// ---------- chân thư ----------

function supportSentence(
  footer: ClinicFooter | null,
): { before: string; parts: string[]; after: string } | null {
  const hotline = footer?.hotline ? one(footer.hotline, 20) : '';
  const email = footer?.email ? one(footer.email, 255) : '';
  if (hotline === '' && email === '') return null;
  if (hotline !== '' && email !== '')
    return {
      before: 'Cần hỗ trợ? Liên hệ qua hotline ',
      parts: [hotline, ' hoặc email ', email],
      after: ' trong giờ làm việc.',
    };
  return hotline !== ''
    ? {
        before: 'Cần hỗ trợ? Liên hệ qua hotline ',
        parts: [hotline],
        after: ' trong giờ làm việc.',
      }
    : {
        before: 'Cần hỗ trợ? Liên hệ qua email ',
        parts: [email],
        after: ' trong giờ làm việc.',
      };
}

function supportText(footer: ClinicFooter | null): string {
  const s = supportSentence(footer);
  return s === null ? '' : `${s.before}${s.parts.join('')}${s.after}`;
}

// Hai phần tử chẵn lẻ: giá trị (hotline, email) in đậm, chữ nối giữa hai giá trị giữ thường
function supportHtml(footer: ClinicFooter | null): string {
  const s = supportSentence(footer);
  if (s === null) return '';
  const body = s.parts
    .map((part, index) =>
      s.parts.length === 3 && index === 1
        ? escapeHtml(part)
        : `<strong>${escapeHtml(part)}</strong>`,
    )
    .join('');
  return `${escapeHtml(s.before)}${body}${escapeHtml(s.after)}`;
}

function footerText(footer: ClinicFooter | null): string {
  const brand = footer?.tenThuongHieu
    ? one(footer.tenThuongHieu)
    : BRAND_DEFAULT;
  const address = footer?.diaChi ? one(footer.diaChi, 255) : '';
  return `${address === '' ? brand : `${brand} — ${address}`}. ${AUTOMATED_NOTE}`;
}

// ---------- in ra ----------

const PARAGRAPH = `margin:0 0 14px;font-size:13px;line-height:1.75;color:${MAIL_COLORS.body}`;

function renderTableHtml(table: Table): string {
  const tone = TONES[table.tone];
  const rows = table.rows.map((row, index) => {
    const last = index === table.rows.length - 1;
    const color = row.emphasis === 'accent' ? tone.accent : MAIL_COLORS.heading;
    const weight = row.emphasis === undefined ? 500 : 700;
    const suffix = row.suffix
      ? ` <span style="font-weight:400;color:${MAIL_COLORS.muted}">${escapeHtml(row.suffix)}</span>`
      : '';
    const border = last ? '' : `border-bottom:1px solid ${tone.border};`;
    return `<tr><td style="padding:5px 12px 5px 0;${border}font-size:13px;color:${MAIL_COLORS.muted}">${escapeHtml(row.label)}</td><td align="right" style="padding:5px 0;${border}font-size:13px;font-weight:${String(weight)};color:${color}">${escapeHtml(row.value)}${suffix}</td></tr>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${tone.background};border:1px solid ${tone.border};border-radius:8px"><tr><td style="padding:10px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table></td></tr></table>`;
}

function renderNoticeHtml(notice: Notice): string {
  const tone = TONES[notice.tone];
  const color =
    notice.tone === 'red'
      ? tone.accent
      : notice.tone === 'slate'
        ? MAIL_COLORS.muted
        : NOTICE_TEXT;
  return `<div style="margin:0 0 14px;padding:10px 12px;background:${tone.background};border:1px solid ${tone.border};border-radius:6px;font-size:12px;line-height:1.7;color:${color}">${escapeHtml(notice.text)}</div>`;
}

function render(spec: MailSpec): RenderedMail {
  const intro = spec.intro
    .map((s) =>
      s.bold ? `<strong>${escapeHtml(s.text)}</strong>` : escapeHtml(s.text),
    )
    .join('');
  const bodyHtml = [
    `<p style="${PARAGRAPH}">Xin chào <strong>${escapeHtml(spec.name)}</strong>,</p>`,
    spec.intro.length > 0 ? `<p style="${PARAGRAPH}">${intro}</p>` : '',
    ...spec.tables.map(renderTableHtml),
    spec.notice === null ? '' : renderNoticeHtml(spec.notice),
    spec.closing === null
      ? ''
      : `<p style="margin:0 0 6px;font-size:12px;line-height:1.7;color:${MAIL_COLORS.muted}">${escapeHtml(spec.closing)}</p>`,
  ].join('');

  const lines = [
    spec.title,
    '',
    `Xin chào ${spec.name},`,
    '',
    ...(spec.intro.length > 0
      ? [spec.intro.map((s) => s.text).join(''), '']
      : []),
    ...spec.tables.flatMap((table) => [
      ...table.rows.map(
        (row) =>
          `${row.label}: ${row.value}${row.suffix ? ` ${row.suffix}` : ''}`,
      ),
      '',
    ]),
    ...(spec.notice === null ? [] : [spec.notice.text, '']),
    ...(spec.closing === null ? [] : [spec.closing, '']),
    ...(supportText(spec.footer) === '' ? [] : [supportText(spec.footer), '']),
    footerText(spec.footer),
    '',
  ];

  return {
    subject: spec.subject,
    text: lines.join('\n'),
    html: renderMailShell({
      bandColor: spec.band,
      title: spec.title,
      bodyHtml,
      supportHtml: supportHtml(spec.footer),
      footerText: footerText(spec.footer),
    }),
  };
}

// ---------- bốn mẫu ----------

function baseRows(
  context: NotificationContext,
  keys: readonly ('ma' | 'bacSi' | 'gio')[],
  accentMa = false,
): Row[] {
  const all: Record<'ma' | 'bacSi' | 'gio', Row> = {
    ma: {
      label: 'Mã lịch hẹn',
      value: one(context.maLichHen, 20),
      ...(accentMa ? { emphasis: 'accent' as const } : {}),
    },
    bacSi: {
      label: 'Bác sĩ',
      value: formatDoctorName(context.chucDanh, one(context.tenBacSi)),
    },
    gio: { label: 'Ngày giờ', value: formatAppointmentTime(context) },
  };
  return keys.map((key) => all[key]);
}

/** `573:2` Xác nhận đặt lịch. Chỉ Tổng giá, cọc đã thanh toán, còn lại (Q46: không tách giá và phụ phí); cọc 0đ bỏ dòng cọc. Cọc đã thanh toán = `tien_coc_snapshot` (TRACKING 3.37 B15-E). */
export function renderBookingConfirmationMail(p: MailCommon): RenderedMail {
  const c = p.context;
  const deposit = !isZeroMoney(c.tienCocSnapshot);
  return render({
    subject: SUBJECTS.confirmation,
    band: BANDS.confirmation,
    title: 'Lịch hẹn đã được xác nhận',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Lịch khám của bạn tại CLINIX Clinic đã được xác nhận thành công.',
      },
    ],
    tables: [
      {
        tone: 'green',
        rows: [
          ...baseRows(c, ['ma'], true),
          {
            label: 'Người được khám',
            value: one(c.nguoiDuocKham),
            ...(c.datHo ? { suffix: '(đặt hộ)' } : {}),
          },
          ...baseRows(c, ['bacSi']),
          { label: 'Chuyên khoa', value: one(c.chuyenKhoa) },
          { label: 'Dịch vụ', value: one(c.dichVu) },
          ...baseRows(c, ['gio']),
          { label: 'Chi nhánh', value: one(c.chiNhanh) },
          { label: 'Địa chỉ', value: one(c.diaChiChiNhanh, 255) },
        ],
      },
      {
        tone: 'slate',
        rows: [
          { label: 'Tổng giá', value: money(c.giaSnapshot), emphasis: 'bold' },
          ...(deposit
            ? [
                {
                  label: 'Tiền cọc đã thanh toán',
                  value: money(c.tienCocSnapshot),
                  emphasis: 'accent' as const,
                },
              ]
            : []),
          {
            label: 'Còn lại cần thanh toán',
            value: money(
              remainingAfterDeposit(c.giaSnapshot, c.tienCocSnapshot),
            ),
            emphasis: 'bold',
          },
        ],
      },
    ],
    notice: {
      tone: 'amber',
      text: 'Số tiền còn lại sẽ được thanh toán theo hình thức đã xác nhận khi đặt lịch. Giá trên là giá tại thời điểm đặt lịch.',
    },
    closing:
      'Vui lòng đến trước giờ hẹn 10–15 phút và mang theo giấy tờ tùy thân.',
    footer: p.footer,
  });
}

/**
 * `676:2` Hủy lịch hẹn. Biến thể (bệnh nhân, phòng khám điều chỉnh, bác sĩ nghỉ phép) và câu hoàn tiền nằm TRONG `noiDung` (chính `thong_bao.noi_dung`, TRACKING 3.37 B15-F, phương án P): thư in nguyên chữ đó ở ô lưu ý,
 * không suy ngược lý do từ `lich_hen`. Bảng chỉ có các dữ kiện đọc lại được từ DB.
 */
export function renderCancellationMail(
  p: MailCommon & { noiDung: string },
): RenderedMail {
  const hotline = p.footer?.hotline ? one(p.footer.hotline, 20) : '';
  return render({
    subject: SUBJECTS.cancellation,
    band: BANDS.cancellation,
    title: 'Lịch hẹn đã bị hủy',
    name: one(p.recipientName),
    intro: [],
    tables: [
      { tone: 'red', rows: baseRows(p.context, ['ma', 'bacSi', 'gio']) },
    ],
    notice: { tone: 'slate', text: one(p.noiDung, 500) },
    closing:
      hotline === ''
        ? 'Để đặt lịch mới, vui lòng truy cập CLINIX.'
        : `Để đặt lịch mới, vui lòng truy cập CLINIX hoặc liên hệ hotline ${hotline}.`,
    footer: p.footer,
  });
}

/** `686:2` Ghi nhận vắng mặt. `soLan` là số lần HIỆN TẠI; `nguong` lấy từ cấu hình (không viết cứng). */
export function renderNoShowMail(
  p: MailCommon & { soLan: number; nguong: number },
): RenderedMail {
  return render({
    subject: SUBJECTS.noShow,
    band: BANDS.noShow,
    title: 'Ghi nhận vắng mặt tại lịch hẹn',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Chúng tôi ghi nhận bạn không đến khám theo lịch hẹn dưới đây. Nếu có nhầm lẫn, vui lòng liên hệ phòng khám.',
      },
    ],
    tables: [
      {
        tone: 'amber',
        rows: [
          ...baseRows(p.context, ['ma', 'bacSi', 'gio']),
          {
            label: 'Số lần vắng mặt (hiện tại)',
            value: `${String(p.soLan)} lần`,
          },
        ],
      },
    ],
    notice: {
      tone: 'amber',
      text: `Tích lũy từ ${String(p.nguong)} lần vắng mặt không thông báo sẽ dẫn đến hạn chế quyền đặt lịch online.`,
    },
    closing: null,
    footer: p.footer,
  });
}

/** `687:2` Hạn chế đặt lịch do no-show. Đây KHÔNG phải khoá đăng nhập; lịch gần nhất là lịch gây ra lần khoá. */
export function renderNoShowRestrictionMail(
  p: MailCommon & { soLan: number; nguong: number },
): RenderedMail {
  const hotline = p.footer?.hotline ? one(p.footer.hotline, 20) : '';
  return render({
    subject: SUBJECTS.restriction,
    band: BANDS.restriction,
    title: 'Tài khoản bị hạn chế đặt lịch online',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Do tích lũy nhiều lần vắng mặt không thông báo, tài khoản của bạn đã bị hạn chế chức năng ',
      },
      { text: 'đặt lịch online', bold: true },
      { text: '. Đây ' },
      { text: 'không phải khóa đăng nhập', bold: true },
      { text: ' tài khoản.' },
    ],
    tables: [
      {
        tone: 'red',
        rows: [
          {
            label: 'Số lần vắng mặt',
            value: `${String(p.soLan)} lần`,
            emphasis: 'accent',
          },
          { label: 'Ngưỡng áp dụng', value: `${String(p.nguong)} lần` },
          {
            label: 'Lịch hẹn gần nhất',
            value: formatAppointmentTime(p.context),
          },
        ],
      },
    ],
    notice: {
      tone: 'red',
      text: `🔒 Chức năng đặt lịch online tạm khóa. Để được kiểm tra và hỗ trợ mở khóa, vui lòng liên hệ CLINIX${hotline === '' ? '' : ` qua hotline ${hotline}`}. Việc mở khóa sẽ do Admin Toàn hệ thống xử lý theo thẩm quyền.`,
    },
    closing: null,
    footer: p.footer,
  });
}
