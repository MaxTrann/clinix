import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { invalidActivationLink } from '../staff-activation-errors.js';
import { StaffActivationRepository } from '../staff-activation.repository.js';
import {
  deferred,
  linkRowOf,
  occupiedSlotsOf,
} from '../testing/activation-link-fixtures.js';
import {
  createStaffActivationFixture,
  eventually,
  locksHeld,
  newCredential,
  newLiveLink,
  type StaffActivationFixture,
} from '../testing/staff-activation-fixtures.js';

// Task B16 (admin) — kích hoạt công khai CHẠY ĐUA trên MySQL 8.4 THẬT (khoá hàng tai_khoan và ma_xac_thuc, thứ tự khoá, UNIQUE): NS-40. Mã NSB16-nn là [đề xuất].
// Chạy lặp nhiều vòng vì lỗi đua chỉ lộ ra một phần số lần; lỗi nào cũng làm test ĐỎ (kể cả 500 hay 1213). KHÔNG dùng bộ đếm deadlock toàn máy chủ (cần SET
// GLOBAL, và bị nhiễu bởi các cửa sổ khác dùng chung MySQL): deadlock lọt ra thì thành lỗi không phải AppException từ `complete`. Khoá được ĐO THẬT bằng
// performance_schema.data_locks lọc theo OBJECT_SCHEMA = DATABASE(), không giả định thứ tự.
const ROUNDS = 15;

let db: DataSource;
let fx: StaffActivationFixture;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createStaffActivationFixture(testDb);
});

const accountOf = (id: string): Promise<TaiKhoan> =>
  db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId: id });

// Repository có CỔNG đặt TRƯỚC câu UPDATE tài khoản: lúc đó giao dịch đã giữ khoá `tai_khoan` và `ma_xac_thuc` bằng FOR UPDATE nhưng CHƯA ghi gì,
// nên mọi khoá quan sát được là của hai câu khoá, không phải của câu ghi.
class GatedRepository extends StaffActivationRepository {
  readonly reached = deferred();
  readonly gate = deferred();
  override async activateAccount(
    em: EntityManager,
    taiKhoanId: string,
    matKhauBam: string,
  ): Promise<boolean> {
    this.reached.resolve();
    await this.gate.promise;
    return super.activateAccount(em, taiKhoanId, matKhauBam);
  }
}

describe('hai complete đồng thời (NS-40)', () => {
  it(`NSB16-50 (NS-40) hai complete cùng liên kết, mật khẩu khác nhau: đúng MỘT thành công và MỘT LIEN_KET_KHONG_HOP_LE, không 500, không deadlock; băm cuối chỉ khớp mật khẩu bên thắng; dù chạy ${String(ROUNDS)} vòng`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const live = await newLiveLink(fx);
      const credentials = [newCredential(), newCredential()] as const;
      const results = await Promise.allSettled(
        credentials.map((matKhauMoi) =>
          fx.service.complete({ id: live.id, token: live.token, matKhauMoi }),
        ),
      );
      const label = `vòng ${String(round)}`;
      const winners = results.flatMap((result, index) =>
        result.status === 'fulfilled' ? [index] : [],
      );
      expect(winners, label).toHaveLength(1);
      const loser = results.find((result) => result.status === 'rejected');
      if (loser?.status !== 'rejected') throw new Error('phải có một bên thua');
      expect(loser.reason, label).toBeInstanceOf(AppException);
      expect((loser.reason as AppException).getResponse(), label).toEqual(
        invalidActivationLink().getResponse(),
      );

      const winnerIndex = winners[0] ?? 0;
      const winningCredential = credentials[winnerIndex] ?? '';
      const losingCredential = credentials[1 - winnerIndex] ?? '';
      const account = await accountOf(live.account.taiKhoanId);
      expect(account.trangThai, label).toBe('DangHoatDong');
      expect(
        await fx.hasher.verify(account.matKhauBam ?? '', winningCredential),
        label,
      ).toBe(true);
      expect(
        await fx.hasher.verify(account.matKhauBam ?? '', losingCredential),
        label,
      ).toBe(false);
      expect((await linkRowOf(db, live.id)).daDungLuc, label).not.toBeNull();
      expect(await occupiedSlotsOf(db, live.account.taiKhoanId), label).toBe(0);
    }
    expect(logs.filter((line) => /deadlock/i.test(line))).toEqual([]);
  });

  it('NSB16-51 (NS-40) xác định: bên một giữ khoá (cổng trước câu ghi) thì bên hai CHỜ ở khoá tai_khoan (đo bằng data_locks); thả cổng ⇒ bên hai nhận LIEN_KET, băm cuối là của bên một', async () => {
    const gatedRepo = new GatedRepository();
    const first = createStaffActivationFixture(db, { repo: gatedRepo });
    const second = createStaffActivationFixture(db);
    const live = await newLiveLink(first);
    const firstCredential = newCredential();

    const winner = first.service.complete({
      id: live.id,
      token: live.token,
      matKhauMoi: firstCredential,
    });
    await gatedRepo.reached.promise;

    let loserSettled = false;
    const loser = second.service
      .complete({
        id: live.id,
        token: live.token,
        matKhauMoi: newCredential(),
      })
      .then(
        () => 'fulfilled',
        (error: unknown) => {
          loserSettled = true;
          return error;
        },
      );
    await eventually(
      async () => ((await locksHeld(db)).waiting.tai_khoan ?? 0) > 0,
      'bên hai chờ khoá hàng tai_khoan',
    );
    expect(loserSettled).toBe(false);

    gatedRepo.gate.resolve();
    expect(await winner).toEqual({ daKichHoat: true });
    const reason = await loser;
    expect(reason).toBeInstanceOf(AppException);
    expect((reason as AppException).getResponse()).toEqual(
      invalidActivationLink().getResponse(),
    );
    const account = await accountOf(live.account.taiKhoanId);
    expect(
      await fx.hasher.verify(account.matKhauBam ?? '', firstCredential),
    ).toBe(true);
  });

  it('NSB16-53 (PLAN 5.5 "khoá liên kết và tài khoản") khi complete đã khoá mà CHƯA ghi: data_locks có khoá X ĐÃ CẤP trên cả tai_khoan VÀ ma_xac_thuc (đo thật)', async () => {
    const gatedRepo = new GatedRepository();
    const gated = createStaffActivationFixture(db, { repo: gatedRepo });
    const live = await newLiveLink(gated);
    const running = gated.service.complete({
      id: live.id,
      token: live.token,
      matKhauMoi: newCredential(),
    });
    await gatedRepo.reached.promise;
    const held = await locksHeld(db);
    expect(held.grantedExclusive.tai_khoan ?? 0).toBeGreaterThan(0);
    expect(held.grantedExclusive.ma_xac_thuc ?? 0).toBeGreaterThan(0);
    gatedRepo.gate.resolve();
    expect(await running).toEqual({ daKichHoat: true });
    // Hết giao dịch thì không còn khoá nào
    const after = await locksHeld(db);
    expect(after.grantedExclusive.tai_khoan ?? 0).toBe(0);
    expect(after.grantedExclusive.ma_xac_thuc ?? 0).toBe(0);
  });
});

describe('complete đua với gửi lại (B14), không khoá ngược chiều', () => {
  it(`NSB16-52 complete đồng thời với issue và deliver của lần gửi lại, ${String(ROUNDS)} vòng: không deadlock, không 500; complete thành công hoặc nhận LIEN_KET; tài khoản cuối nhất quán; tối đa một hàng chiếm UNIQUE`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const live = await newLiveLink(fx);
      // Gửi lại phải cách lần cấp trước ≥ 60 giây: nhảy đồng hồ giả thêm 61 giây so với lúc vừa cấp liên kết đầu
      vi.setSystemTime(new Date(Date.now() + 61_000));
      const resend = async (): Promise<
        'sent' | 'not-pending' | 'mail-failed'
      > => {
        const issued = await fx.links.service.transaction((em) =>
          fx.links.service.issue(
            { taiKhoanId: live.account.taiKhoanId, kind: 'GuiLai' },
            { manager: em },
          ),
        );
        if (!issued.ok) return 'not-pending';
        const delivered = await fx.links.service.deliver(issued.issued, {
          email: live.account.email,
          fullName: live.account.hoTen,
        });
        return delivered.ok ? 'sent' : 'mail-failed';
      };
      const [completed, resent] = await Promise.allSettled([
        fx.service.complete({
          id: live.id,
          token: live.token,
          matKhauMoi: newCredential(),
        }),
        resend(),
      ]);
      const label = `vòng ${String(round)}`;

      // Gửi lại không bao giờ được ném (deadlock hay 500 sẽ lộ ra ở đây)
      expect(resent.status, label).toBe('fulfilled');
      const account = await accountOf(live.account.taiKhoanId);
      if (completed.status === 'fulfilled') {
        expect(completed.value, label).toEqual({ daKichHoat: true });
        expect(account.trangThai, label).toBe('DangHoatDong');
      } else {
        // Thua cuộc đua: gửi lại hoàn tất trước và đã thu hồi liên kết cũ
        expect(completed.reason, label).toBeInstanceOf(AppException);
        expect((completed.reason as AppException).getResponse(), label).toEqual(
          invalidActivationLink().getResponse(),
        );
        expect(account.trangThai, label).toBe('ChoKichHoat');
        expect(resent, label).toEqual({ status: 'fulfilled', value: 'sent' });
      }
      expect(
        await occupiedSlotsOf(db, live.account.taiKhoanId),
        label,
      ).toBeLessThanOrEqual(1);
    }
    expect(logs.filter((line) => /deadlock \(1213\)/.test(line))).toEqual([]);
  });
});
