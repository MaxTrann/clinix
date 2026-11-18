import { toSingleLine } from '../../mail/mail-safety.js';
import {
  MAIL_COLORS,
  escapeHtml,
  renderMailShell,
} from '../../mail/templates/mail-html.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import type {
  ActivationLinkKind,
  StaffLoaiTaiKhoan,
} from './activation-link.types.js';

// Hai email kích hoạt nhân sự (task B14), dựng trên khung HTML dùng chung của auth A14. Chữ và bố cục lấy từ hai frame Figma
// 674:2 "Kích hoạt tài khoản nhân sự" (TaoMoi) và 675:2 "Gửi lại liên kết kích hoạt" (GuiLai), đã đọc 18/11/2026 (chỉ đọc), trừ các chỗ khác Figma:
//  - bỏ hotline 1900 và địa chỉ chân thư (Figma ghi [cần điền]; quyết định G4 của auth: bỏ nếu chưa có giá trị thật); email hỗ trợ lấy từ MAIL_SUPPORT_ADDRESS;
//  - nút dùng #0e7490 thay #0891b2: chữ trắng 14px trên #0891b2 chỉ 3,68:1, dưới 4,5:1 (cùng lý do A14 đổi màu chữ không đủ tương phản). Dải đầu giữ đúng
//    #0891b2 (chữ "CLINIX" 20px đậm là chữ lớn, ngưỡng 3:1);
//  - thêm dòng chép URL dưới nút (ứng dụng thư chặn nút/ảnh vẫn dùng được) và gọi "CLINIX" thay "CLINIX Clinic" (tên hiển thị là CLINIX, G4).
// Khung `mail-html.ts` ghi "không liên kết" (thư OTP không cần), nhưng thư kích hoạt BẮT BUỘC có liên kết nên `<a>` nằm trong `bodyHtml`; khung không đổi.
// Toàn bộ chữ vẫn là [đề xuất] cho tới khi nhóm duyệt. Hai bản (thô và HTML) dựng từ CÙNG một bộ chữ (buildContent) nên không thể lệch URL, số giờ hay email.

export const STAFF_ACTIVATION_MAIL_SUBJECTS = {
  TaoMoi: '[CLINIX] Kích hoạt tài khoản nhân sự',
  GuiLai: '[CLINIX] Liên kết kích hoạt tài khoản mới',
} as const satisfies Record<ActivationLinkKind, string>;

export const STAFF_ACTIVATION_MAIL_COLORS = {
  band: '#0891b2',
  button: '#0e7490',
  panel: '#f0f9ff',
  panelBorder: '#bae6fd',
  noteBackground: '#FEF3C7',
  noteText: '#92620C',
} as const;

export const STAFF_ROLE_LABELS: Record<StaffLoaiTaiKhoan, string> = {
  BacSi: 'Bác sĩ',
  LeTan: 'Lễ tân',
  QuanTriVien: 'Quản trị viên',
};

const BRAND = 'CLINIX';
const BUTTON_LABEL = 'Kích hoạt tài khoản';
const AUTOMATED_NOTE =
  'Email này được gửi tự động. Vui lòng không trả lời trực tiếp email này.';
const SINGLE_USE_NOTE =
  'Tài khoản không có mật khẩu mặc định. Bạn sẽ tự thiết lập mật khẩu trong bước kích hoạt. Liên kết chỉ dùng một lần.';
const URL_FALLBACK =
  'Nếu nút không hoạt động, hãy sao chép liên kết sau vào trình duyệt:';
const SAFE_URL = /^https?:\/\/\S+$/;

export interface StaffActivationMailParams {
  kind: ActivationLinkKind;
  /** Họ tên người nhận; thiếu thì chào chung và bỏ dòng "Họ tên". Được đưa về một dòng, tối đa 100 ký tự. */
  fullName?: string | null;
  /** Email đăng nhập (chính là địa chỉ nhận thư). */
  accountEmail: string;
  loaiTaiKhoan: StaffLoaiTaiKhoan;
  /** URL kích hoạt (có token). Chỉ đi vào thân thư, không bao giờ vào log. */
  activationUrl: string;
  /** Số giờ hiệu lực in trong thư; nơi gọi truyền đúng số đã dùng để tính hạn thật. */
  ttlHours: number;
  /** Địa chỉ hỗ trợ (`MAIL_SUPPORT_ADDRESS`); thiếu thì bỏ ô hỗ trợ (G4). */
  supportAddress?: string | null;
}

/** Chữ THUẦN, chưa thoát HTML: dữ liệu người dùng đã qua `toSingleLine`, mỗi bản tự thoát khi cần. */
interface StaffActivationContent {
  title: string;
  name: string;
  /** Câu mở đầu; có `role` thì vai trò nằm giữa `intro` và `introEnd`. */
  intro: string;
  role: string;
  introEnd: string;
  rows: readonly { label: string; value: string }[];
  /** Dòng ghi chú trong khung vàng (chỉ thư TaoMoi). */
  note: string;
  support: string;
}

function buildContent(
  params: StaffActivationMailParams,
): StaffActivationContent {
  const name = params.fullName ? toSingleLine(params.fullName) : '';
  const email = toSingleLine(params.accountEmail, 255);
  const hours = `${String(params.ttlHours)} giờ`;
  const support = params.supportAddress
    ? toSingleLine(params.supportAddress, 255)
    : '';
  if (params.kind === 'TaoMoi') {
    return {
      title: 'Kích hoạt tài khoản nhân sự',
      name,
      intro: 'Tài khoản nhân sự ',
      role: STAFF_ROLE_LABELS[params.loaiTaiKhoan],
      introEnd:
        ' tại CLINIX đã được tạo cho bạn. Nhấn nút dưới đây để kích hoạt và thiết lập mật khẩu.',
      rows: [
        ...(name ? [{ label: 'Họ tên', value: name }] : []),
        { label: 'Vai trò', value: STAFF_ROLE_LABELS[params.loaiTaiKhoan] },
        { label: 'Email đăng nhập', value: email },
        { label: 'Thời hạn liên kết', value: hours },
      ],
      note: SINGLE_USE_NOTE,
      support,
    };
  }
  return {
    title: 'Liên kết kích hoạt mới',
    name,
    intro:
      'Liên kết kích hoạt trước đó đã hết hạn hoặc được gửi lại theo yêu cầu. Vui lòng sử dụng liên kết mới dưới đây.',
    role: '',
    introEnd: '',
    rows: [
      { label: 'Email đăng nhập', value: email },
      { label: 'Thời hạn liên kết mới', value: hours },
    ],
    note: '',
    support,
  };
}

function supportSentence(address: string): [string, string, string] {
  return ['Cần hỗ trợ? Liên hệ qua email ', address, ' trong giờ làm việc.'];
}

function renderText(content: StaffActivationContent, url: string): string {
  const { name, support, note } = content;
  return [
    content.title,
    '',
    name ? `Xin chào ${name},` : 'Xin chào,',
    '',
    `${content.intro}${content.role}${content.introEnd}`,
    '',
    ...content.rows.map((row) => `${row.label}: ${row.value}`),
    '',
    `${BUTTON_LABEL}: mở liên kết sau`,
    url,
    ...(note ? ['', note] : []),
    ...(support ? ['', supportSentence(support).join('')] : []),
    '',
    AUTOMATED_NOTE,
    BRAND,
    '',
  ].join('\n');
}

function renderBodyHtml(content: StaffActivationContent, url: string): string {
  const paragraph = `margin:0 0 14px;font-size:13px;line-height:1.75;color:${MAIL_COLORS.body}`;
  const greeting = content.name
    ? `Xin chào <strong>${escapeHtml(content.name)}</strong>,`
    : 'Xin chào,';
  const role = content.role
    ? `<strong>${escapeHtml(content.role)}</strong>`
    : '';
  const lastIndex = content.rows.length - 1;
  const rows = content.rows
    .map((row, index) => {
      const border =
        index < lastIndex
          ? `border-bottom:1px solid ${STAFF_ACTIVATION_MAIL_COLORS.panelBorder};`
          : '';
      return `<tr><td style="padding:5px 12px 5px 0;${border}font-size:13px;color:${MAIL_COLORS.muted}">${escapeHtml(row.label)}</td><td align="right" style="padding:5px 0;${border}font-size:13px;font-weight:500;color:${MAIL_COLORS.heading}">${escapeHtml(row.value)}</td></tr>`;
    })
    .join('');
  const note = content.note
    ? `<div style="margin:0 0 14px;padding:10px 12px;background:${STAFF_ACTIVATION_MAIL_COLORS.noteBackground};border-radius:6px;font-size:12px;line-height:1.7;color:${STAFF_ACTIVATION_MAIL_COLORS.noteText}">${escapeHtml(content.note)}</div>`
    : '';
  return [
    `<p style="${paragraph}">${greeting}</p>`,
    `<p style="${paragraph}">${escapeHtml(content.intro)}${role}${escapeHtml(content.introEnd)}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;padding:8px 14px;background:${STAFF_ACTIVATION_MAIL_COLORS.panel};border:1px solid ${STAFF_ACTIVATION_MAIL_COLORS.panelBorder};border-radius:8px">${rows}</table>`,
    '<div style="margin:0 0 14px;text-align:center">',
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 28px;background:${STAFF_ACTIVATION_MAIL_COLORS.button};border-radius:8px;font-size:14px;font-weight:600;color:${MAIL_COLORS.white};text-decoration:none">${BUTTON_LABEL}</a>`,
    '</div>',
    `<p style="margin:0 0 14px;font-size:12px;line-height:1.7;color:${MAIL_COLORS.muted}">${escapeHtml(URL_FALLBACK)}<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>`,
    note,
  ].join('');
}

function renderSupportHtml(address: string): string {
  if (!address) return '';
  const [before, value, after] = supportSentence(address);
  return `${escapeHtml(before)}<strong>${escapeHtml(value)}</strong>${escapeHtml(after)}`;
}

export function renderStaffActivationMail(
  params: StaffActivationMailParams,
): RenderedMail {
  if (!SAFE_URL.test(params.activationUrl)) {
    throw new Error('activationUrl phải là URL http(s) không có khoảng trắng');
  }
  if (!Number.isInteger(params.ttlHours) || params.ttlHours < 1) {
    throw new Error('ttlHours phải là số nguyên dương');
  }

  const content = buildContent(params);
  return {
    subject: STAFF_ACTIVATION_MAIL_SUBJECTS[params.kind],
    text: renderText(content, params.activationUrl),
    html: renderMailShell({
      bandColor: STAFF_ACTIVATION_MAIL_COLORS.band,
      title: content.title,
      bodyHtml: renderBodyHtml(content, params.activationUrl),
      supportHtml: renderSupportHtml(content.support),
      footerText: `${AUTOMATED_NOTE} ${BRAND}`,
    }),
  };
}
