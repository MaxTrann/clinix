import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  changeInput,
  changeServiceFor,
  hashOf,
  queuedOnAccount,
  with401Code,
} from '../testing/change-password-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  loginBody,
  newLoginAccount,
  sessionRowsOf,
} from '../testing/login-int-helpers.js';
import {
  freshFixture,
  type MultiFixture,
} from '../testing/multi-account-helpers.js';
import {
  NEW_PASSWORD,
  resetInput,
  resetServicesFor,
  together,
  tokenFor,
} from '../testing/reset-password-int-helpers.js';
import {
  deferred,
  serverDeadlocks,
  sleep,
} from '../testing/verification-int-helpers.js';

// Task A13 — đổi mật khẩu đua trên CÙNG một tài khoản, MySQL 8.4 thật: thả tự do qua rào chắn và ép thứ tự CẢ HAI CHIỀU bằng chờ khoá thật (`queuedOnAccount`).
// Bộ đo 1213 và 1205 theo thứ tự khoá: session-revoke.race.int-spec.ts. Mã MDK-nn là [đề xuất]. Số vòng CHANGE_RACE_ROUNDS (mặc định 12).
const ROUNDS = Number(process.env['CHANGE_RACE_ROUNDS'] ?? 12);
const TEST_TIMEOUT = Math.max(60_000, ROUNDS * 3_000); // hạn mỗi test tăng theo số vòng
const WRONG = 'MAT_KHAU_CU_SAI';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';

let db: DataSource;
let fx: MultiFixture;

useIntegrationHooks((testDb) => {
  db = testDb;
});

beforeEach(async () => {
  fx = await freshFixture(db);
});

const passwordIs = async (taiKhoanId: string, plain: string) =>
  fx.hasher.verify(await hashOf(db, taiKhoanId), plain);
const lockAccount = (taiKhoanId: string) =>
  db.transaction('READ COMMITTED', async (manager) => {
    await manager.update(
      TaiKhoan,
      { taiKhoanId },
      { trangThai: 'NgungHoatDong' },
    );
    await fx.sessionService.revokeAll(taiKhoanId, { manager });
  });
const liveIds = async (taiKhoanId: string) =>
  (await sessionRowsOf(db, taiKhoanId))
    .filter((row) => row.thuHoiLuc === null)
    .map((row) => row.phienDangNhapId);

describe('hai lần đổi', { timeout: TEST_TIMEOUT }, () => {
  it(`MDK-01 hai lần đổi cùng mật khẩu cũ từ HAI phiên, thả tự do (${String(ROUNDS)} vòng): đúng MỘT thành công, bên kia 400; mật khẩu là của bên thắng, phiên bên thua bị thu hồi`, async () => {
    const service = changeServiceFor(db, fx);
    const deadlocksBefore = await serverDeadlocks(db);
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newLoginAccount(db);
      const sessions = [
        await fx.sessionService.create(account.taiKhoanId),
        await fx.sessionService.create(account.taiKhoanId),
      ];
      const passwords = ['Thang-Cuoc-A-1!', 'Thang-Cuoc-B-2!'];

      const codes = await together(
        sessions.map(
          (session, i) => () =>
            service.change({
              ...changeInput(account.taiKhoanId, session),
              matKhauMoi: passwords[i] ?? '',
            }),
        ),
      );

      expect([...codes].sort(), `vòng ${String(round)}`).toEqual([WRONG, 'ok']);
      const winner = codes.indexOf('ok');
      expect(
        await passwordIs(account.taiKhoanId, passwords[winner] ?? ''),
      ).toBe(true);
      expect(await liveIds(account.taiKhoanId)).toEqual([
        sessions[winner]?.sessionId,
      ]);
    }
    expect((await serverDeadlocks(db)) - deadlocksBefore).toBe(0);
  });
});

describe('hai lần đổi trên CÙNG một phiên', { timeout: TEST_TIMEOUT }, () => {
  it(`MDK-11 cùng mật khẩu cũ, cùng phiên, thả tự do (${String(ROUNDS)} vòng): đúng MỘT thành công, bên kia 400, phiên vẫn sống`, async () => {
    const service = changeServiceFor(db, fx);
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newLoginAccount(db);
      const session = await fx.sessionService.create(account.taiKhoanId);

      const codes = await together([
        () => service.change(changeInput(account.taiKhoanId, session)),
        () => service.change(changeInput(account.taiKhoanId, session)),
      ]);

      expect([...codes].sort(), `vòng ${String(round)}`).toEqual([WRONG, 'ok']);
      expect(await liveIds(account.taiKhoanId)).toEqual([session.sessionId]);
    }
  });
});

describe('đăng nhập bằng mật khẩu cũ', () => {
  it('MDK-12 đăng nhập TRƯỚC, đổi SAU: phiên mới bị thu hồi, chỉ còn phiên hiện tại', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    expect(
      await queuedOnAccount(
        db,
        account.taiKhoanId,
        () => fx.login.login(loginBody(account)),
        () => change.change(changeInput(account.taiKhoanId, session)),
      ),
    ).toEqual(['ok', 'ok']);

    expect(await liveIds(account.taiKhoanId)).toEqual([session.sessionId]);
  });

  it('MDK-13 đổi TRƯỚC, đăng nhập SAU: 401 DANG_NHAP_SAI, không có phiên mới', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    expect(
      await queuedOnAccount(
        db,
        account.taiKhoanId,
        () => change.change(changeInput(account.taiKhoanId, session)),
        () => fx.login.login(loginBody(account)),
      ),
    ).toEqual(['ok', 'DANG_NHAP_SAI']);

    expect(await liveIds(account.taiKhoanId)).toEqual([session.sessionId]);
  });
});

describe('ép thứ tự cả hai chiều bằng chờ khoá thật', () => {
  it('MDK-02 đổi TRƯỚC, đặt lại mật khẩu SAU: cả hai thành công, mật khẩu của bên đặt lại, không còn phiên nào', async () => {
    const reset = resetServicesFor(db, fx);
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const token = await tokenFor({ ...reset, mail: fx.mail }, account.email);

    const codes = await queuedOnAccount(
      db,
      account.taiKhoanId,
      () => change.change(changeInput(account.taiKhoanId, session)),
      () => reset.reset.reset(resetInput(token, 'Dat-Lai-Sau-9!')),
    );

    expect(codes).toEqual(['ok', 'ok']);
    expect(await passwordIs(account.taiKhoanId, 'Dat-Lai-Sau-9!')).toBe(true);
    expect(await liveIds(account.taiKhoanId)).toEqual([]);
  });

  it('MDK-03 đặt lại TRƯỚC, đổi SAU: mật khẩu cũ đã so là của băm cũ nên đổi 400 (hoặc 401 nếu đọc sau khi thu hồi); mật khẩu của bên đặt lại', async () => {
    const reset = resetServicesFor(db, fx);
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const token = await tokenFor({ ...reset, mail: fx.mail }, account.email);

    // Giữ phần đổi ở ngay trước giao dịch: nó đã so xong mật khẩu cũ với băm CŨ, lúc này bên đặt lại mới chạy
    const verified = deferred();
    const proceed = deferred();
    const realHash = fx.hasher.hash.bind(fx.hasher);
    vi.spyOn(fx.hasher, 'hash').mockImplementationOnce(async (plain) => {
      verified.resolve();
      await proceed.promise;
      return realHash(plain);
    });
    const changing = together([
      with401Code(() =>
        change.change(changeInput(account.taiKhoanId, session)),
      ),
    ]);
    await verified.promise;
    await reset.reset.reset(resetInput(token));
    proceed.resolve();
    const [code] = await changing;

    expect(code).toBe(WRONG); // kiểm băm dưới khoá chặn ghi đè; bỏ kiểm này thì đổi sẽ thắng
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    expect(await liveIds(account.taiKhoanId)).toEqual([]);
  });

  it('MDK-04 đổi TRƯỚC, admin khoá SAU: tài khoản ngưng, mật khẩu mới, không còn phiên', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    expect(
      await queuedOnAccount(
        db,
        account.taiKhoanId,
        () => change.change(changeInput(account.taiKhoanId, session)),
        () => lockAccount(account.taiKhoanId),
      ),
    ).toEqual(['ok', 'ok']);

    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    expect(await liveIds(account.taiKhoanId)).toEqual([]);
  });

  it('MDK-05 admin khoá TRƯỚC, đổi SAU: đổi 401, mật khẩu không đổi', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const before = await hashOf(db, account.taiKhoanId);

    const codes = await queuedOnAccount(
      db,
      account.taiKhoanId,
      () => lockAccount(account.taiKhoanId),
      with401Code(() =>
        change.change(changeInput(account.taiKhoanId, session)),
      ),
    );

    expect(codes).toEqual(['ok', SESSION_LOST]);
    expect(await hashOf(db, account.taiKhoanId)).toBe(before);
  });

  it('MDK-06 đổi TRƯỚC, đăng xuất phiên hiện tại SAU: đổi thành công, đăng xuất vẫn thu hồi được phiên', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    const codes = await queuedOnAccount(
      db,
      account.taiKhoanId,
      () => change.change(changeInput(account.taiKhoanId, session)),
      () => fx.sessionService.revokeByRefreshToken(session.refreshToken),
    );

    expect(codes).toEqual(['ok', 'ok']);
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    expect(await liveIds(account.taiKhoanId)).toEqual([]);
  });

  it('MDK-07 đăng xuất phiên hiện tại TRƯỚC, đổi SAU: đổi 401, mật khẩu không đổi', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const before = await hashOf(db, account.taiKhoanId);

    const codes = await queuedOnAccount(
      db,
      account.taiKhoanId,
      () => fx.sessionService.revokeByRefreshToken(session.refreshToken),
      with401Code(() =>
        change.change(changeInput(account.taiKhoanId, session)),
      ),
    );

    expect(codes).toEqual(['ok', SESSION_LOST]);
    expect(await hashOf(db, account.taiKhoanId)).toBe(before);
  });
});

describe('làm mới cùng phiên', { timeout: TEST_TIMEOUT }, () => {
  it(`MDK-08 đổi × refresh ĐANG BAY của chính phiên hiện tại, thả tự do (${String(ROUNDS)} vòng): không lỗi lạ, không 1213; đổi luôn thành công; mọi vòng phiên hoặc sống hoặc bị thu hồi vì dùng lại (TECH_DEBT dòng 48)`, async () => {
    const service = changeServiceFor(db, fx);
    const deadlocksBefore = await serverDeadlocks(db);
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newLoginAccount(db);
      const session = await fx.sessionService.create(account.taiKhoanId);

      const codes = await together([
        with401Code(() =>
          service.change(changeInput(account.taiKhoanId, session)),
        ),
        () => fx.sessionService.refresh(session.refreshToken),
      ]);

      expect(codes[0], `vòng ${String(round)}`).toBe('ok');
      expect(codes[1], `vòng ${String(round)}`).toBe('ok'); // refresh trả kết quả (ok hoặc dùng lại), không ném
      expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    }
    expect((await serverDeadlocks(db)) - deadlocksBefore).toBe(0);
  });
});

describe('refresh cũ, ép cả hai chiều', () => {
  it('MDK-14 refresh TRƯỚC, đổi SAU: cả hai thành công, phiên sống với token của lần đổi', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    expect((await fx.sessionService.refresh(session.refreshToken)).ok).toBe(
      true,
    );
    const result = await change.change(
      changeInput(account.taiKhoanId, session),
    );

    expect((await fx.sessionService.refresh(result.refreshToken)).ok).toBe(
      true,
    );
  });

  it('MDK-15 đổi commit TRƯỚC, refresh cookie cũ đang bay tới SAU: đổi đã 200 nhưng phiên bị thu hồi vì dùng lại (TECH_DEBT dòng 48), mật khẩu mới vẫn giữ', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    await change.change(changeInput(account.taiKhoanId, session));

    expect(await fx.sessionService.refresh(session.refreshToken)).toEqual({
      ok: false,
      reason: 'REUSE_DETECTED',
    });
    expect(await liveIds(account.taiKhoanId)).toEqual([]);
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
  });
});

describe('thứ tự khoá', () => {
  it('MDK-09 tài khoản đang bị giữ khoá X: đổi mật khẩu chờ ở `tai_khoan`, CHƯA đụng hàng phiên (khoá `tai_khoan` trước `phien_dang_nhap`)', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const locked = deferred();
    const free = deferred();
    const holder = db.transaction('READ COMMITTED', async (em) => {
      await em.query(
        'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
        [account.taiKhoanId],
      );
      locked.resolve();
      await free.promise;
    });
    await locked.promise;
    const changing = change.change(changeInput(account.taiKhoanId, session));
    try {
      await sleep(250); // đủ cho hai lần băm, tới chỗ chờ khoá
      await db.transaction('READ COMMITTED', (em) =>
        em.query(
          'SELECT 1 FROM phien_dang_nhap WHERE phien_dang_nhap_id = ? FOR UPDATE NOWAIT',
          [session.sessionId],
        ),
      );
    } finally {
      free.resolve();
      await holder;
    }
    await changing;
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
  });

  it('MDK-10 giao dịch đi qua `otp.transaction` (READ COMMITTED, không khoá khoảng, A5-C)', async () => {
    const change = changeServiceFor(db, fx);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const transaction = vi.spyOn(fx.otp, 'transaction');

    await change.change(changeInput(account.taiKhoanId, session));

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
