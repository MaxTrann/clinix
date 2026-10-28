// Hỗ trợ test cho A5, A6, A11 và e2e: API không bao giờ trả OTP ra ngoài (DK-40), nên test lấy mã từ chính nội dung thư giả.
// `renderOtpMail` (mail/templates/otp-mail.ts) đặt mã một mình trên một dòng thụt vào 4 dấu cách.
const OTP_LINE = /^ {4}([0-9]{6})$/m;

/** Lấy mã OTP 6 số ra khỏi nội dung thư do renderOtpMail dựng. Ném lỗi nếu không tìm đúng một mã (không in nội dung thư). */
export function readOtpFromMail(message: { text: string }): string {
  const matches = message.text.match(new RegExp(OTP_LINE.source, 'gm')) ?? [];
  const found = OTP_LINE.exec(message.text)?.[1];
  if (matches.length !== 1 || found === undefined) {
    throw new Error(
      `Mong đợi đúng một mã OTP trong thư, thấy ${String(matches.length)}`,
    );
  }
  return found;
}
