import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { SESSION_IDLE_MS, SESSION_MAX_MS } from '../auth.constants.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  insertPhienDangNhap,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { PhienDangNhapRepository } from '../repositories/phien-dang-nhap.repository.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import {
  SessionService,
  type IssuedSession,
  type RefreshResult,
} from './session.service.js';
import { TokenService, sha256Hex } from './token.service.js';

// Task A3. Test case (mức dịch vụ, MySQL thật, đồng hồ giả): DN-27, DN-28, DN-29, DN-30, DN-31, DN-35, DX-01..DX-06,
// DM-07, QM-16, SE-03; Q29 của module admin (thu hồi phiên cùng giao dịch với khoá tài khoản); H12/N4 (đồng thời).
// Endpoint HTTP của từng use case được kiểm ở các task A8–A13.
const T0 = new Date('2026-10-27T01:00:00.000Z'); // 08:00:00 giờ Việt Nam, đúng giây
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const advanceTo = (seconds: number) => vi.setSystemTime(at(seconds));
const IDLE = SESSION_IDLE_MS / 1000; // 1800 giây
const MAX = SESSION_MAX_MS / 1000; // 28800 giây

let db: DataSource;
let tokens: TokenService;
let sessions: SessionService;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  tokens = new TokenService(createTestConfigService());
  sessions = new SessionService(new PhienDangNhapRepository(db), tokens);
});

beforeEach(async () => {
  await resetTables(db);
  vi.useFakeTimers({ toFake: ['Date'] }); // chỉ giả Date; bộ hẹn giờ thật vẫn chạy nên kết nối MySQL không bị ảnh hưởng
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db?.destroy();
});

const sessionRow = (id: string) =>
  db.getRepository(PhienDangNhap).findOneByOrFail({ phienDangNhapId: id });
const setSession = (id: string, values: Partial<PhienDangNhap>) =>
  db.getRepository(PhienDangNhap).update({ phienDangNhapId: id }, values);

async function newAccount(overrides: Partial<TaiKhoan> = {}) {
  return (await insertTaiKhoan(db, overrides)).taiKhoanId;
}

async function login(accountId: string): Promise<IssuedSession> {
  return sessions.create(accountId);
}

// Làm mới và bắt buộc thành công (dùng cho phần chuẩn bị của ca khác)
async function refreshOk(refreshToken: string): Promise<IssuedSession> {
  const result = await sessions.refresh(refreshToken);
  if (!result.ok) throw new Error(`làm mới thất bại: ${result.reason}`);
  return result.tokens;
}

const failure = (result: RefreshResult) => (result.ok ? 'ok' : result.reason);

describe('create — đăng nhập tạo phiên (DN-29, SE-03)', () => {
  it('tao_luc = bây giờ, het_han_luc = +30 phút; DB chỉ lưu SHA-256 của token, không có bản rõ', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    const row = await sessionRow(issued.sessionId);

    expect(row.taiKhoanId).toBe(accountId);
    expect(row.taoLuc).toEqual(T0);
    expect(row.hetHanLuc).toEqual(at(IDLE));
    expect(row.thuHoiLuc).toBeNull();
    expect(row.refreshTokenBam).toBe(sha256Hex(issued.refreshToken));
    expect(row.refreshTokenBam).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(issued.refreshToken);
    expect(issued.refreshToken.startsWith(`${issued.sessionId}.`)).toBe(true);
    expect(issued.refreshTokenExpiresAt).toEqual(at(IDLE));
  });

  it('access token mang đúng tài khoản và phiên, sống 15 phút', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    expect(await tokens.verifyAccessToken(issued.accessToken)).toEqual({
      accountId,
      sessionId: issued.sessionId,
    });
    expect(issued.accessTokenExpiresAt).toEqual(at(15 * 60));
  });

  it('hai lần đăng nhập cho hai phiên độc lập với token và băm khác nhau', async () => {
    const accountId = await newAccount();
    const [a, b] = [await login(accountId), await login(accountId)];
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.refreshToken).not.toBe(b.refreshToken);
    expect((await sessionRow(a.sessionId)).refreshTokenBam).not.toBe(
      (await sessionRow(b.sessionId)).refreshTokenBam,
    );
  });

  it('cắt mili giây: giờ lẻ 08:00:00.900 vẫn lưu tao_luc 08:00:00 (DATETIME chỉ có giây)', async () => {
    vi.setSystemTime(new Date(T0.getTime() + 900));
    const issued = await login(await newAccount());
    expect((await sessionRow(issued.sessionId)).taoLuc).toEqual(T0);
  });

  it('chạy trong giao dịch của người gọi: lỗi sau đó thì ROLLBACK, không còn phiên nào', async () => {
    const accountId = await newAccount();
    await expect(
      db.transaction(async (manager) => {
        await sessions.create(accountId, { manager });
        throw new Error('lỗi giả lập sau khi tạo phiên');
      }),
    ).rejects.toThrow('lỗi giả lập');
    expect(await db.getRepository(PhienDangNhap).count()).toBe(0);
  });

  it('tài khoản không tồn tại bị khóa ngoại từ chối, không để lại hàng nào', async () => {
    await expect(sessions.create('999999')).rejects.toThrow();
    expect(await db.getRepository(PhienDangNhap).count()).toBe(0);
  });
});

describe('refresh — làm mới có xoay (DN-27)', () => {
  it('trả token mới khác cũ; băm trong DB thay; het_han_luc dời; tao_luc giữ nguyên; access mới', async () => {
    const accountId = await newAccount();
    const first = await login(accountId);
    advanceTo(600);
    const result = await sessions.refresh(first.refreshToken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.tokens;

    expect(result.accountId).toBe(accountId);
    expect(next.sessionId).toBe(first.sessionId);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.accessToken).not.toBe(first.accessToken);
    expect(await tokens.verifyAccessToken(next.accessToken)).toEqual({
      accountId,
      sessionId: first.sessionId,
    });

    const row = await sessionRow(first.sessionId);
    expect(row.refreshTokenBam).toBe(sha256Hex(next.refreshToken));
    expect(row.refreshTokenBam).not.toBe(sha256Hex(first.refreshToken));
    expect(row.taoLuc).toEqual(T0);
    expect(row.hetHanLuc).toEqual(at(600 + IDLE)); // min(bây giờ + 30 phút, tao_luc + 8 giờ) = bây giờ + 30 phút
    expect(next.refreshTokenExpiresAt).toEqual(at(600 + IDLE));
    expect(row.thuHoiLuc).toBeNull();
  });

  it('gần trần 8 giờ: het_han_luc bị kẹp ở tao_luc + 8 giờ và access token không sống quá trần', async () => {
    const issued = await login(await newAccount());
    await setSession(issued.sessionId, { hetHanLuc: at(MAX) }); // để hạn không hoạt động không chen vào ca này
    advanceTo(MAX - 600); // 7 giờ 50 phút

    const next = await refreshOk(issued.refreshToken);
    expect((await sessionRow(issued.sessionId)).hetHanLuc).toEqual(at(MAX)); // không phải +30 phút = 8 giờ 20 phút
    expect(next.refreshTokenExpiresAt).toEqual(at(MAX));
    expect(next.accessTokenExpiresAt).toEqual(at(MAX)); // không phải +15 phút = 8 giờ 5 phút
  });

  it('làm mới liên tiếp: mỗi lần dùng token do lần trước trả về đều được', async () => {
    let current = await login(await newAccount());
    for (let minute = 10; minute <= 50; minute += 10) {
      advanceTo(minute * 60);
      current = await refreshOk(current.refreshToken);
    }
    expect((await sessionRow(current.sessionId)).hetHanLuc).toEqual(
      at(50 * 60 + IDLE),
    );
  });
});

describe('refresh — các biên hết hạn và từ chối (DN-28)', () => {
  it.each([
    [IDLE - 1, 'ok'],
    [IDLE, 'IDLE_EXPIRED'],
    [IDLE + 1, 'IDLE_EXPIRED'],
  ])(
    'không hoạt động: sau %i giây → %s (29:59 qua, 30:00 và 30:01 không)',
    async (seconds, expected) => {
      const issued = await login(await newAccount());
      advanceTo(seconds);
      expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
        expected,
      );
    },
  );

  it.each([
    [MAX - 1, 'ok'],
    [MAX, 'ABSOLUTE_EXPIRED'],
    [MAX + 1, 'ABSOLUTE_EXPIRED'],
  ])(
    'trần 8 giờ: sau %i giây → %s (7:59:59 qua, 8:00:00 và 8:00:01 không)',
    async (seconds, expected) => {
      const issued = await login(await newAccount());
      await setSession(issued.sessionId, { hetHanLuc: at(MAX + 3600) }); // hạn không hoạt động còn dài
      advanceTo(seconds);
      expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
        expected,
      );
    },
  );

  it('đã hết hạn thì không xoay: băm và het_han_luc giữ nguyên', async () => {
    const issued = await login(await newAccount());
    advanceTo(IDLE + 5);
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
      'IDLE_EXPIRED',
    );
    const row = await sessionRow(issued.sessionId);
    expect(row.refreshTokenBam).toBe(sha256Hex(issued.refreshToken));
    expect(row.hetHanLuc).toEqual(at(IDLE));
    expect(row.thuHoiLuc).toBeNull();
  });

  it('phiên đã thu hồi → SESSION_REVOKED, không đổi mốc thu hồi', async () => {
    const issued = await login(await newAccount());
    await sessions.revoke(issued.sessionId);
    advanceTo(30);
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
      'SESSION_REVOKED',
    );
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).toEqual(T0);
  });

  it('tài khoản không còn DangHoatDong → ACCOUNT_INACTIVE và không xoay; có lại DangHoatDong thì làm mới được', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: accountId }, { trangThai: 'NgungHoatDong' });
    advanceTo(60);
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
      'ACCOUNT_INACTIVE',
    );
    expect((await sessionRow(issued.sessionId)).refreshTokenBam).toBe(
      sha256Hex(issued.refreshToken),
    );

    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: accountId }, { trangThai: 'DangHoatDong' });
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe('ok');
  });

  it('nhân sự ChoKichHoat cũng bị từ chối', async () => {
    const accountId = await newAccount({
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    const stray = await insertPhienDangNhap(db, accountId); // phiên "lạc" để thử, thực tế nhân sự chưa kích hoạt không có phiên
    const { token, hash } = tokens.issueRefreshToken(stray.phienDangNhapId);
    await setSession(stray.phienDangNhapId, { refreshTokenBam: hash });
    expect(failure(await sessions.refresh(token))).toBe('ACCOUNT_INACTIVE');
  });

  it('chữ ký hợp lệ nhưng phiên không còn trong DB → SESSION_NOT_FOUND', async () => {
    const { token } = tokens.issueRefreshToken('987654321');
    expect(failure(await sessions.refresh(token))).toBe('SESSION_NOT_FOUND');
  });
});

describe('refresh — dùng lại token cũ bị phát hiện (DN-30)', () => {
  it('token cũ (chữ ký hợp lệ, băm không khớp) → REUSE_DETECTED, phiên bị thu hồi, token mới của phiên cũng vô hiệu', async () => {
    const first = await login(await newAccount());
    advanceTo(60);
    const second = await refreshOk(first.refreshToken);

    advanceTo(120);
    expect(failure(await sessions.refresh(first.refreshToken))).toBe(
      'REUSE_DETECTED',
    );
    expect((await sessionRow(first.sessionId)).thuHoiLuc).toEqual(at(120));

    advanceTo(180);
    expect(failure(await sessions.refresh(second.refreshToken))).toBe(
      'SESSION_REVOKED',
    );
    expect((await sessionRow(first.sessionId)).thuHoiLuc).toEqual(at(120)); // mốc thu hồi đầu tiên không bị ghi đè
  });

  it('token cũ từ hai lần xoay trước cũng bị coi là dùng lại', async () => {
    const first = await login(await newAccount());
    advanceTo(60);
    const second = await refreshOk(first.refreshToken);
    advanceTo(120);
    await refreshOk(second.refreshToken);
    advanceTo(180);
    expect(failure(await sessions.refresh(first.refreshToken))).toBe(
      'REUSE_DETECTED',
    );
  });

  it('chỉ thu hồi phiên bị dùng lại, các phiên khác của tài khoản vẫn sống', async () => {
    const accountId = await newAccount();
    const [a, b] = [await login(accountId), await login(accountId)];
    advanceTo(60);
    await refreshOk(a.refreshToken);
    await sessions.refresh(a.refreshToken); // dùng lại token cũ của phiên a
    expect((await sessionRow(a.sessionId)).thuHoiLuc).not.toBeNull();
    expect((await sessionRow(b.sessionId)).thuHoiLuc).toBeNull();
    expect(failure(await sessions.refresh(b.refreshToken))).toBe('ok');
  });
});

describe('refresh — token giả không làm hại phiên nào (DN-31)', () => {
  it('sid bị sửa sang phiên khác: INVALID_TOKEN, cả hai phiên nguyên vẹn', async () => {
    const accountId = await newAccount();
    const [a, b] = [await login(accountId), await login(accountId)];
    const [, random, signature] = a.refreshToken.split('.') as [
      string,
      string,
      string,
    ];
    expect(
      failure(await sessions.refresh(`${b.sessionId}.${random}.${signature}`)),
    ).toBe('INVALID_TOKEN');

    for (const issued of [a, b]) {
      const row = await sessionRow(issued.sessionId);
      expect(row.thuHoiLuc).toBeNull();
      expect(row.refreshTokenBam).toBe(sha256Hex(issued.refreshToken));
    }
  });

  it('chuỗi rác, token ký bằng khoá khác, access token đưa nhầm làm refresh token: INVALID_TOKEN, không thu hồi gì', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    const foreign = new TokenService(
      createTestConfigService({ JWT_REFRESH_SECRET: 'f'.repeat(40) }),
    ).issueRefreshToken(issued.sessionId);
    for (const junk of [
      '',
      'abc',
      issued.accessToken,
      foreign.token,
      `${issued.refreshToken}x`,
    ]) {
      expect(failure(await sessions.refresh(junk)), junk.slice(0, 15)).toBe(
        'INVALID_TOKEN',
      );
    }
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).toBeNull();
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe('ok'); // token thật vẫn dùng được
  });
});

describe('resolveActive — kiểm phiên cho guard của mỗi request (DN-35, DX-02, H14)', () => {
  it('phiên còn hiệu lực: trả mã phiên, mã tài khoản và vai trò', async () => {
    const accountId = await newAccount({ loaiTaiKhoan: 'BacSi' });
    const issued = await login(accountId);
    expect(
      await sessions.resolveActive({ accountId, sessionId: issued.sessionId }),
    ).toEqual({
      sessionId: issued.sessionId,
      accountId,
      role: 'BacSi',
    });
  });

  it('sau khi thu hồi (đăng xuất) → null ngay lập tức (DX-02)', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    await sessions.revoke(issued.sessionId);
    expect(
      await sessions.resolveActive({ accountId, sessionId: issued.sessionId }),
    ).toBeNull();
  });

  it('sai chủ: mã phiên của tài khoản này nhưng claims ghi tài khoản khác → null', async () => {
    const [owner, other] = [await newAccount(), await newAccount()];
    const issued = await login(owner);
    expect(
      await sessions.resolveActive({
        accountId: other,
        sessionId: issued.sessionId,
      }),
    ).toBeNull();
    expect(
      await sessions.resolveActive({ accountId: owner, sessionId: '999999' }),
    ).toBeNull();
  });

  it('tài khoản bị ngưng hoạt động → null (Q29: hiệu lực tức thì, không cần chờ refresh)', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: accountId }, { trangThai: 'NgungHoatDong' });
    expect(
      await sessions.resolveActive({ accountId, sessionId: issued.sessionId }),
    ).toBeNull();
  });

  it('trần 8 giờ: qua 7:59:59 còn, đến 8:00:00 thì hết (DN-35)', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    advanceTo(MAX - 1);
    expect(
      await sessions.resolveActive({ accountId, sessionId: issued.sessionId }),
    ).not.toBeNull();
    advanceTo(MAX);
    expect(
      await sessions.resolveActive({ accountId, sessionId: issued.sessionId }),
    ).toBeNull();
  });

  it('access token cấp lúc 7:59 dùng lúc 8:05: bị chặn ở cả tầng token lẫn tầng phiên (DN-35, H14)', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    await setSession(issued.sessionId, { hetHanLuc: at(MAX) });
    advanceTo(MAX - 60); // 7:59
    const next = await refreshOk(issued.refreshToken);
    expect(next.accessTokenExpiresAt).toEqual(at(MAX)); // chỉ còn 1 phút chứ không phải 15 phút

    advanceTo(MAX + 300); // 8:05
    expect(await tokens.verifyAccessToken(next.accessToken)).toBeNull();
    expect(
      await sessions.resolveActive({ accountId, sessionId: issued.sessionId }),
    ).toBeNull();
  });

  it('H14: hạn KHÔNG hoạt động chỉ đo ở lần làm mới, guard không kiểm — quá 30 phút chưa làm mới vẫn qua guard', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    advanceTo(IDLE + 600);
    expect(
      await sessions.resolveActive({ accountId, sessionId: issued.sessionId }),
    ).not.toBeNull();
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
      'IDLE_EXPIRED',
    );
  });
});

describe('revoke / revokeByRefreshToken — đăng xuất (DX-01..DX-06)', () => {
  it('đặt thu_hoi_luc của phiên; refresh với token đó bị từ chối (DX-01)', async () => {
    const issued = await login(await newAccount());
    advanceTo(100);
    expect(await sessions.revoke(issued.sessionId)).toBe(true);
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).toEqual(at(100));
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
      'SESSION_REVOKED',
    );
  });

  it('chỉ thu hồi phiên hiện tại, phiên ở thiết bị khác vẫn dùng được (DX-03)', async () => {
    const accountId = await newAccount();
    const [here, elsewhere] = [await login(accountId), await login(accountId)];
    await sessions.revoke(here.sessionId);
    expect(
      await sessions.resolveActive({
        accountId,
        sessionId: elsewhere.sessionId,
      }),
    ).not.toBeNull();
    expect(failure(await sessions.refresh(elsewhere.refreshToken))).toBe('ok');
  });

  it('đăng xuất hai lần: lần hai trả false và KHÔNG ghi đè mốc thu hồi đầu (DX-05, DX-04)', async () => {
    const issued = await login(await newAccount());
    advanceTo(100);
    expect(await sessions.revoke(issued.sessionId)).toBe(true);
    advanceTo(500);
    expect(await sessions.revoke(issued.sessionId)).toBe(false);
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).toEqual(at(100));
  });

  it('phiên đã hết hạn hoặc không tồn tại: không lỗi (idempotent) (DX-04)', async () => {
    const issued = await login(await newAccount());
    advanceTo(IDLE * 3); // đã hết hạn không hoạt động nhưng chưa thu hồi
    await expect(sessions.revoke(issued.sessionId)).resolves.toBe(true);
    await expect(sessions.revoke('123456789')).resolves.toBe(false);
  });

  it('revokeByRefreshToken: token hợp lệ thu hồi phiên; token cũ (đã xoay) vẫn nhận ra phiên nhờ chữ ký', async () => {
    const accountId = await newAccount();
    const first = await login(accountId);
    advanceTo(60);
    const second = await refreshOk(first.refreshToken);
    expect(await sessions.revokeByRefreshToken(first.refreshToken)).toBe(true); // token cũ nhưng chữ ký đúng
    expect((await sessionRow(first.sessionId)).thuHoiLuc).toEqual(at(60));
    expect(await sessions.revokeByRefreshToken(second.refreshToken)).toBe(
      false,
    ); // đã thu hồi, không ghi đè
  });

  it('không cookie / token rác / token ký khoá khác: trả false, không thu hồi phiên nào (DX-06)', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    const foreign = new TokenService(
      createTestConfigService({ JWT_REFRESH_SECRET: 'g'.repeat(40) }),
    ).issueRefreshToken(issued.sessionId);
    for (const junk of ['', 'abc', foreign.token, issued.accessToken]) {
      expect(await sessions.revokeByRefreshToken(junk), junk.slice(0, 15)).toBe(
        false,
      );
    }
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).toBeNull();
  });
});

describe('revokeAll — thu hồi hàng loạt (QM-16, DM-07, Q8, Q29)', () => {
  it('thu hồi mọi phiên chưa thu hồi của tài khoản, không đụng tài khoản khác, không ghi đè mốc cũ (QM-16)', async () => {
    const [accountId, otherId] = [await newAccount(), await newAccount()];
    const mine = [
      await login(accountId),
      await login(accountId),
      await login(accountId),
    ];
    const theirs = await login(otherId);
    advanceTo(50);
    await sessions.revoke(mine[0]!.sessionId); // đã thu hồi từ trước

    advanceTo(200);
    expect(await sessions.revokeAll(accountId)).toBe(2); // chỉ đếm phiên vừa bị thu hồi
    expect((await sessionRow(mine[0]!.sessionId)).thuHoiLuc).toEqual(at(50));
    expect((await sessionRow(mine[1]!.sessionId)).thuHoiLuc).toEqual(at(200));
    expect((await sessionRow(mine[2]!.sessionId)).thuHoiLuc).toEqual(at(200));
    expect((await sessionRow(theirs.sessionId)).thuHoiLuc).toBeNull();
    for (const issued of mine) {
      expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
        'SESSION_REVOKED',
      );
    }
  });

  it('exceptSessionId: giữ phiên hiện tại, thu hồi các phiên khác (DM-07, Q8)', async () => {
    const accountId = await newAccount();
    const [current, other1, other2] = [
      await login(accountId),
      await login(accountId),
      await login(accountId),
    ];
    expect(
      await sessions.revokeAll(accountId, {
        exceptSessionId: current.sessionId,
      }),
    ).toBe(2);
    expect((await sessionRow(current.sessionId)).thuHoiLuc).toBeNull();
    expect((await sessionRow(other1.sessionId)).thuHoiLuc).not.toBeNull();
    expect((await sessionRow(other2.sessionId)).thuHoiLuc).not.toBeNull();
  });

  it('tài khoản không có phiên nào: trả 0, không lỗi', async () => {
    expect(await sessions.revokeAll(await newAccount())).toBe(0);
  });

  it('cùng giao dịch với khoá tài khoản (Q29): commit thì cả hai có hiệu lực', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    await db.transaction(async (manager) => {
      await manager.update(
        TaiKhoan,
        { taiKhoanId: accountId },
        { trangThai: 'NgungHoatDong' },
      );
      await sessions.revokeAll(accountId, { manager });
    });
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: accountId })
      ).trangThai,
    ).toBe('NgungHoatDong');
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).not.toBeNull();
  });

  it('cùng giao dịch với khoá tài khoản (Q29, TK-24): lỗi giữa chừng thì ROLLBACK cả hai', async () => {
    const accountId = await newAccount();
    const issued = await login(accountId);
    await expect(
      db.transaction(async (manager) => {
        await manager.update(
          TaiKhoan,
          { taiKhoanId: accountId },
          { trangThai: 'NgungHoatDong' },
        );
        await sessions.revokeAll(accountId, { manager });
        throw new Error('lỗi giả lập khi thu hồi phiên');
      }),
    ).rejects.toThrow('lỗi giả lập');
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: accountId })
      ).trangThai,
    ).toBe('DangHoatDong');
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).toBeNull();
  });
});

describe('rotateRefreshToken — đổi mật khẩu xoay token phiên hiện tại (DM-07)', () => {
  it('trả token mới, thay băm; token cũ bị từ chối; token mới dùng được', async () => {
    const issued = await login(await newAccount());
    advanceTo(120);
    const rotated = await sessions.rotateRefreshToken(issued.sessionId);
    expect(rotated).not.toBeNull();
    expect(rotated?.refreshToken).not.toBe(issued.refreshToken);
    expect(rotated?.refreshTokenExpiresAt).toEqual(at(120 + IDLE));
    const row = await sessionRow(issued.sessionId);
    expect(row.refreshTokenBam).toBe(sha256Hex(rotated?.refreshToken ?? ''));
    expect(row.hetHanLuc).toEqual(at(120 + IDLE));

    expect(failure(await sessions.refresh(rotated?.refreshToken ?? ''))).toBe(
      'ok',
    );
  });

  it('token cũ của phiên đã xoay bị từ chối (và bị coi là dùng lại)', async () => {
    const issued = await login(await newAccount());
    await sessions.rotateRefreshToken(issued.sessionId);
    advanceTo(30);
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe(
      'REUSE_DETECTED',
    );
  });

  it('kẹp theo trần 8 giờ', async () => {
    const issued = await login(await newAccount());
    advanceTo(MAX - 100);
    const rotated = await sessions.rotateRefreshToken(issued.sessionId);
    expect(rotated?.refreshTokenExpiresAt).toEqual(at(MAX));
  });

  it('phiên đã thu hồi, quá trần 8 giờ hoặc không tồn tại → null và không đổi gì', async () => {
    const [revoked, old] = [
      await login(await newAccount()),
      await login(await newAccount()),
    ];
    await sessions.revoke(revoked.sessionId);
    expect(await sessions.rotateRefreshToken(revoked.sessionId)).toBeNull();
    expect((await sessionRow(revoked.sessionId)).refreshTokenBam).toBe(
      sha256Hex(revoked.refreshToken),
    );

    advanceTo(MAX);
    expect(await sessions.rotateRefreshToken(old.sessionId)).toBeNull();
    expect(await sessions.rotateRefreshToken('999999')).toBeNull();
  });

  it('chạy trong giao dịch của người gọi: ROLLBACK thì token cũ vẫn là token hiện tại', async () => {
    const issued = await login(await newAccount());
    await expect(
      db.transaction(async (manager) => {
        await sessions.rotateRefreshToken(issued.sessionId, { manager });
        throw new Error('lỗi giả lập khi đổi mật khẩu');
      }),
    ).rejects.toThrow('lỗi giả lập');
    expect((await sessionRow(issued.sessionId)).refreshTokenBam).toBe(
      sha256Hex(issued.refreshToken),
    );
    expect(failure(await sessions.refresh(issued.refreshToken))).toBe('ok');
  });
});

describe('đồng thời — khoá hàng khi xoay (H12, N4)', () => {
  it('hai yêu cầu cùng token: đúng MỘT thành công, yêu cầu kia bị coi là dùng lại và phiên bị thu hồi', async () => {
    const issued = await login(await newAccount());
    advanceTo(60);
    const results = await Promise.all([
      sessions.refresh(issued.refreshToken),
      sessions.refresh(issued.refreshToken),
    ]);
    expect(results.map(failure).sort()).toEqual(['REUSE_DETECTED', 'ok']);
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).not.toBeNull();
  });

  it('mười yêu cầu cùng token: đúng một thành công, không có hai token cùng được cấp', async () => {
    const issued = await login(await newAccount());
    advanceTo(60);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => sessions.refresh(issued.refreshToken)),
    );

    const succeeded = results.filter((result) => result.ok);
    expect(succeeded).toHaveLength(1);
    const others = results.filter((result) => !result.ok).map(failure);
    expect(others).toHaveLength(9);
    expect(others).toContain('REUSE_DETECTED');
    for (const reason of others)
      expect(['REUSE_DETECTED', 'SESSION_REVOKED']).toContain(reason);
    expect((await sessionRow(issued.sessionId)).thuHoiLuc).not.toBeNull();
  });

  it('hai phiên khác nhau làm mới cùng lúc không cản nhau', async () => {
    const accountId = await newAccount();
    const [a, b] = [await login(accountId), await login(accountId)];
    advanceTo(60);
    const results = await Promise.all([
      sessions.refresh(a.refreshToken),
      sessions.refresh(b.refreshToken),
    ]);
    expect(results.map(failure)).toEqual(['ok', 'ok']);
  });

  it('làm mới đúng lúc admin khoá tài khoản: không deadlock, kết cục luôn là mọi phiên bị thu hồi (Q29)', async () => {
    for (let round = 0; round < 15; round++) {
      const accountId = await newAccount();
      const issued = await login(accountId);
      advanceTo(60 + round);
      const [refreshResult] = await Promise.all([
        sessions.refresh(issued.refreshToken),
        db.transaction(async (manager) => {
          await manager.update(
            TaiKhoan,
            { taiKhoanId: accountId },
            { trangThai: 'NgungHoatDong' },
          );
          await sessions.revokeAll(accountId, { manager });
        }),
      ]);
      expect(['ok', 'ACCOUNT_INACTIVE', 'SESSION_REVOKED']).toContain(
        failure(refreshResult),
      );
      const rows = await db
        .getRepository(PhienDangNhap)
        .find({ where: { taiKhoanId: accountId } });
      expect(
        rows.every((row) => row.thuHoiLuc !== null),
        `vòng ${round}`,
      ).toBe(true);
      expect(
        await sessions.resolveActive({
          accountId,
          sessionId: issued.sessionId,
        }),
      ).toBeNull();
    }
  });

  it('làm mới song song với thu hồi hàng loạt: không có phiên nào còn sống sau đó', async () => {
    for (let round = 0; round < 15; round++) {
      const accountId = await newAccount();
      const issued = await login(accountId);
      advanceTo(30 + round);
      await Promise.all([
        sessions.refresh(issued.refreshToken),
        sessions.revokeAll(accountId),
      ]);
      const rows = await db
        .getRepository(PhienDangNhap)
        .find({ where: { taiKhoanId: accountId } });
      expect(
        rows.filter((row) => row.thuHoiLuc === null),
        `vòng ${round}`,
      ).toHaveLength(0);
    }
  });
});
