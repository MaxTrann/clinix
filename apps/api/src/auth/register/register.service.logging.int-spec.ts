import { inspect } from 'node:util';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import {
  insertMaXacThuc,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  REGISTER_PASSWORD,
  accountByEmail,
  allAccounts,
  allOtpRows,
  codeOfMail,
  createRegisterFixture,
  registerBody,
  type RegisterFixture,
} from '../testing/register-int-helpers.js';

// Task A5 — mật khẩu, băm, OTP và email KHÔNG lọt vào log, kết quả hay lỗi ở MỌI luồng của dịch vụ (DK-39, DK-40, SE-04), kiểm bằng giá
// trị THẬT sinh ra trong luồng (mật khẩu của test, băm Argon2id đọc từ DB, mã OTP đọc từ thư giả). Mã LG-nn là [đề xuất].
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;
const EMAIL = registerBody().email;

let db: DataSource;
let fx: RegisterFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createRegisterFixture(testDb);
});

const standalone = (code: string) => new RegExp(`(?<![0-9])${code}(?![0-9])`);

/** Chạy `work`, gom mọi thứ nó đưa ra ngoài: giá trị trả về (JSON) hoặc lỗi (inspect đủ cả nguyên nhân, stack). */
async function exposedBy(work: () => Promise<unknown>): Promise<string> {
  try {
    return JSON.stringify(await work());
  } catch (error) {
    return `${inspect(error, { depth: 8 })}\n${JSON.stringify(
      (error as { getResponse?: () => unknown }).getResponse?.() ?? null,
    )}`;
  }
}

function expectNoSecrets(
  where: string,
  text: string,
  secrets: {
    password?: boolean;
    hashes: string[];
    codes: string[];
    email?: boolean;
  },
): void {
  if (secrets.password !== false) {
    expect(text, `${where}: mật khẩu`).not.toContain(REGISTER_PASSWORD);
  }
  for (const hash of secrets.hashes) {
    expect(text, `${where}: băm mật khẩu`).not.toContain(hash);
  }
  for (const code of secrets.codes) {
    expect(text, `${where}: OTP`).not.toMatch(standalone(code));
  }
  if (secrets.email !== false) {
    expect(text, `${where}: email`).not.toContain(EMAIL);
  }
  expect(text, `${where}: dấu hiệu băm Argon2id`).not.toContain('$argon2id$');
}

describe('mật khẩu, băm, OTP, email không lọt ra ngoài', () => {
  it('LG-01 luồng thành công: log và kết quả sạch; thông tin chẩn đoán vẫn còn (mã tài khoản) và việc che không che nhầm', async () => {
    const exposed = await exposedBy(() => fx.service.register(registerBody()));

    const [account] = await allAccounts(db);
    const [row] = await allOtpRows(db);
    const secrets = {
      hashes: [account?.matKhauBam ?? '', row?.maBam ?? ''],
      codes: [codeOfMail(fx.mail, 0)],
    };
    expect(secrets.hashes.every((h) => h.length > 20)).toBe(true); // đã đọc được băm thật
    expectNoSecrets('kết quả', exposed, secrets);
    expectNoSecrets('log', logs.join('\n'), secrets);
    expect(exposed).toContain(row?.maXacThucId ?? 'thiếu'); // mã lần xác minh có trong kết quả (cần cho bước sau)
  });

  it('LG-02 EMAIL_DA_DUNG, GUI_LAI_QUA_SOM: lỗi (cả inspect đầy đủ) và log sạch', async () => {
    await insertTaiKhoan(db, {
      email: 'da.dung@example.com',
      daXacMinhEmail: true,
    });
    const taken = await exposedBy(() =>
      fx.service.register(registerBody({ email: 'da.dung@example.com' })),
    );
    expect(taken).toContain('EMAIL_DA_DUNG');

    await fx.service.register(registerBody());
    vi.setSystemTime(at(10));
    const tooSoon = await exposedBy(() => fx.service.register(registerBody()));
    expect(tooSoon).toContain('GUI_LAI_QUA_SOM');

    const account = await accountByEmail(db, EMAIL);
    const secrets = {
      hashes: [account?.matKhauBam ?? ''],
      codes: [codeOfMail(fx.mail, 0)],
    };
    expectNoSecrets('EMAIL_DA_DUNG', taken, { ...secrets, email: false });
    expect(taken).not.toContain('da.dung@example.com');
    expectNoSecrets('GUI_LAI_QUA_SOM', tooSoon, secrets);
    expectNoSecrets('log', logs.join('\n'), secrets);
    expect(logs.join('\n')).not.toContain('da.dung@example.com');
  });

  it('LG-03 gửi lỗi (503 GUI_MAIL_LOI): thân, nguyên nhân, stack và log không có mật khẩu, băm, OTP, email, loại lỗi SMTP', async () => {
    fx.mail.failNextWith('AUTH');
    const exposed = await exposedBy(() => fx.service.register(registerBody()));
    expect(exposed).toContain('GUI_MAIL_LOI');

    const [account] = await allAccounts(db);
    const secrets = {
      hashes: [account?.matKhauBam ?? ''],
      codes: [codeOfMail(fx.mail, 0)], // thư lỗi vẫn được dựng và mang mã
    };
    expectNoSecrets('lỗi', exposed, secrets);
    expectNoSecrets('log', logs.join('\n'), secrets);
    expect(logs.join('\n')).toMatch(/Mã OTP \d+ gửi lỗi/); // chẩn đoán của OtpService vẫn còn
  });

  it('LG-04 xoá lười tài khoản quá hạn: log có mã tài khoản bị xoá nhưng KHÔNG có email, họ tên, băm', async () => {
    const old = await insertTaiKhoan(db, {
      email: EMAIL,
      hoTen: 'Chủ Cũ Rất Riêng',
      daXacMinhEmail: false,
      thoiDiemTao: at(-DAY - 5),
    });
    await insertMaXacThuc(db, old.taiKhoanId, { taoLuc: at(-DAY - 5) });

    const exposed = await exposedBy(() => fx.service.register(registerBody()));

    const text = `${exposed}\n${logs.join('\n')}`;
    expect(text).not.toContain('Chủ Cũ Rất Riêng');
    expect(text).not.toContain(old.matKhauBam ?? 'thiếu');
    expect(logs.join('\n')).not.toContain(EMAIL);
    expect(logs.some((line) => line.includes(old.taiKhoanId))).toBe(true); // vẫn truy vết được tài khoản nào bị xoá
    const [account] = await allAccounts(db);
    expectNoSecrets('log', logs.join('\n'), {
      hashes: [account?.matKhauBam ?? ''],
      codes: [codeOfMail(fx.mail, 0)],
    });
  });

  it('LG-05 hết 3 lần thử: lỗi và log sạch (kể cả lỗi trùng khoá của MySQL kèm giá trị trùng)', async () => {
    await insertTaiKhoan(db, { email: EMAIL, daXacMinhEmail: false });
    vi.spyOn(fx.accounts, 'findByEmail').mockResolvedValue(null);

    const exhausted = await exposedBy(() =>
      fx.service.register(registerBody()),
    );

    expect(logs.some((line) => /3 lần/.test(line))).toBe(true);
    expectNoSecrets('hết lần thử', exhausted, { hashes: [], codes: [] });
    expectNoSecrets('log', logs.join('\n'), { hashes: [], codes: [] });
  });

  it('LG-06 khoá ngoại chặn xoá lười: lỗi và log ghi mã tài khoản nhưng không có email, mật khẩu', async () => {
    const old = await insertTaiKhoan(db, {
      email: EMAIL,
      daXacMinhEmail: false,
      thoiDiemTao: at(-DAY - 5),
    });
    await db.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)',
      [old.taiKhoanId, 'Thông báo thử', 'KiemThu', at(-DAY)],
    );

    const blocked = await exposedBy(() => fx.service.register(registerBody()));

    const lines = logs.join('\n');
    expect(lines).toContain(old.taiKhoanId);
    expectNoSecrets('log', lines, { hashes: [], codes: [] });
    // lỗi thô của MySQL kèm câu SQL có thể chứa email; nó chỉ được ra log đã qua bộ che của P5, không ra HTTP (xem e2e)
    expect(blocked).not.toContain(REGISTER_PASSWORD);
  });
});
