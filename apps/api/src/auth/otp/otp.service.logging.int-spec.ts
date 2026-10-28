import { Logger, type LoggerService } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { createAppLogger } from '../../common/logging/sanitizing.logger.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import {
  T0,
  at,
  captureNestLogger,
  createOtpFixture,
  forgotInput,
  newUnverifiedAccount,
  recipientOf,
  registerInput,
  wrongCodeFor,
  type OtpFixture,
} from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import { OtpDeliveryError, toOtpException } from './otp-errors.js';
import type { OtpFailure } from './otp.types.js';

// Task A2 — OTP KHÔNG BAO GIỜ nằm trong log, thông điệp lỗi, phản hồi (SOW 3.2.2; DK-39, DK-40, SE-04 mức dịch vụ).
// Cách kiểm: chạy một luồng đầy đủ với mã THẬT do generateOtpCode sinh (đọc lại từ thư giả, như người dùng), gom MỌI thứ mà nơi gọi có thể
// đưa ra ngoài (log, JSON kết quả, lỗi ném ra, thân AppException) rồi quét từng mã. Đồng thời khẳng định thông tin chẩn đoán vẫn còn.
// Mã nội bộ OTP-Gxx / OTP-Lxx là [đề xuất].
// Logger tĩnh gốc của Nest. KHÔNG khôi phục bằng overrideLogger(true/false): hai giá trị đó TẮT hẳn logger tĩnh, các ca sau sẽ không còn đầu ra.
const ORIGINAL_LOGGER = Reflect.get(
  Logger,
  'staticInstanceRef',
) as LoggerService;

let db: DataSource;
let fx: OtpFixture<FakeMailService>;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

beforeEach(async () => {
  await resetTables(db);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  fx = createOtpFixture(db);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Logger.overrideLogger(ORIGINAL_LOGGER);
});

afterAll(async () => {
  await db?.destroy();
});

const goTo = (seconds: number) => vi.setSystemTime(at(seconds));
const mailAt = (index: number) => {
  const message = fx.mail.attempts[index];
  if (!message) throw new Error(`không có thư thứ ${String(index)}`);
  return message;
};
const standalone = (code: string) => new RegExp(`(?<![0-9])${code}(?![0-9])`);

interface FlowEvidence {
  /** Mọi mã OTP thật đã được sinh (đọc từ thư, kể cả thư gửi lỗi) */
  codes: string[];
  /** Mọi thứ nơi gọi có thể đưa ra ngoài: JSON kết quả, thông điệp/stack lỗi, thân AppException */
  surfaces: string[];
  ids: { first: string; second: string; third: string };
}

// Luồng dùng đủ các nhánh: cấp, gửi, sai nhiều lần đến hết lượt, gửi lại, hết hạn, đúng, quên mật khẩu, gửi quá sớm, gửi lỗi
async function runFullFlow(): Promise<FlowEvidence> {
  const account = await newUnverifiedAccount(db);
  const surfaces: string[] = [];
  const surface = (value: unknown): void => {
    surfaces.push(JSON.stringify(value));
  };
  const failureBody = (failure: OtpFailure): void => {
    surface(failure);
    surface(toOtpException(failure).getResponse());
  };

  const first = await fx.otp.issueAndDeliver(
    registerInput(account.taiKhoanId),
    recipientOf(account),
  );
  surface(first);
  if (!first.ok) throw new Error('cấp mã lần 1 thất bại');
  const firstId = first.issued.maXacThucId;
  const code1 = readOtpFromMail(mailAt(0));

  for (let i = 0; i < 5; i++) {
    const wrong = await fx.otp.verify({
      maXacThucId: firstId,
      loai: 'DangKy',
      otp: wrongCodeFor(code1),
    });
    surface(wrong);
    if (!wrong.ok) failureBody(wrong.failure);
  }

  goTo(61);
  const again = await fx.otp.reissue({ maXacThucId: firstId });
  surface(again);
  if (!again.ok) throw new Error('gửi lại thất bại');
  surface(again.issued); // IssuedOtp: mã rõ phải bị ẩn khi tuần tự hoá
  await fx.otp.deliver(again.issued, recipientOf(account));
  const secondId = again.issued.maXacThucId;

  goTo(61 + 601);
  const expired = await fx.otp.verify({
    maXacThucId: secondId,
    loai: 'DangKy',
    otp: readOtpFromMail(mailAt(1)),
  });
  surface(expired);
  if (!expired.ok) failureBody(expired.failure);

  goTo(61 + 601 + 61);
  const third = await fx.otp.issueAndDeliver(
    registerInput(account.taiKhoanId),
    recipientOf(account),
  );
  surface(third);
  if (!third.ok) throw new Error('cấp mã lần 3 thất bại');
  const code3 = readOtpFromMail(mailAt(2));
  const ok = await fx.otp.verify(
    { maXacThucId: third.issued.maXacThucId, loai: 'DangKy', otp: code3 },
    { consume: true },
  );
  surface(ok);

  const forgot = await fx.otp.issueAndDeliver(
    forgotInput(account.taiKhoanId),
    recipientOf(account),
  );
  surface(forgot);
  const tooSoon = await fx.otp.issue(forgotInput(account.taiKhoanId));
  surface(tooSoon);
  if (!tooSoon.ok) failureBody(tooSoon.failure);

  goTo(61 + 601 + 61 + 61);
  fx.mail.failNextWith('AUTH');
  try {
    await fx.otp.issueAndDeliver(
      forgotInput(account.taiKhoanId),
      recipientOf(account),
    );
  } catch (error) {
    if (!(error instanceof OtpDeliveryError)) throw error;
    surfaces.push(error.message, error.stack ?? '', JSON.stringify(error));
  }

  return {
    codes: fx.mail.attempts.map((m) => readOtpFromMail(m)),
    surfaces,
    ids: { first: firstId, second: secondId, third: third.issued.maXacThucId },
  };
}

describe('OTP không lọt vào log, kết quả, lỗi (DK-39, DK-40, SE-04)', () => {
  it('OTP-G01 mọi lời gọi Logger của OtpService: không chứa mã thật nào (và không chứa mã đoán sai)', async () => {
    const lines = captureNestLogger();
    const evidence = await runFullFlow();
    const logs = lines.join('\n');

    expect(evidence.codes.length).toBeGreaterThanOrEqual(5);
    for (const code of evidence.codes) {
      expect(logs, `mã ${code}`).not.toMatch(standalone(code));
      expect(logs).not.toMatch(standalone(wrongCodeFor(code)));
    }
  });

  it('OTP-G02 thông tin chẩn đoán VẪN CÒN trong log: mã hàng, số lần sai, thu hồi, kết quả gửi (việc che không làm mất dữ liệu cần để điều tra)', async () => {
    const lines = captureNestLogger();
    const { ids } = await runFullFlow();
    const logs = lines.join('\n');

    expect(logs).toContain(`Mã OTP ${ids.first} nhập sai lần 1/5`);
    expect(logs).toContain(`Mã OTP ${ids.first} nhập sai lần 4/5`);
    expect(logs).toContain(`Mã OTP ${ids.first} bị thu hồi sau 5 lần nhập sai`);
    expect(logs).toContain(`Mã OTP ${ids.second} đã gửi; thu hồi`);
    expect(logs).toContain('gửi lỗi: đã thu hồi mã mới, giữ mã cũ');
  });

  it('OTP-G03 mọi thứ nơi gọi có thể đưa ra ngoài (JSON kết quả, IssuedOtp, lỗi ném, thân AppException): không chứa mã thật', async () => {
    captureNestLogger();
    const evidence = await runFullFlow();
    const everything = evidence.surfaces.join('\n');

    expect(evidence.surfaces.length).toBeGreaterThan(15);
    for (const code of evidence.codes) {
      expect(everything, `mã ${code}`).not.toMatch(standalone(code));
    }
  });

  it('OTP-G04 đầu ra thật của logger mặc định Nest (stdout/stderr): không chứa mã, và vẫn có mã hàng', async () => {
    const chunks: string[] = [];
    const capture = (chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);

    const { codes, ids } = await runFullFlow();
    // bỏ tiền tố "[Nest] <pid> - <ngày giờ> LEVEL" (chứa số) để chỉ quét phần nội dung
    const output = chunks
      .join('')
      .replace(
        /^\[Nest\] \d+\s+- .*?(?:LOG|WARN|ERROR|DEBUG|VERBOSE|FATAL)\s+/gm,
        '',
      );

    expect(output).toContain(`Mã OTP ${ids.third}`);
    for (const code of codes) {
      expect(output, `mã ${code}`).not.toMatch(standalone(code));
    }
  });

  it('OTP-G05 qua đúng logger của ứng dụng (createAppLogger của P5): vẫn không có mã và thông tin chẩn đoán không bị che nhầm', async () => {
    const chunks: string[] = [];
    const capture = (chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    Logger.overrideLogger(createAppLogger({}));

    const { codes, ids } = await runFullFlow();
    const output = chunks
      .join('')
      .replace(
        /^\[Nest\] \d+\s+- .*?(?:LOG|WARN|ERROR|DEBUG|VERBOSE|FATAL)\s+/gm,
        '',
      );

    for (const code of codes) {
      expect(output, `mã ${code}`).not.toMatch(standalone(code));
    }
    expect(output).toContain(`Mã OTP ${ids.first} nhập sai lần 3/5`);
    expect(output).not.toContain('[REDACTED]'); // không có gì để che, và bộ che không che nhầm số mã hàng
  });

  it('OTP-G06 mã chỉ nằm trong thân thư (và băm trong DB): thư có đúng một mã; hàng DB không chứa mã rõ', async () => {
    captureNestLogger();
    const account = await newUnverifiedAccount(db);
    const result = await fx.otp.issueAndDeliver(
      registerInput(account.taiKhoanId),
      recipientOf(account),
    );
    if (!result.ok) throw new Error('cấp mã thất bại');
    const mail = fx.mail.sent[0];
    if (!mail) throw new Error('chưa có thư');
    const code = readOtpFromMail(mail);

    const rows = (await db.query(
      'SELECT * FROM ma_xac_thuc WHERE ma_xac_thuc_id = ?',
      [result.issued.maXacThucId],
    )) as Record<string, unknown>[];
    expect(JSON.stringify(rows)).not.toMatch(standalone(code));
    expect(mail.subject).not.toMatch(standalone(code));
  });
});
