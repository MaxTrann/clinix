import { inspect, format } from 'node:util';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { createTestConfigService } from '../../../auth/testing/auth-test-config.js';
import { TEST_AUTH_ENV } from '../../../auth/testing/auth-test-env.js';
import {
  T0,
  at,
  captureNestLogger,
} from '../../../auth/testing/otp-int-helpers.js';
import type { EnvironmentVariables } from '../../../config/env.validation.js';
import {
  MailSendError,
  type MailSendErrorKind,
} from '../../../mail/mail-send.error.js';
import { MailService, type MailMessage } from '../../../mail/mail.service.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import type {
  ActivationLinkRepository,
  LockedAccount,
  NewActivationRow,
} from '../activation-link.repository.js';
import { ActivationLinkService } from '../activation-link.service.js';
import type { IssueActivationLinkInput } from '../activation-link.types.js';
import { IssuedActivationLink } from '../issued-activation-link.js';

// Task B14 (admin) — ActivationLinkService ở mức đơn vị: kho giả ghi lại THỨ TỰ lời gọi, DataSource giả đếm giao dịch đang mở. Không DB, không SMTP.
// Phần cần MySQL thật (UNIQUE, khoá hàng, chạy đua) ở activation-link.service.int-spec.ts. Mã NSB14-nn là [đề xuất].

const ACCOUNT_ID = '7';
const INPUT: IssueActivationLinkInput = {
  taiKhoanId: ACCOUNT_ID,
  kind: 'GuiLai',
};
const RECIPIENT = {
  email: 'leminhquang@clinix.example.test',
  fullName: 'Lê Minh Quang',
};
const HOUR_MS = 3_600_000;
const MAIL_KINDS: MailSendErrorKind[] = [
  'NOT_CONFIGURED',
  'INVALID_MESSAGE',
  'TLS',
  'AUTH',
  'REJECTED',
  'TIMEOUT',
  'CONNECTION',
  'UNKNOWN',
];

const deadlock = (): Error =>
  Object.assign(new Error('Deadlock found when trying to get lock'), {
    errno: 1213,
    code: 'ER_LOCK_DEADLOCK',
  });

class FakeRepository {
  readonly calls: string[] = [];
  readonly readLocks: { op: string; lock: boolean }[] = [];
  readonly sinceArgs: Date[] = [];
  readonly inserted: NewActivationRow[] = [];
  readonly revokedUnsent: string[] = [];
  readonly revokedOlder: string[] = [];
  readonly markedSent: string[] = [];
  account: LockedAccount | null = {
    loaiTaiKhoan: 'LeTan',
    trangThai: 'ChoKichHoat',
  };
  createdAt: Date[] = [];
  newerSent = false;
  markSentResult = true;
  insertError: Error | null = null;
  markSentFailures: Error[] = [];
  revokeUnsentFailures: Error[] = [];
  private nextId = 101;

  lockAccount(): Promise<LockedAccount | null> {
    this.calls.push('lockAccount');
    return Promise.resolve(this.account);
  }

  listCreatedSince(
    _em: EntityManager,
    _taiKhoanId: string,
    since: Date,
    lock = true,
  ): Promise<Date[]> {
    this.calls.push('listCreatedSince');
    this.sinceArgs.push(since);
    this.readLocks.push({ op: 'listCreatedSince', lock });
    return Promise.resolve(this.createdAt);
  }

  insert(_em: EntityManager, row: NewActivationRow): Promise<string> {
    this.calls.push('insert');
    this.inserted.push(row);
    if (this.insertError) return Promise.reject(this.insertError);
    return Promise.resolve(String(this.nextId++));
  }

  existsNewerSent(
    _em: EntityManager,
    _taiKhoanId: string,
    _afterId: string,
    lock = true,
  ): Promise<boolean> {
    this.calls.push('existsNewerSent');
    this.readLocks.push({ op: 'existsNewerSent', lock });
    return Promise.resolve(this.newerSent);
  }

  revokeOlderPending(
    _em: EntityManager,
    _taiKhoanId: string,
    beforeId: string,
  ): Promise<number> {
    this.calls.push('revokeOlderPending');
    this.revokedOlder.push(beforeId);
    return Promise.resolve(1);
  }

  markSent(_em: EntityManager, id: string): Promise<boolean> {
    this.calls.push('markSent');
    const failure = this.markSentFailures.shift();
    if (failure) return Promise.reject(failure);
    this.markedSent.push(id);
    return Promise.resolve(this.markSentResult);
  }

  revokeUnsent(_em: EntityManager, id: string): Promise<boolean> {
    this.calls.push('revokeUnsent');
    const failure = this.revokeUnsentFailures.shift();
    if (failure) return Promise.reject(failure);
    this.revokedUnsent.push(id);
    return Promise.resolve(true);
  }

  /** Xoá nhật ký lời gọi (giữ nguyên trạng thái giả) để chỉ nhìn các lời gọi của pha sau. */
  clearLog(): void {
    this.calls.length = 0;
    this.readLocks.length = 0;
    this.revokedUnsent.length = 0;
    this.revokedOlder.length = 0;
    this.markedSent.length = 0;
  }
}

class FakeDataSource {
  open = 0;
  started = 0;
  readonly isolations: string[] = [];

  async transaction<T>(
    isolation: string,
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    this.open++;
    this.started++;
    this.isolations.push(isolation);
    try {
      return await work({} as EntityManager);
    } finally {
      this.open--;
    }
  }
}

/** MailService thăm dò: ghi số giao dịch đang mở và đã bắt đầu NGAY lúc `send` chạy. */
class ProbeMail extends FakeMailService {
  readonly atSend: { open: number; started: number }[] = [];
  private readonly ds: FakeDataSource;

  constructor(ds: FakeDataSource) {
    super();
    this.ds = ds;
  }

  override send(message: MailMessage): Promise<void> {
    this.atSend.push({ open: this.ds.open, started: this.ds.started });
    return super.send(message);
  }
}

class ThrowingMail extends MailService {
  readonly error: Error;

  constructor(error: Error) {
    super();
    this.error = error;
  }

  send(): Promise<void> {
    return Promise.reject(this.error);
  }
}

function build(
  overrides: Partial<Record<keyof EnvironmentVariables, unknown>> = {},
  mailFactory: (ds: FakeDataSource) => MailService = (ds) => new ProbeMail(ds),
) {
  const repo = new FakeRepository();
  const ds = new FakeDataSource();
  const mail = mailFactory(ds);
  const config = createTestConfigService({
    STAFF_ACTIVATION_TTL_HOURS: 24,
    STAFF_ACTIVATION_RESEND_MIN_SECONDS: 60,
    STAFF_ACTIVATION_RESEND_MAX_PER_HOUR: 5,
    ...overrides,
  });
  const service = new ActivationLinkService(
    ds as unknown as DataSource,
    repo as unknown as ActivationLinkRepository,
    mail,
    config,
  );
  return { repo, ds, mail, config, service };
}

async function issueOk(
  service: ActivationLinkService,
  input: IssueActivationLinkInput = INPUT,
): Promise<IssuedActivationLink> {
  const result = await service.issue(input);
  if (!result.ok)
    throw new Error(`cấp liên kết thất bại: ${result.failure.code}`);
  return result.issued;
}

const urlOf = (message: MailMessage | undefined): string => {
  const match = /https?:\/\/\S+/.exec(message?.text ?? '');
  if (!match) throw new Error('không có URL trong thư');
  return match[0];
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  // Tắt log của Nest cho gọn màn hình; ca nào cần xem log thì tự gọi captureNestLogger() để lấy các dòng
  captureNestLogger();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ActivationLinkService.issue (pha 1)', () => {
  it('NSB14-12 thứ tự khoá tài khoản → đọc tao_luc → INSERT; KHÔNG gọi mạng; cửa sổ đếm là 1 giờ gần nhất', async () => {
    const { repo, mail, service } = build();
    const result = await service.issue(INPUT);
    expect(result.ok).toBe(true);
    expect(repo.calls).toEqual(['lockAccount', 'listCreatedSince', 'insert']);
    expect(repo.sinceArgs[0]?.getTime()).toBe(T0.getTime() - HOUR_MS);
    expect((mail as FakeMailService).attempts).toHaveLength(0);
    // Hàng được chèn mang băm SHA-256 hex, không phải token rõ
    expect(repo.inserted[0]?.maBam).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.inserted[0]?.taiKhoanId).toBe(ACCOUNT_ID);
  });

  it('NSB14-12 (NS-45) bị giới hạn ⇒ trả failure kèm số giây chờ và KHÔNG INSERT', async () => {
    const { repo, service } = build();
    repo.createdAt = [at(-30)];
    const result = await service.issue(INPUT);
    expect(result).toEqual({
      ok: false,
      failure: {
        code: 'GUI_LAI_QUA_SOM',
        reason: 'TOO_SOON',
        retryAfterSeconds: 30,
      },
    });
    expect(repo.calls).toEqual(['lockAccount', 'listCreatedSince']);
  });

  it('NSB14-12 giá trị cấu hình khác mặc định được dùng (10 giây, 2 hàng mỗi giờ)', async () => {
    const { repo, service } = build({
      STAFF_ACTIVATION_RESEND_MIN_SECONDS: 10,
      STAFF_ACTIVATION_RESEND_MAX_PER_HOUR: 2,
    });
    repo.createdAt = [at(-10)];
    expect((await service.issue(INPUT)).ok).toBe(true);
    repo.createdAt = [at(-20), at(-10)];
    const refused = await service.issue(INPUT);
    expect(refused).toMatchObject({
      ok: false,
      failure: { reason: 'HOURLY_LIMIT', retryAfterSeconds: 3580 },
    });
  });

  it('NSB14-12 (NS-19) lỗi INSERT ⇒ ném NGUYÊN lỗi, không thư, không gọi gì sau INSERT', async () => {
    const { repo, mail, service } = build();
    const boom = new Error('INSERT hỏng');
    repo.insertError = boom;
    await expect(service.issue(INPUT)).rejects.toBe(boom);
    expect(repo.calls).toEqual(['lockAccount', 'listCreatedSince', 'insert']);
    expect((mail as FakeMailService).attempts).toHaveLength(0);
  });

  it('NSB14-12 có manager của người gọi ⇒ KHÔNG tự mở giao dịch; không có ⇒ tự mở đúng một giao dịch READ COMMITTED', async () => {
    const { ds, service } = build();
    await service.issue(INPUT, { manager: {} as EntityManager });
    expect(ds.started).toBe(0);
    await service.issue(INPUT);
    expect(ds.started).toBe(1);
    expect(ds.isolations).toEqual(['READ COMMITTED']);
  });

  it.each([
    ['BenhNhan đang chờ (không thể có ở DB)', 'BenhNhan', 'ChoKichHoat'],
    ['BenhNhan đang hoạt động', 'BenhNhan', 'DangHoatDong'],
    ['LeTan đang hoạt động', 'LeTan', 'DangHoatDong'],
    ['BacSi đã ngưng', 'BacSi', 'NgungHoatDong'],
    ['QuanTriVien đang hoạt động', 'QuanTriVien', 'DangHoatDong'],
  ] as const)(
    'NSB14-13 %s ⇒ TAI_KHOAN_KHONG_CHO_KICH_HOAT, không INSERT',
    async (_name, loaiTaiKhoan, trangThai) => {
      const { repo, service } = build();
      repo.account = { loaiTaiKhoan, trangThai };
      const result = await service.issue(INPUT);
      expect(result).toEqual({
        ok: false,
        failure: {
          code: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
          reason: 'NOT_PENDING_STAFF',
        },
      });
      expect(repo.calls).toEqual(['lockAccount']);
    },
  );

  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'NSB14-13 nhân sự %s đang chờ kích hoạt ⇒ được cấp, mang đúng vai trò',
    async (loaiTaiKhoan) => {
      const { repo, service } = build();
      repo.account = { loaiTaiKhoan, trangThai: 'ChoKichHoat' };
      const issued = await issueOk(service);
      expect(issued.loaiTaiKhoan).toBe(loaiTaiKhoan);
    },
  );

  it('NSB14-13 tài khoản KHÔNG tồn tại là lỗi lập trình của người gọi ⇒ ném Error (không phải failure), không INSERT', async () => {
    const { repo, service } = build();
    repo.account = null;
    await expect(service.issue(INPUT)).rejects.toThrow(
      `Không có tài khoản ${ACCOUNT_ID}`,
    );
    expect(repo.calls).toEqual(['lockAccount']);
  });

  it('NSB14-14 (NS-42) TTL đọc MỖI LẦN gọi và tính bằng GIỜ: 24 rồi 48 rồi 1', async () => {
    const { repo, config, service } = build();
    const first = await issueOk(service);
    expect(first.hetHanLuc.getTime()).toBe(T0.getTime() + 24 * HOUR_MS);
    expect(first.ttlHours).toBe(24);
    expect(repo.inserted[0]?.expiresAt.getTime()).toBe(
      T0.getTime() + 24 * HOUR_MS,
    );

    config.set('STAFF_ACTIVATION_TTL_HOURS', 48);
    const second = await issueOk(service);
    expect(second.hetHanLuc.getTime()).toBe(T0.getTime() + 48 * HOUR_MS);
    expect(second.ttlHours).toBe(48);
    // Hàng đã chèn trước đó KHÔNG bị đổi: chỉ có hai INSERT, mỗi cái giữ hạn của lúc nó được tạo
    expect(repo.inserted.map((row) => row.expiresAt.getTime())).toEqual([
      T0.getTime() + 24 * HOUR_MS,
      T0.getTime() + 48 * HOUR_MS,
    ]);

    config.set('STAFF_ACTIVATION_TTL_HOURS', 1);
    expect((await issueOk(service)).hetHanLuc.getTime()).toBe(
      T0.getTime() + 3_600_000,
    );
  });

  it('NSB14-14 mốc thời gian cắt xuống GIÂY (MySQL làm tròn DATETIME): đồng hồ T0 + 0,7 giây ⇒ tao_luc = T0, hết hạn = T0 + 24 giờ', async () => {
    const { repo, service } = build();
    vi.setSystemTime(new Date(T0.getTime() + 700));
    const issued = await issueOk(service);
    expect(repo.inserted[0]?.createdAt.getTime()).toBe(T0.getTime());
    expect(issued.hetHanLuc.getTime()).toBe(T0.getTime() + 24 * HOUR_MS);
    expect(repo.sinceArgs[0]?.getTime()).toBe(T0.getTime() - HOUR_MS);
  });

  it('NSB14-23 giao dịch CHUẨN (activationLinks.transaction) đọc KHÔNG khoá; giao dịch tự mở trong issue cũng vậy', async () => {
    const { repo, ds, service } = build();
    await service.transaction((em) => service.issue(INPUT, { manager: em }));
    expect(repo.readLocks).toEqual([{ op: 'listCreatedSince', lock: false }]);
    expect(ds.isolations).toEqual(['READ COMMITTED']);

    repo.readLocks.length = 0;
    await service.issue(INPUT);
    expect(repo.readLocks).toEqual([{ op: 'listCreatedSince', lock: false }]);
  });

  it('NSB14-23 giao dịch LẠ (không do transaction mở) đọc KHOÁ và cảnh báo đúng MỘT lần (TECH_DEBT 30)', async () => {
    const { repo, service } = build();
    const lines = captureNestLogger();
    await service.issue(INPUT, { manager: {} as EntityManager });
    await service.issue(INPUT, { manager: {} as EntityManager });
    expect(repo.readLocks).toEqual([
      { op: 'listCreatedSince', lock: true },
      { op: 'listCreatedSince', lock: true },
    ]);
    const warnings = lines.filter((line) =>
      line.includes('KHÔNG do ActivationLinkService.transaction mở'),
    );
    expect(warnings).toHaveLength(1);
  });
});

describe('ActivationLinkService.deliver (pha 2)', () => {
  it('NSB14-15 (TK-46, quy tắc 21) thành công: MỘT giao dịch, thứ tự khoá tài khoản → kiểm hàng mới hơn → THU HỒI cũ → ĐẶT da_gui_luc', async () => {
    const { repo, ds, service } = build();
    const issued = await issueOk(service);
    repo.clearLog();
    const before = ds.started;

    const result = await service.deliver(issued, RECIPIENT);

    expect(result).toEqual({
      ok: true,
      maXacThucId: issued.maXacThucId,
      hetHanLuc: issued.hetHanLuc,
    });
    expect(repo.calls).toEqual([
      'lockAccount',
      'existsNewerSent',
      'revokeOlderPending',
      'markSent',
    ]);
    expect(repo.revokedOlder).toEqual([issued.maXacThucId]);
    expect(repo.markedSent).toEqual([issued.maXacThucId]);
    expect(ds.started - before).toBe(1);
    // Giao dịch hậu gửi cũng READ COMMITTED và đọc không khoá
    expect(repo.readLocks).toEqual([{ op: 'existsNewerSent', lock: false }]);
  });

  it.each(MAIL_KINDS)(
    'NSB14-16 (NS-19, TK-41) MailSendError %s ⇒ GUI_MAIL_LOI, CHỈ thu hồi hàng mới (giữ liên kết cũ), không ném, log không có email hay URL',
    async (kind) => {
      const { repo, ds, mail, service } = build();
      const lines = captureNestLogger();
      const issued = await issueOk(service);
      repo.clearLog();
      const before = ds.started;
      (mail as FakeMailService).failNextWith(kind);

      const result = await service.deliver(issued, RECIPIENT);

      expect(result).toEqual({
        ok: false,
        maLoi: 'GUI_MAIL_LOI',
        maXacThucId: issued.maXacThucId,
      });
      expect(repo.calls).toEqual(['lockAccount', 'revokeUnsent']);
      expect(repo.revokedUnsent).toEqual([issued.maXacThucId]);
      expect(repo.revokedOlder).toEqual([]);
      expect(repo.markedSent).toEqual([]);
      expect(ds.started - before).toBe(1);

      const log = lines.join('\n');
      const url = urlOf((mail as FakeMailService).attempts[0]);
      expect(log).toContain(kind);
      expect(log).not.toContain(RECIPIENT.email);
      expect(log).not.toContain(url);
      expect(log).not.toContain(url.split('token=')[1] ?? 'khong-co');
    },
  );

  it('NSB14-17 lỗi KHÔNG phải MailSendError (lỗi lập trình) ⇒ thu hồi hàng mới rồi ném lại NGUYÊN lỗi, không báo GUI_MAIL_LOI', async () => {
    const boom = new TypeError('lỗi lập trình');
    const { repo, service } = build({}, () => new ThrowingMail(boom));
    const issued = await issueOk(service);
    repo.clearLog();
    await expect(service.deliver(issued, RECIPIENT)).rejects.toBe(boom);
    expect(repo.calls).toEqual(['lockAccount', 'revokeUnsent']);
    expect(repo.markedSent).toEqual([]);
  });

  it('NSB14-17 MailSendError do chính hạ tầng ném (không qua FakeMailService) cũng được nhận ra', async () => {
    const { repo, service } = build(
      {},
      () => new ThrowingMail(new MailSendError('AUTH')),
    );
    const issued = await issueOk(service);
    repo.clearLog();
    const result = await service.deliver(issued, RECIPIENT);
    expect(result).toMatchObject({ ok: false, maLoi: 'GUI_MAIL_LOI' });
    expect(repo.calls).toEqual(['lockAccount', 'revokeUnsent']);
  });

  it('NSB14-18 thư được gửi NGOÀI giao dịch: lúc send chạy không có giao dịch nào đang mở và chưa giao dịch nào bắt đầu trong deliver', async () => {
    const { ds, mail, service } = build();
    const issued = await issueOk(service);
    const before = ds.started;
    await service.deliver(issued, RECIPIENT);
    const probe = mail as ProbeMail;
    expect(probe.atSend).toEqual([{ open: 0, started: before }]);
    // Hai giao dịch hậu gửi (thành công: 1; lỗi: 1) đều chạy SAU send
    expect(ds.started - before).toBe(1);
  });

  it('NSB14-18 gửi lỗi: send vẫn ngoài giao dịch, rồi đúng một giao dịch ghi lỗi', async () => {
    const { ds, mail, service } = build();
    const issued = await issueOk(service);
    const before = ds.started;
    (mail as FakeMailService).failNextWith('TIMEOUT');
    await service.deliver(issued, RECIPIENT);
    expect((mail as ProbeMail).atSend).toEqual([{ open: 0, started: before }]);
    expect(ds.started - before).toBe(1);
  });

  it('NSB14-19 giao dịch hậu gửi gặp deadlock 1213: thử lại tối đa 3 lần rồi mới thành công', async () => {
    const { repo, ds, service } = build();
    const issued = await issueOk(service);
    repo.clearLog();
    const before = ds.started;
    repo.markSentFailures = [deadlock(), deadlock()];
    const result = await service.deliver(issued, RECIPIENT);
    expect(result.ok).toBe(true);
    expect(ds.started - before).toBe(3);
    expect(repo.markedSent).toEqual([issued.maXacThucId]);
  });

  it('NSB14-19 deadlock 3 lần liền ⇒ ném lỗi gốc, đúng 3 lần thử (không 4)', async () => {
    const { repo, ds, service } = build();
    const issued = await issueOk(service);
    const before = ds.started;
    const last = deadlock();
    repo.markSentFailures = [deadlock(), deadlock(), last];
    await expect(service.deliver(issued, RECIPIENT)).rejects.toBe(last);
    expect(ds.started - before).toBe(3);
  });

  it('NSB14-19 lỗi KHÁC (trùng khoá 1062) không thử lại', async () => {
    const { repo, ds, service } = build();
    const issued = await issueOk(service);
    const before = ds.started;
    const duplicate = Object.assign(new Error('Duplicate entry'), {
      errno: 1062,
      code: 'ER_DUP_ENTRY',
    });
    repo.markSentFailures = [duplicate];
    await expect(service.deliver(issued, RECIPIENT)).rejects.toBe(duplicate);
    expect(ds.started - before).toBe(1);
  });

  it('NSB14-19 gửi lỗi mà ghi nhận lỗi cũng hỏng (deadlock hết lượt): vẫn trả GUI_MAIL_LOI (không che lỗi gốc) và ghi log lỗi', async () => {
    const { repo, mail, service } = build();
    const lines = captureNestLogger();
    const issued = await issueOk(service);
    (mail as FakeMailService).failNextWith('CONNECTION');
    repo.revokeUnsentFailures = [deadlock(), deadlock(), deadlock()];
    const result = await service.deliver(issued, RECIPIENT);
    expect(result).toMatchObject({ ok: false, maLoi: 'GUI_MAIL_LOI' });
    expect(lines.join('\n')).toContain('Không ghi được kết quả gửi lỗi');
  });

  it('NSB14-20 đã có liên kết MỚI HƠN gửi xong (hoàn tất đảo thứ tự) ⇒ thu hồi chính hàng này, KHÔNG thu hồi ai khác, KHÔNG đặt da_gui_luc', async () => {
    const { repo, service } = build();
    const lines = captureNestLogger();
    const issued = await issueOk(service);
    repo.clearLog();
    repo.newerSent = true;
    const result = await service.deliver(issued, RECIPIENT);
    expect(result.ok).toBe(true);
    expect(repo.calls).toEqual([
      'lockAccount',
      'existsNewerSent',
      'revokeUnsent',
    ]);
    expect(repo.revokedUnsent).toEqual([issued.maXacThucId]);
    expect(repo.markedSent).toEqual([]);
    expect(lines.join('\n')).toContain('đã có liên kết mới hơn');
  });

  it('NSB14-20 markSent không đặt được (hàng đã bị thu hồi trong lúc gửi) ⇒ cảnh báo, không ném', async () => {
    const { repo, service } = build();
    const lines = captureNestLogger();
    const issued = await issueOk(service);
    repo.markSentResult = false;
    await expect(service.deliver(issued, RECIPIENT)).resolves.toMatchObject({
      ok: true,
    });
    expect(lines.join('\n')).toContain('không đặt da_gui_luc');
  });

  it('NSB14-22 thư gửi đi: đúng người nhận, URL đúng id và WEB_ORIGIN, số giờ là số đã dùng tính hạn kể cả khi cấu hình đổi sau issue', async () => {
    const { config, mail, service } = build({
      MAIL_SUPPORT_ADDRESS: 'ho.tro@clinix.example.test',
    });
    const issued = await issueOk(service);
    config.set('STAFF_ACTIVATION_TTL_HOURS', 99);
    await service.deliver(issued, RECIPIENT);

    const message = (mail as FakeMailService).attempts[0];
    expect(message?.to).toBe(RECIPIENT.email);
    expect(message?.subject).toBe('[CLINIX] Liên kết kích hoạt tài khoản mới');
    expect(message?.html).toBeDefined();
    const url = urlOf(message);
    expect(url).toMatch(
      new RegExp(
        `^${TEST_AUTH_ENV.WEB_ORIGIN}/kich-hoat#id=${issued.maXacThucId}&token=[A-Za-z0-9_-]{43}$`,
      ),
    );
    expect(message?.text).toContain('Thời hạn liên kết mới: 24 giờ');
    expect(message?.text).not.toContain('99 giờ');
    expect(message?.text).toContain('ho.tro@clinix.example.test');
    expect(message?.text).toContain('Lê Minh Quang');
  });

  it('NSB14-22 kind TaoMoi dùng thư 674:2 (tiêu đề và vai trò)', async () => {
    const { repo, mail, service } = build();
    repo.account = { loaiTaiKhoan: 'BacSi', trangThai: 'ChoKichHoat' };
    const issued = await issueOk(service, {
      taiKhoanId: ACCOUNT_ID,
      kind: 'TaoMoi',
    });
    await service.deliver(issued, RECIPIENT);
    const message = (mail as FakeMailService).attempts[0];
    expect(message?.subject).toBe('[CLINIX] Kích hoạt tài khoản nhân sự');
    expect(message?.text).toContain('Vai trò: Bác sĩ');
  });

  it('NSB14-20 chỉ gọi deliver được MỘT lần cho mỗi liên kết (lần hai là lỗi lập trình, không gửi trùng)', async () => {
    const { mail, service } = build();
    const issued = await issueOk(service);
    await service.deliver(issued, RECIPIENT);
    await expect(service.deliver(issued, RECIPIENT)).rejects.toThrow(
      'đã được lấy để gửi một lần rồi',
    );
    expect((mail as FakeMailService).attempts).toHaveLength(1);
  });
});

describe('IssuedActivationLink', () => {
  it('NSB14-21 (NS-21) URL và token không lộ qua JSON, inspect, String, format, trải, liệt kê khoá; lấy ra lần hai thì ném', async () => {
    const { service } = build();
    const issued = await issueOk(service);
    const url = IssuedActivationLink.revealForDelivery(issued);
    const token = url.split('token=')[1] ?? 'khong-co';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const surfaces = [
      JSON.stringify(issued),
      JSON.stringify(Object.assign({}, issued)),
      inspect(issued, { depth: 10, showHidden: true }),
      String(issued),
      format('%o %s %j', issued, issued, issued),
      Object.keys(issued).join(','),
      Object.getOwnPropertyNames(issued).join(','),
      JSON.stringify(Object.entries(issued)),
    ];
    for (const surface of surfaces) {
      expect(surface).not.toContain(token);
      expect(surface).not.toContain(url);
      expect(surface).not.toContain('kich-hoat');
    }
    // Vẫn còn đủ thông tin chẩn đoán
    expect(JSON.parse(surfaces[0] ?? '{}')).toMatchObject({
      maXacThucId: issued.maXacThucId,
      kind: 'GuiLai',
      ttlHours: 24,
    });
    expect(() => IssuedActivationLink.revealForDelivery(issued)).toThrow(
      'đã được lấy để gửi một lần rồi',
    );
  });
});
