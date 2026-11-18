import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { MaXacThuc } from '../../../auth/entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { insertMaXacThuc } from '../../../auth/entities/testing/auth-fixtures.js';
import { TEST_AUTH_ENV } from '../../../auth/testing/auth-test-env.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import {
  ControlledMailService,
  at,
} from '../../../auth/testing/otp-int-helpers.js';
import { isDuplicateKeyError } from '../../../database/mysql-errors.js';
import type { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { activationTokenMatches } from '../activation-link-token.js';
import { deriveActivationLinkState } from '../activation-link-rules.js';
import { IssuedActivationLink } from '../issued-activation-link.js';
import { toIssueException } from '../staff-activation-errors.js';
import {
  createActivationFixture,
  issueAndDeliver,
  issueOk,
  linkRowOf,
  linkRowsOf,
  newAccount,
  newPendingStaff,
  occupiedSlotsOf,
  parseActivationMail,
  recipientOf,
  type ActivationFixture,
} from '../testing/activation-link-fixtures.js';

// Task B14 (admin) — ActivationLinkService trên MySQL 8.4 THẬT: bảng trạng thái PLAN 5.5, thứ tự thu hồi rồi đặt da_gui_luc (quy tắc nghiệp vụ 21 và
// ràng buộc 22), giới hạn gửi lại (Q23), TTL (Q22), mail ngoài giao dịch, log sạch (NS-21). Chạy đua ở activation-link.service.concurrency.int-spec.ts.
// Mã NSB14-nn là [đề xuất]; mã PLAN (NS-19, NS-20, NS-21, NS-34, NS-37, NS-41, NS-42, NS-45; TK-40…42, 45…48) ghi kèm ở mức dịch vụ.
// Đồng hồ giả chỉ giả `Date` (useIntegrationHooks): mọi mốc thời gian ghi tường minh từ ứng dụng, không dùng NOW() của DB.
const HOUR_MS = 3_600_000;

let db: DataSource;
let fx: ActivationFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createActivationFixture(testDb);
});

const goTo = (seconds: number): void => {
  vi.setSystemTime(at(seconds));
};

/** Trạng thái hiện tại (theo đồng hồ giả) của một hàng, đọc lại từ DB. */
const stateOfRow = async (id: string) =>
  deriveActivationLinkState(await linkRowOf(db, id), new Date());

describe('liên kết cũ được giữ khi gửi lỗi, thay đúng một lần khi gửi lại (NS-19, NS-20, NS-34, TK-40…42)', () => {
  it('NSB14-30 (NS-19, TK-41) gửi lỗi khi đã có liên kết cũ còn hạn: hàng mới bị thu hồi, liên kết cũ GIỮ NGUYÊN từng cột và vẫn chiếm slot hợp lệ', async () => {
    const account = await newPendingStaff(db);
    const first = await issueAndDeliver(fx, account, 'TaoMoi');
    expect(first.result.ok).toBe(true);
    const oldBefore = await linkRowOf(db, first.id);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);

    goTo(61);
    fx.mail.failNextWith('TIMEOUT');
    const second = await issueAndDeliver(fx, account, 'GuiLai');
    expect(second.result).toEqual({
      ok: false,
      maLoi: 'GUI_MAIL_LOI',
      maXacThucId: second.id,
    });

    const newRow = await linkRowOf(db, second.id);
    expect(newRow.thuHoiLuc).not.toBeNull();
    expect(newRow.daGuiLuc).toBeNull();
    expect(newRow.kichHoatDangHieuLuc).toBeNull();
    expect(await stateOfRow(second.id)).toBe('BI_THU_HOI');

    // Liên kết cũ: không đổi cột nào, vẫn hợp lệ, vẫn là hàng duy nhất chiếm slot
    expect(await linkRowOf(db, first.id)).toEqual(oldBefore);
    expect(await stateOfRow(first.id)).toBe('HOP_LE');
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
    expect(
      (
        await db.getRepository(TaiKhoan).findOneByOrFail({
          taiKhoanId: account.taiKhoanId,
        })
      ).trangThai,
    ).toBe('ChoKichHoat');
  });

  it('NSB14-31 (NS-20, NS-34, TK-40) gửi lại thành công: đúng MỘT hàng hợp lệ (hàng mới), hàng cũ bị thu hồi; token cũ khớp băm của hàng cũ nhưng hàng đó KHÔNG dùng được', async () => {
    const account = await newPendingStaff(db);
    const first = await issueAndDeliver(fx, account, 'TaoMoi');
    const oldToken = parseActivationMail(fx.mail.sent[0]);
    goTo(61);
    fx.mail.failNextWith('CONNECTION');
    const failed = await issueAndDeliver(fx, account);
    expect(failed.result.ok).toBe(false);

    goTo(122);
    const third = await issueAndDeliver(fx, account);
    expect(third.result.ok).toBe(true);

    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
    const rows = await linkRowsOf(db, account.taiKhoanId);
    expect(rows.map((r) => r.kichHoatDangHieuLuc !== null)).toEqual([
      false,
      false,
      true,
    ]);
    expect(await stateOfRow(first.id)).toBe('BI_THU_HOI');
    expect(await stateOfRow(failed.id)).toBe('BI_THU_HOI');
    expect(await stateOfRow(third.id)).toBe('HOP_LE');

    // Token của thư mới khớp băm của hàng mới; token của thư cũ vẫn "đúng" với hàng cũ nhưng hàng cũ đã bị thu hồi
    const newToken = parseActivationMail(fx.mail.sent[1]);
    expect(newToken.id).toBe(third.id);
    expect(
      activationTokenMatches(
        (await linkRowOf(db, third.id)).maBam,
        newToken.token,
      ),
    ).toBe(true);
    expect(oldToken.id).toBe(first.id);
    expect(
      activationTokenMatches(
        (await linkRowOf(db, first.id)).maBam,
        oldToken.token,
      ),
    ).toBe(true);
    expect((await linkRowOf(db, first.id)).thuHoiLuc?.getTime()).toBe(
      at(122).getTime(),
    );
  });

  it('NSB14-32 (TK-42) liên kết cũ đã HẾT HẠN rồi gửi lỗi: không còn liên kết hợp lệ; gửi lại lần sau thành công và thu hồi cả hàng hết hạn (không vi phạm UNIQUE)', async () => {
    const account = await newPendingStaff(db);
    const first = await issueAndDeliver(fx, account, 'TaoMoi');

    goTo(25 * 3600);
    expect(await stateOfRow(first.id)).toBe('HET_HAN');
    fx.mail.failNextWith('AUTH');
    const failed = await issueAndDeliver(fx, account);
    expect(failed.result.ok).toBe(false);
    expect(await stateOfRow(failed.id)).toBe('BI_THU_HOI');
    // Hàng hết hạn vẫn chiếm slot (cột sinh không xét hạn) nhưng đã không dùng được
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);

    goTo(25 * 3600 + 61);
    const third = await issueAndDeliver(fx, account);
    expect(third.result.ok).toBe(true);
    expect(await stateOfRow(first.id)).toBe('BI_THU_HOI');
    expect(await stateOfRow(third.id)).toBe('HOP_LE');
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
  });

  it('NSB14-39 (quy tắc 23) hàng ĐÃ DÙNG không bị thu hồi lại khi gửi lại thành công (CHECK dùng-hoặc-thu-hồi)', async () => {
    const account = await newPendingStaff(db);
    const used = await insertMaXacThuc(db, account.taiKhoanId, {
      loai: 'KichHoatNhanSu',
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
      maBam: 'a'.repeat(64),
      taoLuc: new Date(at(0).getTime() - 2 * HOUR_MS),
      daGuiLuc: new Date(at(0).getTime() - 2 * HOUR_MS),
      daDungLuc: new Date(at(0).getTime() - HOUR_MS),
      hetHanLuc: new Date(at(0).getTime() + 22 * HOUR_MS),
    });

    const created = await issueAndDeliver(fx, account);
    expect(created.result.ok).toBe(true);
    const after = await linkRowOf(db, used.maXacThucId);
    expect(after.thuHoiLuc).toBeNull();
    expect(after.daDungLuc).not.toBeNull();
    expect(await stateOfRow(used.maXacThucId)).toBe('DA_DUNG');
    expect(await stateOfRow(created.id)).toBe('HOP_LE');
  });
});

describe('bảng trạng thái 5.5 trên hàng thật (NS-37)', () => {
  const baseRow = (overrides: Partial<MaXacThuc>): Partial<MaXacThuc> => ({
    loai: 'KichHoatNhanSu',
    hoTenDangKy: null,
    soDienThoaiDangKy: null,
    matKhauBamDangKy: null,
    maBam: 'b'.repeat(64),
    hetHanLuc: at(24 * 3600),
    ...overrides,
  });

  it('NSB14-33 (NS-37) từng trạng thái: mới tạo, hợp lệ, hết hạn, thu hồi (gửi lỗi), thu hồi (bị thay), đã dùng; cột sinh đúng từng hàng', async () => {
    const create = async (overrides: Partial<MaXacThuc>) => {
      const account = await newPendingStaff(db);
      const row = await insertMaXacThuc(
        db,
        account.taiKhoanId,
        baseRow(overrides),
      );
      return { account, id: row.maXacThucId };
    };
    const newTwo = await newPendingStaff(db);
    // Hai hàng "mới tạo" cùng tài khoản chèn được (không chiếm slot UNIQUE)
    const draftA = await insertMaXacThuc(db, newTwo.taiKhoanId, baseRow({}));
    const draftB = await insertMaXacThuc(db, newTwo.taiKhoanId, baseRow({}));
    for (const draft of [draftA, draftB]) {
      expect(await stateOfRow(draft.maXacThucId)).toBe('MOI_TAO');
      expect(
        (await linkRowOf(db, draft.maXacThucId)).kichHoatDangHieuLuc,
      ).toBeNull();
    }

    const valid = await create({ daGuiLuc: at(-60) });
    expect(await stateOfRow(valid.id)).toBe('HOP_LE');
    expect((await linkRowOf(db, valid.id)).kichHoatDangHieuLuc).toBe(
      valid.account.taiKhoanId,
    );

    const expired = await create({
      daGuiLuc: at(-7200),
      hetHanLuc: at(-1),
    });
    expect(await stateOfRow(expired.id)).toBe('HET_HAN');
    // Hàng hết hạn mà chưa thu hồi VẪN chiếm slot: chèn thêm một hàng đã gửi cho cùng tài khoản bị UNIQUE chặn
    expect((await linkRowOf(db, expired.id)).kichHoatDangHieuLuc).toBe(
      expired.account.taiKhoanId,
    );
    let duplicate: unknown;
    try {
      await insertMaXacThuc(
        db,
        expired.account.taiKhoanId,
        baseRow({ daGuiLuc: at(-30) }),
      );
    } catch (error) {
      duplicate = error;
    }
    expect(isDuplicateKeyError(duplicate)).toBe(true);

    const sendFailed = await create({ thuHoiLuc: at(-10) });
    expect(await stateOfRow(sendFailed.id)).toBe('BI_THU_HOI');
    expect((await linkRowOf(db, sendFailed.id)).kichHoatDangHieuLuc).toBeNull();

    const replaced = await create({
      daGuiLuc: at(-100),
      thuHoiLuc: at(-10),
    });
    expect(await stateOfRow(replaced.id)).toBe('BI_THU_HOI');
    expect((await linkRowOf(db, replaced.id)).kichHoatDangHieuLuc).toBeNull();

    const used = await create({ daGuiLuc: at(-100), daDungLuc: at(-10) });
    expect(await stateOfRow(used.id)).toBe('DA_DUNG');
    expect((await linkRowOf(db, used.id)).kichHoatDangHieuLuc).toBeNull();
  });

  it('NSB14-34 (NS-41) ma_bam là SHA-256 hex của token trong thư; không cột nào của ma_xac_thuc và tai_khoan chứa token rõ; URL đúng WEB_ORIGIN, fragment, id khớp hàng', async () => {
    const account = await newPendingStaff(db, 'BacSi');
    const { id, result } = await issueAndDeliver(fx, account, 'TaoMoi');
    expect(result.ok).toBe(true);

    const parsed = parseActivationMail(fx.mail.sent[0]);
    expect(parsed.id).toBe(id);
    const row = await linkRowOf(db, id);
    expect(row.maBam).toMatch(/^[0-9a-f]{64}$/);
    expect(row.maBam).toBe(
      createHash('sha256').update(parsed.token).digest('hex'),
    );
    expect(activationTokenMatches(row.maBam, parsed.token)).toBe(true);

    const dump = JSON.stringify([
      await db.query('SELECT * FROM ma_xac_thuc'),
      await db.query('SELECT * FROM tai_khoan'),
    ]);
    expect(dump).not.toContain(parsed.token);
    expect(dump).not.toContain(parsed.url);

    const url = new URL(parsed.url);
    expect(url.origin).toBe(TEST_AUTH_ENV.WEB_ORIGIN);
    expect(url.pathname).toBe('/kich-hoat');
    expect(url.search).toBe('');
    expect(url.hash).toBe(`#id=${id}&token=${parsed.token}`);
  });
});

describe('TTL và giới hạn gửi lại (Q22, Q23)', () => {
  it('NSB14-35 (NS-42, TK-48) đổi TTL giữa hai lần cấp: liên kết mới theo TTL mới, liên kết cũ GIỮ hạn cũ', async () => {
    const account = await newPendingStaff(db);
    const first = await issueAndDeliver(fx, account);
    fx.config.set('STAFF_ACTIVATION_TTL_HOURS', 48);
    goTo(61);
    const second = await issueAndDeliver(fx, account);

    expect((await linkRowOf(db, first.id)).hetHanLuc.getTime()).toBe(
      at(24 * 3600).getTime(),
    );
    expect((await linkRowOf(db, second.id)).hetHanLuc.getTime()).toBe(
      at(61 + 48 * 3600).getTime(),
    );
    // Thư in đúng số giờ của TỪNG lần
    expect(fx.mail.sent[0]?.text).toContain('Thời hạn liên kết mới: 24 giờ');
    expect(fx.mail.sent[1]?.text).toContain('Thời hạn liên kết mới: 48 giờ');
  });

  it('NSB14-36 (NS-45, TK-47) tạo rồi gửi lại sau 59 giây bị từ chối (không hàng mới), sau 60 giây được; đồng hồ có mili giây lẻ vẫn đúng biên', async () => {
    const account = await newPendingStaff(db);
    await issueAndDeliver(fx, account, 'TaoMoi');

    goTo(59);
    const tooSoon = await fx.service.issue({
      taiKhoanId: account.taiKhoanId,
      kind: 'GuiLai',
    });
    expect(tooSoon).toEqual({
      ok: false,
      failure: {
        code: 'GUI_LAI_QUA_SOM',
        reason: 'TOO_SOON',
        retryAfterSeconds: 1,
      },
    });
    expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(1);

    goTo(60);
    const allowed = await issueAndDeliver(fx, account);
    expect(allowed.result.ok).toBe(true);
    expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(2);

    // Mili giây lẻ: tạo lúc T0 + 0,7 giây ghi tao_luc = T0 (cắt giây TRƯỚC khi MySQL làm tròn DATETIME lên T0 + 1 giây)
    const other = await newPendingStaff(db);
    vi.setSystemTime(new Date(at(1000).getTime() + 700));
    const created = await issueAndDeliver(fx, other, 'TaoMoi');
    expect((await linkRowOf(db, created.id)).taoLuc.getTime()).toBe(
      at(1000).getTime(),
    );
    vi.setSystemTime(new Date(at(1000).getTime() + 59_900));
    expect(
      await fx.service.issue({ taiKhoanId: other.taiKhoanId, kind: 'GuiLai' }),
    ).toMatchObject({ ok: false, failure: { reason: 'TOO_SOON' } });
    vi.setSystemTime(new Date(at(1000).getTime() + 60_900));
    expect(
      (await fx.service.issue({ taiKhoanId: other.taiKhoanId, kind: 'GuiLai' }))
        .ok,
    ).toBe(true);
  });

  it('NSB14-37 (TK-47) 5 hàng trong 1 giờ kể cả hàng gửi lỗi ⇒ hàng thứ 6 HOURLY_LIMIT với số giây chờ đúng; đúng 3 600 giây sau hàng đầu thì được; hàng thứ 5 (khi có 4) được', async () => {
    const account = await newPendingStaff(db);
    const times = [0, 61, 122, 183, 244];
    for (const [index, seconds] of times.entries()) {
      goTo(seconds);
      // Hàng 1 và 3 gửi lỗi: vẫn phải được đếm
      if (index === 0 || index === 2) fx.mail.failNextWith('CONNECTION');
      const issued = await issueAndDeliver(fx, account);
      expect(issued.result.ok, `hàng ${String(index + 1)}`).toBe(
        !(index === 0 || index === 2),
      );
    }
    expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(5);

    goTo(305);
    const sixth = await fx.service.issue({
      taiKhoanId: account.taiKhoanId,
      kind: 'GuiLai',
    });
    expect(sixth).toEqual({
      ok: false,
      failure: {
        code: 'GUI_LAI_QUA_SOM',
        reason: 'HOURLY_LIMIT',
        retryAfterSeconds: 3295,
      },
    });
    expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(5);
    // Thông điệp HTTP chỉ có số giây chờ
    if (sixth.ok) throw new Error('hàng thứ 6 lẽ ra bị từ chối');
    expect(toIssueException(sixth.failure).getResponse()).toMatchObject({
      chiTiet: { soGiayCho: 3295 },
    });

    goTo(3599);
    expect(
      await fx.service.issue({
        taiKhoanId: account.taiKhoanId,
        kind: 'GuiLai',
      }),
    ).toMatchObject({ ok: false, failure: { retryAfterSeconds: 1 } });
    goTo(3600); // hàng đầu đúng 3 600 giây tuổi: không còn được đếm
    expect(
      (
        await fx.service.issue({
          taiKhoanId: account.taiKhoanId,
          kind: 'GuiLai',
        })
      ).ok,
    ).toBe(true);
  });

  it('NSB14-37 giá trị cấu hình khác mặc định: 10 giây và 2 lần mỗi giờ', async () => {
    const custom = createActivationFixture(db, fx.mail, {
      STAFF_ACTIVATION_RESEND_MIN_SECONDS: 10,
      STAFF_ACTIVATION_RESEND_MAX_PER_HOUR: 2,
    });
    const account = await newPendingStaff(db);
    await issueAndDeliver(custom, account, 'TaoMoi');
    goTo(10);
    await issueAndDeliver(custom, account);
    goTo(20);
    expect(
      await custom.service.issue({
        taiKhoanId: account.taiKhoanId,
        kind: 'GuiLai',
      }),
    ).toMatchObject({
      ok: false,
      failure: { reason: 'HOURLY_LIMIT', retryAfterSeconds: 3580 },
    });
  });
});

describe('thứ tự thu hồi rồi đặt da_gui_luc và hoàn tất đảo thứ tự (TK-46, quy tắc 21 và ràng buộc 22)', () => {
  it('NSB14-38 (TK-46) thứ tự là BẮT BUỘC: đặt da_gui_luc cho hàng mới TRƯỚC khi thu hồi hàng cũ vi phạm UNIQUE; thu hồi rồi đặt thì không', async () => {
    const account = await newPendingStaff(db);
    const first = await issueAndDeliver(fx, account, 'TaoMoi');
    goTo(61);
    const issued = await issueOk(fx.service, account.taiKhoanId);

    let wrongOrder: unknown;
    try {
      await db.query(
        'UPDATE ma_xac_thuc SET da_gui_luc = ? WHERE ma_xac_thuc_id = ?',
        [at(61), issued.maXacThucId],
      );
    } catch (error) {
      wrongOrder = error;
    }
    expect(isDuplicateKeyError(wrongOrder)).toBe(true);
    expect((await linkRowOf(db, issued.maXacThucId)).daGuiLuc).toBeNull();

    await db.query(
      'UPDATE ma_xac_thuc SET thu_hoi_luc = ? WHERE ma_xac_thuc_id = ?',
      [at(61), first.id],
    );
    await db.query(
      'UPDATE ma_xac_thuc SET da_gui_luc = ? WHERE ma_xac_thuc_id = ?',
      [at(61), issued.maXacThucId],
    );
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
  });

  it.each(['liên kết MỚI trả lời trước', 'liên kết CŨ trả lời trước'] as const)(
    'NSB14-40 hai lần gửi lại cách nhau ≥ 60 giây hoàn tất ĐẢO THỨ TỰ (%s): cuối cùng đúng MỘT hợp lệ là hàng id lớn nhất, không 1062',
    async (order) => {
      const mail = new ControlledMailService();
      const held = createActivationFixture(db, mail);
      const account = await newPendingStaff(db);
      const issuedOld = await issueOk(held.service, account.taiKhoanId);
      goTo(61);
      const issuedNew = await issueOk(held.service, account.taiKhoanId);

      mail.holding = true;
      const oldPromise = held.service.deliver(issuedOld, recipientOf(account));
      const newPromise = held.service.deliver(issuedNew, recipientOf(account));
      await mail.waitForPending(2);
      if (order === 'liên kết MỚI trả lời trước') {
        mail.release(1);
        await expect(newPromise).resolves.toMatchObject({ ok: true });
        mail.release(0);
        await expect(oldPromise).resolves.toMatchObject({ ok: true });
      } else {
        mail.release(0);
        await expect(oldPromise).resolves.toMatchObject({ ok: true });
        mail.release(0);
        await expect(newPromise).resolves.toMatchObject({ ok: true });
      }

      expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
      expect(await stateOfRow(issuedNew.maXacThucId)).toBe('HOP_LE');
      const oldRow = await linkRowOf(db, issuedOld.maXacThucId);
      expect(oldRow.thuHoiLuc).not.toBeNull();
      expect(oldRow.kichHoatDangHieuLuc).toBeNull();
    },
  );
});

describe('giao dịch, thư và log (NS-19, NS-21)', () => {
  it('NSB14-41 giao dịch của người gọi ném sau `issue` (giả B15 vừa tạo tai_khoan): rollback sạch, không hàng nào, không thư', async () => {
    await expect(
      fx.service.transaction(async (em) => {
        const account = await newPendingStaff(em);
        const result = await fx.service.issue(
          { taiKhoanId: account.taiKhoanId, kind: 'TaoMoi' },
          { manager: em },
        );
        expect(result.ok).toBe(true);
        throw new Error('lỗi sau issue');
      }),
    ).rejects.toThrow('lỗi sau issue');

    expect(await db.getRepository(TaiKhoan).count()).toBe(0);
    expect(await db.getRepository(MaXacThuc).count()).toBe(0);
    expect(fx.mail.attempts).toHaveLength(0);
  });

  it('NSB14-42 (NS-19) thư gửi NGOÀI giao dịch: trong lúc send bị giữ không có giao dịch nào của dịch vụ, khoá hàng tai_khoan lấy được ngay (NOWAIT), hàng mới còn "mới tạo"', async () => {
    const mail = new ControlledMailService();
    const held = createActivationFixture(db, mail);
    const account = await newPendingStaff(db);
    const issued = await issueOk(held.service, account.taiKhoanId);

    mail.holding = true;
    const delivering = held.service.deliver(issued, recipientOf(account));
    await mail.waitForPending(1);

    // (1) Không còn giao dịch InnoDB nào đang chạy trên DB test (đếm theo PROCESSLIST.DB để không lẫn việc của cửa sổ khác dùng chung MySQL)
    const open: { n: string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM information_schema.INNODB_TRX t JOIN performance_schema.processlist p ON p.ID = t.trx_mysql_thread_id WHERE p.DB = ?',
      [String(db.options.database)],
    );
    expect(Number(open[0]?.n)).toBe(0);

    // (2) Khoá hàng tai_khoan bằng NOWAIT thành công: không ai đang giữ khoá
    const runner = db.createQueryRunner();
    try {
      await runner.startTransaction();
      await expect(
        runner.query(
          'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE NOWAIT',
          [account.taiKhoanId],
        ),
      ).resolves.toHaveLength(1);
      await runner.rollbackTransaction();
    } finally {
      await runner.release();
    }

    // (3) Liên kết mới vẫn chưa có hiệu lực cho tới khi thư được nhận
    expect(await stateOfRow(issued.maXacThucId)).toBe('MOI_TAO');
    mail.release();
    await expect(delivering).resolves.toMatchObject({ ok: true });
    expect(await stateOfRow(issued.maXacThucId)).toBe('HOP_LE');
  });

  it('NSB14-43 (NS-21) quét log toàn luồng với token thật: không token, URL, băm, email người nhận ở log, kết quả hay lỗi; chẩn đoán còn', async () => {
    const account = await newPendingStaff(db, 'BacSi');
    const surfaces: string[] = [];
    const surface = (value: unknown): void => {
      surfaces.push(JSON.stringify(value), inspect(value, { depth: 10 }));
    };

    const first = await issueAndDeliver(fx, account, 'TaoMoi'); // thư tạo mới
    surface(first);
    goTo(61);
    fx.mail.failNextWith('CONNECTION'); // gửi lỗi
    const failed = await issueAndDeliver(fx, account);
    surface(failed);
    goTo(122);
    const third = await issueAndDeliver(fx, account); // gửi lại thành công
    surface(third);
    goTo(123);
    const refused = await fx.service.issue({
      taiKhoanId: account.taiKhoanId,
      kind: 'GuiLai',
    }); // bị giới hạn
    surface(refused);
    if (!refused.ok) {
      surface(toIssueException(refused.failure).getResponse());
      surface(toIssueException(refused.failure));
    }
    // Lỗi lập trình: lấy URL lần hai
    goTo(200);
    const issued = await issueOk(fx.service, account.taiKhoanId);
    await fx.service.deliver(issued, recipientOf(account));
    let reuseError: unknown;
    try {
      IssuedActivationLink.revealForDelivery(issued);
    } catch (error) {
      reuseError = error;
    }
    surface(reuseError);
    surfaces.push(String((reuseError as Error).stack));

    const secrets: string[] = [];
    for (const message of fx.mail.attempts) {
      const parsed = parseActivationMail(message);
      secrets.push(parsed.token, parsed.url);
    }
    for (const row of await linkRowsOf(db, account.taiKhoanId)) {
      secrets.push(row.maBam);
    }
    expect(secrets.length).toBeGreaterThanOrEqual(8);

    const everything = [...logs, ...surfaces].join('\n');
    for (const secret of secrets) expect(everything).not.toContain(secret);
    expect(logs.join('\n')).not.toContain(account.email);
    expect(logs.join('\n')).not.toMatch(/\b[0-9a-f]{64}\b/);
    // Chẩn đoán vẫn còn: id hàng và loại lỗi gửi thư
    expect(logs.join('\n')).toContain(
      `Liên kết kích hoạt ${failed.id} gửi lỗi (CONNECTION)`,
    );
    expect(logs.join('\n')).toContain(`Liên kết kích hoạt ${third.id} đã gửi`);
  });

  it('NSB14-44 tài khoản Bệnh nhân, đang hoạt động hoặc đã ngưng ⇒ từ chối, không hàng nào, không thư', async () => {
    const cases = [
      await newAccount(db, 'BenhNhan', 'DangHoatDong'),
      await newAccount(db, 'LeTan', 'DangHoatDong'),
      await newAccount(db, 'BacSi', 'NgungHoatDong'),
      await newAccount(db, 'QuanTriVien', 'DangHoatDong'),
    ];
    for (const account of cases) {
      expect(
        await fx.service.issue({
          taiKhoanId: account.taiKhoanId,
          kind: 'GuiLai',
        }),
      ).toEqual({
        ok: false,
        failure: {
          code: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
          reason: 'NOT_PENDING_STAFF',
        },
      });
    }
    expect(await db.getRepository(MaXacThuc).count()).toBe(0);
    expect(fx.mail.attempts).toHaveLength(0);
  });

  it('NSB14-45 (TECH_DEBT 30) người gọi dùng giao dịch THÔ (không qua transaction): vẫn đúng nhờ đọc khoá, thấy hàng vừa commit của bên kia, và cảnh báo một lần', async () => {
    const account = await newPendingStaff(db);
    const run = () =>
      db.transaction((em) =>
        fx.service.issue(
          { taiKhoanId: account.taiKhoanId, kind: 'GuiLai' },
          { manager: em },
        ),
      );
    const first = await run();
    expect(first.ok).toBe(true);
    const second = await run(); // cùng giây ⇒ thấy hàng đã commit của lần trước
    expect(second).toMatchObject({
      ok: false,
      failure: { reason: 'TOO_SOON' },
    });
    expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(1);
    expect(
      logs.filter((line) =>
        line.includes('KHÔNG do ActivationLinkService.transaction mở'),
      ),
    ).toHaveLength(1);
  });
});
