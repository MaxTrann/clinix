import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { MailSendError } from '../../mail/mail-send.error.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import {
  OTP_MAX_WRONG_ATTEMPTS,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
} from '../auth.constants.js';
import { BenhNhan } from '../entities/benh-nhan.entity.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  insertMaXacThuc,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';
import {
  ControlledMailService,
  REGISTRATION,
  T0,
  at,
  captureNestLogger,
  createOtpFixture,
  forgotInput,
  issueDeliverRead,
  issueOk,
  newUnverifiedAccount,
  recipientOf,
  registerInput,
  rowOf,
  rowsOf,
  wrongCodeFor,
  type OtpFixture,
} from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import { hashOtp } from './otp-code.js';
import { OtpDeliveryError } from './otp-errors.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';

// Task A2 — OtpService trên MySQL 8.4 thật, đồng hồ giả (chỉ giả Date). Mã test case của plan:
//  ĐK b6/b8–b9, A2/4c–4d, A3, A4, A5 và QMK b5/b7, A2, A3, A6: DK-01, DK-12..DK-16, DK-18..DK-26, DK-31, DK-44, DK-45, DK-48..DK-50;
//  QM-05, QM-06, QM-09, QM-10, QM-13 (mức consume), N1, N2, N3, N6. Chạy đua: otp.service.concurrency.int-spec.ts. Log: otp.service.logging.int-spec.ts.
// Mã nội bộ OTP-Inn là [đề xuất] (plan chưa có mã test case riêng cho A2 ngoài các ca DK/QM).
const HMAC_KEY = Buffer.from(TEST_AUTH_ENV.OTP_HMAC_SECRET, 'utf8');

let db: DataSource;
let fx: OtpFixture<FakeMailService>;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

beforeEach(async () => {
  await resetTables(db);
  vi.useFakeTimers({ toFake: ['Date'] }); // chỉ giả Date; bộ hẹn giờ thật vẫn chạy nên kết nối MySQL không bị ảnh hưởng
  vi.setSystemTime(T0);
  captureNestLogger(); // không in log của OtpService ra màn hình; ca nào cần xem log tự bắt lại
  fx = createOtpFixture(db);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db?.destroy();
});

const goTo = (seconds: number) => vi.setSystemTime(at(seconds));

describe('issue — pha 1: cấp mã (DK-01, N1, S3, G2)', () => {
  it('OTP-I01 đăng ký: hàng mới có đủ cột, mã băm là HMAC gồm cả ma_xac_thuc_id, hạn 10 phút, CHƯA gửi thư', async () => {
    const account = await newUnverifiedAccount(db);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));

    const row = await rowOf(db, issued.maXacThucId);
    expect(row).toMatchObject({
      taiKhoanId: account.taiKhoanId,
      loai: 'DangKy',
      daGuiLuc: null,
      thuHoiLuc: null,
      daDungLuc: null,
      soLanNhapSai: 0,
      hoTenDangKy: REGISTRATION.hoTen,
      soDienThoaiDangKy: REGISTRATION.soDienThoai,
      matKhauBamDangKy: REGISTRATION.matKhauBam,
    });
    expect(row.taoLuc).toEqual(T0);
    expect(row.hetHanLuc).toEqual(at(OTP_TTL_MS / 1000));
    expect(issued.hetHanLuc).toEqual(row.hetHanLuc);
    expect(row.maBam).toMatch(/^[0-9a-f]{64}$/);
    expect(fx.mail.attempts).toHaveLength(0); // pha 1 không đụng mạng
  });

  it('OTP-I02 `ma_bam` đúng bằng HMAC(tai_khoan_id | loai | ma_xac_thuc_id | mã) với khoá cấu hình (DK-01)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    const row = await rowOf(db, id);
    expect(row.maBam).toBe(
      hashOtp(HMAC_KEY, {
        taiKhoanId: account.taiKhoanId,
        loai: 'DangKy',
        maXacThucId: id,
        code,
      }),
    );
  });

  it('OTP-I03 quên mật khẩu: không có dữ liệu đăng ký (ba cột NULL)', async () => {
    const account = await insertTaiKhoan(db);
    const issued = await issueOk(fx.otp, forgotInput(account.taiKhoanId));
    expect(await rowOf(db, issued.maXacThucId)).toMatchObject({
      loai: 'QuenMatKhau',
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    });
  });

  it('OTP-I04 mọi mốc thời gian lấy từ đồng hồ ứng dụng và cắt xuống giây (không dùng NOW() của DB)', async () => {
    const account = await newUnverifiedAccount(db);
    vi.setSystemTime(new Date(T0.getTime() + 900)); // 08:00:00.900
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    const row = await rowOf(db, issued.maXacThucId);
    expect(row.taoLuc).toEqual(T0);
    expect(row.hetHanLuc).toEqual(at(600));
    const [stored] = (await db.query(
      "SELECT DATE_FORMAT(tao_luc, '%Y-%m-%d %H:%i:%s') AS tao_luc FROM ma_xac_thuc WHERE ma_xac_thuc_id = ?",
      [issued.maXacThucId],
    )) as { tao_luc: string }[];
    expect(stored?.tao_luc).toBe('2026-11-02 08:00:00'); // giờ Việt Nam, không phải giờ thật của máy đang chạy
  });

  it('OTP-I05 tài khoản không tồn tại là lỗi lập trình (ném), không phải kết quả nghiệp vụ', async () => {
    await expect(fx.otp.issue(registerInput('999999'))).rejects.toThrow(
      'Không có tài khoản',
    );
  });

  it('OTP-I06 chạy trong giao dịch của người gọi: người gọi rollback thì hàng OTP cũng mất; commit thì còn', async () => {
    const account = await newUnverifiedAccount(db);
    await expect(
      db.transaction(async (em) => {
        await fx.otp.issue(registerInput(account.taiKhoanId), { manager: em });
        throw new Error('người gọi rollback');
      }),
    ).rejects.toThrow('người gọi rollback');
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(0);

    await db.transaction((em) =>
      fx.otp.issue(registerInput(account.taiKhoanId), { manager: em }),
    );
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(1);
  });
});

describe('giới hạn gửi lại (DK-13, DK-14, DK-15, DK-26, QM-10)', () => {
  it('OTP-L01 cách mã trước 59 giây thì từ chối (chờ 1 giây), đúng 60 giây thì được (DK-13, DK-14)', async () => {
    const account = await newUnverifiedAccount(db);
    await issueOk(fx.otp, registerInput(account.taiKhoanId));
    goTo(59);
    const tooSoon = await fx.otp.issue(registerInput(account.taiKhoanId));
    expect(tooSoon).toEqual({
      ok: false,
      failure: {
        code: 'GUI_LAI_QUA_SOM',
        reason: 'TOO_SOON',
        retryAfterSeconds: 1,
      },
    });
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(1);
    goTo(60);
    expect((await fx.otp.issue(registerInput(account.taiKhoanId))).ok).toBe(
      true,
    );
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(2);
  });

  it('OTP-L02 5 mã trong 1 giờ: mã thứ 5 vẫn được, thứ 6 bị từ chối; đúng 1 giờ sau mã đầu thì lại được (DK-15)', async () => {
    const account = await newUnverifiedAccount(db);
    for (const seconds of [0, 61, 122, 183, 244]) {
      goTo(seconds);
      expect(
        (await fx.otp.issue(registerInput(account.taiKhoanId))).ok,
        `mã lúc ${String(seconds)}s`,
      ).toBe(true);
    }
    goTo(305);
    expect(await fx.otp.issue(registerInput(account.taiKhoanId))).toEqual({
      ok: false,
      failure: {
        code: 'GUI_LAI_QUA_SOM',
        reason: 'HOURLY_LIMIT',
        retryAfterSeconds: 3295,
      },
    });
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(5);

    goTo(3599); // mã đầu (lúc 0s) còn trong cửa sổ
    expect((await fx.otp.issue(registerInput(account.taiKhoanId))).ok).toBe(
      false,
    );
    goTo(3600); // mã đầu đúng 1 giờ tuổi: không còn được đếm
    expect((await fx.otp.issue(registerInput(account.taiKhoanId))).ok).toBe(
      true,
    );
  });

  it('OTP-L03 hàng GỬI LỖI vẫn tính vào cả hai giới hạn (DK-26)', async () => {
    const account = await newUnverifiedAccount(db);
    fx.mail.failAllWith('CONNECTION');
    // lỗi gửi vẫn bị tính 60 giây
    await expect(
      fx.otp.issueAndDeliver(
        registerInput(account.taiKhoanId),
        recipientOf(account),
      ),
    ).rejects.toBeInstanceOf(OtpDeliveryError);
    goTo(30);
    expect((await fx.otp.issue(registerInput(account.taiKhoanId))).ok).toBe(
      false,
    );
    // 5 hàng đều lỗi thì hàng thứ 6 bị từ chối vì quá 5/giờ
    for (const seconds of [61, 122, 183, 244]) {
      goTo(seconds);
      await expect(
        fx.otp.issueAndDeliver(
          registerInput(account.taiKhoanId),
          recipientOf(account),
        ),
      ).rejects.toBeInstanceOf(OtpDeliveryError);
    }
    goTo(305);
    expect(await fx.otp.issue(registerInput(account.taiKhoanId))).toMatchObject(
      {
        ok: false,
        failure: { reason: 'HOURLY_LIMIT' },
      },
    );
    const rows = await rowsOf(db, account.taiKhoanId);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.daGuiLuc === null && r.thuHoiLuc !== null)).toBe(
      true,
    );
  });

  it('OTP-L04 đếm RIÊNG theo loại (QM-10): 5 mã DangKy không chặn QuenMatKhau; 59/60 giây của QuenMatKhau tính riêng', async () => {
    const account = await newUnverifiedAccount(db);
    for (const seconds of [0, 61, 122, 183, 244]) {
      goTo(seconds);
      await issueOk(fx.otp, registerInput(account.taiKhoanId));
    }
    goTo(305);
    expect((await fx.otp.issue(registerInput(account.taiKhoanId))).ok).toBe(
      false,
    );
    await issueOk(fx.otp, forgotInput(account.taiKhoanId)); // QuenMatKhau chưa có hàng nào
    goTo(305 + 59);
    expect((await fx.otp.issue(forgotInput(account.taiKhoanId))).ok).toBe(
      false,
    );
    goTo(305 + 60);
    expect((await fx.otp.issue(forgotInput(account.taiKhoanId))).ok).toBe(true);
  });

  it('OTP-L05 hàng của tài khoản khác và hàng KichHoatNhanSu (module admin) không bị tính', async () => {
    const account = await newUnverifiedAccount(db);
    const other = await newUnverifiedAccount(db);
    await issueOk(fx.otp, registerInput(other.taiKhoanId));
    await insertMaXacThuc(db, account.taiKhoanId, {
      loai: 'KichHoatNhanSu',
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
      taoLuc: T0,
    });
    expect((await fx.otp.issue(registerInput(account.taiKhoanId))).ok).toBe(
      true,
    );
  });

  it('OTP-L06 truy vấn đếm của repo: hàng tạo ĐÚNG mốc không được trả, hàng ngay sau mốc được trả (kể cả hàng gửi lỗi); hàng của loại hoặc tài khoản khác không được trả', async () => {
    const account = await newUnverifiedAccount(db);
    const other = await newUnverifiedAccount(db);
    await insertMaXacThuc(db, account.taiKhoanId, { taoLuc: at(0) }); // đúng mốc: không đếm (cửa sổ nửa mở)
    await insertMaXacThuc(db, account.taiKhoanId, { taoLuc: at(1) });
    await insertMaXacThuc(db, account.taiKhoanId, {
      taoLuc: at(2),
      thuHoiLuc: at(2), // hàng gửi lỗi: vẫn đếm (DK-26)
    });
    await insertMaXacThuc(db, other.taiKhoanId, { taoLuc: at(3) });
    await insertMaXacThuc(db, account.taiKhoanId, {
      loai: 'QuenMatKhau',
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
      taoLuc: at(4),
    });

    const times = await db.transaction((em) =>
      fx.repo.listCreatedSinceForUpdate(
        em,
        account.taiKhoanId,
        'DangKy',
        at(0),
      ),
    );
    expect(times).toEqual([at(1), at(2)]);
  });
});

describe('deliver — pha 2: gửi thư rồi ghi kết quả (N1, S3, DK-12, DK-25, DK-26, DK-48)', () => {
  it('OTP-D01 gửi thành công: thư tới đúng người, đúng mẫu "10 phút", da_gui_luc theo đồng hồ lúc gửi xong', async () => {
    const account = await newUnverifiedAccount(db, { hoTen: 'Trần Thị B' });
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    goTo(3);
    await fx.otp.deliver(issued, recipientOf(account));

    expect(fx.mail.sent).toHaveLength(1);
    const mail = fx.mail.sent[0];
    expect(mail?.to).toBe(account.email);
    expect(mail?.subject).toBe('[CLINIX] Mã xác minh OTP đăng ký tài khoản');
    expect(mail?.text).toContain(
      `Mã có hiệu lực trong ${String(OTP_TTL_MINUTES)} phút.`,
    );
    expect(mail?.text).toContain('Xin chào Trần Thị B,');
    const row = await rowOf(db, issued.maXacThucId);
    expect(row.daGuiLuc).toEqual(at(3));
    expect(row.thuHoiLuc).toBeNull();
  });

  it('OTP-D02 quên mật khẩu: mẫu riêng nêu email tài khoản và cảnh báo không chia sẻ mã', async () => {
    const account = await insertTaiKhoan(db);
    const issued = await issueOk(fx.otp, forgotInput(account.taiKhoanId));
    await fx.otp.deliver(issued, recipientOf(account));
    const mail = fx.mail.sent[0];
    expect(mail?.subject).toBe('[CLINIX] Mã OTP đặt lại mật khẩu');
    expect(mail?.text).toContain(account.email);
    expect(mail?.text).toContain('Không chia sẻ mã này với bất kỳ ai.');
  });

  it('OTP-D03 N1: ĐANG gửi thì mã cũ chưa bị đụng; chỉ khi send resolve mới đặt da_gui_luc rồi thu hồi mã cũ (DK-12)', async () => {
    const ctl = new ControlledMailService();
    const held = createOtpFixture(db, ctl);
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(held, account);

    goTo(61);
    ctl.holding = true;
    const issuedB = await issueOk(held.otp, registerInput(account.taiKhoanId));
    const delivering = held.otp.deliver(issuedB, recipientOf(account));
    await ctl.waitForPending(1);

    // GIỮA lúc gửi: mã cũ còn nguyên và vẫn dùng được; hàng mới chưa có hiệu lực
    expect((await rowOf(db, first.id)).thuHoiLuc).toBeNull();
    const midB = await rowOf(db, issuedB.maXacThucId);
    expect(midB.daGuiLuc).toBeNull();
    expect(midB.thuHoiLuc).toBeNull();
    expect(
      (
        await held.otp.verify({
          maXacThucId: first.id,
          loai: 'DangKy',
          otp: first.code,
        })
      ).ok,
    ).toBe(true);

    ctl.release();
    await delivering;
    expect((await rowOf(db, issuedB.maXacThucId)).daGuiLuc).toEqual(at(61));
    expect((await rowOf(db, first.id)).thuHoiLuc).toEqual(at(61));
  });

  it('OTP-D04 gửi lỗi khi đang có mã cũ còn hạn: hàng mới bị thu hồi, MÃ CŨ VẪN DÙNG ĐƯỢC và không bị thay thế (DK-26, QM-09)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    goTo(61);
    fx.mail.failNextWith('AUTH');
    const issuedB = await issueOk(fx.otp, registerInput(account.taiKhoanId));

    const error = await fx.otp
      .deliver(issuedB, recipientOf(account))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OtpDeliveryError);
    expect(error).toBeInstanceOf(MailSendError);
    expect(error).toMatchObject({
      kind: 'AUTH',
      maXacThucId: issuedB.maXacThucId,
    });

    const failedRow = await rowOf(db, issuedB.maXacThucId);
    expect(failedRow.thuHoiLuc).toEqual(at(61));
    expect(failedRow.daGuiLuc).toBeNull();
    expect((await rowOf(db, first.id)).thuHoiLuc).toBeNull();
    const verified = await fx.otp.verify({
      maXacThucId: first.id,
      loai: 'DangKy',
      otp: first.code,
    });
    expect(verified.ok).toBe(true);
    // hàng lỗi vẫn tính giới hạn 60 giây
    goTo(61 + 30);
    expect((await fx.otp.issue(registerInput(account.taiKhoanId))).ok).toBe(
      false,
    );
  });

  it('OTP-D05 đăng ký lần đầu mà gửi lỗi: tài khoản vẫn còn, hàng OTP bị thu hồi và chưa gửi, không xác minh được bằng hàng đó, không bị đếm sai (DK-25, DK-49)', async () => {
    const account = await newUnverifiedAccount(db);
    fx.mail.failNextWith('CONNECTION');
    const error = await fx.otp
      .issueAndDeliver(registerInput(account.taiKhoanId), recipientOf(account))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OtpDeliveryError);

    expect(
      await db
        .getRepository(TaiKhoan)
        .countBy({ taiKhoanId: account.taiKhoanId }),
    ).toBe(1);
    const [row] = await rowsOf(db, account.taiKhoanId);
    expect(row).toMatchObject({ daGuiLuc: null, soLanNhapSai: 0 });
    expect(row?.thuHoiLuc).not.toBeNull();

    const lastAttempt = fx.mail.attempts[0];
    if (!lastAttempt || !row) throw new Error('thiếu dữ liệu');
    const result = await fx.otp.verify({
      maXacThucId: row.maXacThucId,
      loai: 'DangKy',
      otp: readOtpFromMail(lastAttempt), // mã đúng nhưng thư chưa tới nơi: hàng chưa có hiệu lực
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'NOT_SENT' },
    });
    expect((await rowOf(db, row.maXacThucId)).soLanNhapSai).toBe(0);
  });

  it('OTP-D06 lỗi không phải MailSendError (lỗi lập trình) cũng thu hồi hàng mới rồi ném lại NGUYÊN lỗi', async () => {
    const account = await newUnverifiedAccount(db);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    const boom = new TypeError('lỗi lạ của người gọi');
    fx.mail.send = () => Promise.reject(boom);
    await expect(fx.otp.deliver(issued, recipientOf(account))).rejects.toBe(
      boom,
    );
    expect((await rowOf(db, issued.maXacThucId)).thuHoiLuc).not.toBeNull();
  });

  it('OTP-D07 mỗi IssuedOtp chỉ gửi được MỘT lần (không gửi trùng một mã)', async () => {
    const account = await newUnverifiedAccount(db);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    await fx.otp.deliver(issued, recipientOf(account));
    await expect(fx.otp.deliver(issued, recipientOf(account))).rejects.toThrow(
      'đã được lấy',
    );
    expect(fx.mail.attempts).toHaveLength(1);
  });

  it('OTP-D08 issueAndDeliver trả mã hàng và hạn, không có mã OTP (DK-40)', async () => {
    const account = await newUnverifiedAccount(db);
    const result = await fx.otp.issueAndDeliver(
      registerInput(account.taiKhoanId),
      recipientOf(account),
    );
    expect(result).toMatchObject({ ok: true, issued: { hetHanLuc: at(600) } });
    const attempt = fx.mail.attempts[0];
    if (!attempt) throw new Error('chưa có thư');
    expect(JSON.stringify(result)).not.toContain(readOtpFromMail(attempt));
  });

  it('OTP-D09 lần gửi chậm xong SAU khi lần mới hơn đã thành công: không đặt da_gui_luc cho hàng cũ, không thu hồi nhầm hàng mới', async () => {
    const ctl = new ControlledMailService();
    const held = createOtpFixture(db, ctl);
    const account = await newUnverifiedAccount(db);
    ctl.holding = true;

    const issuedA = await issueOk(held.otp, registerInput(account.taiKhoanId));
    const deliveringA = held.otp.deliver(issuedA, recipientOf(account));
    await ctl.waitForPending(1);

    goTo(61);
    const issuedB = await issueOk(held.otp, registerInput(account.taiKhoanId));
    const deliveringB = held.otp.deliver(issuedB, recipientOf(account));
    await ctl.waitForPending(2);

    ctl.release(1); // B xong trước
    await deliveringB;
    ctl.release(0); // A xong muộn
    await deliveringA;

    const a = await rowOf(db, issuedA.maXacThucId);
    const b = await rowOf(db, issuedB.maXacThucId);
    expect(b.daGuiLuc).toEqual(at(61));
    expect(b.thuHoiLuc).toBeNull(); // hàng mới KHÔNG bị thu hồi nhầm
    expect(a.thuHoiLuc).toEqual(at(61)); // bị B thu hồi lúc B thành công
    expect(a.daGuiLuc).toBeNull(); // thư của A đã đi nhưng mã không còn hiệu lực
  });

  it('OTP-D10 lần gửi CŨ xong TRƯỚC khi lần mới hơn xong: chỉ thu hồi mã cũ hơn, hàng mới đang gửi không bị thu hồi nhầm; mã cũ còn dùng được tới khi mã mới gửi xong (N1)', async () => {
    const ctl = new ControlledMailService();
    const held = createOtpFixture(db, ctl);
    const account = await newUnverifiedAccount(db);
    ctl.holding = true;

    const issuedA = await issueOk(held.otp, registerInput(account.taiKhoanId));
    const deliveringA = held.otp.deliver(issuedA, recipientOf(account));
    await ctl.waitForPending(1);

    goTo(61);
    const issuedB = await issueOk(held.otp, registerInput(account.taiKhoanId));
    const deliveringB = held.otp.deliver(issuedB, recipientOf(account));
    await ctl.waitForPending(2);
    const [mailA, mailB] = ctl.attempts;
    if (!mailA || !mailB) throw new Error('thiếu thư');

    ctl.release(0); // A xong TRƯỚC, B vẫn đang gửi
    await deliveringA;
    expect(await rowOf(db, issuedB.maXacThucId)).toMatchObject({
      daGuiLuc: null,
      thuHoiLuc: null, // B chưa xong nhưng KHÔNG bị thu hồi nhầm
    });
    expect(
      (
        await held.otp.verify({
          maXacThucId: issuedA.maXacThucId,
          loai: 'DangKy',
          otp: readOtpFromMail(mailA),
        })
      ).ok,
    ).toBe(true); // B chưa gửi xong nên A vẫn là mã mới nhất đã gửi

    ctl.release(0); // B xong (A đã rời hàng đợi nên B nằm ở chỉ số 0)
    await deliveringB;
    expect(await rowOf(db, issuedB.maXacThucId)).toMatchObject({
      daGuiLuc: at(61),
      thuHoiLuc: null,
    });
    expect((await rowOf(db, issuedA.maXacThucId)).thuHoiLuc).toEqual(at(61));
    expect(
      await held.otp.verify({
        maXacThucId: issuedA.maXacThucId,
        loai: 'DangKy',
        otp: readOtpFromMail(mailA),
      }),
    ).toMatchObject({ ok: false, failure: { code: 'OTP_BI_THAY_THE' } });
    expect(
      (
        await held.otp.verify({
          maXacThucId: issuedB.maXacThucId,
          loai: 'DangKy',
          otp: readOtpFromMail(mailB),
        })
      ).ok,
    ).toBe(true);
  });
});

describe('verify — kiểm hạn, đếm sai, thay thế (DK-16..DK-24, DK-31, DK-44, DK-48..DK-50, QM-05, QM-06, S3, D5)', () => {
  it('OTP-V01 đúng mã: thành công, trả dữ liệu đăng ký đọc từ chính hàng OTP, mặc định KHÔNG đánh dấu đã dùng', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    const result = await fx.otp.verify({
      maXacThucId: id,
      loai: 'DangKy',
      otp: code,
    });
    expect(result).toMatchObject({
      ok: true,
      otp: {
        maXacThucId: id,
        taiKhoanId: account.taiKhoanId,
        loai: 'DangKy',
        registration: REGISTRATION,
      },
    });
    expect((await rowOf(db, id)).daDungLuc).toBeNull();
    expect(
      (await fx.otp.verify({ maXacThucId: id, loai: 'DangKy', otp: code })).ok,
    ).toBe(true);
  });

  it('OTP-V02 sai 1 lần: báo sai, so_lan_nhap_sai = 1, nhập lại đúng vẫn được (DK-18); sai 4 lần rồi đúng vẫn thành công (DK-19, QM-05)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    const wrong = wrongCodeFor(code);
    expect(
      await fx.otp.verify({ maXacThucId: id, loai: 'DangKy', otp: wrong }),
    ).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'WRONG_CODE', wrongAttempts: 1 },
    });
    expect((await rowOf(db, id)).soLanNhapSai).toBe(1);
    for (let i = 2; i <= 4; i++) {
      await fx.otp.verify({ maXacThucId: id, loai: 'DangKy', otp: wrong });
    }
    const row = await rowOf(db, id);
    expect(row.soLanNhapSai).toBe(4);
    expect(row.thuHoiLuc).toBeNull(); // lần thứ 4 CHƯA thu hồi (ngưỡng 5, không lệch một)
    expect(
      (await fx.otp.verify({ maXacThucId: id, loai: 'DangKy', otp: code })).ok,
    ).toBe(true);
  });

  it('OTP-V03 sai đủ 5 lần: lần thứ 5 thu hồi ngay; sau đó mã đúng cũng bị từ chối và bộ đếm dừng ở 5 (DK-20, QM-06)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    const wrong = wrongCodeFor(code);
    for (let i = 1; i < OTP_MAX_WRONG_ATTEMPTS; i++) {
      const r = await fx.otp.verify({
        maXacThucId: id,
        loai: 'DangKy',
        otp: wrong,
      });
      expect(r).toMatchObject({
        ok: false,
        failure: { code: 'OTP_SAI', wrongAttempts: i },
      });
    }
    goTo(7);
    const fifth = await fx.otp.verify({
      maXacThucId: id,
      loai: 'DangKy',
      otp: wrong,
    });
    expect(fifth).toEqual({
      ok: false,
      failure: {
        code: 'OTP_HET_LUOT',
        reason: 'ATTEMPTS_EXHAUSTED',
        wrongAttempts: 5,
      },
    });
    const row = await rowOf(db, id);
    expect(row.soLanNhapSai).toBe(5);
    expect(row.thuHoiLuc).toEqual(at(7));

    for (const otp of [code, wrong]) {
      expect(
        await fx.otp.verify({ maXacThucId: id, loai: 'DangKy', otp }),
      ).toEqual({
        ok: false,
        failure: { code: 'OTP_HET_LUOT', reason: 'ATTEMPTS_EXHAUSTED' },
      });
    }
    expect((await rowOf(db, id)).soLanNhapSai).toBe(5);
  });

  it('OTP-V04 sau khi hết lượt, "Gửi lại mã" bằng chính maXacThucId: hàng mới sao chép dữ liệu đăng ký, bộ đếm = 0 (DK-21)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    for (let i = 0; i < OTP_MAX_WRONG_ATTEMPTS; i++) {
      await fx.otp.verify({
        maXacThucId: first.id,
        loai: 'DangKy',
        otp: wrongCodeFor(first.code),
      });
    }
    goTo(61);
    const again = await fx.otp.reissue({ maXacThucId: first.id });
    if (!again.ok) throw new Error(`gửi lại thất bại: ${again.failure.reason}`);
    await fx.otp.deliver(again.issued, recipientOf(account));
    const lastSent = fx.mail.sent[fx.mail.sent.length - 1];
    if (!lastSent) throw new Error('chưa có thư');
    const secondCode = readOtpFromMail(lastSent);

    const row = await rowOf(db, again.issued.maXacThucId);
    expect(row).toMatchObject({
      soLanNhapSai: 0,
      hoTenDangKy: REGISTRATION.hoTen,
      soDienThoaiDangKy: REGISTRATION.soDienThoai,
      matKhauBamDangKy: REGISTRATION.matKhauBam,
    });
    expect((await rowOf(db, first.id)).thuHoiLuc).not.toBeNull();
    expect(
      (
        await fx.otp.verify({
          maXacThucId: again.issued.maXacThucId,
          loai: 'DangKy',
          otp: secondCode,
        })
      ).ok,
    ).toBe(true);
  });

  it.each([
    [599, true],
    [600, false],
    [601, false],
  ])(
    'OTP-V05 đúng mã ở giây %s: thành công = %s (hạn 10 phút, nửa mở; DK-22)',
    async (seconds, expectedOk) => {
      const account = await newUnverifiedAccount(db);
      const { id, code } = await issueDeliverRead(fx, account);
      goTo(seconds);
      const result = await fx.otp.verify({
        maXacThucId: id,
        loai: 'DangKy',
        otp: code,
      });
      expect(result.ok).toBe(expectedOk);
      if (!result.ok)
        expect(result.failure).toEqual({
          code: 'OTP_HET_HAN',
          reason: 'EXPIRED',
        });
    },
  );

  it('OTP-V06 mã SAI và quá hạn: báo "hết hạn", KHÔNG tăng so_lan_nhap_sai (kiểm hạn trước số lần sai; DK-23, S3, D5)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    goTo(601);
    const result = await fx.otp.verify({
      maXacThucId: id,
      loai: 'DangKy',
      otp: wrongCodeFor(code),
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: 'OTP_HET_HAN', reason: 'EXPIRED' },
    });
    expect((await rowOf(db, id)).soLanNhapSai).toBe(0);
  });

  it('OTP-V07 hết hạn → "Gửi lại mã" → mã mới xác minh được (DK-24)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    goTo(601);
    const again = await fx.otp.reissue({ maXacThucId: first.id });
    if (!again.ok) throw new Error(`gửi lại thất bại: ${again.failure.reason}`);
    await fx.otp.deliver(again.issued, recipientOf(account));
    const lastMail = fx.mail.sent[fx.mail.sent.length - 1];
    if (!lastMail) throw new Error('chưa có thư');
    const code = readOtpFromMail(lastMail);
    expect(
      (
        await fx.otp.verify({
          maXacThucId: again.issued.maXacThucId,
          loai: 'DangKy',
          otp: code,
        })
      ).ok,
    ).toBe(true);
  });

  it('OTP-V08 mã của hàng cũ sau khi có hàng mới ĐÃ GỬI THÀNH CÔNG: bị thay thế; gửi lại từ hàng cũ cũng bị từ chối (DK-16, DK-44)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    goTo(61);
    const second = await issueDeliverRead(fx, account);

    const replaced = {
      ok: false,
      failure: { code: 'OTP_BI_THAY_THE', reason: 'REPLACED' },
    };
    expect(
      await fx.otp.verify({
        maXacThucId: first.id,
        loai: 'DangKy',
        otp: first.code,
      }),
    ).toEqual(replaced);
    expect(await fx.otp.reissue({ maXacThucId: first.id })).toEqual(replaced);
    expect(
      (
        await fx.otp.verify({
          maXacThucId: second.id,
          loai: 'DangKy',
          otp: second.code,
        })
      ).ok,
    ).toBe(true);
  });

  it('OTP-V09 hàng mới nhất gửi lỗi: "Gửi lại mã" bằng chính maXacThucId đó được phép (không bị thay thế); thành công thì thu hồi hàng cũ (DK-48)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    goTo(61);
    fx.mail.failNextWith('TIMEOUT');
    const failed = await fx.otp
      .issueAndDeliver(registerInput(account.taiKhoanId), recipientOf(account))
      .catch((e: unknown) => e);
    if (!(failed instanceof OtpDeliveryError))
      throw new Error('mong đợi lỗi gửi');

    goTo(122);
    const again = await fx.otp.reissue({ maXacThucId: failed.maXacThucId });
    if (!again.ok) throw new Error(`gửi lại thất bại: ${again.failure.reason}`);
    await fx.otp.deliver(again.issued, recipientOf(account));
    const rows = await rowsOf(db, account.taiKhoanId);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ hoTenDangKy: REGISTRATION.hoTen });
    expect(rows[2]?.daGuiLuc).toEqual(at(122));
    expect(rows[0]?.maXacThucId).toBe(first.id);
    expect(rows[0]?.thuHoiLuc).toEqual(at(122)); // hàng cũ bị thu hồi chỉ lúc hàng mới gửi xong
  });

  it('OTP-V10 xác minh bằng maXacThucId của hàng CHƯA gửi thành công: từ chối, không tăng số lần sai (DK-49)', async () => {
    const account = await newUnverifiedAccount(db);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    const result = await fx.otp.verify({
      maXacThucId: issued.maXacThucId,
      loai: 'DangKy',
      otp: '123456',
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'NOT_SENT' },
    });
    expect((await rowOf(db, issued.maXacThucId)).soLanNhapSai).toBe(0);
  });

  it('OTP-V11 sau khi đặt lại mật khẩu trên tài khoản chưa xác minh (N3): xác minh và gửi lại bằng id cũ → CAN_DANG_KY_LAI; đăng nhập thấy CanDangKyLai; đăng ký lại cùng email dùng được (DK-50, DN-38, QM-17)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    await db.transaction(async (em) => {
      await fx.otp.revokePending(account.taiKhoanId, 'DangKy', { manager: em });
      await fx.otp.clearRegistrationData(account.taiKhoanId, { manager: em });
    });

    const voided = {
      ok: false,
      failure: { code: 'CAN_DANG_KY_LAI', reason: 'REGISTRATION_VOID' },
    };
    expect(
      await fx.otp.verify({
        maXacThucId: first.id,
        loai: 'DangKy',
        otp: first.code,
      }),
    ).toEqual(voided);
    expect(await fx.otp.reissue({ maXacThucId: first.id })).toEqual(voided);
    expect(await rowOf(db, first.id)).toMatchObject({
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    });
    expect(
      await fx.otp.latestStatus(account.taiKhoanId, 'DangKy'),
    ).toMatchObject({
      maXacThucId: first.id,
      trangThaiMa: 'CanDangKyLai',
    });

    goTo(61);
    const fresh = await issueDeliverRead(fx, account);
    expect(
      (
        await fx.otp.verify({
          maXacThucId: fresh.id,
          loai: 'DangKy',
          otp: fresh.code,
        })
      ).ok,
    ).toBe(true);
  });

  it('OTP-V12 mã QuenMatKhau dùng cho đăng ký (và ngược lại) bị từ chối, không đếm lần sai (DK-31)', async () => {
    const account = await newUnverifiedAccount(db);
    const register = await issueDeliverRead(fx, account, 'DangKy');
    goTo(61);
    const forgot = await issueDeliverRead(fx, account, 'QuenMatKhau');

    const wrongType = {
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'WRONG_TYPE' },
    };
    expect(
      await fx.otp.verify({
        maXacThucId: forgot.id,
        loai: 'DangKy',
        otp: forgot.code,
      }),
    ).toEqual(wrongType);
    expect(
      await fx.otp.verify({
        maXacThucId: register.id,
        loai: 'QuenMatKhau',
        otp: register.code,
      }),
    ).toEqual(wrongType);
    expect((await rowOf(db, forgot.id)).soLanNhapSai).toBe(0);
    expect((await rowOf(db, register.id)).soLanNhapSai).toBe(0);
  });

  it('OTP-V13 `expectedTaiKhoanId` sai: từ chối NGAY, không khoá, KHÔNG đếm lần sai dù thử nhiều lần; đúng thì xác minh bình thường (giảm nhẹ dò id tuần tự)', async () => {
    const victim = await newUnverifiedAccount(db);
    const stranger = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, victim);

    for (let i = 0; i < 10; i++) {
      const r = await fx.otp.verify({
        maXacThucId: id,
        loai: 'DangKy',
        otp: wrongCodeFor(code),
        expectedTaiKhoanId: stranger.taiKhoanId,
      });
      expect(r).toEqual({
        ok: false,
        failure: { code: 'OTP_SAI', reason: 'WRONG_ACCOUNT' },
      });
    }
    const row = await rowOf(db, id);
    expect(row.soLanNhapSai).toBe(0);
    expect(row.thuHoiLuc).toBeNull();
    expect(
      await fx.otp.reissue({
        maXacThucId: id,
        expectedTaiKhoanId: stranger.taiKhoanId,
      }),
    ).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'WRONG_ACCOUNT' },
    });
    expect(await rowsOf(db, victim.taiKhoanId)).toHaveLength(1);

    expect(
      (
        await fx.otp.verify({
          maXacThucId: id,
          loai: 'DangKy',
          otp: code,
          expectedTaiKhoanId: victim.taiKhoanId,
        })
      ).ok,
    ).toBe(true);
  });

  it('OTP-V14 băm của hàng này đem gắn sang hàng khác (cùng tài khoản, cùng loại) KHÔNG dùng được: HMAC có ma_xac_thuc_id (DK-31)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    const firstHash = (await rowOf(db, first.id)).maBam;
    goTo(61);
    const second = await issueDeliverRead(fx, account);
    await db
      .getRepository(MaXacThuc)
      .update({ maXacThucId: second.id }, { maBam: firstHash });

    const result = await fx.otp.verify({
      maXacThucId: second.id,
      loai: 'DangKy',
      otp: first.code,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'WRONG_CODE' },
    });
  });

  it('OTP-V15 mã không đúng dạng 6 chữ số cũng tính là một lần nhập sai (không có đường tắt để dò trạng thái miễn phí)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id } = await issueDeliverRead(fx, account);
    for (const bad of ['abc', '', '12345', '1234567', ' 123456']) {
      const r = await fx.otp.verify({
        maXacThucId: id,
        loai: 'DangKy',
        otp: bad,
      });
      expect(r, JSON.stringify(bad)).toMatchObject({
        ok: false,
        failure: {
          code: expect.stringMatching(/OTP_SAI|OTP_HET_LUOT/) as string,
        },
      });
    }
    expect((await rowOf(db, id)).soLanNhapSai).toBe(5);
  });

  it('OTP-V16 không có hàng nào với maXacThucId / tài khoản đó: OTP_SAI NOT_FOUND', async () => {
    const account = await newUnverifiedAccount(db);
    expect(
      await fx.otp.verify({
        maXacThucId: '999999',
        loai: 'DangKy',
        otp: '123456',
      }),
    ).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'NOT_FOUND' },
    });
    expect(
      await fx.otp.verify({
        taiKhoanId: account.taiKhoanId,
        loai: 'QuenMatKhau',
        otp: '123456',
      }),
    ).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'NOT_FOUND' },
    });
  });

  it('OTP-V17 quên mật khẩu theo tài khoản: lấy mã đã gửi MỚI NHẤT; mã cũ bị thay thế nên sai; không đánh dấu đã dùng (QM-05)', async () => {
    const account = await insertTaiKhoan(db);
    const older = await issueDeliverRead(fx, account, 'QuenMatKhau');
    goTo(61);
    const newer = await issueDeliverRead(fx, account, 'QuenMatKhau');

    expect(
      await fx.otp.verify({
        taiKhoanId: account.taiKhoanId,
        loai: 'QuenMatKhau',
        otp: older.code,
      }),
    ).toMatchObject({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'WRONG_CODE' },
    });
    const ok = await fx.otp.verify({
      taiKhoanId: account.taiKhoanId,
      loai: 'QuenMatKhau',
      otp: newer.code,
    });
    expect(ok).toMatchObject({ ok: true, otp: { maXacThucId: newer.id } });
    expect((await rowOf(db, newer.id)).daDungLuc).toBeNull();
  });

  it('OTP-V18 consume + onVerified: đánh dấu đã dùng và chạy việc của người gọi TRONG CÙNG giao dịch; dùng lại bị từ chối (DK-02, DK-30)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    goTo(10);

    const result = await fx.otp.verify(
      { maXacThucId: id, loai: 'DangKy', otp: code },
      { consume: true },
      async ({ manager, otp, now }) => {
        await manager.update(
          TaiKhoan,
          { taiKhoanId: otp.taiKhoanId },
          { hoTen: otp.registration?.hoTen ?? 'x', daXacMinhEmail: true },
        );
        await manager.insert(BenhNhan, { taiKhoanId: otp.taiKhoanId });
        return now;
      },
    );

    expect(result).toMatchObject({ ok: true, value: at(10) });
    expect((await rowOf(db, id)).daDungLuc).toEqual(at(10));
    expect(
      await db
        .getRepository(TaiKhoan)
        .findOneByOrFail({ taiKhoanId: account.taiKhoanId }),
    ).toMatchObject({ daXacMinhEmail: true });
    expect(
      await db
        .getRepository(BenhNhan)
        .countBy({ taiKhoanId: account.taiKhoanId }),
    ).toBe(1);
    expect(
      await fx.otp.verify({ maXacThucId: id, loai: 'DangKy', otp: code }),
    ).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'USED' },
    });
  });

  it('OTP-V19 onVerified ném lỗi: ROLLBACK cả việc đánh dấu đã dùng lẫn việc của người gọi; mã vẫn dùng được (DK-03, QM-20)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);

    await expect(
      fx.otp.verify(
        { maXacThucId: id, loai: 'DangKy', otp: code },
        { consume: true },
        async ({ manager, otp }) => {
          await manager.insert(BenhNhan, { taiKhoanId: otp.taiKhoanId });
          throw new Error('lỗi giữa giao dịch của người gọi');
        },
      ),
    ).rejects.toThrow('lỗi giữa giao dịch của người gọi');

    expect((await rowOf(db, id)).daDungLuc).toBeNull();
    expect(
      await db
        .getRepository(BenhNhan)
        .countBy({ taiKhoanId: account.taiKhoanId }),
    ).toBe(0);
    expect(
      (await fx.otp.verify({ maXacThucId: id, loai: 'DangKy', otp: code })).ok,
    ).toBe(true);
  });

  it('OTP-V20 lần đếm sai được COMMIT riêng: người gọi ném lỗi ngay sau đó cũng không làm mất lần đếm (chặn thử vô hạn)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    await expect(
      db.transaction(async () => {
        await fx.otp.verify({
          maXacThucId: id,
          loai: 'DangKy',
          otp: wrongCodeFor(code),
        });
        throw new Error('controller ném AppException sau khi verify');
      }),
    ).rejects.toThrow('controller ném');
    expect((await rowOf(db, id)).soLanNhapSai).toBe(1);
  });
});

describe('consume — đặt mật khẩu quên (A12; S2, N6, QM-13)', () => {
  async function sentRow(account: TaiKhoan) {
    return issueDeliverRead(fx, account, 'QuenMatKhau');
  }
  const consume = (
    id: string,
    taiKhoanId: string,
    loai: 'DangKy' | 'QuenMatKhau' = 'QuenMatKhau',
  ) =>
    db.transaction((em) =>
      fx.otp.consume({ maXacThucId: id, taiKhoanId, loai }, { manager: em }),
    );

  it('OTP-C01 hàng đã gửi, chưa dùng, chưa thu hồi: đặt da_gui đã dùng; lần hai bị từ chối USED', async () => {
    const account = await insertTaiKhoan(db);
    const { id } = await sentRow(account);
    goTo(5);
    expect(await consume(id, account.taiKhoanId)).toEqual({ ok: true });
    expect((await rowOf(db, id)).daDungLuc).toEqual(at(5));
    expect(await consume(id, account.taiKhoanId)).toEqual({
      ok: false,
      reason: 'USED',
    });
  });

  it('OTP-C02 KHÔNG kiểm lại hạn của OTP (N6): quá hạn vẫn dùng được', async () => {
    const account = await insertTaiKhoan(db);
    const { id } = await sentRow(account);
    goTo(3600);
    expect(await consume(id, account.taiKhoanId)).toEqual({ ok: true });
  });

  it.each([
    ['đã thu hồi', 'REVOKED'],
    ['chưa gửi thành công', 'NOT_SENT'],
  ] as const)('OTP-C03 hàng %s: từ chối %s', async (kind, reason) => {
    const account = await insertTaiKhoan(db);
    const { id } = await sentRow(account);
    if (reason === 'REVOKED')
      await db
        .getRepository(MaXacThuc)
        .update({ maXacThucId: id }, { thuHoiLuc: T0 });
    else
      await db
        .getRepository(MaXacThuc)
        .update({ maXacThucId: id }, { daGuiLuc: null });
    expect(await consume(id, account.taiKhoanId), kind).toEqual({
      ok: false,
      reason,
    });
  });

  it('OTP-C04 resetToken của A kèm dữ liệu của B, sai loại, không tồn tại: từ chối, không đổi gì (QM-12)', async () => {
    const a = await insertTaiKhoan(db);
    const b = await insertTaiKhoan(db);
    const { id } = await sentRow(a);
    expect(await consume(id, b.taiKhoanId)).toEqual({
      ok: false,
      reason: 'WRONG_ACCOUNT',
    });
    expect(await consume(id, a.taiKhoanId, 'DangKy')).toEqual({
      ok: false,
      reason: 'WRONG_TYPE',
    });
    expect(await consume('999999', a.taiKhoanId)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect((await rowOf(db, id)).daDungLuc).toBeNull();
  });

  it('OTP-C05 chạy trong giao dịch của người gọi: người gọi rollback thì hàng vẫn chưa dùng (QM-20)', async () => {
    const account = await insertTaiKhoan(db);
    const { id } = await sentRow(account);
    await expect(
      db.transaction(async (em) => {
        await fx.otp.consume(
          {
            maXacThucId: id,
            taiKhoanId: account.taiKhoanId,
            loai: 'QuenMatKhau',
          },
          { manager: em },
        );
        throw new Error('đổi mật khẩu lỗi');
      }),
    ).rejects.toThrow('đổi mật khẩu lỗi');
    expect((await rowOf(db, id)).daDungLuc).toBeNull();
  });
});

describe('revokePending, clearRegistrationData, latestStatus (A6, A8, A12; N2, N3, DK-45)', () => {
  it('OTP-R01 revokePending chỉ thu hồi hàng chưa dùng, chưa thu hồi của đúng (tài khoản, loại)', async () => {
    const account = await newUnverifiedAccount(db);
    const other = await newUnverifiedAccount(db);
    const pending = await issueDeliverRead(fx, account);
    const otherPending = await issueDeliverRead(fx, other);
    goTo(61);
    const forgot = await issueDeliverRead(fx, account, 'QuenMatKhau');

    const count = await db.transaction((em) =>
      fx.otp.revokePending(account.taiKhoanId, 'DangKy', { manager: em }),
    );
    expect(count).toBe(1);
    expect((await rowOf(db, pending.id)).thuHoiLuc).toEqual(at(61));
    expect((await rowOf(db, forgot.id)).thuHoiLuc).toBeNull(); // khác loại
    expect((await rowOf(db, otherPending.id)).thuHoiLuc).toBeNull(); // khác tài khoản
    expect(
      await db.transaction((em) =>
        fx.otp.revokePending(account.taiKhoanId, 'DangKy', { manager: em }),
      ),
    ).toBe(0);
  });

  it('OTP-R02 clearRegistrationData đặt NULL ba cột của MỌI hàng DangKy (kể cả đã dùng/đã thu hồi); không đụng loại khác (DK-45)', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    goTo(61);
    const second = await issueDeliverRead(fx, account); // first bị thu hồi
    await fx.otp.verify(
      { maXacThucId: second.id, loai: 'DangKy', otp: second.code },
      { consume: true },
    );
    goTo(122);
    const forgot = await issueDeliverRead(fx, account, 'QuenMatKhau');
    await insertMaXacThuc(db, account.taiKhoanId, {
      loai: 'KichHoatNhanSu',
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    });

    const affected = await db.transaction((em) =>
      fx.otp.clearRegistrationData(account.taiKhoanId, { manager: em }),
    );
    expect(affected).toBe(2);
    for (const id of [first.id, second.id]) {
      expect(await rowOf(db, id)).toMatchObject({
        hoTenDangKy: null,
        soDienThoaiDangKy: null,
        matKhauBamDangKy: null,
      });
    }
    expect((await rowOf(db, second.id)).daDungLuc).not.toBeNull(); // hàng đã dùng vẫn giữ dấu đã dùng
    expect((await rowOf(db, forgot.id)).loai).toBe('QuenMatKhau');
  });

  it('OTP-R03 latestStatus: chưa từng có hàng → null; còn hạn → ConHan; hết hạn → HetHan; sai đủ lần → DaThuHoi (N2, DN-17, DN-37)', async () => {
    const account = await newUnverifiedAccount(db);
    expect(await fx.otp.latestStatus(account.taiKhoanId, 'DangKy')).toBeNull();

    const { id, code } = await issueDeliverRead(fx, account);
    expect(await fx.otp.latestStatus(account.taiKhoanId, 'DangKy')).toEqual({
      maXacThucId: id,
      trangThaiMa: 'ConHan',
      hetHanLuc: at(600),
    });
    goTo(600);
    expect(
      await fx.otp.latestStatus(account.taiKhoanId, 'DangKy'),
    ).toMatchObject({ trangThaiMa: 'HetHan' });

    goTo(700);
    const second = await issueDeliverRead(fx, account);
    for (let i = 0; i < OTP_MAX_WRONG_ATTEMPTS; i++) {
      await fx.otp.verify({
        maXacThucId: second.id,
        loai: 'DangKy',
        otp: wrongCodeFor(second.code),
      });
    }
    expect(
      await fx.otp.latestStatus(account.taiKhoanId, 'DangKy'),
    ).toMatchObject({
      maXacThucId: second.id,
      trangThaiMa: 'DaThuHoi',
    });
    expect(code).not.toBe(second.code); // hai lần cấp là hai mã độc lập
  });

  it('OTP-R04 latestStatus ưu tiên hàng ĐÃ GỬI mới nhất; chưa hàng nào đã gửi thì lấy hàng mới nhất → ChuaGui (PLAN 5.3)', async () => {
    const account = await newUnverifiedAccount(db);
    fx.mail.failNextWith('CONNECTION');
    const failed = await fx.otp
      .issueAndDeliver(registerInput(account.taiKhoanId), recipientOf(account))
      .catch((e: unknown) => e);
    if (!(failed instanceof OtpDeliveryError))
      throw new Error('mong đợi lỗi gửi');
    expect(
      await fx.otp.latestStatus(account.taiKhoanId, 'DangKy'),
    ).toMatchObject({
      maXacThucId: failed.maXacThucId,
      trangThaiMa: 'ChuaGui',
    });

    goTo(61);
    const sent = await issueDeliverRead(fx, account);
    goTo(122);
    fx.mail.failNextWith('CONNECTION');
    await fx.otp
      .issueAndDeliver(registerInput(account.taiKhoanId), recipientOf(account))
      .catch(() => undefined);
    // hàng mới nhất là hàng lỗi, nhưng hàng ĐÃ GỬI mới nhất là `sent` và còn hạn
    expect(
      await fx.otp.latestStatus(account.taiKhoanId, 'DangKy'),
    ).toMatchObject({
      maXacThucId: sent.id,
      trangThaiMa: 'ConHan',
    });
  });
});

describe('thời gian và múi giờ khi ghi/đọc DATETIME (MySQL thật)', () => {
  it('OTP-T01 DATETIME làm tròn phần lẻ giây khi lưu — lý do mọi mốc phải được cắt xuống giây TRƯỚC khi ghi', async () => {
    const account = await newUnverifiedAccount(db);
    const row = await insertMaXacThuc(db, account.taiKhoanId, {
      taoLuc: new Date(T0.getTime() + 900),
      hetHanLuc: new Date(T0.getTime() + 600_000 + 400),
    });
    const stored = await rowOf(db, row.maXacThucId);
    expect(stored.taoLuc.getTime() - T0.getTime()).toBe(1000); // .900 giây bị làm tròn LÊN
    expect(stored.hetHanLuc.getTime() - T0.getTime()).toBe(600_000); // .400 giây bị làm tròn xuống
  });
});
