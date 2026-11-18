import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { MaXacThuc } from '../../../auth/entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import {
  insertMaXacThuc,
  insertTaiKhoan,
} from '../../../auth/entities/testing/auth-fixtures.js';
import { PasswordHasher } from '../../../auth/password/password-hasher.service.js';
import { expectNoSecrets } from '../../../auth/testing/secret-scan.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import { T0, at } from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import {
  generateActivationToken,
  hashActivationToken,
} from '../activation-link-token.js';
import { invalidActivationLink } from '../staff-activation-errors.js';
import { StaffActivationRepository } from '../staff-activation.repository.js';
import {
  createActivationFixture,
  deferred,
  linkRowOf,
  newPendingStaff,
  occupiedSlotsOf,
  parseActivationMail,
} from '../testing/activation-link-fixtures.js';
import {
  createStaffActivationFixture,
  linkFor,
  locksHeld,
  newCredential,
  newLiveLink,
  snapshotOf,
  type StaffActivationFixture,
} from '../testing/staff-activation-fixtures.js';

// Task B16 (admin) — kích hoạt công khai trên MySQL 8.4 THẬT: liên kết được cấp bằng đường thật của B14 (`issue` + `deliver` qua thư giả); kiểm bảng trạng thái
// PLAN 5.5, một giao dịch, CHECK, lỗi chung, băm ngoài giao dịch, log sạch. Chạy đua ở staff-activation.concurrency.int-spec.ts. Mã NSB16-nn là [đề xuất];
// mã PLAN phủ: NS-20, 21, 30…37, 41, 42; SE-A1, A3, A5, A9, A12. Đồng hồ giả chỉ giả `Date` (useIntegrationHooks): mọi mốc ghi tường minh từ ứng dụng.
const TTL_SECONDS = 24 * 3600;

let db: DataSource;
let fx: StaffActivationFixture;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createStaffActivationFixture(testDb);
});

const goTo = (seconds: number): void => {
  vi.setSystemTime(at(seconds));
};
const accountOf = (id: string): Promise<TaiKhoan> =>
  db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId: id });

async function failureOf(run: () => Promise<unknown>): Promise<AppException> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('lẽ ra phải ném lỗi');
}
const expectInvalidLink = async (
  run: () => Promise<unknown>,
  label: string,
): Promise<void> => {
  const error = await failureOf(run);
  expect(error.getStatus(), label).toBe(400);
  expect(error.getResponse(), label).toEqual(
    invalidActivationLink().getResponse(),
  );
};

describe('liên kết hợp lệ: validate và complete (NS-30, NS-31)', () => {
  it('NSB16-30 (NS-30, SE-A12) validate liên kết hợp lệ ⇒ { hopLe: true }; tài khoản và mọi hàng liên kết y nguyên TỪNG CỘT', async () => {
    const live = await newLiveLink(fx);
    const before = await snapshotOf(db, live.account.taiKhoanId);
    goTo(5);
    expect(
      await fx.service.validate({ id: live.id, token: live.token }),
    ).toEqual({ hopLe: true });
    expect(await snapshotOf(db, live.account.taiKhoanId)).toBe(before);
  });

  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'NSB16-31 (NS-31, NS-41, SE-A3, SE-A5, Q24) %s: một giao dịch đặt Argon2id, DangHoatDong, da_xac_minh_email, da_dung_luc; ma_bam vẫn là SHA-256; không bí mật rõ ở DB',
    async (loai) => {
      const live = await newLiveLink(fx, loai);
      const credential = newCredential();
      goTo(10);
      expect(
        await fx.service.complete({
          id: live.id,
          token: live.token,
          matKhauMoi: credential,
        }),
      ).toEqual({ daKichHoat: true });

      const account = await accountOf(live.account.taiKhoanId);
      // Tham số Argon2id theo S6 (m=19456, t=2, p=1); thư viện ghi theo thứ tự m, p, t nên so từng tham số, không so cả chuỗi
      const [, variant, version, params] = (account.matKhauBam ?? '').split(
        '$',
      );
      expect([variant, version]).toEqual(['argon2id', 'v=19']);
      expect(params?.split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
      expect(await fx.hasher.verify(account.matKhauBam ?? '', credential)).toBe(
        true,
      );
      expect(account.trangThai).toBe('DangHoatDong');
      expect(account.daXacMinhEmail).toBe(true);

      const row = await linkRowOf(db, live.id);
      expect(row.daDungLuc).toEqual(at(10));
      expect(row.thuHoiLuc).toBeNull();
      expect(row.kichHoatDangHieuLuc).toBeNull();
      expect(await occupiedSlotsOf(db, live.account.taiKhoanId)).toBe(0);
      expect(row.maBam).toBe(
        createHash('sha256').update(live.token).digest('hex'),
      );
      const everything = await snapshotOf(db, live.account.taiKhoanId);
      expect(everything).not.toContain(live.token);
      expect(everything).not.toContain(credential);
    },
  );
});

describe('hết hạn và TTL (NS-32, NS-42)', () => {
  it.each([
    [-1, true],
    [0, false],
    [1, false],
  ] as const)(
    'NSB16-32 (NS-32) tại het_han_luc %i giây: dùng được = %s',
    async (offset, usable) => {
      const live = await newLiveLink(fx);
      goTo(TTL_SECONDS + offset);
      const input = { id: live.id, token: live.token };
      if (usable) {
        expect(await fx.service.validate(input)).toEqual({ hopLe: true });
        const result = await fx.service.complete({
          ...input,
          matKhauMoi: newCredential(),
        });
        expect(result).toEqual({ daKichHoat: true });
        return;
      }
      await expectInvalidLink(() => fx.service.validate(input), 'validate');
      await expectInvalidLink(
        () => fx.service.complete({ ...input, matKhauMoi: newCredential() }),
        'complete',
      );
      const account = await accountOf(live.account.taiKhoanId);
      expect(account.trangThai).toBe('ChoKichHoat');
      expect(account.matKhauBam).toBeNull();
      expect((await linkRowOf(db, live.id)).daDungLuc).toBeNull();
    },
  );

  it('NSB16-32 (NS-42) đổi TTL giữa hai liên kết: mỗi hàng giữ hạn riêng; quá 24 giờ chỉ liên kết 24 giờ hết hạn', async () => {
    const first = await newLiveLink(fx);
    const links48 = createActivationFixture(db, new FakeMailService(), {
      STAFF_ACTIVATION_TTL_HOURS: 48,
    });
    const second = await linkFor(
      links48,
      await newPendingStaff(db, 'BacSi'),
      'TaoMoi',
    );
    goTo(TTL_SECONDS + 1);
    await expectInvalidLink(
      () => fx.service.validate({ id: first.id, token: first.token }),
      '24 giờ',
    );
    expect(
      await fx.service.validate({ id: second.id, token: second.token }),
    ).toEqual({ hopLe: true });
  });
});

describe('dùng lại, bị thay, chưa gửi, thu hồi (NS-20, NS-33, NS-34, NS-37)', () => {
  it('NSB16-33 (NS-33) dùng lại liên kết đã dùng ⇒ lỗi chung; băm mật khẩu của lần đầu KHÔNG đổi', async () => {
    const live = await newLiveLink(fx);
    const input = { id: live.id, token: live.token };
    goTo(10);
    await fx.service.complete({ ...input, matKhauMoi: newCredential() });
    const hashAfterFirst = (await accountOf(live.account.taiKhoanId))
      .matKhauBam;
    goTo(20);
    await expectInvalidLink(
      () => fx.service.complete({ ...input, matKhauMoi: newCredential() }),
      'complete lần hai',
    );
    await expectInvalidLink(() => fx.service.validate(input), 'validate');
    expect((await accountOf(live.account.taiKhoanId)).matKhauBam).toBe(
      hashAfterFirst,
    );
  });

  it('NSB16-33b (NS-33) dữ liệu lệch: hàng đã dùng nhưng tài khoản vẫn ChoKichHoat ⇒ vẫn từ chối (lớp liên kết độc lập với lớp tài khoản)', async () => {
    const live = await newLiveLink(fx);
    const input = { id: live.id, token: live.token };
    goTo(10);
    await fx.service.complete({ ...input, matKhauMoi: newCredential() });
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'ChoKichHoat', mat_khau_bam = NULL, da_xac_minh_email = 0 WHERE tai_khoan_id = ?",
      [live.account.taiKhoanId],
    );
    await expectInvalidLink(() => fx.service.validate(input), 'validate');
    await expectInvalidLink(
      () => fx.service.complete({ ...input, matKhauMoi: newCredential() }),
      'complete',
    );
    const account = await accountOf(live.account.taiKhoanId);
    expect(account.trangThai).toBe('ChoKichHoat');
    expect(account.matKhauBam).toBeNull();
  });

  it('NSB16-34 (NS-34) gửi lại thành công: liên kết CŨ bị từ chối ở cả hai hàm, liên kết MỚI kích hoạt được', async () => {
    const first = await newLiveLink(fx);
    goTo(61);
    const second = await linkFor(fx.links, first.account, 'GuiLai');
    expect(second.id).not.toBe(first.id);
    await expectInvalidLink(
      () => fx.service.validate({ id: first.id, token: first.token }),
      'validate liên kết cũ',
    );
    await expectInvalidLink(
      () =>
        fx.service.complete({
          id: first.id,
          token: first.token,
          matKhauMoi: newCredential(),
        }),
      'complete liên kết cũ',
    );
    expect(
      (await accountOf(first.account.taiKhoanId)).trangThai,
      'liên kết cũ không đổi gì',
    ).toBe('ChoKichHoat');
    expect(
      await fx.service.complete({
        id: second.id,
        token: second.token,
        matKhauMoi: newCredential(),
      }),
    ).toEqual({ daKichHoat: true });
  });

  it('NSB16-34 (NS-20, TK-41) gửi lại bị LỖI mail: liên kết cũ còn hạn VẪN dùng được; sau đó gửi lại thành công thì liên kết mới dùng được', async () => {
    const first = await newLiveLink(fx);
    goTo(61);
    fx.links.mail.failNextWith('TIMEOUT');
    const failed = await fx.links.service.issue({
      taiKhoanId: first.account.taiKhoanId,
      kind: 'GuiLai',
    });
    if (!failed.ok) throw new Error('issue lẽ ra phải thành công');
    const delivered = await fx.links.service.deliver(failed.issued, {
      email: first.account.email,
      fullName: first.account.hoTen,
    });
    expect(delivered.ok).toBe(false);
    expect(
      await fx.service.validate({ id: first.id, token: first.token }),
    ).toEqual({ hopLe: true });

    goTo(130);
    const third = await linkFor(fx.links, first.account, 'GuiLai');
    expect(
      await fx.service.complete({
        id: third.id,
        token: third.token,
        matKhauMoi: newCredential(),
      }),
    ).toEqual({ daKichHoat: true });
  });

  it('NSB16-37 (NS-37; quy tắc 22) hàng gửi lỗi, hàng mới tạo (chưa gửi), hàng bị thay, và hàng KHÔNG phải KichHoatNhanSu (OTP) với token đúng ⇒ đều từ chối', async () => {
    const account = await newPendingStaff(db);
    const rawLinkValue = generateActivationToken();
    const base = {
      maBam: hashActivationToken(rawLinkValue),
      hetHanLuc: at(TTL_SECONDS),
      taoLuc: T0,
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    };
    const rows: [string, Partial<MaXacThuc>][] = [
      [
        'gửi lỗi (thu hồi, chưa gửi)',
        { loai: 'KichHoatNhanSu', thuHoiLuc: at(1), daGuiLuc: null },
      ],
      [
        'mới tạo (chưa gửi, chưa thu hồi)',
        { loai: 'KichHoatNhanSu', daGuiLuc: null },
      ],
      [
        'bị thay (đã gửi rồi bị thu hồi)',
        { loai: 'KichHoatNhanSu', daGuiLuc: at(1), thuHoiLuc: at(2) },
      ],
      [
        'hàng OTP quên mật khẩu (khác loại) đã gửi, còn hạn',
        { loai: 'QuenMatKhau', daGuiLuc: at(1) },
      ],
    ];
    goTo(5);
    for (const [label, over] of rows) {
      const row = await insertMaXacThuc(db, account.taiKhoanId, {
        ...base,
        ...over,
      });
      const input = { id: row.maXacThucId, token: rawLinkValue };
      await expectInvalidLink(() => fx.service.validate(input), label);
      await expectInvalidLink(
        () => fx.service.complete({ ...input, matKhauMoi: newCredential() }),
        label,
      );
    }
    expect((await accountOf(account.taiKhoanId)).trangThai).toBe('ChoKichHoat');
  });
});

describe('mọi nhánh thất bại cùng một lỗi, liên kết thật không bị "đốt" (NS-35)', () => {
  it('NSB16-35 (NS-35) token sai, id không tồn tại, id/token sai dạng, thiếu, số JSON, id có số 0 đứng đầu, id vượt BIGINT: cùng ngoại lệ; liên kết thật còn nguyên', async () => {
    const live = await newLiveLink(fx);
    const before = await snapshotOf(db, live.account.taiKhoanId);
    const missing = String(Number(live.id) + 1000);
    const wrongToken = generateActivationToken();
    const bodies: [string, unknown][] = [
      ['token sai, id đúng', { id: live.id, token: wrongToken }],
      ['id không tồn tại', { id: missing, token: live.token }],
      ['id sai dạng', { id: 'abc', token: live.token }],
      ['token sai dạng', { id: live.id, token: 'khong-dung-dang' }],
      ['thiếu cả hai', {}],
      ['thiếu id', { token: live.token }],
      ['thiếu token', { id: live.id }],
      ['id là số JSON', { id: Number(live.id), token: live.token }],
      [
        'id có số 0 đứng đầu, token đúng',
        { id: `0${live.id}`, token: live.token },
      ],
      ['id vượt BIGINT', { id: '9223372036854775808', token: live.token }],
      [
        'id 19 chữ số không có',
        { id: '1000000000000000000', token: live.token },
      ],
      ['thân không phải object', 'x'],
      ['thân null', null],
    ];
    goTo(5);
    for (const [label, body] of bodies) {
      await expectInvalidLink(
        () => fx.service.validate(body),
        `validate ${label}`,
      );
      const input = (body ?? {}) as { id?: unknown; token?: unknown };
      await expectInvalidLink(
        () =>
          fx.service.complete({
            id: input.id,
            token: input.token,
            matKhauMoi: newCredential(),
          }),
        `complete ${label}`,
      );
    }
    // Không lần thử sai nào làm hỏng liên kết thật
    expect(await snapshotOf(db, live.account.taiKhoanId)).toBe(before);
    expect(
      await fx.service.validate({ id: live.id, token: live.token }),
    ).toEqual({ hopLe: true });
  });
});

describe('tài khoản không còn chờ kích hoạt (NS-36)', () => {
  it.each(['DangHoatDong', 'NgungHoatDong'] as const)(
    'NSB16-36 (NS-36) tài khoản %s với liên kết CÒN hợp lệ ⇒ từ chối, mật khẩu không đổi',
    async (state) => {
      const live = await newLiveLink(fx);
      const existingHash = await fx.hasher.hash(newCredential());
      await db.query(
        'UPDATE tai_khoan SET trang_thai = ?, mat_khau_bam = ? WHERE tai_khoan_id = ?',
        [state, existingHash, live.account.taiKhoanId],
      );
      const input = { id: live.id, token: live.token };
      goTo(5);
      await expectInvalidLink(() => fx.service.validate(input), 'validate');
      await expectInvalidLink(
        () => fx.service.complete({ ...input, matKhauMoi: newCredential() }),
        'complete',
      );
      const account = await accountOf(live.account.taiKhoanId);
      expect(account.matKhauBam).toBe(existingHash);
      expect(account.trangThai).toBe(state);
      expect((await linkRowOf(db, live.id)).daDungLuc).toBeNull();
    },
  );

  it('NSB16-36c (quyết định (i)) lần gửi lại đang bay hoàn tất SAU khi kích hoạt: deliver vẫn ok, hàng mới chiếm slot, nhưng validate vẫn từ chối vì tài khoản đã DangHoatDong', async () => {
    const first = await newLiveLink(fx);
    goTo(61);
    const issued = await fx.links.service.issue({
      taiKhoanId: first.account.taiKhoanId,
      kind: 'GuiLai',
    });
    if (!issued.ok) throw new Error('issue lẽ ra phải thành công');
    goTo(62);
    await fx.service.complete({
      id: first.id,
      token: first.token,
      matKhauMoi: newCredential(),
    });
    goTo(63);
    const delivered = await fx.links.service.deliver(issued.issued, {
      email: first.account.email,
      fullName: first.account.hoTen,
    });
    expect(delivered.ok).toBe(true);
    // Ghi lại hành vi: hàng của lần gửi lại giờ "đã gửi, chưa thu hồi, chưa dùng" (chiếm slot) nhưng vô dụng
    expect(await occupiedSlotsOf(db, first.account.taiKhoanId)).toBe(1);
    const late = parseActivationMail(fx.links.mail.sent.at(-1));
    await expectInvalidLink(
      () => fx.service.validate({ id: late.id, token: late.token }),
      'liên kết của lần gửi lại đến muộn',
    );
    expect((await accountOf(first.account.taiKhoanId)).trangThai).toBe(
      'DangHoatDong',
    );
  });
});

describe('một giao dịch và lớp WHERE độc lập (NS-31, SE-A9)', () => {
  it('NSB16-38 (NS-31, SE-A9) ép lỗi ở bước ghi liên kết ⇒ tài khoản vẫn ChoKichHoat, mat_khau_bam NULL, hàng liên kết chưa dùng', async () => {
    class FailingRepository extends StaffActivationRepository {
      override markUsed(): Promise<boolean> {
        return Promise.reject(new Error('mô phỏng lỗi ghi liên kết'));
      }
    }
    const failing = createStaffActivationFixture(db, {
      repo: new FailingRepository(),
    });
    const live = await newLiveLink(failing);
    goTo(5);
    await expect(
      failing.service.complete({
        id: live.id,
        token: live.token,
        matKhauMoi: newCredential(),
      }),
    ).rejects.toThrow('mô phỏng lỗi ghi liên kết');
    const account = await accountOf(live.account.taiKhoanId);
    expect(account.trangThai).toBe('ChoKichHoat');
    expect(account.matKhauBam).toBeNull();
    expect(account.daXacMinhEmail).toBe(false);
    expect((await linkRowOf(db, live.id)).daDungLuc).toBeNull();
    // Liên kết vẫn dùng được khi lỗi hết
    expect(
      await fx.service.complete({
        id: live.id,
        token: live.token,
        matKhauMoi: newCredential(),
      }),
    ).toEqual({ daKichHoat: true });
  });

  it('NSB16-39 activateAccount và markUsed gọi TRỰC TIẾP: không đụng tài khoản đang hoạt động, Bệnh nhân, hàng chưa gửi, đã thu hồi, đã dùng', async () => {
    const repo = new StaffActivationRepository();
    const active = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'LeTan',
      trangThai: 'DangHoatDong',
    });
    const patient = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'BenhNhan',
      trangThai: 'DangHoatDong',
    });
    const existingHashes = [active.matKhauBam, patient.matKhauBam];
    for (const account of [active, patient]) {
      expect(
        await repo.activateAccount(db.manager, account.taiKhoanId, 'bam-moi'),
      ).toBe(false);
    }
    expect([
      (await accountOf(active.taiKhoanId)).matKhauBam,
      (await accountOf(patient.taiKhoanId)).matKhauBam,
    ]).toEqual(existingHashes);

    const pending = await newPendingStaff(db);
    const base = {
      loai: 'KichHoatNhanSu',
      maBam: hashActivationToken(generateActivationToken()),
      hetHanLuc: at(TTL_SECONDS),
      taoLuc: T0,
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    } as const;
    const unsent = await insertMaXacThuc(db, pending.taiKhoanId, base);
    const revoked = await insertMaXacThuc(db, pending.taiKhoanId, {
      ...base,
      daGuiLuc: at(1),
      thuHoiLuc: at(2),
    });
    const used = await insertMaXacThuc(db, pending.taiKhoanId, {
      ...base,
      daGuiLuc: at(1),
      daDungLuc: at(3),
    });
    for (const row of [unsent, revoked, used]) {
      expect(await repo.markUsed(db.manager, row.maXacThucId, at(9))).toBe(
        false,
      );
    }
    expect((await linkRowOf(db, used.maXacThucId)).daDungLuc).toEqual(at(3));
    expect((await linkRowOf(db, unsent.maXacThucId)).daDungLuc).toBeNull();
  });
});

describe('log sạch (NS-21, SE-A1)', () => {
  it('NSB16-40 (NS-21, SE-A1) toàn luồng validate và complete (đúng và sai): log không có token, URL, mật khẩu, băm Argon2id, ma_bam', async () => {
    const live = await newLiveLink(fx);
    const other = await newLiveLink(fx, 'BacSi');
    const credential = newCredential();
    goTo(5);
    await fx.service.validate({ id: live.id, token: live.token });
    await failureOf(() =>
      fx.service.validate({ id: live.id, token: generateActivationToken() }),
    );
    await failureOf(() =>
      fx.service.complete({
        id: other.id,
        token: generateActivationToken(),
        matKhauMoi: newCredential(),
      }),
    );
    await fx.service.complete({
      id: live.id,
      token: live.token,
      matKhauMoi: credential,
    });
    await failureOf(() =>
      fx.service.complete({
        id: live.id,
        token: live.token,
        matKhauMoi: newCredential(),
      }),
    );
    const storedHash = (await accountOf(live.account.taiKhoanId)).matKhauBam;
    const linkHash = (await linkRowOf(db, live.id)).maBam;
    const text = logs.join('\n');
    expect(text).toContain('đã kích hoạt qua liên kết'); // có log thành công (kiểm tra bộ quét có gì để quét)
    expectNoSecrets('log', text, {
      literals: [
        live.token,
        other.token,
        credential,
        storedHash ?? '',
        linkHash,
        live.token.slice(0, 20),
      ],
      codes: [],
    });
  });
});

class GateHasher extends PasswordHasher {
  readonly started = deferred();
  readonly gate = deferred();
  override async hash(plain: string): Promise<string> {
    this.started.resolve();
    await this.gate.promise;
    return super.hash(plain);
  }
}

describe('băm ngoài giao dịch và kiểm lại dưới khoá (NS-31, NS-32, NS-36, NS-37)', () => {
  it('NSB16-41 băm Argon2id NGOÀI giao dịch (đo thật): trong lúc băm, DB không có khoá hàng nào của tai_khoan hay ma_xac_thuc; thả cổng thì kích hoạt xong', async () => {
    const gate = new GateHasher();
    const gated = createStaffActivationFixture(db, { hasher: gate });
    const live = await newLiveLink(gated);
    goTo(5);
    const running = gated.service.complete({
      id: live.id,
      token: live.token,
      matKhauMoi: newCredential(),
    });
    await gate.started.promise;
    const held = await locksHeld(db);
    expect(held.grantedExclusive.tai_khoan ?? 0).toBe(0);
    expect(held.grantedExclusive.ma_xac_thuc ?? 0).toBe(0);
    expect(held.waiting).toEqual({});
    gate.gate.resolve();
    expect(await running).toEqual({ daKichHoat: true });
  });

  it.each([
    [
      'liên kết bị thu hồi trong lúc băm',
      async (live: { id: string; account: TaiKhoan }) => {
        await db.query(
          'UPDATE ma_xac_thuc SET thu_hoi_luc = ? WHERE ma_xac_thuc_id = ?',
          [at(3), live.id],
        );
      },
    ],
    [
      'tài khoản bị ngưng trong lúc băm',
      async (live: { id: string; account: TaiKhoan }) => {
        await db.query(
          "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
          [live.account.taiKhoanId],
        );
      },
    ],
    [
      'đồng hồ chạy qua hạn trong lúc băm',
      (_live: { id: string; account: TaiKhoan }) => {
        goTo(TTL_SECONDS);
        return Promise.resolve();
      },
    ],
  ])(
    'NSB16-42 %s ⇒ lỗi chung, không ghi gì (kiểm LẠI dưới khoá, `now` lấy sau khoá)',
    async (_label, drift) => {
      const gate = new GateHasher();
      const gated = createStaffActivationFixture(db, { hasher: gate });
      const live = await newLiveLink(gated);
      goTo(5);
      const running = failureOf(() =>
        gated.service.complete({
          id: live.id,
          token: live.token,
          matKhauMoi: newCredential(),
        }),
      );
      await gate.started.promise;
      await drift(live);
      gate.gate.resolve();
      expect((await running).getResponse()).toEqual(
        invalidActivationLink().getResponse(),
      );
      const account = await accountOf(live.account.taiKhoanId);
      expect(account.matKhauBam).toBeNull();
      expect(account.trangThai).not.toBe('DangHoatDong');
      expect((await linkRowOf(db, live.id)).daDungLuc).toBeNull();
      // Lỗi bất ngờ nào cũng là 500, ở đây phải là lỗi nghiệp vụ; dòng cảnh báo dưới khoá có đúng một dòng
      expect(
        logs.filter((line) => line.includes('không còn dùng được khi khoá')),
      ).toHaveLength(1);
    },
  );
});
