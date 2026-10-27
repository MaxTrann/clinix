import nodemailer from 'nodemailer';
import {
  EMAIL_LOCAL_PART_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  isValidEmail,
  normalizeEmail,
} from '../auth/validation/email-policy.js';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import {
  MAIL_ADDRESS_MAX_LENGTH,
  MAIL_LOCAL_PART_MAX_LENGTH,
  isSafeMailAddress,
} from './mail-safety.js';
import { buildSmtpTransportOptions, readMailConfig } from './mail-config.js';
import { SmtpMailService } from './smtp-mail.service.js';
import {
  startFakeSmtpServer,
  type FakeSmtpServer,
} from './testing/fake-smtp-server.js';

// Task P4, điều kiện (b): ĐỐI CHIẾU với chính sách email A1. Mọi email mà A1 chấp nhận (sau khi chuẩn hoá) đều phải qua phần kiểm `to` của mail,
// và nodemailer thật phải đưa ĐÚNG địa chỉ đó vào phong bì SMTP, để không có tài khoản hợp lệ nào không nhận được OTP.
// A1 chỉ được import Ở ĐÂY (trong test); mã chạy thật của mail không import auth (tránh phụ thuộc ngược lớp). Mã nội bộ MAIL-23… là [đề xuất].
const PRINTABLE = Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) =>
  String.fromCharCode(0x21 + i),
);

// Bộ sinh giả ngẫu nhiên có hạt cố định (mulberry32) để test lặp lại được
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tên miền dài đúng `length` ký tự: các nhãn 'd…d' (mỗi nhãn 1–63 ký tự) cách nhau bằng dấu chấm, kết thúc bằng ".com" (TLD là chữ cái để qua A1)
function domainOfLength(length: number): string {
  let remaining = length - 3; // chừa "com"; mỗi nhãn chiếm (độ dài + 1 dấu chấm)
  const labels: string[] = [];
  while (remaining > 0) {
    let size = Math.min(63, remaining - 1);
    if (remaining - (size + 1) === 1) size -= 1; // tránh còn dư 1 (không dựng được nhãn rỗng)
    labels.push('d'.repeat(size));
    remaining -= size + 1;
  }
  return `${labels.join('.')}.com`;
}

function buildCorpus(): string[] {
  const candidates: string[] = [
    // Địa chỉ thực tế
    'nguyen.van.a@gmail.com',
    'tran_thi-b@sub.example.edu.vn',
    'a+tag@example.com',
    "o'brien@example.com",
    'User.Name@Example.COM',
    '  spaced@example.com  ',
    'a@b.co',
    'x@a-b.example.com',
    '1234567890@example.com',
    '{a}|b~@example.com',
    'a%b@example.com',
    'a/b=c?d@example.com',
    '`a^b@example.com',
    '!#$%&*+-/=?^_`{|}~@example.com',
  ];

  // Mỗi ký tự ASCII in được ở các vị trí khác nhau của phần trước @ và tên miền
  for (const c of PRINTABLE) {
    candidates.push(
      `a${c}b@example.com`,
      `${c}a@example.com`,
      `a${c}@example.com`,
      `${c}@example.com`,
      `a@b${c}c.example.com`,
      `a@${c}b.example.com`,
      `a@b.example${c}com`,
    );
  }
  // Mọi cặp ký tự liền nhau trong phần trước @
  for (const c1 of PRINTABLE) {
    for (const c2 of PRINTABLE) candidates.push(`a${c1}${c2}b@example.com`);
  }
  // Biên độ dài: phần trước @ 63/64/65, cả địa chỉ 254/255/256
  for (const local of [1, 2, 63, 64, 65]) {
    candidates.push(`${'a'.repeat(local)}@example.com`);
  }
  for (const total of [253, 254, 255, 256]) {
    const local = 'l'.repeat(32);
    candidates.push(`${local}@${domainOfLength(total - local.length - 1)}`);
  }
  // Ngẫu nhiên có hạt cố định, trên bảng chữ cái của phần trước @ và tên miền
  const random = prng(20261027);
  const alphabet = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789${PRINTABLE.join('')}@@..--`;
  for (let i = 0; i < 30_000; i += 1) {
    const length = 3 + Math.floor(random() * 78);
    let s = '';
    for (let j = 0; j < length; j += 1) {
      s += alphabet[Math.floor(random() * alphabet.length)];
    }
    candidates.push(s);
  }
  return candidates;
}

// Email A1 chấp nhận = sau normalizeEmail thì isValidEmail đúng (đúng cách A1 được dùng ở đăng ký)
const accepted = [
  ...new Set(
    buildCorpus()
      .map((raw) => normalizeEmail(raw))
      .filter((email) => isValidEmail(email)),
  ),
];

describe('Đối chiếu với chính sách email A1 (MAIL-23)', () => {
  it('hằng số độ dài của mail đúng bằng của A1 (mail không được chặt hơn A1)', () => {
    expect(MAIL_ADDRESS_MAX_LENGTH).toBe(EMAIL_MAX_LENGTH);
    expect(MAIL_LOCAL_PART_MAX_LENGTH).toBe(EMAIL_LOCAL_PART_MAX_LENGTH);
  });

  it('bộ mẫu đủ phong phú để có ý nghĩa: hàng nghìn email A1 chấp nhận, gồm cả hai biên độ dài', () => {
    expect(accepted.length).toBeGreaterThan(3_000);
    expect(accepted.some((e) => e.length === EMAIL_MAX_LENGTH)).toBe(true);
    expect(
      accepted.some((e) => e.indexOf('@') === EMAIL_LOCAL_PART_MAX_LENGTH),
    ).toBe(true);
  });

  it('MỌI email A1 chấp nhận đều qua phần kiểm `to` của mail', () => {
    const refused = accepted.filter((email) => !isSafeMailAddress(email));
    expect(refused).toEqual([]);
  });
});

describe('Đối chiếu với nodemailer thật: đúng địa chỉ vào phong bì SMTP (MAIL-24)', () => {
  let server: FakeSmtpServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('mọi email trong mẫu đại diện của A1 được gửi tới ĐÚNG địa chỉ đó, không bị đổi hay tách', async () => {
    server = await startFakeSmtpServer();
    const config = readMailConfig({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: server.port,
      SMTP_USER: 'clinix@example.test',
      SMTP_PASS: fakeSecretValue('smtp'),
      MAIL_FROM_NAME: 'CLINIX',
      MAIL_FROM_ADDRESS: undefined,
      MAIL_SUPPORT_ADDRESS: undefined,
    });
    if (!config) throw new Error('cấu hình test phải đủ');
    // Máy chủ giả không nói TLS nên tắt requireTLS; mọi tuỳ chọn khác là của mã thật
    const transport = nodemailer.createTransport({
      ...buildSmtpTransportOptions(config),
      requireTLS: false,
    });
    const service = new SmtpMailService(config, transport);

    // Mẫu đại diện: các địa chỉ biên + cứ 40 địa chỉ lấy 1 (khoảng vài trăm địa chỉ)
    const sample = [
      ...accepted.filter(
        (e) =>
          e.length >= EMAIL_MAX_LENGTH - 1 ||
          e.indexOf('@') >= EMAIL_LOCAL_PART_MAX_LENGTH - 1,
      ),
      ...accepted.filter((_, index) => index % 40 === 0),
    ];
    expect(sample.length).toBeGreaterThan(100);

    const mismatches: string[] = [];
    for (const email of sample) {
      const before = server.commands.length;
      try {
        await service.send({ to: email, subject: 'Tiêu đề', text: 'Nội dung' });
      } catch (error) {
        mismatches.push(
          `${email} → ${error instanceof Error ? error.message : 'lỗi lạ'}`,
        );
        continue;
      }
      const rcpt = server.commands
        .slice(before)
        .filter((c) => c.startsWith('RCPT TO:'));
      if (rcpt.length !== 1 || rcpt[0] !== `RCPT TO:<${email}>`) {
        mismatches.push(`${email} → ${rcpt.join(' | ')}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
