import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { SESSION_IDLE_MS, SESSION_MAX_MS } from '../auth.constants.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { ChangePasswordService } from './change-password.service.js';
import {
  changeInput,
  changeServiceFor,
  hashOf,
} from '../testing/change-password-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  createLoginFixture,
  failureState,
  loginBody,
  loginPasswordHash,
  newLoginAccount,
  sessionRowsOf,
  setFailureState,
  type LoginFixture,
} from '../testing/login-int-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  NEW_PASSWORD,
  accountState,
} from '../testing/reset-password-int-helpers.js';
import { expectRefused } from '../testing/verification-int-helpers.js';

// Task A13 — đổi mật khẩu trên MySQL 8.4 THẬT, đồng hồ giả. Test case: DM-01, DM-02, DM-03, DM-07, DM-08 (DM-04: DTO; DM-05, DM-06: e2e; DM-09: logging; đua: concurrency;
// nhiều tài khoản: multi-account). Mã MD-nn là [đề xuất].
const WRONG = 'MAT_KHAU_CU_SAI';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const IDLE = SESSION_IDLE_MS / 1000;
const MAX = SESSION_MAX_MS / 1000;

let db: DataSource;
let fx: LoginFixture<FakeMailService>;
let service: ChangePasswordService;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createLoginFixture(testDb);
  service = changeServiceFor(testDb, fx);
});

const stateOf = async (taiKhoanId: string) => ({
  ...(await accountState(db, taiKhoanId)),
  sessions: await sessionRowsOf(db, taiKhoanId),
});
const passwordIs = async (taiKhoanId: string, plain: string) =>
  fx.hasher.verify(await hashOf(db, taiKhoanId), plain);

const expectSessionLost = (work: Promise<unknown>) =>
  expect(work).rejects.toThrow(SESSION_LOST);

describe('đổi mật khẩu thành công (DM-01, DM-02, DM-07)', () => {
  it('MD-01 DM-01 mật khẩu mới đăng nhập được, mật khẩu cũ thì không; băm Argon2id đúng tham số; không thư nào; log có mã tài khoản, mã phiên, số phiên', async () => {
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    await service.change(changeInput(account.taiKhoanId, session));

    expect(await hashOf(db, account.taiKhoanId)).toMatch(
      /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/,
    );
    expect(
      (await fx.login.login(loginBody(account, NEW_PASSWORD))).vaiTro,
    ).toBe('BenhNhan');
    await expectRefused(
      fx.login.login(loginBody(account, LOGIN_PASSWORD)),
      401,
      'DANG_NHAP_SAI',
    );
    expect(fx.mail.attempts).toHaveLength(0);
    expect(logs.join('\n')).toContain(
      `Tài khoản ${account.taiKhoanId} đổi mật khẩu (phiên ${session.sessionId}): thu hồi 0 phiên khác`,
    );
  });

  it('MD-02 DM-02 cả bốn vai trò đổi được', async () => {
    const admin = new AdminFixtures(db);
    const branch = await admin.branch();
    const matKhauBam = await loginPasswordHash();
    const accounts = [
      (await admin.patient({ matKhauBam })).account,
      (await admin.doctor(branch, {}, { matKhauBam })).account,
      (await admin.receptionist(branch, { matKhauBam })).account,
      (await admin.admin(branch, { matKhauBam })).account,
    ];
    expect(accounts.map((one) => one.loaiTaiKhoan).sort()).toEqual([
      'BacSi',
      'BenhNhan',
      'LeTan',
      'QuanTriVien',
    ]);

    for (const account of accounts) {
      const session = await fx.sessionService.create(account.taiKhoanId);
      await service.change(changeInput(account.taiKhoanId, session));
      expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    }
  });

  it('MD-03 DM-07 phiên khác bị thu hồi, phiên đã thu hồi giữ mốc cũ, tài khoản khác không bị đụng; phiên hiện tại sống với refresh token MỚI', async () => {
    const account = await newLoginAccount(db);
    const stranger = await newLoginAccount(db);
    const old = await fx.sessionService.create(account.taiKhoanId);
    vi.setSystemTime(at(5));
    await fx.sessionService.revoke(old.sessionId);
    vi.setSystemTime(at(10));
    const current = await fx.sessionService.create(account.taiKhoanId);
    const others = [
      await fx.sessionService.create(account.taiKhoanId),
      await fx.sessionService.create(account.taiKhoanId),
    ];
    const foreign = await fx.sessionService.create(stranger.taiKhoanId);
    vi.setSystemTime(at(20));

    const result = await service.change(
      changeInput(account.taiKhoanId, current),
    );

    const rows = await sessionRowsOf(db, account.taiKhoanId);
    const moment = (id: string) =>
      rows.find((row) => row.phienDangNhapId === id)?.thuHoiLuc;
    expect(moment(old.sessionId)).toEqual(at(5));
    expect(moment(current.sessionId)).toBeNull();
    for (const other of others) expect(moment(other.sessionId)).toEqual(at(20));
    expect(
      (await sessionRowsOf(db, stranger.taiKhoanId))[0]?.thuHoiLuc,
    ).toBeNull();
    expect(result.refreshToken).not.toBe(current.refreshToken);
    expect(result.refreshTokenExpiresAt).toEqual(at(20 + IDLE));

    const access = await fx.sessionService.resolveActive({
      accountId: account.taiKhoanId,
      sessionId: current.sessionId,
    });
    expect(access?.sessionId).toBe(current.sessionId); // access token đang có vẫn dùng được
    expect((await fx.sessionService.refresh(result.refreshToken)).ok).toBe(
      true,
    );
    expect(
      await fx.sessionService.refresh(others[0]?.refreshToken ?? ''),
    ).toEqual({ ok: false, reason: 'SESSION_REVOKED' });
    expect((await fx.sessionService.refresh(foreign.refreshToken)).ok).toBe(
      true,
    );
  });

  it('MD-04 DM-07 refresh token CŨ của phiên hiện tại bị từ chối (coi là dùng lại, phiên bị thu hồi)', async () => {
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    const result = await service.change(
      changeInput(account.taiKhoanId, session),
    );

    expect(await fx.sessionService.refresh(session.refreshToken)).toEqual({
      ok: false,
      reason: 'REUSE_DETECTED',
    });
    expect((await fx.sessionService.refresh(result.refreshToken)).ok).toBe(
      false,
    );
  });

  it('MD-05 mật khẩu mới trùng mật khẩu cũ vẫn đổi được (băm mới, muối mới), phiên khác vẫn bị thu hồi', async () => {
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const other = await fx.sessionService.create(account.taiKhoanId);
    const before = await hashOf(db, account.taiKhoanId);

    await service.change(
      changeInput(account.taiKhoanId, session, LOGIN_PASSWORD, LOGIN_PASSWORD),
    );

    expect(await hashOf(db, account.taiKhoanId)).not.toBe(before);
    expect(await passwordIs(account.taiKhoanId, LOGIN_PASSWORD)).toBe(true);
    const rows = await sessionRowsOf(db, account.taiKhoanId);
    expect(
      rows.find((row) => row.phienDangNhapId === other.sessionId)?.thuHoiLuc,
    ).not.toBeNull();
  });

  it('MD-06 chỉ đổi đúng cột mật khẩu: thành công KHÔNG đụng bộ đếm sai và khoá đăng nhập, không đụng trạng thái hay xác minh email', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 3,
      khoaDangNhapDen: at(900),
    });
    const session = await fx.sessionService.create(account.taiKhoanId);
    const before = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: account.taiKhoanId });

    await service.change(changeInput(account.taiKhoanId, session));

    const after = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: account.taiKhoanId });
    expect(after.matKhauBam).not.toBe(before.matKhauBam);
    after.matKhauBam = before.matKhauBam; // còn lại mọi cột phải y nguyên
    expect(after).toEqual(before);
  });

  it('MD-07 phiên quá hạn không hoạt động mà access token còn hạn vẫn đổi được; hạn mới kẹp theo trần 8 giờ', async () => {
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    vi.setSystemTime(at(MAX - 100));

    const result = await service.change(
      changeInput(account.taiKhoanId, session),
    );

    expect(result.refreshTokenExpiresAt).toEqual(at(MAX));
  });
});

describe('bị từ chối (DM-03, DM-08)', () => {
  it('MD-08 DM-03 mật khẩu cũ sai: 400 MAT_KHAU_CU_SAI, KHÔNG thay đổi gì ở tài khoản và mọi phiên', async () => {
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    await fx.sessionService.create(account.taiKhoanId);
    const before = await stateOf(account.taiKhoanId);

    await expectRefused(
      service.change(changeInput(account.taiKhoanId, session, WRONG_PASSWORD)),
      400,
      WRONG,
    );

    expect(await stateOf(account.taiKhoanId)).toEqual(before);
  });

  it('MD-09 DM-08 sai 12 lần liên tiếp: `so_lan_dang_nhap_sai` và khoá KHÔNG đổi, vẫn đổi được ở lần đúng; bộ đếm đang dở cũng giữ nguyên', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 2,
      khoaDangNhapDen: null,
    });
    const session = await fx.sessionService.create(account.taiKhoanId);

    for (let i = 0; i < 12; i++) {
      await expectRefused(
        service.change(
          changeInput(account.taiKhoanId, session, WRONG_PASSWORD),
        ),
        400,
        WRONG,
      );
    }

    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 2,
      khoaDangNhapDen: null,
    });
    await service.change(changeInput(account.taiKhoanId, session));
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
  });

  it.each([
    ['đã thu hồi', 'revoked'],
    ['quá trần 8 giờ', 'expired'],
    ['không còn hàng', 'gone'],
  ] as const)(
    'MD-10 phiên %s (access token chưa hết hạn): 401, mật khẩu không đổi',
    async (_label, kind) => {
      const account = await newLoginAccount(db);
      const session = await fx.sessionService.create(account.taiKhoanId);
      if (kind === 'revoked') await fx.sessionService.revoke(session.sessionId);
      if (kind === 'expired') vi.setSystemTime(at(MAX));
      if (kind === 'gone') {
        await db
          .getRepository(PhienDangNhap)
          .delete({ phienDangNhapId: session.sessionId });
      }
      const before = await stateOf(account.taiKhoanId);

      await expectSessionLost(
        service.change(changeInput(account.taiKhoanId, session)),
      );

      expect(await stateOf(account.taiKhoanId)).toEqual(before);
    },
  );

  it('MD-11 tài khoản không còn DangHoatDong: 401, mật khẩu không đổi', async () => {
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    await db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: account.taiKhoanId },
        { trangThai: 'NgungHoatDong' },
      );
    const before = await stateOf(account.taiKhoanId);

    await expectSessionLost(
      service.change(changeInput(account.taiKhoanId, session)),
    );

    expect(await stateOf(account.taiKhoanId)).toEqual(before);
  });
});

describe('lỗi giữa chừng hoàn tác trọn', () => {
  /** Lần gọi tới chạy THẬT rồi mới ném: bước đó đã ghi xong, chỉ hoàn tác mới đưa được về trạng thái cũ. */
  const failAfter = <T extends object>(target: T, method: keyof T) => {
    const real = (
      target[method] as (...args: unknown[]) => Promise<unknown>
    ).bind(target);
    vi.spyOn(target, method as never).mockImplementationOnce((async (
      ...args: unknown[]
    ) => {
      await real(...args);
      throw new Error('giả lập mất DB');
    }) as never);
  };

  it.each([
    ['xoay token', () => failAfter(fx.sessions, 'rotate')],
    ['ghi mật khẩu', () => failAfter(fx.accounts, 'setPasswordAfterChange')],
    ['thu hồi phiên khác', () => failAfter(fx.sessions, 'revokeAllActive')],
  ] as const)(
    'MD-12 lỗi ngay sau bước %s: mật khẩu và mọi phiên như trước, refresh token cũ vẫn dùng được, thử lại được',
    async (_label, arm) => {
      const account = await newLoginAccount(db);
      const session = await fx.sessionService.create(account.taiKhoanId);
      await fx.sessionService.create(account.taiKhoanId);
      const before = await stateOf(account.taiKhoanId);
      arm();

      await expect(
        service.change(changeInput(account.taiKhoanId, session)),
      ).rejects.toThrow('giả lập mất DB');

      expect(await stateOf(account.taiKhoanId)).toEqual(before);
      await service.change(changeInput(account.taiKhoanId, session));
      expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    },
  );
});

describe('hai hàm repository của A13', () => {
  it('MD-13 setPasswordAfterChange trả false và không ghi khi tài khoản không còn DangHoatDong; chỉ đọc đúng ba cột ở findForPasswordChange', async () => {
    const account = await newLoginAccount(db);
    const before = await hashOf(db, account.taiKhoanId);
    await db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: account.taiKhoanId },
        { trangThai: 'NgungHoatDong' },
      );

    expect(
      await fx.accounts.setPasswordAfterChange(
        db.manager,
        account.taiKhoanId,
        'bam-khac',
      ),
    ).toBe(false);

    expect(await hashOf(db, account.taiKhoanId)).toBe(before);
    const row = await fx.accounts.findForPasswordChange(
      db.manager,
      account.taiKhoanId,
    );
    const loaded = Object.entries(row ?? {}).filter(
      ([, value]) => value !== undefined,
    );
    expect(loaded.map(([key]) => key).sort()).toEqual([
      'matKhauBam',
      'taiKhoanId',
      'trangThai',
    ]);
  });
});

it('MD-14 lỗi nghiệp vụ là AppException (không phải lỗi lạ) để bộ lọc P5 trả đúng mã', async () => {
  const account = await newLoginAccount(db);
  const session = await fx.sessionService.create(account.taiKhoanId);

  await expect(
    service.change(changeInput(account.taiKhoanId, session, WRONG_PASSWORD)),
  ).rejects.toBeInstanceOf(AppException);
});
