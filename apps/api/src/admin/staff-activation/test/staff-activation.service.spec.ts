import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { PasswordHasher } from '../../../auth/password/password-hasher.service.js';
import {
  T0,
  captureNestLogger,
} from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { ActivationLinkRepository } from '../activation-link.repository.js';
import type { AccountFacts, LinkFacts } from '../activation-link-usability.js';
import {
  generateActivationToken,
  hashActivationToken,
} from '../activation-link-token.js';
import { invalidActivationLink } from '../staff-activation-errors.js';
import type {
  LinkWithAccount,
  StaffActivationRepository,
} from '../staff-activation.repository.js';
import { StaffActivationService } from '../staff-activation.service.js';

// Task B16 (admin) — StaffActivationService ở mức đơn vị: kho giả ghi lại THỨ TỰ lời gọi, DataSource giả đếm giao dịch đang mở, hasher giả ghi lại
// "lúc băm có giao dịch mở không". Không DB, không Argon2id thật. Phần cần MySQL thật (khoá hàng, CHECK, chạy đua) ở staff-activation.*.int-spec.ts.
// Mã NSB16-nn là [đề xuất]; mã PLAN phủ: NS-21, 30, 31, 33, 35, 40.
const LINK_ID = '5';
const ACCOUNT_ID = '7';
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const rawLinkValue = generateActivationToken();
// Mật khẩu sinh lúc chạy (không ghi cứng chuỗi trông như bí mật)
const newCredential = (): string => `${randomBytes(6).toString('hex')}Aa1!`;
const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$bW9ja3NhbHQ$bW9ja2hhc2g';

type LinkRow = LinkFacts & { taiKhoanId: string };

const goodLink = (over: Partial<LinkRow> = {}): LinkRow => ({
  taiKhoanId: ACCOUNT_ID,
  maBam: hashActivationToken(rawLinkValue),
  hetHanLuc: new Date(T0.getTime() + HOUR_MS),
  daGuiLuc: new Date(T0.getTime() - MINUTE_MS),
  thuHoiLuc: null,
  daDungLuc: null,
  ...over,
});
const goodAccount = (over: Partial<AccountFacts> = {}): AccountFacts => ({
  trangThai: 'ChoKichHoat',
  loaiTaiKhoan: 'LeTan',
  ...over,
});

class Journal {
  calls: string[] = [];
  openTransactions = 0;
  isolationLevels: string[] = [];
}

class FakeDataSource {
  readonly manager = { tag: 'root' };
  constructor(private readonly journal: Journal) {}
  async transaction<T>(
    isolation: string,
    work: (em: unknown) => Promise<T>,
  ): Promise<T> {
    this.journal.calls.push('tx:open');
    this.journal.openTransactions++;
    this.journal.isolationLevels.push(isolation);
    try {
      return await work({ tag: 'tx' });
    } finally {
      this.journal.openTransactions--;
      this.journal.calls.push('tx:close');
    }
  }
}

class FakeRepository {
  /** Kết quả của lần đọc sơ bộ (không khoá) */
  stored: LinkWithAccount | null = {
    link: goodLink(),
    account: goodAccount(),
  };
  /** Dữ kiện dưới khoá; mặc định trùng lần đọc sơ bộ */
  lockedLink: LinkRow | null | undefined = undefined;
  onLockLink: (() => void) | null = null;
  readonly readIds: string[] = [];
  readonly activated: { id: string; hash: string }[] = [];
  readonly used: { id: string; at: Date }[] = [];
  activateResult = true;
  markUsedResult = true;
  constructor(private readonly journal: Journal) {}

  findLinkWithAccount(
    em: unknown,
    id: string,
  ): Promise<LinkWithAccount | null> {
    this.journal.calls.push('read');
    this.readIds.push(id);
    expect((em as { tag: string }).tag).toBe('root');
    return Promise.resolve(this.stored);
  }
  lockLink(em: unknown, id: string): Promise<LinkRow | null> {
    this.journal.calls.push('lockLink');
    expect(id).toBe(LINK_ID);
    expect((em as { tag: string }).tag).toBe('tx');
    this.onLockLink?.();
    return Promise.resolve(
      this.lockedLink === undefined
        ? (this.stored?.link ?? null)
        : this.lockedLink,
    );
  }
  activateAccount(_em: unknown, id: string, hash: string): Promise<boolean> {
    this.journal.calls.push('activate');
    this.activated.push({ id, hash });
    return Promise.resolve(this.activateResult);
  }
  markUsed(_em: unknown, id: string, at: Date): Promise<boolean> {
    this.journal.calls.push('markUsed');
    this.used.push({ id, at });
    return Promise.resolve(this.markUsedResult);
  }
}

class FakeAccounts {
  lockedAccount: AccountFacts | null | undefined = undefined;
  constructor(
    private readonly repo: FakeRepository,
    private readonly journal: Journal,
  ) {}
  lockAccount(em: unknown, id: string): Promise<AccountFacts | null> {
    this.journal.calls.push('lockAccount');
    expect(id).toBe(ACCOUNT_ID);
    expect((em as { tag: string }).tag).toBe('tx');
    return Promise.resolve(
      this.lockedAccount === undefined
        ? (this.repo.stored?.account ?? null)
        : this.lockedAccount,
    );
  }
}

class FakeHasher {
  readonly plain: string[] = [];
  openTransactionsAtHash: number[] = [];
  constructor(private readonly journal: Journal) {}
  hash(plain: string): Promise<string> {
    this.journal.calls.push('hash');
    this.plain.push(plain);
    this.openTransactionsAtHash.push(this.journal.openTransactions);
    return Promise.resolve(FAKE_HASH);
  }
}

interface Harness {
  service: StaffActivationService;
  journal: Journal;
  repo: FakeRepository;
  accounts: FakeAccounts;
  hasher: FakeHasher;
  logs: string[];
}

function harness(): Harness {
  const journal = new Journal();
  const repo = new FakeRepository(journal);
  const accounts = new FakeAccounts(repo, journal);
  const hasher = new FakeHasher(journal);
  const service = new StaffActivationService(
    new FakeDataSource(journal) as unknown as DataSource,
    repo as unknown as StaffActivationRepository,
    accounts as unknown as ActivationLinkRepository,
    hasher as unknown as PasswordHasher,
  );
  return { service, journal, repo, accounts, hasher, logs: [] };
}

let h: Harness;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  h = harness();
  h.logs = captureNestLogger();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function failureOf(run: () => Promise<unknown>): Promise<AppException> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('lẽ ra phải ném lỗi');
}

const body = { id: LINK_ID, token: rawLinkValue };
const completeInput = (over: Record<string, unknown> = {}) => ({
  id: LINK_ID,
  token: rawLinkValue,
  matKhauMoi: newCredential(),
  ...over,
});

interface FailureCase {
  label: string;
  stored: LinkWithAccount | null;
  id?: unknown;
  token?: unknown;
}
const failureCases = (): FailureCase[] => {
  const withLink = (over: Partial<LinkRow>): LinkWithAccount => ({
    link: goodLink(over),
    account: goodAccount(),
  });
  const past = new Date(T0.getTime() - 1000);
  return [
    { label: 'không có hàng', stored: null },
    {
      label: 'token sai (đúng dạng)',
      stored: withLink({}),
      token: generateActivationToken(),
    },
    { label: 'token sai dạng', stored: withLink({}), token: 'khong-dung-dang' },
    { label: 'token thiếu', stored: withLink({}), token: undefined },
    { label: 'id sai dạng', stored: null, id: 'abc' },
    { label: 'id là số JSON', stored: null, id: 5 },
    { label: 'id thiếu', stored: null, id: undefined },
    { label: 'đã dùng', stored: withLink({ daDungLuc: past }) },
    { label: 'thu hồi', stored: withLink({ thuHoiLuc: past }) },
    { label: 'chưa gửi', stored: withLink({ daGuiLuc: null }) },
    { label: 'hết hạn', stored: withLink({ hetHanLuc: past }) },
    {
      label: 'tài khoản đang hoạt động',
      stored: {
        link: goodLink(),
        account: goodAccount({ trangThai: 'DangHoatDong' }),
      },
    },
    {
      label: 'tài khoản ngưng',
      stored: {
        link: goodLink(),
        account: goodAccount({ trangThai: 'NgungHoatDong' }),
      },
    },
  ];
};

describe('mọi nhánh thất bại trả CÙNG một lỗi và làm CÙNG việc (NS-33, NS-35)', () => {
  it('NSB16-05 (NS-35) validate: cùng ngoại lệ (400, LIEN_KET_KHONG_HOP_LE, cùng chữ, không loi, không chiTiet) và đúng MỘT lần đọc ở mọi nhánh', async () => {
    const reference = invalidActivationLink();
    for (const failure of failureCases()) {
      h = harness();
      h.repo.stored = failure.stored;
      const input = { ...body, ...pick(failure) };
      const error = await failureOf(() => h.service.validate(input));
      expect(error.getStatus(), failure.label).toBe(400);
      expect(error.maLoi, failure.label).toBe('LIEN_KET_KHONG_HOP_LE');
      expect(error.getResponse(), failure.label).toEqual(
        reference.getResponse(),
      );
      expect(error.getResponse(), failure.label).not.toHaveProperty('loi');
      expect(error.getResponse(), failure.label).not.toHaveProperty('chiTiet');
      expect(h.journal.calls, failure.label).toEqual(['read']);
    }
  });

  it('NSB16-05 (NS-35) validate: thân không phải object (null, chuỗi, số, mảng) cũng cùng ngoại lệ và đúng MỘT lần đọc', async () => {
    const reference = invalidActivationLink();
    for (const weird of [null, undefined, 'x', 7, [], [body]]) {
      h = harness();
      const error = await failureOf(() => h.service.validate(weird));
      expect(error.getResponse(), JSON.stringify(weird)).toEqual(
        reference.getResponse(),
      );
      expect(h.journal.calls).toEqual(['read']);
    }
  });

  it('NSB16-05 (NS-35) id sai dạng vẫn đọc ĐÚNG MỘT lần với id mốc "0" (không bỏ qua lần đọc, không đọc bằng giá trị người dùng gửi)', async () => {
    for (const id of ['abc', 5, undefined, '0012', '-1', '1e3']) {
      h = harness();
      h.repo.stored = null;
      await failureOf(() => h.service.validate({ id, token: rawLinkValue }));
      expect(h.repo.readIds, String(id)).toEqual(['0']);
    }
  });

  it('NSB16-05 (NS-33, NS-35) complete: cùng ngoại lệ ở mọi nhánh thất bại sơ bộ; hasher KHÔNG được gọi; không mở giao dịch nào', async () => {
    const reference = invalidActivationLink();
    for (const failure of failureCases()) {
      h = harness();
      h.repo.stored = failure.stored;
      const input = completeInput(pick(failure));
      const error = await failureOf(() => h.service.complete(input));
      expect(error.getStatus(), failure.label).toBe(400);
      expect(error.getResponse(), failure.label).toEqual(
        reference.getResponse(),
      );
      // Chống tốn CPU: kiểm sơ bộ thất bại thì chưa băm, chưa mở giao dịch
      expect(h.journal.calls, failure.label).toEqual(['read']);
      expect(h.hasher.plain, failure.label).toEqual([]);
    }
  });

  it('NSB16-05 thất bại ở bước sơ bộ KHÔNG ghi log nào (không có gì đáng tin để ghi; không để kẻ ngoài làm đầy log)', async () => {
    for (const failure of failureCases()) {
      h = harness();
      h.logs = captureNestLogger();
      h.repo.stored = failure.stored;
      await failureOf(() => h.service.complete(completeInput(pick(failure))));
      await failureOf(() => h.service.validate({ ...body, ...pick(failure) }));
      expect(h.logs, failure.label).toEqual([]);
    }
  });
});

function pick(failure: FailureCase): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('id' in failure) out.id = failure.id;
  if ('token' in failure) out.token = failure.token;
  return out;
}

describe('complete thành công: thứ tự và giao dịch (NS-31)', () => {
  it('NSB16-06 (NS-31) thứ tự: đọc sơ bộ, băm (KHÔNG có giao dịch mở), mở giao dịch READ COMMITTED, khoá tài khoản TRƯỚC liên kết, ghi tài khoản, ghi liên kết', async () => {
    const credential = newCredential();
    const result = await h.service.complete(
      completeInput({ matKhauMoi: credential }),
    );
    expect(result).toEqual({ daKichHoat: true });
    expect(h.journal.calls).toEqual([
      'read',
      'hash',
      'tx:open',
      'lockAccount',
      'lockLink',
      'activate',
      'markUsed',
      'tx:close',
    ]);
    expect(h.hasher.plain).toEqual([credential]);
    expect(h.hasher.openTransactionsAtHash).toEqual([0]);
    expect(h.journal.isolationLevels).toEqual(['READ COMMITTED']);
    // Ghi đúng tài khoản với đúng băm do hasher trả; đánh dấu đúng liên kết với mốc giây của đồng hồ ứng dụng
    expect(h.repo.activated).toEqual([{ id: ACCOUNT_ID, hash: FAKE_HASH }]);
    expect(h.repo.used).toEqual([{ id: LINK_ID, at: T0 }]);
  });

  it('NSB16-06 đồng hồ ghi `da_dung_luc` là mốc SAU khoá, cắt xuống giây', async () => {
    h.repo.onLockLink = () => {
      vi.setSystemTime(new Date(T0.getTime() + 5_678));
    };
    await h.service.complete(completeInput());
    expect(h.repo.used[0]?.at).toEqual(new Date(T0.getTime() + 5_000));
  });
});

describe('kiểm LẠI dưới khoá (NS-33, NS-36, NS-40)', () => {
  const drifts: [string, (x: Harness) => void][] = [
    [
      'liên kết đã bị dùng',
      (x) => {
        x.repo.lockedLink = goodLink({ daDungLuc: T0 });
      },
    ],
    [
      'liên kết đã bị thu hồi (gửi lại thành công)',
      (x) => {
        x.repo.lockedLink = goodLink({ thuHoiLuc: T0 });
      },
    ],
    [
      'liên kết biến mất',
      (x) => {
        x.repo.lockedLink = null;
      },
    ],
    [
      'tài khoản đã được kích hoạt bởi lần khác',
      (x) => {
        x.accounts.lockedAccount = goodAccount({ trangThai: 'DangHoatDong' });
      },
    ],
    [
      'tài khoản đã bị xoá',
      (x) => {
        x.accounts.lockedAccount = null;
      },
    ],
    [
      'hết hạn trong lúc băm hay chờ khoá (đồng hồ chạy qua hạn)',
      (x) => {
        x.repo.onLockLink = () => {
          vi.setSystemTime(new Date(T0.getTime() + HOUR_MS));
        };
      },
    ],
  ];

  it.each(drifts)(
    'NSB16-07 %s ⇒ LIEN_KET_KHONG_HOP_LE, KHÔNG câu ghi nào, giao dịch kết thúc không ném bên trong',
    async (_label, drift) => {
      drift(h);
      const credential = newCredential();
      const error = await failureOf(() =>
        h.service.complete(completeInput({ matKhauMoi: credential })),
      );
      expect(error.getResponse()).toEqual(
        invalidActivationLink().getResponse(),
      );
      expect(h.journal.calls).toEqual([
        'read',
        'hash',
        'tx:open',
        'lockAccount',
        'lockLink',
        'tx:close',
      ]);
      expect(h.repo.activated).toEqual([]);
      expect(h.repo.used).toEqual([]);
      // Log cảnh báo đúng một dòng, chỉ có mã tài khoản và mã liên kết, không bí mật
      expect(h.logs).toHaveLength(1);
      expect(h.logs[0]).toContain(`Tài khoản ${ACCOUNT_ID}`);
      expect(h.logs[0]).toContain(LINK_ID);
      for (const secret of [rawLinkValue, credential, FAKE_HASH]) {
        expect(h.logs[0]).not.toContain(secret);
      }
    },
  );
});

describe('bất biến bị vi phạm ⇒ lỗi thường, hoàn tác', () => {
  it('NSB16-08 UPDATE tài khoản trả 0 hàng ⇒ ném Error thường (không phải AppException), chưa đánh dấu liên kết', async () => {
    h.repo.activateResult = false;
    const failure = h.service.complete(completeInput());
    await expect(failure).rejects.toThrow(/Không kích hoạt được tài khoản 7/);
    await expect(failure).rejects.not.toBeInstanceOf(AppException);
    expect(h.repo.used).toEqual([]);
    expect(h.journal.calls.at(-1)).toBe('tx:close');
  });

  it('NSB16-08 đánh dấu dùng trả 0 hàng ⇒ ném Error thường (giao dịch hoàn tác ở DB)', async () => {
    h.repo.markUsedResult = false;
    const failure = h.service.complete(completeInput());
    await expect(failure).rejects.toThrow(/Không đánh dấu dùng được liên kết/);
    await expect(failure).rejects.not.toBeInstanceOf(AppException);
  });
});

describe('log sạch (NS-21 mức đơn vị)', () => {
  it('NSB16-09 (NS-21) thành công: ĐÚNG một dòng log, có mã tài khoản và mã liên kết; không token, mật khẩu, băm, ma_bam', async () => {
    const credential = newCredential();
    await h.service.complete(completeInput({ matKhauMoi: credential }));
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toContain(`Tài khoản ${ACCOUNT_ID} đã kích hoạt`);
    expect(h.logs[0]).toContain(LINK_ID);
    const everything = h.logs.join('\n');
    for (const secret of [
      rawLinkValue,
      credential,
      FAKE_HASH,
      hashActivationToken(rawLinkValue),
      '$argon2',
    ]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe('validate không ghi, không khoá (NS-30)', () => {
  it('NSB16-10 (NS-30) liên kết hợp lệ ⇒ { hopLe: true }; chỉ MỘT lần đọc sơ bộ: không băm, không giao dịch, không khoá, không ghi, không log', async () => {
    const result = await h.service.validate(body);
    expect(result).toEqual({ hopLe: true });
    expect(h.journal.calls).toEqual(['read']);
    expect(h.hasher.plain).toEqual([]);
    expect(h.repo.activated).toEqual([]);
    expect(h.repo.used).toEqual([]);
    expect(h.logs).toEqual([]);
  });

  it('NSB16-10 phản hồi chỉ có đúng khoá hopLe (không lộ vai trò, họ tên, email, hạn)', async () => {
    expect(Object.keys(await h.service.validate(body))).toEqual(['hopLe']);
    expect(Object.keys(await h.service.complete(completeInput()))).toEqual([
      'daKichHoat',
    ]);
  });
});
