import { TEST_AUTH_ENV } from '../auth/testing/auth-test-env.js';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import { TEST_MAIL_ENV } from '../mail/testing/mail-test-env.js';
import { validateEnv } from './env.validation.js';

// Task P1/P3 — không có mã test case riêng trong plan auth. Task A3: SE-09 và các ràng buộc cấu hình xác thực (cuối file).
const DB = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
};
// Cấu hình hợp lệ tối thiểu: thông tin DB + cấu hình xác thực (JWT_*, WEB_ORIGIN)
const VALID = { ...DB, ...TEST_AUTH_ENV };
// Task P4: staging/production BẮT BUỘC có SMTP_HOST, SMTP_USER, SMTP_PASS. Các ca cũ của A3 dùng NODE_ENV đó chỉ để kiểm điều khác,
// nên thêm cấu hình email hợp lệ (giá trị giả) cho riêng hai môi trường này.
const MAIL_OK = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_USER: 'clinix@example.test',
  SMTP_PASS: fakeSecretValue('smtp'),
};
const mailFor = (nodeEnv: string) =>
  nodeEnv === 'production' || nodeEnv === 'staging' ? MAIL_OK : {};

describe('validateEnv', () => {
  it('dùng giá trị mặc định khi chỉ khai báo bắt buộc (thông tin đăng nhập DB)', () => {
    const env = validateEnv({ ...VALID });
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DB_HOST).toBe('127.0.0.1');
    expect(env.DB_PORT).toBe(3306);
    expect(env.DB_TIMEZONE).toBe('+07:00');
    expect(env.DB_MIGRATIONS_RUN).toBe(false);
  });

  it('bắt buộc có MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD', () => {
    expect(() => validateEnv({})).toThrow('MYSQL_DATABASE');
    expect(() => validateEnv({ ...VALID, MYSQL_PASSWORD: '' })).toThrow(
      'MYSQL_PASSWORD',
    );
    expect(() =>
      validateEnv({ MYSQL_DATABASE: 'clinix', MYSQL_USER: 'clinix' }),
    ).toThrow('MYSQL_PASSWORD');
  });

  it('đổi API_PORT và DB_PORT dạng chuỗi sang số', () => {
    const env = validateEnv({
      ...VALID,
      API_PORT: '3100',
      DB_PORT: '3307',
      NODE_ENV: 'production',
      ...MAIL_OK,
    });
    expect(env.API_PORT).toBe(3100);
    expect(env.DB_PORT).toBe(3307);
  });

  it('từ chối cổng ngoài khoảng 1–65535 hoặc không phải số', () => {
    expect(() => validateEnv({ ...VALID, API_PORT: '0' })).toThrow('API_PORT');
    expect(() => validateEnv({ ...VALID, API_PORT: '70000' })).toThrow(
      'API_PORT',
    );
    expect(() => validateEnv({ ...VALID, API_PORT: 'abc' })).toThrow(
      'API_PORT',
    );
    expect(() => validateEnv({ ...VALID, DB_PORT: '0' })).toThrow('DB_PORT');
  });

  it('DB_MIGRATIONS_RUN: chuỗi "false" phải là false (không bị chuyển kiểu ngầm thành true)', () => {
    expect(
      validateEnv({ ...VALID, DB_MIGRATIONS_RUN: 'false' }).DB_MIGRATIONS_RUN,
    ).toBe(false);
    expect(
      validateEnv({ ...VALID, DB_MIGRATIONS_RUN: 'true' }).DB_MIGRATIONS_RUN,
    ).toBe(true);
    expect(
      validateEnv({ ...VALID, DB_MIGRATIONS_RUN: '' }).DB_MIGRATIONS_RUN,
    ).toBe(false);
  });

  it('DB_TIMEZONE phải dạng +07:00', () => {
    expect(validateEnv({ ...VALID, DB_TIMEZONE: '-05:30' }).DB_TIMEZONE).toBe(
      '-05:30',
    );
    expect(() =>
      validateEnv({ ...VALID, DB_TIMEZONE: 'Asia/Ho_Chi_Minh' }),
    ).toThrow('DB_TIMEZONE');
    expect(() =>
      validateEnv({ ...VALID, DB_TIMEZONE: "+07:00'; DROP" }),
    ).toThrow('DB_TIMEZONE');
  });

  it('từ chối NODE_ENV lạ và không in giá trị của biến trong thông báo lỗi', () => {
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'bi-mat-123' })).toThrow(
      'NODE_ENV',
    );
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'bi-mat-123' })).not.toThrow(
      'bi-mat-123',
    );
  });

  it('không in mật khẩu DB trong thông báo lỗi', () => {
    const matKhau = 'mat-khau-tuyet-mat-xyz';
    expect(() =>
      validateEnv({
        MYSQL_DATABASE: '',
        MYSQL_USER: 'u',
        MYSQL_PASSWORD: matKhau,
      }),
    ).toThrow('MYSQL_DATABASE');
    expect(() =>
      validateEnv({
        MYSQL_DATABASE: '',
        MYSQL_USER: 'u',
        MYSQL_PASSWORD: matKhau,
      }),
    ).not.toThrow(matKhau);
  });
});

describe('validateEnv — cấu hình xác thực (task A3)', () => {
  it('đọc cấu hình xác thực; COOKIE_SECURE mặc định BẬT', () => {
    const env = validateEnv({ ...VALID, COOKIE_SECURE: undefined });
    expect(env.JWT_ACCESS_SECRET).toBe(TEST_AUTH_ENV.JWT_ACCESS_SECRET);
    expect(env.JWT_REFRESH_SECRET).toBe(TEST_AUTH_ENV.JWT_REFRESH_SECRET);
    expect(env.WEB_ORIGIN).toBe(TEST_AUTH_ENV.WEB_ORIGIN);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...VALID, COOKIE_SECURE: '' }).COOKIE_SECURE).toBe(
      true,
    );
  });

  it('thiếu hẳn biến COOKIE_SECURE (trường hợp phổ biến nhất) thì mặc định BẬT, kể cả ở production', () => {
    const { COOKIE_SECURE: _bo, ...withoutCookieSecure } = VALID;
    expect(validateEnv(withoutCookieSecure).COOKIE_SECURE).toBe(true);
    expect(
      validateEnv({
        ...withoutCookieSecure,
        NODE_ENV: 'production',
        ...MAIL_OK,
      }).COOKIE_SECURE,
    ).toBe(true);
  });

  it('bắt buộc có JWT_ACCESS_SECRET, JWT_REFRESH_SECRET và WEB_ORIGIN', () => {
    for (const name of [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'WEB_ORIGIN',
    ]) {
      const config: Record<string, unknown> = { ...VALID };
      delete config[name];
      expect(() => validateEnv(config), name).toThrow(name);
    }
  });

  it('khoá JWT phải dài ít nhất 32 ký tự (biên 31 / 32)', () => {
    expect(() =>
      validateEnv({ ...VALID, JWT_ACCESS_SECRET: 'a'.repeat(31) }),
    ).toThrow('JWT_ACCESS_SECRET');
    expect(() =>
      validateEnv({ ...VALID, JWT_REFRESH_SECRET: 'b'.repeat(31) }),
    ).toThrow('JWT_REFRESH_SECRET');
    expect(
      validateEnv({ ...VALID, JWT_ACCESS_SECRET: 'a'.repeat(32) })
        .JWT_ACCESS_SECRET,
    ).toHaveLength(32);
  });

  it('khoá access và khoá refresh phải khác nhau (SE-06)', () => {
    const same = 'x'.repeat(40);
    expect(() =>
      validateEnv({
        ...VALID,
        JWT_ACCESS_SECRET: same,
        JWT_REFRESH_SECRET: same,
      }),
    ).toThrow('JWT_REFRESH_SECRET: phải khác JWT_ACCESS_SECRET');
  });

  it.each(['production', 'staging', 'test'])(
    'COOKIE_SECURE=false bị từ chối khi NODE_ENV=%s — API không khởi động (SE-09, N5)',
    (nodeEnv) => {
      expect(() =>
        validateEnv({
          ...VALID,
          ...mailFor(nodeEnv),
          NODE_ENV: nodeEnv,
          COOKIE_SECURE: 'false',
        }),
      ).toThrow('COOKIE_SECURE');
      expect(() =>
        validateEnv({
          ...VALID,
          ...mailFor(nodeEnv),
          NODE_ENV: nodeEnv,
          COOKIE_SECURE: false,
        }),
      ).toThrow('COOKIE_SECURE');
    },
  );

  it('COOKIE_SECURE=false chỉ được chấp nhận khi NODE_ENV=development (SE-09)', () => {
    const env = validateEnv({
      ...VALID,
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
    });
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('COOKIE_SECURE=true hợp lệ ở mọi môi trường', () => {
    for (const nodeEnv of ['development', 'test', 'staging', 'production']) {
      expect(
        validateEnv({
          ...VALID,
          ...mailFor(nodeEnv),
          NODE_ENV: nodeEnv,
          COOKIE_SECURE: 'true',
        }).COOKIE_SECURE,
      ).toBe(true);
    }
  });

  it('COOKIE_SECURE chỉ nhận true/false: giá trị gõ nhầm bị báo lỗi, không lặng lẽ thành false', () => {
    for (const bad of ['ture', '0', 'no', 'False ', 'TRUE']) {
      expect(
        () =>
          validateEnv({
            ...VALID,
            NODE_ENV: 'development',
            COOKIE_SECURE: bad,
          }),
        bad,
      ).toThrow('COOKIE_SECURE');
    }
  });

  it.each([
    'http://localhost:5173',
    'https://clinix.example.com',
    'http://127.0.0.1:8080',
  ])('WEB_ORIGIN hợp lệ: %s', (origin) => {
    expect(validateEnv({ ...VALID, WEB_ORIGIN: origin }).WEB_ORIGIN).toBe(
      origin,
    );
  });

  it.each([
    'localhost:5173',
    'http://localhost:5173/',
    'http://localhost:5173/app',
    'ftp://localhost',
    'https://clinix.example.com?x=1',
    'HTTP://LOCALHOST:5173',
    'khong-phai-url',
  ])('WEB_ORIGIN không phải origin chuẩn bị từ chối: %s', (origin) => {
    expect(() => validateEnv({ ...VALID, WEB_ORIGIN: origin })).toThrow(
      'WEB_ORIGIN',
    );
  });

  it('thông báo lỗi không bao giờ in giá trị khoá JWT', () => {
    const secret = 'khoa-bi-mat-ngan-rat-bi-mat';
    let message = '';
    try {
      validateEnv({
        ...VALID,
        JWT_ACCESS_SECRET: secret,
        JWT_REFRESH_SECRET: secret,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).not.toContain(secret);
  });
});

describe('validateEnv — cấu hình gửi email (task P4)', () => {
  const messageOf = (config: Record<string, unknown>): string => {
    try {
      validateEnv(config);
    } catch (error) {
      return (error as Error).message;
    }
    return '';
  };

  it('mặc định ở dev: không cần SMTP; cổng 465, tên người gửi CLINIX, các địa chỉ tuỳ chọn không đặt', () => {
    const env = validateEnv({ ...VALID });
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASS).toBeUndefined();
    expect(env.SMTP_PORT).toBe(465);
    expect(env.MAIL_FROM_NAME).toBe('CLINIX');
    expect(env.MAIL_FROM_ADDRESS).toBeUndefined();
    expect(env.MAIL_SUPPORT_ADDRESS).toBeUndefined();
  });

  it('môi trường test của dự án (mọi biến email ép về rỗng) hợp lệ và coi như không đặt', () => {
    const env = validateEnv({ ...VALID, NODE_ENV: 'test', ...TEST_MAIL_ENV });
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_PORT).toBe(465);
    expect(env.MAIL_FROM_NAME).toBe('CLINIX');
  });

  it.each(['development', 'test'])(
    'NODE_ENV=%s không bắt buộc SMTP: API vẫn khởi động (không ép mọi người sửa .env)',
    (nodeEnv) => {
      expect(() => validateEnv({ ...VALID, NODE_ENV: nodeEnv })).not.toThrow();
    },
  );

  it.each(['production', 'staging'])(
    'NODE_ENV=%s thiếu cả ba biến SMTP: API không khởi động và thông báo nêu đủ tên từng biến',
    (nodeEnv) => {
      const message = messageOf({ ...VALID, NODE_ENV: nodeEnv });
      for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
        expect(message, name).toContain(
          `${name}: bắt buộc khi NODE_ENV=${nodeEnv}`,
        );
      }
    },
  );

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'])(
    'production thiếu riêng %s (không đặt hoặc để trống) thì không khởi động',
    (name) => {
      for (const value of [undefined, '']) {
        const message = messageOf({
          ...VALID,
          NODE_ENV: 'production',
          ...MAIL_OK,
          [name]: value,
        });
        expect(message, `${name}=${String(value)}`).toContain(name);
      }
    },
  );

  it.each(['production', 'staging'])(
    'NODE_ENV=%s đủ ba biến SMTP thì hợp lệ',
    (nodeEnv) => {
      const env = validateEnv({ ...VALID, NODE_ENV: nodeEnv, ...MAIL_OK });
      expect(env.SMTP_HOST).toBe('smtp.example.test');
      expect(env.SMTP_USER).toBe('clinix@example.test');
      expect(env.SMTP_PASS).toBe(MAIL_OK.SMTP_PASS);
    },
  );

  it.each([
    [{ SMTP_USER: 'clinix@example.test' }, 'SMTP_HOST, SMTP_PASS'],
    [{ SMTP_PASS: MAIL_OK.SMTP_PASS }, 'SMTP_HOST, SMTP_USER'],
    [{ SMTP_HOST: 'smtp.example.test' }, 'SMTP_USER, SMTP_PASS'],
    [
      { SMTP_HOST: 'smtp.example.test', SMTP_USER: 'clinix@example.test' },
      'SMTP_PASS',
    ],
  ])(
    'ở dev, đặt nửa vời %j là cấu hình sai (đặt đủ ba hoặc bỏ trống cả ba)',
    (partial, missing) => {
      const message = messageOf({ ...VALID, ...partial });
      expect(message).toContain(missing);
      expect(message).toContain('phải đặt đủ cả ba hoặc bỏ trống cả ba');
    },
  );

  it('SMTP_PORT: mặc định 465, đổi chuỗi sang số, để trống là 465; ngoài 1–65535 hoặc không phải số thì lỗi', () => {
    expect(validateEnv({ ...VALID, SMTP_PORT: '587' }).SMTP_PORT).toBe(587);
    expect(validateEnv({ ...VALID, SMTP_PORT: '' }).SMTP_PORT).toBe(465);
    for (const bad of ['0', '70000', 'abc', '587.5', '-1']) {
      expect(() => validateEnv({ ...VALID, SMTP_PORT: bad }), bad).toThrow(
        'SMTP_PORT',
      );
    }
  });

  it.each([
    'smtp.gmail.com:465',
    'smtp.example.test/x',
    'a b',
    'smtp@example.test',
    'smtp host',
  ])(
    'SMTP_HOST phải là tên máy chủ thuần, không kèm cổng/đường dẫn: từ chối %j',
    (host) => {
      expect(() =>
        validateEnv({ ...VALID, ...MAIL_OK, SMTP_HOST: host }),
      ).toThrow('SMTP_HOST');
    },
  );

  it('địa chỉ gửi: mặc định là SMTP_USER nên SMTP_USER phải là địa chỉ email, trừ khi đặt MAIL_FROM_ADDRESS', () => {
    const apiKeyLogin = { ...MAIL_OK, SMTP_USER: 'apikey' };
    expect(() => validateEnv({ ...VALID, ...apiKeyLogin })).toThrow(
      'MAIL_FROM_ADDRESS',
    );
    expect(
      validateEnv({
        ...VALID,
        ...apiKeyLogin,
        MAIL_FROM_ADDRESS: 'gui@example.test',
      }).MAIL_FROM_ADDRESS,
    ).toBe('gui@example.test');
  });

  it.each([
    'khong-phai-email',
    'a@example.test\r\nBcc: evil@example.test',
    'a@example.test,b@example.test',
    'Ten <a@example.test>',
  ])(
    'MAIL_FROM_ADDRESS và MAIL_SUPPORT_ADDRESS không an toàn bị từ chối (kể cả khi chưa cấu hình SMTP): %j',
    (address) => {
      expect(() =>
        validateEnv({ ...VALID, MAIL_FROM_ADDRESS: address }),
      ).toThrow('MAIL_FROM_ADDRESS');
      expect(() =>
        validateEnv({ ...VALID, MAIL_SUPPORT_ADDRESS: address }),
      ).toThrow('MAIL_SUPPORT_ADDRESS');
    },
  );

  it('MAIL_SUPPORT_ADDRESS hợp lệ được nhận; để trống là không đặt', () => {
    expect(
      validateEnv({ ...VALID, MAIL_SUPPORT_ADDRESS: 'hotro@example.test' })
        .MAIL_SUPPORT_ADDRESS,
    ).toBe('hotro@example.test');
    expect(
      validateEnv({ ...VALID, MAIL_SUPPORT_ADDRESS: '' }).MAIL_SUPPORT_ADDRESS,
    ).toBeUndefined();
  });

  it('MAIL_FROM_NAME: để trống là CLINIX; không được có ký tự điều khiển hay dài quá 100', () => {
    expect(validateEnv({ ...VALID, MAIL_FROM_NAME: '' }).MAIL_FROM_NAME).toBe(
      'CLINIX',
    );
    expect(
      validateEnv({ ...VALID, MAIL_FROM_NAME: 'Phòng khám CLINIX' })
        .MAIL_FROM_NAME,
    ).toBe('Phòng khám CLINIX');
    for (const bad of ['CLINIX\r\nBcc: evil@example.test', 'A'.repeat(101)]) {
      expect(() => validateEnv({ ...VALID, MAIL_FROM_NAME: bad })).toThrow(
        'MAIL_FROM_NAME',
      );
    }
  });

  it('SMTP_USER và SMTP_PASS không được chứa ký tự xuống dòng, và thông báo lỗi không in giá trị', () => {
    const user = 'nguoi.dung.bi.mat@example.test\nx';
    const pass = 'mat-khau-bi-mat\ndef-ghi-jkl';
    const userMessage = messageOf({ ...VALID, ...MAIL_OK, SMTP_USER: user });
    const passMessage = messageOf({ ...VALID, ...MAIL_OK, SMTP_PASS: pass });
    expect(userMessage).toContain('SMTP_USER');
    expect(userMessage).not.toContain('nguoi.dung.bi.mat');
    expect(passMessage).toContain('SMTP_PASS');
    expect(passMessage).not.toContain('mat-khau-bi-mat');
  });

  it('mật khẩu ứng dụng có dấu cách (cách Google hiển thị) được nhận nguyên văn, không tự cắt', () => {
    const spaced = 'abcd efgh ijkl mnop';
    expect(
      validateEnv({ ...VALID, ...MAIL_OK, SMTP_PASS: spaced }).SMTP_PASS,
    ).toBe(spaced);
  });

  it('thông báo lỗi không bao giờ in giá trị SMTP_PASS, SMTP_USER hay SMTP_HOST', () => {
    const pass = fakeSecretValue('smtp-bi-mat');
    const message = messageOf({
      ...VALID,
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp host sai',
      SMTP_USER: 'nguoi.dung.bi.mat@example.test',
      SMTP_PASS: pass,
      SMTP_PORT: 'abc',
      MAIL_FROM_ADDRESS: 'dia-chi-sai-bi-mat',
    });
    expect(message).toContain('SMTP_HOST');
    expect(message).toContain('SMTP_PORT');
    expect(message).toContain('MAIL_FROM_ADDRESS');
    for (const value of [
      pass,
      'nguoi.dung.bi.mat',
      'smtp host sai',
      'dia-chi-sai-bi-mat',
    ]) {
      expect(message).not.toContain(value);
    }
  });
});
