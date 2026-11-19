import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import {
  ControlledMailService,
  at,
} from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { deriveActivationLinkState } from '../../staff-activation/activation-link-rules.js';
import { activationTokenMatches } from '../../staff-activation/activation-link-token.js';
import { STAFF_ACTIVATION_MAIL_SUBJECTS } from '../../staff-activation/staff-activation-mail.js';
import {
  createActivationFixture,
  issueAndDeliver,
  issueOk,
  linkRowOf,
  linkRowsOf,
  occupiedSlotsOf,
  parseActivationMail,
} from '../../staff-activation/testing/activation-link-fixtures.js';
import {
  createAs,
  createStaffAccountWorld,
  receptionistInput,
} from '../../staff-accounts/testing/staff-account-world.js';
import type { ResendActivationResponse } from '../account-resend.types.js';
import {
  SYSTEM_SCOPE,
  auditRowCount,
  createResendWorld,
  createWorld,
  pendingAdmin,
  pendingDoctor,
  pendingReceptionist,
  resendServiceFor,
  sentTo,
  type ResendWorld,
} from '../testing/resend-world.js';

// Task B20 (admin) — "Gửi lại liên kết kích hoạt" trên MySQL 8.4 THẬT: dịch vụ B20 thật + ActivationLinkService thật (B14) + chính sách phạm vi thật; chỉ
// MailService là thư giả. Mã TKB20-nn là [đề xuất]; mã PLAN ghi kèm (TK-40…48, NS-20, NS-34, NS-45, Q22, Q23, Q27, Q40). Đua ở account-resend.race.int-spec.ts;
// khoá thật (data_locks) ở account-resend.locks.int-spec.ts.

let db: DataSource;
let logs: string[];
let w: ResendWorld<FakeMailService>;

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
});

beforeEach(async () => {
  w = await createWorld(db);
});

const goTo = (seconds: number): void => {
  vi.setSystemTime(at(seconds));
};
const HOUR = 3600;
const TTL_MS = 24 * HOUR * 1000;

async function rejection(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

const stateOfRow = async (id: string) =>
  deriveActivationLinkState(await linkRowOf(db, id), new Date());
const statesOf = async (taiKhoanId: string) =>
  (await linkRowsOf(db, taiKhoanId)).map((row) =>
    deriveActivationLinkState(row, new Date()),
  );

// Bệnh nhân có ít nhất MỘT lịch hẹn tại chi nhánh của bác sĩ ⇒ Admin Chi nhánh đó THẤY được (PLAN 5.6)
async function patientWithAppointmentAt(
  world: ResendWorld<FakeMailService>,
  branch: ResendWorld<FakeMailService>['branchA'],
): Promise<TaiKhoan> {
  const patient = await world.fx.patient();
  const doctor = await world.fx.doctor(branch);
  const shift = await world.fx.shift(doctor.profile);
  const slot = await world.fx.slot(shift);
  await world.fx.appointment(doctor.profile, slot, patient.account.taiKhoanId);
  return patient.account;
}

const errnoOf = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const wrapped: unknown = Reflect.get(error, 'driverError');
  const source =
    typeof wrapped === 'object' && wrapped !== null ? wrapped : error;
  const errno: unknown = Reflect.get(source, 'errno');
  return typeof errno === 'number' ? errno : undefined;
};

const NOWAIT_SQL =
  'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE NOWAIT';

describe('TKB20-10 (TK-40, NS-20, NS-34) — Toàn hệ thống gửi lại cho MỌI loại nhân sự chờ kích hoạt, ở mọi chi nhánh', () => {
  const kinds: [
    string,
    (world: ResendWorld<FakeMailService>) => Promise<TaiKhoan>,
  ][] = [
    ['Bác sĩ chi nhánh A', (x) => pendingDoctor(x, x.branchA)],
    ['Lễ tân chi nhánh B', (x) => pendingReceptionist(x, x.branchB)],
    ['Quản trị viên Toàn hệ thống', (x) => pendingAdmin(x)],
    ['Quản trị viên Chi nhánh A', (x) => pendingAdmin(x, x.branchA)],
  ];

  it.each(kinds)(
    '%s: hàng mới thành hợp lệ, hàng cũ bị thu hồi, đúng MỘT hàng chiếm slot UNIQUE; thư mẫu GuiLai tới đúng email, token trong thư là của hàng MỚI',
    async (_label, make) => {
      const account = await make(w);
      const first = await issueAndDeliver(w.links, account);
      const oldMail = parseActivationMail(sentTo(w.mail, account.email)[0]);
      goTo(61);

      const response = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);

      expect(response).toEqual({
        taiKhoanId: account.taiKhoanId,
        guiEmail: { ketQua: 'DaGui' },
        hanLienKet: new Date(at(61).getTime() + TTL_MS),
      });
      const rows = await linkRowsOf(db, account.taiKhoanId);
      expect(rows).toHaveLength(2);
      expect(await statesOf(account.taiKhoanId)).toEqual([
        'BI_THU_HOI',
        'HOP_LE',
      ]);
      expect(rows[0]?.maXacThucId).toBe(first.id);
      expect(rows[0]?.thuHoiLuc?.getTime()).toBe(at(61).getTime());
      expect(rows[1]?.daGuiLuc?.getTime()).toBe(at(61).getTime());
      expect(rows[1]?.hetHanLuc.getTime()).toBe(at(61).getTime() + TTL_MS);
      expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);

      const mails = sentTo(w.mail, account.email);
      expect(mails).toHaveLength(2);
      const last = mails[1];
      expect(last?.subject).toBe(STAFF_ACTIVATION_MAIL_SUBJECTS.GuiLai);
      const newMail = parseActivationMail(last);
      expect(newMail.id).toBe(rows[1]?.maXacThucId);
      expect(activationTokenMatches(rows[1]!.maBam, newMail.token)).toBe(true);
      // Token CŨ vẫn "đúng" với hàng cũ nhưng hàng cũ đã bị thu hồi ⇒ không dùng được (NS-34)
      expect(activationTokenMatches(rows[0]!.maBam, oldMail.token)).toBe(true);
      expect(await stateOfRow(first.id)).toBe('BI_THU_HOI');
    },
  );

  it('chưa từng có liên kết nào (tài khoản tạo thẳng vào DB) vẫn gửi lại được: hàng đầu tiên, không cần liên kết cũ để thu hồi', async () => {
    const account = await pendingDoctor(w, w.branchA);
    const response = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
    expect(response.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(await statesOf(account.taiKhoanId)).toEqual(['HOP_LE']);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
  });
});

describe('TKB20-11 (TK-41) — thư lỗi khi liên kết cũ còn hạn: liên kết cũ GIỮ NGUYÊN và dùng được', () => {
  it('hàng mới bị thu hồi, hàng cũ không đổi cột nào và vẫn chiếm slot; tài khoản vẫn ChoKichHoat; phản hồi ThatBai, hanLienKet null', async () => {
    const account = await pendingReceptionist(w, w.branchA);
    const first = await issueAndDeliver(w.links, account);
    const oldBefore = await linkRowOf(db, first.id);
    goTo(61);
    w.mail.failNextWith('TIMEOUT');

    const response = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);

    expect(response).toEqual({
      taiKhoanId: account.taiKhoanId,
      guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
      hanLienKet: null,
    });
    const rows = await linkRowsOf(db, account.taiKhoanId);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.thuHoiLuc).not.toBeNull();
    expect(rows[1]?.daGuiLuc).toBeNull();
    expect(await linkRowOf(db, first.id)).toEqual(oldBefore);
    expect(await statesOf(account.taiKhoanId)).toEqual([
      'HOP_LE',
      'BI_THU_HOI',
    ]);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
    expect(sentTo(w.mail, account.email)).toHaveLength(1);
    expect(w.mail.attempts.filter((m) => m.to === account.email)).toHaveLength(
      2,
    );
    const status: { trang_thai: string }[] = await db.query(
      'SELECT trang_thai FROM tai_khoan WHERE tai_khoan_id = ?',
      [account.taiKhoanId],
    );
    expect(status[0]?.trang_thai).toBe('ChoKichHoat');
  });
});

describe('TKB20-12 (TK-42, TK-46) — liên kết cũ đã HẾT HẠN rồi thư lỗi: không còn liên kết hợp lệ; gửi lại lần sau thành công', () => {
  it('hàng hết hạn vẫn chiếm slot nhưng không dùng được; lần gửi sau thu hồi nó RỒI mới đặt da_gui_luc (không 1062)', async () => {
    const account = await pendingDoctor(w, w.branchA);
    const first = await issueAndDeliver(w.links, account);
    goTo(25 * HOUR);
    expect(await stateOfRow(first.id)).toBe('HET_HAN');
    w.mail.failNextWith('CONNECTION');

    const failed = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
    expect(failed.guiEmail).toEqual({
      ketQua: 'ThatBai',
      maLoi: 'GUI_MAIL_LOI',
    });
    expect(await statesOf(account.taiKhoanId)).toEqual([
      'HET_HAN',
      'BI_THU_HOI',
    ]);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);

    goTo(25 * HOUR + 61);
    const ok = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
    expect(ok.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(await statesOf(account.taiKhoanId)).toEqual([
      'BI_THU_HOI',
      'BI_THU_HOI',
      'HOP_LE',
    ]);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
  });
});

describe('TKB20-13 (TK-43) — đích không còn chờ kích hoạt ⇒ 409, không hàng mới, không thư', () => {
  const targets: [
    string,
    (world: ResendWorld<FakeMailService>) => Promise<TaiKhoan>,
  ][] = [
    [
      'Bác sĩ DangHoatDong',
      async (x) =>
        (await x.fx.doctor(x.branchA, {}, { trangThai: 'DangHoatDong' }))
          .account,
    ],
    [
      'Lễ tân NgungHoatDong',
      async (x) =>
        (await x.fx.receptionist(x.branchA, { trangThai: 'NgungHoatDong' }))
          .account,
    ],
    ['Quản trị viên DangHoatDong', async (x) => (await x.fx.admin()).account],
    ['Bệnh nhân DangHoatDong', async (x) => (await x.fx.patient()).account],
    [
      'Bệnh nhân NgungHoatDong',
      async (x) => (await x.fx.patient({ trangThai: 'NgungHoatDong' })).account,
    ],
  ];

  it.each(targets)('%s (Toàn hệ thống gọi)', async (_label, make) => {
    const account = await make(w);
    const error = await rejection(
      w.service.resend(SYSTEM_SCOPE, account.taiKhoanId),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      maLoi: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
      thongBao:
        'Tài khoản không còn chờ kích hoạt. Nếu cần đặt lại mật khẩu, dùng "Quên mật khẩu".',
    });
    expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(0);
    expect(w.mail.attempts).toHaveLength(0);
  });

  it('Chi nhánh + Bác sĩ chi nhánh mình ĐÃ kích hoạt ⇒ cũng 409 (quyền đủ, trạng thái không đạt)', async () => {
    const doctor = await w.fx.doctor(
      w.branchA,
      {},
      { trangThai: 'DangHoatDong' },
    );
    const error = await rejection(
      w.service.resend(w.scopeA, doctor.account.taiKhoanId),
    );
    expect(error.getStatus()).toBe(409);
    expect(w.mail.attempts).toHaveLength(0);
  });
});

describe('TKB20-14 (TK-44, Q27, Q40, PQ-13) — Chi nhánh: nhân sự chi nhánh MÌNH được; còn lại 404 (ngoài tầm nhìn) hoặc 403 (Bệnh nhân thấy được)', () => {
  it('Bác sĩ và Lễ tân chi nhánh A ⇒ thành công; chi nhánh B, Quản trị viên chờ kích hoạt (cả Toàn hệ thống lẫn Chi nhánh A), Bệnh nhân chỉ ở B, Bệnh nhân không lịch, id không tồn tại ⇒ 404 CÙNG thân; Bệnh nhân có lịch ở A ⇒ 403', async () => {
    const doctorA = await pendingDoctor(w, w.branchA);
    const receptionistA = await pendingReceptionist(w, w.branchA);
    const doctorB = await pendingDoctor(w, w.branchB);
    const adminSystem = await pendingAdmin(w);
    const adminBranchA = await pendingAdmin(w, w.branchA);
    const patientA = await patientWithAppointmentAt(w, w.branchA);
    const patientB = await patientWithAppointmentAt(w, w.branchB);
    const patientNone = (await w.fx.patient()).account;

    for (const account of [doctorA, receptionistA]) {
      const response = await w.service.resend(w.scopeA, account.taiKhoanId);
      expect(response.guiEmail).toEqual({ ketQua: 'DaGui' });
      expect(await statesOf(account.taiKhoanId)).toEqual(['HOP_LE']);
    }

    const hidden: string[] = [
      doctorB.taiKhoanId,
      adminSystem.taiKhoanId,
      adminBranchA.taiKhoanId,
      patientB.taiKhoanId,
      patientNone.taiKhoanId,
      '999999999',
    ];
    const bodies: unknown[] = [];
    for (const id of hidden) {
      const error = await rejection(w.service.resend(w.scopeA, id));
      expect(error.getStatus(), id).toBe(404);
      bodies.push(error.getResponse());
      expect(await linkRowsOf(db, id), id).toHaveLength(0);
    }
    // Không phân biệt được "không tồn tại" với "ngoài tầm nhìn" (Q40): mọi thân giống hệt nhau
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(bodies[0]).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });

    const denied = await rejection(
      w.service.resend(w.scopeA, patientA.taiKhoanId),
    );
    expect(denied.getStatus()).toBe(403);
    expect(denied.getResponse()).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });

    // Chỉ hai thư (hai thành công); mọi nhánh lỗi KHÔNG gửi thư và KHÔNG chèn hàng
    expect(w.mail.attempts).toHaveLength(2);
    expect(await linkRowsOf(db, patientA.taiKhoanId)).toHaveLength(0);
  });

  it('Chi nhánh B không gửi được cho nhân sự chi nhánh A (đối xứng) và Toàn hệ thống gửi được cho cả hai', async () => {
    const doctorA = await pendingDoctor(w, w.branchA);
    const error = await rejection(
      w.service.resend(w.scopeB, doctorA.taiKhoanId),
    );
    expect(error.getStatus()).toBe(404);
    expect(await linkRowsOf(db, doctorA.taiKhoanId)).toHaveLength(0);
    await expect(
      w.service.resend(SYSTEM_SCOPE, doctorA.taiKhoanId),
    ).resolves.toMatchObject({ guiEmail: { ketQua: 'DaGui' } });
  });
});

describe('TKB20-17 (TK-46, quy tắc 21) — hồi quy thứ tự thu hồi QUA service B20', () => {
  it('liên kết cũ đã gửi nhưng HẾT HẠN (còn chiếm slot) cộng một hàng "mới tạo" bị bỏ rơi: gửi lại thành công, không vi phạm UNIQUE, đúng MỘT hàng hợp lệ', async () => {
    const account = await pendingReceptionist(w, w.branchA);
    await issueAndDeliver(w.links, account);
    goTo(61);
    // Hàng "mới tạo" bị bỏ rơi: pha 1 xong nhưng tiến trình chết trước khi gửi thư
    await issueOk(w.links.service, account.taiKhoanId);
    expect(await statesOf(account.taiKhoanId)).toEqual(['HOP_LE', 'MOI_TAO']);
    goTo(25 * HOUR);
    expect(await statesOf(account.taiKhoanId)).toEqual(['HET_HAN', 'MOI_TAO']);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);

    const response = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);

    expect(response.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(await statesOf(account.taiKhoanId)).toEqual([
      'BI_THU_HOI',
      'BI_THU_HOI',
      'HOP_LE',
    ]);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
  });
});

describe('TKB20-18 (TK-48, NS-42, Q22) — hạn của liên kết gửi lại theo TTL hiện hành', () => {
  it('mặc định 24 giờ: hanLienKet và het_han_luc = bây giờ + 24 giờ, thư in "24 giờ"', async () => {
    const account = await pendingDoctor(w, w.branchA);
    goTo(100);
    const response = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
    const expected = new Date(at(100).getTime() + TTL_MS);
    expect(response.hanLienKet).toEqual(expected);
    const rows = await linkRowsOf(db, account.taiKhoanId);
    expect(rows[0]?.hetHanLuc.getTime()).toBe(expected.getTime());
    expect(sentTo(w.mail, account.email)[0]?.text).toContain('24 giờ');
  });

  it('đổi TTL còn 2 giờ giữa hai lần gửi: liên kết MỚI hết hạn sau 2 giờ, liên kết cũ GIỮ hạn 24 giờ đã lưu (trước khi bị thu hồi), thư in "2 giờ"', async () => {
    const account = await pendingDoctor(w, w.branchA);
    const first = await issueAndDeliver(w.links, account);
    const oldExpiry = (await linkRowOf(db, first.id)).hetHanLuc.getTime();
    expect(oldExpiry).toBe(at(0).getTime() + TTL_MS);
    goTo(61);
    const short = createActivationFixture(db, w.mail, {
      STAFF_ACTIVATION_TTL_HOURS: 2,
    });

    const response = await resendServiceFor(short).resend(
      SYSTEM_SCOPE,
      account.taiKhoanId,
    );

    const twoHours = at(61).getTime() + 2 * HOUR * 1000;
    expect(response.hanLienKet).toEqual(new Date(twoHours));
    const rows = await linkRowsOf(db, account.taiKhoanId);
    expect(rows[1]?.hetHanLuc.getTime()).toBe(twoHours);
    expect(rows[0]?.hetHanLuc.getTime()).toBe(oldExpiry);
    const last = sentTo(w.mail, account.email).at(-1);
    expect(last?.text).toContain('2 giờ');
    expect(last?.text).not.toContain('24 giờ');
  });
});

describe('TKB20-19 (NS-45, TK-47, Q23) — giới hạn gửi lại QUA service B20, sau tạo thật của B15 (đồng hồ giả)', () => {
  it('tạo rồi gửi lại sau 59 giây ⇒ 429 GUI_LAI_QUA_SOM (chiTiet.soGiayCho 1), KHÔNG hàng mới, KHÔNG thư; sau 60 giây ⇒ thành công', async () => {
    const sw = await createStaffAccountWorld(db, new FakeMailService());
    const resend = resendServiceFor(sw.links, sw.policy);
    goTo(0);
    const created = await createAs(sw, SYSTEM_SCOPE, receptionistInput(sw));
    expect(created.guiEmail).toEqual({ ketQua: 'DaGui' });

    goTo(59);
    const tooSoon = await rejection(
      resend.resend(SYSTEM_SCOPE, created.taiKhoanId),
    );
    expect(tooSoon.getStatus()).toBe(429);
    expect(tooSoon.getResponse()).toEqual({
      maLoi: 'GUI_LAI_QUA_SOM',
      thongBao: 'Vui lòng thử lại sau.',
      chiTiet: { soGiayCho: 1 },
    });
    expect(await linkRowsOf(db, created.taiKhoanId)).toHaveLength(1);
    expect(sw.mail.sent).toHaveLength(1);

    goTo(60);
    await expect(
      resend.resend(SYSTEM_SCOPE, created.taiKhoanId),
    ).resolves.toMatchObject({ guiEmail: { ketQua: 'DaGui' } });
    expect(await linkRowsOf(db, created.taiKhoanId)).toHaveLength(2);
    expect(sw.mail.sent).toHaveLength(2);
  });

  it('5 hàng trong 1 giờ KỂ CẢ hàng gửi lỗi: hàng thứ 5 (khi có 4) được, hàng thứ 6 bị 429 với số giây chờ đúng; đúng 3 600 giây sau hàng đầu thì được', async () => {
    const sw = await createStaffAccountWorld(db, new FakeMailService());
    const resend = resendServiceFor(sw.links, sw.policy);
    goTo(0);
    const created = await createAs(sw, SYSTEM_SCOPE, receptionistInput(sw));
    const id = created.taiKhoanId;

    goTo(60);
    await resend.resend(SYSTEM_SCOPE, id); // hàng 2
    goTo(120);
    sw.mail.failNextWith('TIMEOUT');
    const failed = await resend.resend(SYSTEM_SCOPE, id); // hàng 3: gửi lỗi, vẫn tính
    expect(failed.guiEmail).toEqual({
      ketQua: 'ThatBai',
      maLoi: 'GUI_MAIL_LOI',
    });
    goTo(180);
    await resend.resend(SYSTEM_SCOPE, id); // hàng 4
    goTo(240);
    await resend.resend(SYSTEM_SCOPE, id); // hàng 5 (đang có 4: được)
    expect(await linkRowsOf(db, id)).toHaveLength(5);
    const sentBefore = sw.mail.sent.length;

    goTo(300);
    const sixth = await rejection(resend.resend(SYSTEM_SCOPE, id));
    expect(sixth.getStatus()).toBe(429);
    // Hàng quyết định là hàng đầu (tạo lúc 0): còn 3 600 - 300 = 3 300 giây
    expect(sixth.getResponse()).toMatchObject({
      maLoi: 'GUI_LAI_QUA_SOM',
      chiTiet: { soGiayCho: HOUR - 300 },
    });
    expect(await linkRowsOf(db, id)).toHaveLength(5);
    expect(sw.mail.sent).toHaveLength(sentBefore);

    goTo(HOUR - 1);
    expect(
      (await rejection(resend.resend(SYSTEM_SCOPE, id))).getResponse(),
    ).toMatchObject({ chiTiet: { soGiayCho: 1 } });
    goTo(HOUR);
    await expect(resend.resend(SYSTEM_SCOPE, id)).resolves.toMatchObject({
      guiEmail: { ketQua: 'DaGui' },
    });
    expect(await linkRowsOf(db, id)).toHaveLength(6);
  });
});

describe('TKB20-20 (TK-40) — hoàn tác: lỗi SAU khi đã chèn hàng liên kết không để lại hàng nào, không thư, không giữ khoá', () => {
  it('issue chèn hàng rồi ném lỗi ⇒ giao dịch hoàn tác: 0 hàng, 0 thư; hàng tai_khoan được nhả (giao dịch khác khoá ngay được, NOWAIT)', async () => {
    const account = await pendingReceptionist(w, w.branchA);
    const original = w.links.service.issue.bind(w.links.service);
    vi.spyOn(w.links.service, 'issue').mockImplementationOnce(
      async (input, options) => {
        await original(input, options);
        throw new Error('lỗi giả sau khi đã chèn hàng liên kết');
      },
    );

    await expect(
      w.service.resend(SYSTEM_SCOPE, account.taiKhoanId),
    ).rejects.toThrow('lỗi giả sau khi đã chèn hàng liên kết');

    expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(0);
    expect(w.mail.attempts).toHaveLength(0);
    await expect(
      db.transaction((em) => em.query(NOWAIT_SQL, [account.taiKhoanId])),
    ).resolves.toBeDefined();
    // Sau lỗi đó, gửi lại bình thường vẫn chạy (không có hàng rác chặn giới hạn)
    await expect(
      w.service.resend(SYSTEM_SCOPE, account.taiKhoanId),
    ).resolves.toMatchObject({ guiEmail: { ketQua: 'DaGui' } });
  });
});

describe('TKB20-21 (mục 2.4) — thư chậm KHÔNG giữ khoá: thư gửi NGOÀI giao dịch', () => {
  it('trong lúc bộ gửi thư bị giữ cổng, một giao dịch khác khoá được hàng tai_khoan của đích NGAY (NOWAIT); nhả cổng ⇒ hoàn tất DaGui', async () => {
    const mail = new ControlledMailService();
    const held = await createResendWorld(db, mail);
    const account = await pendingReceptionist(held, held.branchA);

    // Đối chứng: NOWAIT THẬT SỰ thất bại khi hàng đang bị khoá (nếu không, ca này không chứng minh được gì)
    await db.transaction(async (em) => {
      await em.query(NOWAIT_SQL, [account.taiKhoanId]);
      const blocked = await db
        .transaction((other) => other.query(NOWAIT_SQL, [account.taiKhoanId]))
        .then(
          () => undefined,
          (reason: unknown) => reason,
        );
      expect(errnoOf(blocked)).toBe(3572);
    });

    mail.holding = true;
    const pending = held.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
    let response!: ResendActivationResponse;
    try {
      await mail.waitForPending(1);
      // Giao dịch 1 đã commit (hàng liên kết "mới tạo" đã có), nhưng thư chưa đi
      expect(await statesOf(account.taiKhoanId)).toEqual(['MOI_TAO']);
      await expect(
        db.transaction((em) => em.query(NOWAIT_SQL, [account.taiKhoanId])),
      ).resolves.toBeDefined();
    } finally {
      mail.release(0);
      response = await pending;
    }
    expect(response.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(await statesOf(account.taiKhoanId)).toEqual(['HOP_LE']);
  });
});

describe('TKB20-22 (PLAN 5.10) — không ghi audit ở bất kỳ nhánh nào', () => {
  it('thành công, thư lỗi, 404, 403, 409 và 429 đều để nhat_ky_hanh_dong nguyên 0 dòng', async () => {
    const doctorA = await pendingDoctor(w, w.branchA);
    const receptionistA = await pendingReceptionist(w, w.branchA);
    const patientA = await patientWithAppointmentAt(w, w.branchA);
    const active = (await w.fx.doctor(w.branchA)).account;

    await w.service.resend(SYSTEM_SCOPE, doctorA.taiKhoanId); // thành công
    w.mail.failNextWith('TIMEOUT');
    await w.service.resend(SYSTEM_SCOPE, receptionistA.taiKhoanId); // thư lỗi
    await rejection(w.service.resend(SYSTEM_SCOPE, '999999999')); // 404
    await rejection(w.service.resend(w.scopeA, patientA.taiKhoanId)); // 403
    await rejection(w.service.resend(SYSTEM_SCOPE, active.taiKhoanId)); // 409
    await rejection(w.service.resend(SYSTEM_SCOPE, doctorA.taiKhoanId)); // 429

    expect(await auditRowCount(db)).toBe(0);
  });
});

describe('TKB20-23 (TK-41, mục 1.7) — sự cố SAU khi thư đã đi: hàng "mới tạo" bị bỏ rơi', () => {
  it('ghi kết quả hậu gửi lỗi ⇒ ThatBai, liên kết cũ vẫn dùng được, hàng bỏ rơi VẪN tính vào giới hạn (429) và được thu hồi ở lần gửi thành công kế tiếp', async () => {
    const account = await pendingReceptionist(w, w.branchA);
    const first = await issueAndDeliver(w.links, account);
    goTo(61);
    const broken = vi
      .spyOn(w.links.repo, 'markSent')
      .mockRejectedValue(new Error('DB lỗi giả khi ghi da_gui_luc'));

    const response = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);

    expect(response).toEqual({
      taiKhoanId: account.taiKhoanId,
      guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
      hanLienKet: null,
    });
    // Thư ĐÃ đi (hai thư tới người nhận) nhưng liên kết trong thư mới KHÔNG dùng được; liên kết cũ không bị đụng (giao dịch hậu gửi hoàn tác)
    expect(sentTo(w.mail, account.email)).toHaveLength(2);
    expect(await statesOf(account.taiKhoanId)).toEqual(['HOP_LE', 'MOI_TAO']);
    expect(await stateOfRow(first.id)).toBe('HOP_LE');
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
    // Log chỉ có mã tài khoản và TÊN lỗi, không email, không URL
    const logText = logs.join('\n');
    expect(logText).toContain(`tài khoản ${account.taiKhoanId}`);
    expect(logText).not.toContain(account.email);
    expect(logText).not.toContain('kich-hoat#');

    // Gửi lại ngay vẫn bị giới hạn: hàng bỏ rơi VẪN được đếm (Q23 tính theo tao_luc, mọi trạng thái)
    const again = await rejection(
      w.service.resend(SYSTEM_SCOPE, account.taiKhoanId),
    );
    expect(again.getStatus()).toBe(429);

    broken.mockRestore();
    goTo(122);
    const ok = await w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
    expect(ok.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(await statesOf(account.taiKhoanId)).toEqual([
      'BI_THU_HOI',
      'BI_THU_HOI',
      'HOP_LE',
    ]);
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
  });
});
