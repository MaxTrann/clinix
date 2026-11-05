import { UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import {
  queuedOnAccount,
  with401Code,
} from '../../auth/testing/change-password-helpers.js';
import { together } from '../../auth/testing/reset-password-int-helpers.js';
import {
  deferred,
  serverDeadlocks,
  sleep,
} from '../../auth/testing/verification-int-helpers.js';
import {
  accountRow,
  CHANGES_A,
  CHANGES_B,
  changedColumns,
  failureOf,
  PROFILE_COLUMNS,
  SESSION_LOST,
  useProfileIntegration,
} from '../testing/profile-update-helpers.js';
import type { ProfileChanges } from './profile.repository.js';
import { ProfileRepository } from './profile.repository.js';
import type { ProfileResponse } from './profile.dto.js';
import type { ProfileService } from './profile.service.js';

// Task B2 — PUT /profile ĐUA NHAU trên MySQL 8.4 thật (HS-23, H10, H9; PLAN patient 3.5, Q24): hai PUT cùng tài khoản thả tự do qua rào chắn và ÉP thứ tự
// bằng chờ khoá thật (`queuedOnAccount`), như auth/change-password/change-password.concurrency.int-spec.ts. Mã ca PUR-nn là [đề xuất] (TRACKING patient B2-G).
// Số vòng PROFILE_RACE_ROUNDS (mặc định 12).
const ROUNDS = Number(process.env['PROFILE_RACE_ROUNDS'] ?? 12);
const TEST_TIMEOUT = Math.max(60_000, ROUNDS * 3_000);

let db: DataSource;
let fx: AdminFixtures;
let service: ProfileService;

useProfileIntegration(
  new ProfileRepository(),
  (testDb, fixtures, profileService) => {
    db = testDb;
    fx = fixtures;
    service = profileService;
  },
);

const BEFORE = {
  hoTen: 'Tên Cũ Giả',
  soDienThoai: '0900000000',
  gioiTinh: null,
  ngaySinh: null,
  diaChi: null,
};

// Năm trường hồ sơ của một phản hồi, để so với một bộ đã gửi
const fieldsOf = (profile: ProfileResponse): ProfileChanges => ({
  hoTen: profile.hoTen,
  soDienThoai: profile.soDienThoai,
  gioiTinh: profile.gioiTinh,
  ngaySinh: profile.ngaySinh,
  diaChi: profile.diaChi,
});

describe('hai PUT cùng tài khoản', { timeout: TEST_TIMEOUT }, () => {
  it(`PUR-01 (HS-23, H10) hai PUT khác dữ liệu, thả tự do (${String(ROUNDS)} vòng): cả hai thành công, MỖI phản hồi là bộ của chính nó, DB cuối bằng đúng MỘT bộ (không trộn trường), 0 deadlock`, async () => {
    const deadlocksBefore = await serverDeadlocks(db);
    for (let round = 0; round < ROUNDS; round++) {
      const { account } = await fx.patient(BEFORE);
      const id = account.taiKhoanId;
      const results: ProfileResponse[] = [];

      const codes = await together(
        [CHANGES_A, CHANGES_B].map((changes, i) => async () => {
          results[i] = await service.updateProfile(id, changes);
        }),
      );

      expect(codes, `vòng ${String(round)}`).toEqual(['ok', 'ok']);
      expect(fieldsOf(results[0] as ProfileResponse)).toEqual(CHANGES_A);
      expect(fieldsOf(results[1] as ProfileResponse)).toEqual(CHANGES_B);
      const final = fieldsOf(await service.getProfile(id));
      expect([CHANGES_A, CHANGES_B], `vòng ${String(round)}`).toContainEqual(
        final,
      );
    }
    expect((await serverDeadlocks(db)) - deadlocksBefore).toBe(0);
  });

  it.each([
    ['A rồi B', CHANGES_A, CHANGES_B],
    ['B rồi A', CHANGES_B, CHANGES_A],
  ] as const)(
    'PUR-02 (HS-23, Q24) ép thứ tự bằng chờ khoá thật, %s: bên sau thắng trọn vẹn, mỗi phản hồi là bộ của chính nó',
    async (_label, firstChanges, secondChanges) => {
      const { account } = await fx.patient(BEFORE);
      const id = account.taiKhoanId;
      let firstResult: ProfileResponse | undefined;
      let secondResult: ProfileResponse | undefined;

      const codes = await queuedOnAccount(
        db,
        id,
        async () => {
          firstResult = await service.updateProfile(id, firstChanges);
        },
        async () => {
          secondResult = await service.updateProfile(id, secondChanges);
        },
      );

      expect(codes).toEqual(['ok', 'ok']);
      expect(fieldsOf(firstResult as ProfileResponse)).toEqual(firstChanges);
      expect(fieldsOf(secondResult as ProfileResponse)).toEqual(secondChanges);
      expect(fieldsOf(await service.getProfile(id))).toEqual(secondChanges);
    },
  );
});

describe('PUT đua với việc khoá tài khoản', { timeout: TEST_TIMEOUT }, () => {
  const lock = (taiKhoanId: string) =>
    db.transaction('READ COMMITTED', async (manager) => {
      await manager.update(
        TaiKhoan,
        { taiKhoanId },
        { trangThai: 'NgungHoatDong' },
      );
    });

  it('PUR-03 (H9) khoá trước ⇒ PUT 401 và năm cột không đổi; PUT trước ⇒ PUT 200 rồi mới khoá', async () => {
    const lockedFirst = await fx.patient(BEFORE);
    const idLocked = lockedFirst.account.taiKhoanId;
    const beforeLocked = await accountRow(db, idLocked);

    const [lockCode, putCode] = await queuedOnAccount(
      db,
      idLocked,
      () => lock(idLocked),
      with401Code(() => service.updateProfile(idLocked, CHANGES_A)),
    );

    expect([lockCode, putCode]).toEqual(['ok', SESSION_LOST]);
    expect(
      changedColumns(beforeLocked, await accountRow(db, idLocked)),
    ).toEqual(['trang_thai']);

    const putFirst = await fx.patient(BEFORE);
    const idPut = putFirst.account.taiKhoanId;
    const beforePut = await accountRow(db, idPut);

    const [putCode2, lockCode2] = await queuedOnAccount(
      db,
      idPut,
      with401Code(() => service.updateProfile(idPut, CHANGES_A)),
      () => lock(idPut),
    );

    expect([putCode2, lockCode2]).toEqual(['ok', 'ok']);
    expect(changedColumns(beforePut, await accountRow(db, idPut))).toEqual(
      [...PROFILE_COLUMNS, 'trang_thai'].sort(),
    );
  });

  it('PUR-04 (H9) PUT đang CHỜ khoá hàng của một giao dịch khoá tài khoản chưa commit: khi giao dịch đó commit thì PUT thấy NgungHoatDong ⇒ 401, năm cột không đổi', async () => {
    const { account } = await fx.patient(BEFORE);
    const id = account.taiKhoanId;
    const before = await accountRow(db, id);
    const locked = deferred();
    const release = deferred();
    const holder = db.transaction('READ COMMITTED', async (manager) => {
      await manager.update(
        TaiKhoan,
        { taiKhoanId: id },
        { trangThai: 'NgungHoatDong' },
      );
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const outcome = failureOf(() => service.updateProfile(id, CHANGES_A));
    await sleep(200); // PUT đã tới chỗ chờ khoá hàng
    release.resolve();
    await holder;

    const error = await outcome;

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(SESSION_LOST);
    expect(changedColumns(before, await accountRow(db, id))).toEqual([
      'trang_thai',
    ]);
  });
});
