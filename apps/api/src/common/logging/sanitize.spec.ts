import {
  REDACTED,
  collectSecretValues,
  isSensitiveKey,
  redactText,
  sanitizeLogArgs,
  sanitizeValue,
} from './sanitize.js';
import { fakeJwt, fakeSecretValue } from '../testing/sample-secrets.js';

// Task P5. Test case: SE-04 và DM-09 ở mức hàm (quét log toàn luồng ở test/log-masking.e2e-spec.ts).
// Mọi giá trị dưới đây là GIẢ, chỉ có hình dạng giống thật.
const JWT = fakeJwt('sanitize');
const REFRESH = `42.${'a'.repeat(43)}.${'B'.repeat(43)}`;
const HEX64 = 'a1b2c3d4'.repeat(8);
// Giá trị cấu hình giả, dựng lúc chạy (gitleaks coi cặp TEN_BIEN_BI_MAT: 'gia-tri' viết thẳng trong mã là bí mật)
const SECRETS = {
  access: fakeSecretValue('truy-cap'),
  refresh: fakeSecretValue('lam-moi'),
  db: fakeSecretValue('mat-khau-db'),
  smtp: fakeSecretValue('mat-khau-smtp'),
};
const ARGON2 = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNo';

describe('isSensitiveKey', () => {
  it.each([
    'password',
    'Password',
    'matKhau',
    'matKhauMoi',
    'mat_khau_cu',
    'xacNhan',
    'otp',
    'OTP',
    'otpCode',
    'accessToken',
    'refresh_token',
    'resetToken',
    'Authorization',
    'cookie',
    'Set-Cookie',
    'JWT_ACCESS_SECRET',
    'MYSQL_PASSWORD',
    'SMTP_PASS',
    'mat_khau_bam',
    'matKhauBamDangKy',
    'refresh_token_bam',
    'ma_bam',
    'passwordHash',
    'parameters',
    'sql',
    'query',
  ])('khoá nhạy cảm: %s', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each([
    'email',
    'hoTen',
    'taiKhoanId',
    'sessionId',
    'accountId',
    'requestId',
    'maXacThucId',
    'soDienThoai',
    'status',
    'code',
    'method',
    'path',
    'name',
    'footprint', // chứa "otp" nhưng không phải từ "otp"
    'hotpink',
    'API_PORT',
    'NODE_ENV',
  ])('khoá thường, không che: %s', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });
});

describe('redactText — chuỗi (thông điệp, stack, câu lệnh)', () => {
  it('Authorization: Bearer <token>', () => {
    const out = redactText(`Authorization: Bearer ${JWT}`);
    expect(out).not.toContain(JWT);
    expect(out).toContain(REDACTED);
  });

  it.each([
    ['JWT đứng một mình', `lỗi khi kiểm ${JWT} lúc 08:00`, JWT],
    [
      'refresh token <sid>.<43>.<43>',
      `cookie lạ ${REFRESH} bị từ chối`,
      REFRESH,
    ],
    ['SHA-256/HMAC hex 64 ký tự', `băm ${HEX64} không khớp`, HEX64],
    ['băm Argon2', `so ${ARGON2} thất bại`, ARGON2],
  ])('%s bị che', (_ten, text, secret) => {
    const out = redactText(text);
    expect(out).not.toContain(secret);
    expect(out).toContain(REDACTED);
  });

  it.each([
    ['password=Mat-khau-1!', 'password=', 'Mat-khau-1!'],
    ['matKhauMoi: "Sup3r!bi-mat"', 'matKhauMoi', 'Sup3r!bi-mat'],
    [
      '{"password":"Mat-khau-1!","email":"a@b.vn"}',
      '"password"',
      'Mat-khau-1!',
    ],
    ['otp: 123456', 'otp', '123456'],
    ['OTP=654321', 'OTP', '654321'],
    ['resetToken=abc-xyz-123', 'resetToken', 'abc-xyz-123'],
    ['refresh_token_bam=zzz-hash-value', 'refresh_token_bam', 'zzz-hash-value'],
  ])('khoá=giá trị: %s', (text, keepKey, secret) => {
    const out = redactText(text);
    expect(out).not.toContain(secret);
    expect(out).toContain(keepKey); // giữ tên khoá để còn chẩn đoán
  });

  it('header Cookie: cả cặp refresh_token=… bị che', () => {
    const out = redactText(`cookie: refresh_token=${REFRESH}; theme=dark`);
    expect(out).not.toContain(REFRESH);
  });

  it("thông điệp MySQL 'Duplicate entry': che giá trị, giữ tên khoá ràng buộc", () => {
    const out = redactText(
      "Duplicate entry 'nguoi.dung@example.com' for key 'tai_khoan.email'",
    );
    expect(out).toBe(`Duplicate entry '${REDACTED}' for key 'tai_khoan.email'`);
  });

  it('giá trị bí mật của cấu hình bị che nguyên văn, kể cả khi chứa nhau', () => {
    const secrets = ['khoa-bi-mat-dai-1234567890', 'khoa-bi-mat'];
    const out = redactText(
      'lỗi: khoa-bi-mat-dai-1234567890 và khoa-bi-mat',
      secrets,
    );
    expect(out).toBe(`lỗi: ${REDACTED} và ${REDACTED}`);
  });

  it.each([
    'Phát hiện dùng lại refresh token của phiên 42; phiên đã bị thu hồi',
    '[550e8400-e29b-41d4-a716-446655440000] POST /guard-probe/x → 500 account=7',
    `${HEX64}0`, // 65 ký tự hex: không phải băm 64
    'ER_DUP_ENTRY errno=1062 sqlState=23000',
    'Cannot find module ./foo.js tại D:\\du_lieu\\clinix-app\\apps\\api\\src\\main.ts:12:3',
  ])('chuỗi bình thường không bị đổi: %s', (text) => {
    expect(redactText(text)).toBe(text);
  });

  it('GIỚI HẠN ĐÃ BIẾT: dãy 6 số trần trong văn bản tự do (không khoá, không ngữ cảnh) KHÔNG bị che, nên không bao giờ được log OTP (xem docs/TECH_DEBT.md)', () => {
    expect(redactText('mã đã gửi là 123456 cho người dùng')).toBe(
      'mã đã gửi là 123456 cho người dùng',
    );
  });

  it('chuỗi rất dài không có dấu phân cách vẫn xử lý nhanh (không bùng nổ regex)', () => {
    const long = 'a'.repeat(200_000);
    const start = Date.now();
    expect(redactText(long)).toBe(long);
    expect(Date.now() - start).toBeLessThan(1500);
  });
});

describe('sanitizeValue — đối tượng, mảng, Error', () => {
  it('che theo tên khoá ở mọi độ sâu, giữ phần còn lại, không sửa đối tượng gốc', () => {
    const input = {
      user: { email: 'a@b.vn', matKhauMoi: 'Sup3r!bi-mat', hoTen: 'A' },
      headers: { authorization: `Bearer ${JWT}`, accept: 'json' },
      items: [{ otp: '123456', id: 1 }],
    };
    const snapshot = JSON.stringify(input);

    const out = sanitizeValue(input) as typeof input;

    expect(out.user).toEqual({
      email: 'a@b.vn',
      matKhauMoi: REDACTED,
      hoTen: 'A',
    });
    expect(out.headers).toEqual({ authorization: REDACTED, accept: 'json' });
    expect(out.items).toEqual([{ otp: REDACTED, id: 1 }]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('chuỗi bên trong đối tượng cũng được che theo mẫu (không chỉ theo khoá)', () => {
    const out = sanitizeValue({ ghiChu: `đã gửi ${JWT}` }) as {
      ghiChu: string;
    };
    expect(out.ghiChu).not.toContain(JWT);
  });

  it('giữ nguyên số, boolean, null, undefined, Date', () => {
    const now = new Date('2026-10-27T01:00:00.000Z');
    expect(sanitizeValue(7)).toBe(7);
    expect(sanitizeValue(true)).toBe(true);
    expect(sanitizeValue(null)).toBeNull();
    expect(sanitizeValue(undefined)).toBeUndefined();
    expect(sanitizeValue(now)).toBe(now);
  });

  it('xử lý Map, Set, Buffer, vòng lặp và thuộc tính ném lỗi khi đọc', () => {
    const cyclic: Record<string, unknown> = { ten: 'a' };
    cyclic['self'] = cyclic;
    const throwing = {
      get boom(): string {
        throw new Error('getter hỏng');
      },
    };
    const map = new Map<string, unknown>([
      ['matKhau', 'x'],
      ['ten', 'b'],
    ]);

    expect(sanitizeValue(cyclic)).toEqual({ ten: 'a', self: '[Circular]' });
    expect(sanitizeValue(throwing)).toEqual({ boom: '[Unreadable]' });
    expect(sanitizeValue(map)).toEqual({ matKhau: REDACTED, ten: 'b' });
    expect(sanitizeValue(new Set(['một', `đã gửi ${JWT}`]))).toEqual([
      'một',
      `đã gửi ${REDACTED}`,
    ]);
    expect(sanitizeValue(Buffer.from('bí mật'))).toBe('[Binary]');
  });

  it('cùng một đối tượng xuất hiện ở hai nhánh không bị coi là vòng lặp', () => {
    const shared = { id: 1 };
    expect(sanitizeValue({ a: shared, b: shared })).toEqual({
      a: { id: 1 },
      b: { id: 1 },
    });
  });

  it('đối tượng lồng quá sâu bị cắt thay vì tràn ngăn xếp', () => {
    let deep: Record<string, unknown> = { end: true };
    for (let i = 0; i < 50; i += 1) deep = { child: deep };
    expect(JSON.stringify(sanitizeValue(deep))).toContain('[MaxDepth]');
  });

  it('Error: che thông điệp và stack, giữ tên + code/errno/sqlState, BỎ sql/query/parameters', () => {
    const error = new Error(
      `Duplicate entry '${HEX64}' for key 'phien_dang_nhap.refresh_token_bam'`,
    );
    error.name = 'QueryFailedError';
    Object.assign(error, {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlState: '23000',
      sql: `INSERT INTO phien_dang_nhap VALUES ('${HEX64}')`,
      query: 'INSERT INTO phien_dang_nhap VALUES (?)',
      parameters: [HEX64],
    });

    const out = sanitizeValue(error) as Error;

    expect(out).toBeInstanceOf(Error);
    expect(out.name).toBe('QueryFailedError');
    expect(out.message).toBe(
      `Duplicate entry '${REDACTED}' for key 'phien_dang_nhap.refresh_token_bam'`,
    );
    expect(out.stack).not.toContain(HEX64);
    expect(out.stack).toContain('sanitize.spec.ts'); // vẫn còn đường dẫn trong stack để chẩn đoán
    expect(Reflect.get(out, 'code')).toBe('ER_DUP_ENTRY');
    expect(Reflect.get(out, 'errno')).toBe(1062);
    expect(Reflect.get(out, 'sqlState')).toBe('23000');
    for (const dropped of ['sql', 'query', 'parameters']) {
      expect(Reflect.has(out, dropped)).toBe(false);
    }
  });

  it('Error: nguyên nhân (cause) cũng được che', () => {
    const error = new Error('ngoài', {
      cause: new Error(`đáy: password=Bi-mat-1!`),
    });
    const out = sanitizeValue(error) as Error;
    expect((out.cause as Error).message).not.toContain('Bi-mat-1!');
  });
});

describe('sanitizeLogArgs / collectSecretValues', () => {
  it('che từng đối số của một lời gọi logger (message, stack, context)', () => {
    const out = sanitizeLogArgs(
      [`lỗi ${JWT}`, `at x\n  password=Bi-mat-1!`, 'ExceptionFilter'],
      [],
    ) as string[];
    expect(out[0]).not.toContain(JWT);
    expect(out[1]).not.toContain('Bi-mat-1!');
    expect(out[2]).toBe('ExceptionFilter');
  });

  it('collectSecretValues lấy giá trị biến bí mật đủ dài, bỏ biến thường và giá trị ngắn', () => {
    const values = collectSecretValues({
      JWT_ACCESS_SECRET: SECRETS.access,
      JWT_REFRESH_SECRET: SECRETS.refresh,
      MYSQL_PASSWORD: SECRETS.db,
      SMTP_PASS: SECRETS.smtp,
      SHORT_SECRET: 'ngan',
      API_PORT: '3000',
      NODE_ENV: 'production',
      EMPTY_TOKEN: undefined,
    });
    expect([...values].sort()).toEqual(
      [SECRETS.refresh, SECRETS.access, SECRETS.db, SECRETS.smtp].sort(),
    );
  });
});
