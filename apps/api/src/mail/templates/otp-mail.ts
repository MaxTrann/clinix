import { toSingleLine } from '../mail-safety.js';

// Mẫu văn bản thô cho hai loại email OTP (task P4). Tiêu đề lấy từ dòng A14 của PLAN auth (đối chiếu Figma 25/10/2026).
// Mẫu HTML theo hai frame "Admin - Email Preview" là việc của A14.
// Câu chữ trong thân thư là [đề xuất] của AI, chưa được nhóm duyệt; A14 sẽ chỉnh theo Figma.
export const OTP_MAIL_SUBJECTS = {
  register: '[CLINIX] Mã xác minh OTP đăng ký tài khoản',
  'forgot-password': '[CLINIX] Mã OTP đặt lại mật khẩu',
} as const;

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

  const name = params.fullName ? toSingleLine(params.fullName) : '';
  const greeting = name ? `Xin chào ${name},` : 'Xin chào,';
  const support = params.supportAddress
    ? toSingleLine(params.supportAddress, 255)
    : '';
  const supportLine = support ? ['', `Cần hỗ trợ? Liên hệ ${support}.`] : [];
  const validity = `Mã có hiệu lực trong ${String(params.expiresInMinutes)} phút.`;

  const lines =
    params.kind === 'register'
      ? [
          greeting,
          '',
          'Mã OTP để xác minh email và hoàn tất đăng ký tài khoản CLINIX của bạn là:',
          '',
          `    ${params.otp}`,
          '',
          `${validity} Nếu bạn không thực hiện đăng ký, vui lòng bỏ qua email này.`,
        ]
      : [
          greeting,
          '',
          `Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ${toSingleLine(params.accountEmail, 255)}. Mã OTP của bạn là:`,
          '',
          `    ${params.otp}`,
          '',
          `${validity} Không chia sẻ mã này với bất kỳ ai. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.`,
        ];

  return {
    subject: OTP_MAIL_SUBJECTS[params.kind],
    text: [...lines, ...supportLine, '', 'CLINIX', ''].join('\n'),
  };
}
