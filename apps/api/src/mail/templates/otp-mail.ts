import { toSingleLine } from '../mail-safety.js';
import { MAIL_COLORS, escapeHtml, renderMailShell } from './mail-html.js';

// Hai email OTP, mỗi thư gồm bản văn bản thô và bản HTML (task P4, A14). Tiêu đề lấy từ dòng A14 của PLAN auth.
// Chữ trong thân thư lấy từ hai frame "Admin - Email Preview" (đối chiếu 01/11/2026), trừ các chỗ Figma sai so với G2, G3, G4;
// toàn bộ vẫn là [đề xuất] cho tới khi nhóm duyệt chữ thật. "trong giờ làm việc" là chữ Figma, nhóm chưa xác nhận giờ hỗ trợ: [đề xuất].
// Hai bản dựng từ CÙNG một bộ chữ (buildContent) nên không thể lệch mã, số phút hay email tài khoản.
export const OTP_MAIL_SUBJECTS = {
  register: '[CLINIX] Mã xác minh OTP đăng ký tài khoản',
  'forgot-password': '[CLINIX] Mã OTP đặt lại mật khẩu',
} as const;

// Màu theo Figma, riêng nhãn đăng ký dùng #1D4ED8 thay #3B82F6 cho đủ tương phản trên nền nhạt (mail-html.ts).
export const OTP_THEMES = {
  register: {
    band: '#3B82F6',
    panel: '#EFF6FF',
    panelBorder: '#93C5FD',
    label: '#1D4ED8',
    code: '#1D4ED8',
  },
  'forgot-password': {
    band: '#8B5CF6',
    panel: '#F5F3FF',
    panelBorder: '#C4B5FD',
    label: '#7C3AED',
    code: '#5B21B6',
  },
} as const;

export const OTP_NOTICE_COLORS = {
  badgeText: '#92620C',
  badgeBackground: '#FEF3C7',
  warningText: '#B91C1C',
  warningBackground: '#FEF2F2',
  warningBorder: '#FECACA',
} as const;

const CODE_LABEL = 'Mã xác minh OTP';
const VALIDITY_PREFIX = 'Mã có hiệu lực trong';
const AUTOMATED_NOTE =
  'Email này được gửi tự động. Vui lòng không trả lời trực tiếp email này.';
const BRAND = 'CLINIX';

interface OtpMailCommon {
  /** Đúng 6 chữ số. Chỉ đi vào thân thư, không bao giờ vào log. */
  otp: string;
  /**
   * Số phút hiệu lực in trong thư. Nơi gọi (A2) truyền từ chính hằng số hạn OTP của nó, để chữ "10 phút" (G2)
   * không thể lệch với hạn thật.
   */
  expiresInMinutes: number;
  /** Họ tên người nhận (`ho_ten`); thiếu thì chào chung. Được đưa về một dòng, tối đa 100 ký tự. */
  fullName?: string | null;
  /** Địa chỉ hỗ trợ (`MAIL_SUPPORT_ADDRESS`, N8); thiếu thì bỏ dòng hỗ trợ (G4). */
  supportAddress?: string | null;
}

export type OtpMailParams =
  | (OtpMailCommon & { kind: 'register' })
  // Mẫu quên mật khẩu nêu email tài khoản và cảnh báo không chia sẻ mã (PLAN A14)
  | (OtpMailCommon & { kind: 'forgot-password'; accountEmail: string });

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/** Chữ THUẦN, chưa thoát HTML: dữ liệu người dùng đã qua `toSingleLine`, mỗi bản tự thoát khi cần. */
interface OtpMailContent {
  title: string;
  name: string;
  /** Câu mở đầu; có `account` thì email tài khoản nằm giữa `intro` và `introEnd`. */
  intro: string;
  account: string;
  introEnd: string;
  minutes: string;
  /** Dòng phụ sau huy hiệu hiệu lực (mẫu đăng ký). */
  notes: readonly string[];
  /** Hộp cảnh báo (mẫu quên mật khẩu). */
  warning: string;
  support: string;
}

function buildContent(params: OtpMailParams): OtpMailContent {
  const common = {
    name: params.fullName ? toSingleLine(params.fullName) : '',
    minutes: `${String(params.expiresInMinutes)} phút`,
    support: params.supportAddress
      ? toSingleLine(params.supportAddress, 255)
      : '',
  };
  if (params.kind === 'register') {
    return {
      ...common,
      title: 'Xác minh địa chỉ email',
      intro:
        'Cảm ơn bạn đã đăng ký tài khoản tại CLINIX. Vui lòng nhập mã OTP dưới đây để xác minh email và kích hoạt tài khoản.',
      account: '',
      introEnd: '',
      notes: [
        'Nhập mã trên vào ô xác minh trong ứng dụng để hoàn tất đăng ký.',
        'Nếu bạn không thực hiện đăng ký, vui lòng bỏ qua email này.',
      ],
      warning: '',
    };
  }
  return {
    ...common,
    title: 'Đặt lại mật khẩu',
    intro: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ',
    account: toSingleLine(params.accountEmail, 255),
    introEnd: '. Vui lòng nhập mã OTP dưới đây để tiếp tục.',
    notes: [],
    warning:
      'Nếu bạn không yêu cầu đặt lại mật khẩu, tài khoản vẫn an toàn. Không chia sẻ mã này với bất kỳ ai.',
  };
}

function supportSentence(address: string): [string, string, string] {
  return ['Cần hỗ trợ? Liên hệ qua email ', address, ' trong giờ làm việc.'];
}

function renderText(content: OtpMailContent, otp: string): string {
  const { name, support, warning } = content;
  return [
    content.title,
    '',
    name ? `Xin chào ${name},` : 'Xin chào,',
    '',
    `${content.intro}${content.account}${content.introEnd}`,
    '',
    `    ${otp}`,
    '',
    `${VALIDITY_PREFIX} ${content.minutes}.`,
    ...content.notes,
    ...(warning ? [warning] : []),
    ...(support ? ['', supportSentence(support).join('')] : []),
    '',
    AUTOMATED_NOTE,
    BRAND,
    '',
  ].join('\n');
}

function renderBodyHtml(
  content: OtpMailContent,
  otp: string,
  kind: OtpMailParams['kind'],
): string {
  const theme = OTP_THEMES[kind];
  const paragraph = `margin:0 0 14px;font-size:13px;line-height:1.75;color:${MAIL_COLORS.body}`;
  const greeting = content.name
    ? `Xin chào <strong>${escapeHtml(content.name)}</strong>,`
    : 'Xin chào,';
  const account = content.account
    ? `<strong>${escapeHtml(content.account)}</strong>`
    : '';
  const notes = content.notes.length
    ? `<p style="margin:0 0 12px;font-size:12px;line-height:1.7;color:${MAIL_COLORS.muted}">${content.notes.map(escapeHtml).join('<br>')}</p>`
    : '';
  const warning = content.warning
    ? `<div style="margin:0 0 14px;padding:10px 12px;background:${OTP_NOTICE_COLORS.warningBackground};border:1px solid ${OTP_NOTICE_COLORS.warningBorder};border-radius:6px;font-size:12px;line-height:1.7;color:${OTP_NOTICE_COLORS.warningText}">${escapeHtml(content.warning)}</div>`
    : '';
  return [
    `<p style="${paragraph}">${greeting}</p>`,
    `<p style="${paragraph}">${escapeHtml(content.intro)}${account}${escapeHtml(content.introEnd)}</p>`,
    '<div style="margin:0 0 18px;text-align:center">',
    `<div style="display:inline-block;padding:16px 32px;background:${theme.panel};border:2px dashed ${theme.panelBorder};border-radius:12px">`,
    `<div style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${theme.label}">${CODE_LABEL}</div>`,
    // Mã in 6 số LIỀN, giãn bằng letter-spacing: chép ra không có dấu cách (Figma dựng bằng dấu cách)
    `<div style="font-family:monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:${theme.code}">${otp}</div>`,
    '</div></div>',
    '<div style="margin:0 0 18px;text-align:center">',
    `<span style="display:inline-block;padding:6px 14px;background:${OTP_NOTICE_COLORS.badgeBackground};border-radius:6px;font-size:12px;color:${OTP_NOTICE_COLORS.badgeText}">⏱ ${VALIDITY_PREFIX} <strong>${content.minutes}</strong></span>`,
    '</div>',
    notes,
    warning,
  ].join('');
}

function renderSupportHtml(address: string): string {
  if (!address) return '';
  const [before, value, after] = supportSentence(address);
  return `${escapeHtml(before)}<strong>${escapeHtml(value)}</strong>${escapeHtml(after)}`;
}

export function renderOtpMail(params: OtpMailParams): RenderedMail {
  if (!/^\d{6}$/.test(params.otp)) {
    throw new Error('OTP phải gồm đúng 6 chữ số');
  }
  if (
    !Number.isInteger(params.expiresInMinutes) ||
    params.expiresInMinutes < 1
  ) {
    throw new Error('expiresInMinutes phải là số nguyên dương');
  }

  const content = buildContent(params);
  return {
    subject: OTP_MAIL_SUBJECTS[params.kind],
    text: renderText(content, params.otp),
    html: renderMailShell({
      bandColor: OTP_THEMES[params.kind].band,
      title: content.title,
      bodyHtml: renderBodyHtml(content, params.otp, params.kind),
      supportHtml: renderSupportHtml(content.support),
      footerText: `${AUTOMATED_NOTE} ${BRAND}`,
    }),
  };
}
