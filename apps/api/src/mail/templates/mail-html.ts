// Khung HTML dùng chung cho email (task A14; module admin dựng mẫu của mình trên khung này, B14). Hàm thuần, nối chuỗi, không thư viện mẫu.
// Chỉ dùng CSS nội tuyến và bảng: nhiều ứng dụng thư bỏ thẻ style và không hỗ trợ flex. Không script, không ảnh, không font tải từ ngoài,
// không liên kết: thư chạy được khi tắt tải tài nguyên ngoài và không có gì để theo dõi người đọc.

// Hai dải đầu giữ đúng màu Figma. Các màu chữ sau khác Figma vì Figma không đủ tương phản (chi tiết ở TRACKING A14-C):
// `muted` thay #9CA3AF, `warningText` thay #DC2626, nhãn đăng ký trong OTP_THEMES (otp-mail.ts) thay #3B82F6.
export const MAIL_COLORS = {
  white: '#FFFFFF',
  heading: '#111827',
  body: '#555555',
  muted: '#6B7280',
  supportText: '#64748B',
  supportBackground: '#F8FAFC',
  supportBorder: '#E2E8F0',
  footerBackground: '#F9FAFB',
  footerBorder: '#E5E7EB',
} as const;

// "CLINIX" 20px đậm là chữ lớn theo WCAG (ngưỡng 3:1); 16px của Figma sẽ cần 4,5:1 mà chữ trắng trên hai dải đầu không đạt.
const BRAND_FONT_SIZE = '20px';
const FONT_FAMILY = 'Roboto, Arial, sans-serif';

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Thoát dữ liệu trước khi chèn vào HTML. Gọi SAU `toSingleLine`: cắt độ dài sau khi thoát có thể làm đứt một thực thể. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

export interface MailShellParams {
  /** Màu dải đầu. */
  bandColor: string;
  /** Chữ thuần, hàm tự thoát. */
  title: string;
  /** HTML đã thoát sẵn của phần thân. */
  bodyHtml: string;
  /** HTML đã thoát sẵn của ô hỗ trợ; rỗng thì bỏ cả ô (G4). */
  supportHtml: string;
  /** Chữ thuần ở chân thư, hàm tự thoát. */
  footerText: string;
}

export function renderMailShell(params: MailShellParams): string {
  const support = params.supportHtml
    ? `<tr><td style="padding:0 28px 20px"><div style="padding:12px 14px;background:${MAIL_COLORS.supportBackground};border:1px solid ${MAIL_COLORS.supportBorder};border-radius:8px;font-size:12px;line-height:1.75;color:${MAIL_COLORS.supportText}">${params.supportHtml}</div></td></tr>`
    : '';
  return [
    '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    `<body style="margin:0;padding:0;background:${MAIL_COLORS.white}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:${FONT_FAMILY};background:${MAIL_COLORS.white}">`,
    `<tr><td style="padding:20px 28px;background:${params.bandColor};border-radius:8px 8px 0 0;color:${MAIL_COLORS.white};font-size:${BRAND_FONT_SIZE};font-weight:800">CLINIX</td></tr>`,
    `<tr><td style="padding:24px 28px 12px"><h2 style="margin:0 0 12px;font-size:17px;font-weight:700;color:${MAIL_COLORS.heading}">${escapeHtml(params.title)}</h2>${params.bodyHtml}</td></tr>`,
    support,
    `<tr><td style="padding:14px 28px;background:${MAIL_COLORS.footerBackground};border-top:1px solid ${MAIL_COLORS.footerBorder};border-radius:0 0 8px 8px;font-size:11px;line-height:1.8;color:${MAIL_COLORS.muted};text-align:center">${escapeHtml(params.footerText)}</td></tr>`,
    '</table></body></html>',
  ].join('');
}
