import type { DataSource, EntityManager } from 'typeorm';
import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { evaluateBookability } from '../slots/bookability.rules.js';
import {
  BookabilityReader,
  type BookabilityMode,
} from '../slots/bookability.reader.js';
import { BOOKABLE_DAY, BookingFixtures } from '../testing/booking-fixtures.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from '../testing/fake-ports.js';
import {
  firstTableOf,
  interceptQuery,
  isLockingStatement,
} from '../testing/query-spy.js';
import { verdictLabel } from '../testing/reschedulability-facts.js';
import {
  buildRescheduleChain,
  holdRescheduleChain,
} from '../testing/reschedule-world.js';
import { evaluateReschedulability } from './reschedulability.rules.js';
import { RescheduleReader } from './reschedule.reader.js';
import type { RescheduleActor } from './reschedule.types.js';

// reschedule B2 — KDL-01…KDL-23 phần I (PLAN reschedule 7.1) trên MySQL 8.4 THẬT: `RescheduleReader` đọc đúng dữ kiện, ở CẢ HAI chế độ `none` (preview) và `locked` (POST, sau khi giữ chuỗi
// khoá tầng 2 đến 6), và `evaluateReschedulability(facts)` ra đúng kết luận. Thế giới: lịch cũ `DaXacNhan` của Bệnh nhân ở ô 0 (08:00 ngày 10/11/2026, thứ Ba); khung giờ đích mặc định là ô 2
// (09:00) của cùng bác sĩ; `now` là 09:00 ngày 02/11/2026. `thoiGian` của lịch ở ô i là 08:00 + 30 phút × i.
const CODES = BOOKING_ERROR_CODES;
const NOW = new Date('2026-11-02T09:00:00+07:00');
// 08:05 ngày 02/11/2026: lịch ChoThanhToan của fixture (hạn 08:15) còn hạn
const NOW_BEFORE_HOLD_EXPIRES = new Date('2026-11-02T08:05:00+07:00');
const TWO_MODES: BookabilityMode[] = ['none', 'locked'];

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

async function world(config: Partial<CauHinhHeThong> = {}) {
  const w = await fx.world();
  await fx.systemConfig({ soLanTuDoiLichToiDa: 2, ...config });
  const patientId = w.patient.account.taiKhoanId;
  const doctorProfile = w.doctor.profile;
  const leave = new FakeDoctorLeavePort();
  const pending = new FakePendingBranchChangesPort();
  const bookability = new BookabilityReader(
    new BranchHoursReader(),
    leave,
    pending,
  );
  const reader = new RescheduleReader(
    bookability,
    new SystemConfigService(new SystemConfigRepository(db)),
  );
  const old = await fx.appointmentIn('DaXacNhan', {
    doctor: doctorProfile,
    khungGioId: w.slotIds[0]!,
    patientId,
  });
  const branchId = doctorProfile.chiNhanhId;
  return {
    ...w,
    patientId,
    doctorProfile,
    doctorId: w.doctor.account.taiKhoanId,
    leave,
    pending,
    bookability,
    reader,
    old,
    branchId,
    owner: { via: 'TuDoi', accountId: patientId } as RescheduleActor,
    desk: { via: 'DoiHo', chiNhanhId: branchId } as RescheduleActor,
    /** Một lịch hẹn khác của Bệnh nhân ở ô `slot` (mặc định đang xác nhận) */
    other: (
      slot: number,
      trangThai: TrangThaiLichHen = 'DaXacNhan',
      extra: { hoSoNguoiThanId?: string; patientId?: string } = {},
    ) =>
      fx.appointmentIn(trangThai, {
        doctor: doctorProfile,
        khungGioId: w.slotIds[slot]!,
        patientId: extra.patientId ?? patientId,
        ...(extra.hoSoNguoiThanId === undefined
          ? {}
          : { hoSoNguoiThanId: extra.hoSoNguoiThanId }),
      }),
  };
}
type World = Awaited<ReturnType<typeof world>>;

interface Scenario {
  actor?: RescheduleActor;
  maLichHen?: string;
  khungGioMoiId?: string;
  now?: Date;
  reason?: boolean;
}

/**
 * Một lượt đọc trong MỘT giao dịch `READ COMMITTED` (như `withBookingTransaction`). Chế độ `locked`: `locate` rồi giữ chuỗi khoá 2 → 6 (hàm test-only, B1 sẽ có bản thật) rồi `read`; `inTx`
 * chạy khi khoá còn giữ.
 */
async function run(
  w: World,
  mode: BookabilityMode,
  scenario: Scenario = {},
  inTx?: (em: EntityManager) => Promise<void>,
) {
  return db.transaction('READ COMMITTED', async (em) => {
    const actor = scenario.actor ?? w.owner;
    const maLichHen = scenario.maLichHen ?? w.old.maLichHen;
    const khungGioMoiId = scenario.khungGioMoiId ?? w.slotIds[2]!;
    if (mode === 'locked') {
      const located = await w.reader.locate(em, {
        actor,
        maLichHen,
        khungGioMoiId,
      });
      if (located !== null)
        await holdRescheduleChain(em, located, khungGioMoiId);
    }
    const read = await w.reader.read(
      em,
      {
        actor,
        maLichHen,
        khungGioMoiId,
        now: scenario.now ?? NOW,
        config: await w.reader.config(),
        requestReasonGiven: scenario.reason ?? false,
      },
      mode,
    );
    const verdict = evaluateReschedulability(read.facts);
    if (inTx) await inTx(em);
    return { read, verdict, label: verdictLabel(verdict) };
  });
}

/** Ảnh chụp các bảng mà reader có thể (nhưng không được) ghi: so trước và sau để chứng minh "không ghi gì". */
async function snapshot(): Promise<string> {
  return JSON.stringify([
    await db.query(
      'SELECT khung_gio_id, trang_thai, giu_cho_den FROM khung_gio ORDER BY khung_gio_id',
    ),
    await db.query(
      'SELECT lich_hen_id, trang_thai, so_lan_tu_doi_lich, lich_hen_truoc_id FROM lich_hen ORDER BY lich_hen_id',
    ),
    await db.query('SELECT thong_bao_id FROM thong_bao'),
    await db.query('SELECT nhat_ky_hanh_dong_id FROM nhat_ky_hanh_dong'),
    await db.query(
      'SELECT yeu_cau_doi_lich_ngoai_chinh_sach_id, trang_thai FROM yeu_cau_doi_lich_ngoai_chinh_sach ORDER BY 1',
    ),
  ]);
}

/** Chèn thẳng một yêu cầu đổi lịch của `lichHenId` (hợp lệ với hai CHECK của bảng). */
async function insertRequest(
  w: World,
  trangThai: 'ChoDuyet' | 'DaDuyet' | 'TuChoi',
): Promise<void> {
  const handled = trangThai !== 'ChoDuyet';
  await db.query(
    `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach
       (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, trang_thai, ghi_chu_xu_ly, nguoi_xu_ly_id, thoi_diem_xu_ly, thoi_diem_tao)
     VALUES (?, ?, 'Lý do mẫu', ?, ?, ?, ?, '2026-11-02 08:00:00')`,
    [
      w.old.lichHenId,
      w.slotIds[2],
      trangThai,
      handled ? 'Ghi chú mẫu' : null,
      handled ? w.receptionist.account.taiKhoanId : null,
      handled ? '2026-11-02 08:30:00' : null,
    ],
  );
}

describe('KDL-01 đường đạt trên dữ liệu thật, cả hai chế độ', () => {
  it.each(TWO_MODES)(
    'chế độ %s: lịch DaXacNhan sang khung giờ trống cùng bác sĩ ⇒ đổi ngay',
    async (mode) => {
      const w = await world();
      const { read, verdict } = await run(w, mode);
      expect(verdict).toEqual({
        ok: true,
        branch: 'Reschedule',
        lapsedHold: null,
      });
      const facts = read.facts;
      expect(facts.source).toMatchObject({
        maLichHen: w.old.maLichHen,
        benhNhanId: w.patientId,
        hoSoNguoiThanId: null,
        bacSiId: w.doctorId,
        chiNhanhId: w.branchId,
        dichVuKhamId: w.doctorProfile.dichVuKhamId,
        khungGioId: w.slotIds[0],
        trangThai: 'DaXacNhan',
        soLanTuDoiLich: 0,
      });
      expect(facts.source?.thoiGian).toEqual(
        new Date('2026-11-10T08:00:00+07:00'),
      );
      expect(facts.profileActive).toBe(true);
      expect(facts.chainLength).toBe(1);
      expect(facts.pendingRequest).toBe(false);
      expect(facts.config).toEqual({
        soLanTuDoiLichToiDa: 2,
        checkInSauPhut: 15,
      });
      expect(facts.bookability?.slot.khungGioId).toBe(w.slotIds[2]);
      expect(facts.bookability?.thayThe).toEqual({
        maLichHen: w.old.maLichHen,
      });
      expect(facts.bookability?.noShowLocked).toBe(false);
      expect(read.locked === null).toBe(mode === 'none');
    },
  );
});

// Mỗi ca dựng dữ liệu rồi chạy CẢ HAI chế độ và khẳng định cùng một kết luận (KDL-18); `expected` là nhãn của `verdictLabel`.
interface Case {
  name: string;
  setup: (w: World) => Promise<Scenario | undefined> | Scenario | undefined;
  expected: string;
}
const STATES: TrangThaiLichHen[] = [
  'ChoThanhToan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
];
const CASES: Case[] = [
  ...STATES.map((trangThai): Case => ({
    name: `KDL-02 lịch ${trangThai} ⇒ LICH_HEN_KHONG_CHO_DOI`,
    setup: async (w) => ({
      maLichHen: (await w.other(5, trangThai)).maLichHen,
    }),
    expected: CODES.NOT_RESCHEDULABLE,
  })),
  {
    name: 'KDL-02 lịch DaDoiLich, Bệnh nhân tự đổi ⇒ NotFound (cùng thân với "không có")',
    setup: async (w) => ({
      maLichHen: (await w.other(5, 'DaDoiLich')).maLichHen,
    }),
    expected: 'NotFound',
  },
  {
    name: 'KDL-02 lịch DaDoiLich, Lễ tân ⇒ LICH_HEN_KHONG_CHO_DOI',
    setup: async (w) => ({
      actor: w.desk,
      maLichHen: (await w.other(5, 'DaDoiLich')).maLichHen,
    }),
    expected: CODES.NOT_RESCHEDULABLE,
  },
  {
    name: 'KDL-02 mã lịch không có ⇒ NotFound',
    setup: () => ({ maLichHen: 'CLX-KHONG-CO' }),
    expected: 'NotFound',
  },
  {
    name: 'KDL-03 Bệnh nhân tự đổi sau giờ hẹn cũ (08:10, lịch cũ 08:00) ⇒ LICH_HEN_DA_QUA_GIO',
    setup: () => ({ now: new Date('2026-11-10T08:10:00+07:00') }),
    expected: CODES.RESCHEDULE_TOO_LATE,
  },
  {
    name: 'KDL-04 Lễ tân đổi hộ trong cửa sổ tiếp đón 15 phút (08:10) ⇒ đổi được',
    setup: (w) => ({
      actor: w.desk,
      now: new Date('2026-11-10T08:10:00+07:00'),
    }),
    expected: 'ok:Reschedule',
  },
  {
    name: 'KDL-04 Lễ tân đổi hộ sau cửa sổ (08:15 đúng hạn) ⇒ LICH_HEN_DA_QUA_GIO',
    setup: (w) => ({
      actor: w.desk,
      now: new Date('2026-11-10T08:15:00+07:00'),
    }),
    expected: CODES.RESCHEDULE_TOO_LATE,
  },
  {
    name: 'KDL-05 khung giờ đích = khung giờ cũ ⇒ KHUNG_GIO_TRUNG_LICH_CU',
    setup: (w) => ({ khungGioMoiId: w.slotIds[0]! }),
    expected: CODES.SAME_AS_CURRENT_SLOT,
  },
  {
    name: 'KDL-05 khung giờ đích không tồn tại ⇒ SlotNotFound',
    setup: () => ({ khungGioMoiId: '999999999' }),
    expected: 'SlotNotFound',
  },
  {
    name: 'KDL-06 khung giờ của bác sĩ khác (cùng chi nhánh) ⇒ KHUNG_GIO_KHAC_BAC_SI',
    setup: async (w) => {
      const other = await fx.admin.doctor(w.branch);
      const { slotIds } = await fx.doctor.shiftWithSlots(other.profile, {
        ngay: BOOKABLE_DAY,
        ca: 'CaSang',
      });
      return { khungGioMoiId: slotIds[2]! };
    },
    expected: CODES.OTHER_DOCTOR_SLOT,
  },
  {
    name: 'KDL-07 bác sĩ đã đổi dịch vụ chính so với lúc đặt (SQL trực tiếp) ⇒ LICH_HEN_KHAC_DICH_VU_HIEN_TAI',
    setup: async (w) => {
      const { service } = await fx.admin.catalog();
      await db.query(
        'UPDATE bac_si SET dich_vu_kham_id = ? WHERE tai_khoan_id = ?',
        [service.dichVuKhamId, w.doctorId],
      );
      return undefined;
    },
    expected: CODES.SERVICE_CHANGED,
  },
  {
    name: 'KDL-08 bác sĩ đã đổi chi nhánh so với lúc đặt (SQL trực tiếp) ⇒ LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI',
    setup: async (w) => {
      const branch = await fx.admin.branch();
      await db.query(
        'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
        [branch.chiNhanhId, w.doctorId],
      );
      return undefined;
    },
    expected: CODES.BRANCH_CHANGED,
  },
  {
    name: 'KDL-09 hồ sơ đang bị khoá đặt lịch do no-show vẫn đổi được (Q7 (b))',
    setup: async (w) => {
      await db.query(
        'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
        [w.patientId],
      );
      return undefined;
    },
    expected: 'ok:Reschedule',
  },
  {
    name: 'KDL-12 khung giờ đích đã có người đặt ⇒ KHUNG_GIO_DA_DAT',
    setup: async (w) => {
      const [stranger] = await fx.patients(1);
      await w.other(2, 'DaXacNhan', {
        patientId: stranger!.account.taiKhoanId,
      });
      return undefined;
    },
    expected: CODES.SLOT_BOOKED,
  },
  {
    name: 'KDL-12 khung giờ đích đang được người khác giữ còn hạn ⇒ KHUNG_GIO_DANG_GIU',
    setup: async (w) => {
      const [stranger] = await fx.patients(1);
      await w.other(2, 'ChoThanhToan', {
        patientId: stranger!.account.taiKhoanId,
      });
      return { now: NOW_BEFORE_HOLD_EXPIRES };
    },
    expected: CODES.SLOT_HELD,
  },
  {
    name: 'KDL-12 giờ khung giờ đích đã qua (now = 08:30, ô 1) ⇒ KHUNG_GIO_DA_QUA',
    setup: async (w) => ({
      maLichHen: (await w.other(7)).maLichHen,
      khungGioMoiId: w.slotIds[1]!,
      now: new Date('2026-11-10T08:30:00+07:00'),
    }),
    expected: CODES.SLOT_PAST,
  },
  {
    name: 'KDL-12 bác sĩ nghỉ phép ở khung giờ đích ⇒ BAC_SI_NGHI_PHEP',
    setup: (w) => {
      w.leave.blocks();
      return undefined;
    },
    expected: CODES.DOCTOR_ON_LEAVE,
  },
  {
    name: 'KDL-14 lịch của hồ sơ người thân đã ngừng ⇒ ProfileInactive',
    setup: async (w) => ({
      maLichHen: (
        await w.other(5, 'DaXacNhan', { hoSoNguoiThanId: w.stoppedRelativeId })
      ).maLichHen,
    }),
    expected: 'ProfileInactive',
  },
  {
    name: 'KDL-14 lịch của hồ sơ người thân còn hiệu lực ⇒ đổi được',
    setup: async (w) => ({
      maLichHen: (
        await w.other(5, 'DaXacNhan', { hoSoNguoiThanId: w.relativeId })
      ).maLichHen,
    }),
    expected: 'ok:Reschedule',
  },
  {
    name: 'KDL-19 Lễ tân đổi hộ khi lịch có yêu cầu ChoDuyet ⇒ được phép',
    setup: async (w) => {
      await insertRequest(w, 'ChoDuyet');
      return { actor: w.desk };
    },
    expected: 'ok:Reschedule',
  },
];

describe('KDL-02…KDL-14, KDL-19: kết luận trên dữ liệu thật; KDL-18: chế độ none và locked cho CÙNG kết luận', () => {
  it.each(CASES)('$name', async ({ setup, expected }) => {
    const w = await world();
    const scenario = (await setup(w)) ?? {};
    const labels = [];
    for (const mode of TWO_MODES)
      labels.push((await run(w, mode, scenario)).label);
    expect(labels).toEqual([expected, expected]);
  });
});

describe('KDL-10 số lịch tối đa khi đổi lịch trên dữ liệu thật (Q7 (e), L13)', () => {
  it.each(TWO_MODES)(
    'chế độ %s: đủ 3 lịch kể cả lịch đang đổi ⇒ đổi được; lịch KHÁC đủ 3 ⇒ VUOT_SO_LICH_HEN_TOI_DA; cùng dữ liệu, ĐẶT lịch (không thayThe) bị chặn',
    async (mode) => {
      const w = await world();
      await w.other(5);
      await w.other(6);
      // 3 lịch đang hoạt động (cả lịch cũ), tối đa 3: đổi được vì lịch cũ không tính
      expect((await run(w, mode)).label).toBe('ok:Reschedule');
      // đối chứng hành vi cũ: cùng khung giờ đích, KHÔNG thayThe ⇒ 3 lịch đã đủ tối đa
      const booking = await db.transaction('READ COMMITTED', (em) =>
        w.bookability.read(
          em,
          {
            khungGioId: w.slotIds[2]!,
            benhNhanId: w.patientId,
            hoSoNguoiThanId: null,
            noShowLocked: false,
            soLichHenToiDa: 3,
            now: NOW,
          },
          mode,
        ),
      );
      if (booking.kind !== 'Read') throw new Error('phải đọc được');
      expect('thayThe' in booking.facts).toBe(false);
      expect(booking.facts.activeAppointments).toHaveLength(3);
      // thêm một lịch KHÁC nữa: 3 lịch khác ⇒ chặn
      await w.other(4);
      expect((await run(w, mode)).label).toBe(CODES.OVER_MAX_APPOINTMENTS);
    },
  );
});

describe('KDL-11 chồng giờ khi đổi lịch trên dữ liệu thật (Q7 (e))', () => {
  const setTime = (lichHenId: string, thoiGian: string) =>
    db.query('UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?', [
      thoiGian,
      lichHenId,
    ]);

  it.each(TWO_MODES)(
    'chế độ %s: chồng chính lịch cũ ⇒ cho; chồng lịch KHÁC của cùng hồ sơ ⇒ LICH_HEN_TRUNG_THOI_GIAN; chồng lịch của hồ sơ khác cùng tài khoản ⇒ cho',
    async (mode) => {
      const w = await world();
      // lịch cũ dịch sang 08:45 (dịch vụ 30 phút: 08:45 đến 09:15) nên chồng khung giờ đích 09:00 đến 09:30 của chính nó
      await setTime(w.old.lichHenId, '2026-11-10 08:45:00');
      expect((await run(w, mode)).label).toBe('ok:Reschedule');

      // lịch của HỒ SƠ NGƯỜI THÂN (cùng tài khoản) chồng khung giờ đích: không tính vì khác hồ sơ đi khám
      const relative = await w.other(5, 'DaXacNhan', {
        hoSoNguoiThanId: w.relativeId,
      });
      await setTime(relative.lichHenId, '2026-11-10 09:15:00');
      expect((await run(w, mode)).label).toBe('ok:Reschedule');

      // lịch KHÁC của cùng hồ sơ chồng khung giờ đích ⇒ chặn, kèm mã và giờ của lịch đó
      const same = await w.other(6);
      await setTime(same.lichHenId, '2026-11-10 09:15:00');
      const { verdict } = await run(w, mode);
      expect(verdict).toMatchObject({
        ok: false,
        failure: {
          kind: 'Rule',
          code: CODES.OVERLAPPING_APPOINTMENT,
          chiTiet: { maLichHen: same.maLichHen },
        },
      });
    },
  );

  it('đối chứng hành vi cũ: cùng dữ liệu (lịch cũ chồng khung giờ đích), ĐẶT lịch không thayThe bị chặn bởi chính lịch cũ', async () => {
    const w = await world();
    await setTime(w.old.lichHenId, '2026-11-10 08:45:00');
    const booking = await db.transaction('READ COMMITTED', (em) =>
      w.bookability.read(
        em,
        {
          khungGioId: w.slotIds[2]!,
          benhNhanId: w.patientId,
          hoSoNguoiThanId: null,
          noShowLocked: false,
          soLichHenToiDa: 3,
          now: NOW,
        },
        'none',
      ),
    );
    if (booking.kind !== 'Read') throw new Error('phải đọc được');
    expect(booking.facts.overlaps.map((o) => o.maLichHen)).toEqual([
      w.old.maLichHen,
    ]);
    expect(evaluateBookability(booking.facts)).toMatchObject({
      ok: false,
      code: CODES.OVERLAPPING_APPOINTMENT,
    });
  });
});

describe('KDL-13 khung giờ đích giữ chỗ đã quá hạn (phần ĐỌC; phần ghi hết hạn lười thuộc reschedule B4)', () => {
  it.each(TWO_MODES)(
    'chế độ %s: coi là trống, verdict mang đúng người giữ; reader KHÔNG ghi gì',
    async (mode) => {
      const w = await world();
      const [stranger] = await fx.patients(1);
      const held = await w.other(2, 'ChoThanhToan', {
        patientId: stranger!.account.taiKhoanId,
      });
      const before = await snapshot();
      const { verdict } = await run(w, mode); // now 09:00 > hạn 08:15
      expect(verdict).toEqual({
        ok: true,
        branch: 'Reschedule',
        lapsedHold: { lichHenId: held.lichHenId, maLichHen: held.maLichHen },
      });
      expect(await snapshot()).toBe(before);
      // lịch người kia vẫn ChoThanhToan, khung giờ vẫn DangGiuCho (chưa ai hết hạn lười)
      expect((await fx.slotState(w.slotIds[2]!)).trangThai).toBe('DangGiuCho');
    },
  );
});

describe('KDL-15 cấu hình đổi lịch trên MySQL thật (quy tắc 35)', () => {
  it('không có dòng cấu hình ⇒ config() ném 409 HE_THONG_CHUA_CAU_HINH, không số ngầm', async () => {
    const w = await world();
    await db.query('DELETE FROM cau_hinh_he_thong');
    let error: unknown;
    try {
      await w.reader.config();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).getResponse()).toMatchObject({
      maLoi: 'HE_THONG_CHUA_CAU_HINH',
    });
  });

  it('có dòng: đọc đúng ba giá trị (không phải số mặc định của mã)', async () => {
    const w = await world({
      soLanTuDoiLichToiDa: 7,
      checkInSauPhut: 21,
      soLichHenToiDaMoiHoSo: 4,
    });
    expect(await w.reader.config()).toEqual({
      soLanTuDoiLichToiDa: 7,
      checkInSauPhut: 21,
      soLichHenToiDaMoiHoSo: 4,
    });
  });

  it.each(TWO_MODES)(
    'chế độ %s: so_lan_tu_doi_lich_toi_da = 0 là hợp lệ: mọi lần TuDoi đã là nhánh yêu cầu (có lý do) hoặc VUOT_SO_LAN_TU_DOI (thiếu lý do)',
    async (mode) => {
      const w = await world({ soLanTuDoiLichToiDa: 0 });
      expect((await run(w, mode, { reason: true })).label).toBe('ok:Request');
      expect((await run(w, mode, { reason: false })).label).toBe(
        CODES.OVER_SELF_RESCHEDULE_LIMIT,
      );
    },
  );
});

describe('KDL-16 chuỗi đổi lịch quá dài (R4)', () => {
  it.each([
    [MAX_CHAIN_DEPTH - 2, 'ok:Reschedule'],
    [MAX_CHAIN_DEPTH - 1, CODES.RESCHEDULE_CHAIN_TOO_LONG],
    [MAX_CHAIN_DEPTH, CODES.RESCHEDULE_CHAIN_TOO_LONG],
    [MAX_CHAIN_DEPTH + 1, CODES.RESCHEDULE_CHAIN_TOO_LONG],
  ])(
    'chuỗi %i lịch ⇒ %s (không 500, không chạm CHAIN_TOO_DEEP của PaymentChain)',
    async (length, expected) => {
      const w = await world();
      // chuỗi riêng ở ô 5 (cùng khung giờ với các lịch DaDoiLich của chuỗi); lịch của `world()` ở ô 0 vẫn đang hoạt động
      const last = await buildRescheduleChain(db, fx, {
        doctor: w.doctorProfile,
        patientId: w.patientId,
        khungGioId: w.slotIds[5]!,
        length,
      });
      for (const mode of TWO_MODES) {
        const { read, label } = await run(w, mode, {
          maLichHen: last.maLichHen,
        });
        // độ dài đọc ra bị chặn ở MAX_CHAIN_DEPTH (câu đệ quy không treo ở chuỗi dài hơn)
        expect(read.facts.chainLength).toBe(Math.min(length, MAX_CHAIN_DEPTH));
        expect(label).toBe(expected);
      }
    },
  );
});

describe('KDL-17 vùng bị loại bởi thay đổi chi nhánh: cổng được gọi cho khung giờ ĐÍCH, đúng một lần (TECH_DEBT 260, phần kiểm)', () => {
  const TARGET_START = new Date('2026-11-10T13:00:00+07:00');
  const SOURCE_START = new Date('2026-11-10T08:00:00+07:00');

  /** Khung giờ đích ở CA CHIỀU (ô đầu 13:00) để `ca` của đích khác `ca` của nguồn (CaSang). */
  async function afternoon(w: World) {
    const { slotIds } = await fx.doctor.shiftWithSlots(w.doctorProfile, {
      ngay: BOOKABLE_DAY,
      ca: 'CaChieu',
    });
    return { khungGioMoiId: slotIds[0]! };
  }

  it.each(TWO_MODES)(
    'chế độ %s: đích bị loại ⇒ KHUNG_GIO_NGOAI_LICH_MOI; findBlocking đúng một lần với ca, giờ của khung giờ ĐÍCH',
    async (mode) => {
      const w = await world();
      const scenario = await afternoon(w);
      w.pending.blocks({ ngayGio: TARGET_START });
      const { label } = await run(w, mode, scenario);
      expect(label).toBe(CODES.SLOT_OUTSIDE_NEW_SCHEDULE);
      expect(w.pending.findBlockingCall.count).toBe(1);
      const input = w.pending.findBlockingCall.calls[0]![1];
      expect(input.ca).toBe('CaChieu');
      expect(input.ngayGio).toEqual(TARGET_START);
      expect(input.chiNhanhId).toBe(w.branchId);
      expect(input.dichVuKhamId).toBe(w.doctorProfile.dichVuKhamId);
    },
  );

  it.each(TWO_MODES)(
    'chế độ %s: NGUỒN trong vùng bị loại, đích ngoài vùng ⇒ vẫn đổi đi được; cổng không được hỏi về khung giờ nguồn',
    async (mode) => {
      const w = await world();
      const scenario = await afternoon(w);
      w.pending.blocks({ ngayGio: SOURCE_START });
      const { label } = await run(w, mode, scenario);
      expect(label).toBe('ok:Reschedule');
      expect(w.pending.findBlockingCall.count).toBe(1);
      expect(w.pending.findBlockingCall.calls[0]![1].ngayGio).toEqual(
        TARGET_START,
      );
    },
  );
});

describe('KDL-19 và KDL-20 yêu cầu chờ duyệt và hạn mức tự đổi trên dữ liệu thật', () => {
  const setCount = (w: World, count: number) =>
    db.query(
      'UPDATE lich_hen SET so_lan_tu_doi_lich = ? WHERE lich_hen_id = ?',
      [count, w.old.lichHenId],
    );

  it.each(TWO_MODES)(
    'chế độ %s: còn lần ⇒ đổi ngay; hết lần: thiếu lý do ⇒ VUOT_SO_LAN_TU_DOI, có lý do ⇒ nhánh Request',
    async (mode) => {
      const w = await world();
      await setCount(w, 1);
      expect((await run(w, mode)).label).toBe('ok:Reschedule');
      await setCount(w, 2);
      const missing = await run(w, mode, { reason: false });
      expect(missing.verdict).toEqual({
        ok: false,
        failure: {
          kind: 'Rule',
          code: CODES.OVER_SELF_RESCHEDULE_LIMIT,
          chiTiet: { soLanDaDoi: 2, toiDa: 2 },
        },
      });
      expect((await run(w, mode, { reason: true })).label).toBe('ok:Request');
    },
  );

  it.each(TWO_MODES)(
    'chế độ %s: nhánh Request gặp yêu cầu ChoDuyet ⇒ DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET; yêu cầu TuChoi hay DaDuyet KHÔNG chặn; yêu cầu còn nguyên (reader không đụng)',
    async (mode) => {
      const w = await world();
      await setCount(w, 2);
      await insertRequest(w, 'TuChoi');
      await insertRequest(w, 'DaDuyet');
      expect((await run(w, mode, { reason: true })).label).toBe('ok:Request');
      await insertRequest(w, 'ChoDuyet');
      const before = await snapshot();
      expect((await run(w, mode, { reason: true })).label).toBe(
        CODES.RESCHEDULE_REQUEST_PENDING,
      );
      // Lễ tân đổi hộ vẫn được phép và KHÔNG xoá yêu cầu (yêu cầu thành tồn)
      expect((await run(w, mode, { actor: w.desk })).label).toBe(
        'ok:Reschedule',
      );
      expect(await snapshot()).toBe(before);
    },
  );
});

describe('KDL-22 phạm vi của người đổi, kiểm ở lần đọc thường và dưới khoá', () => {
  it.each(TWO_MODES)(
    'chế độ %s: lịch của người khác, của chi nhánh khác ⇒ NotFound cùng thân; đúng phạm vi ⇒ đọc được',
    async (mode) => {
      const w = await world();
      const [stranger] = await fx.patients(1);
      const branch2 = await fx.admin.branch();
      const stranger1: RescheduleActor = {
        via: 'TuDoi',
        accountId: stranger!.account.taiKhoanId,
      };
      const actors: RescheduleActor[] = [
        w.owner,
        stranger1,
        w.desk,
        { via: 'DoiHo', chiNhanhId: branch2.chiNhanhId },
        { via: 'DuyetYeuCau', chiNhanhId: null },
        { via: 'DuyetYeuCau', chiNhanhId: w.branchId },
        { via: 'DuyetYeuCau', chiNhanhId: branch2.chiNhanhId },
      ];
      // TUẦN TỰ: ở chế độ locked mỗi lượt giữ khoá cùng dòng, chạy song song sẽ chờ nhau
      const labels: string[] = [];
      for (const actor of actors)
        labels.push((await run(w, mode, { actor })).label);
      expect(labels).toEqual([
        'ok:Reschedule',
        'NotFound',
        'ok:Reschedule',
        'NotFound',
        'ok:Reschedule',
        'ok:Reschedule',
        'NotFound',
      ]);
    },
  );

  it('ngoài phạm vi thì reader KHÔNG đọc gì thêm ngoài một câu lấy lịch (không lộ gì, không câu thừa)', async () => {
    const w = await world();
    const [stranger] = await fx.patients(1);
    const statements: string[] = [];
    await db.transaction('READ COMMITTED', async (em) => {
      interceptQuery(em, (sql, runStatement) => {
        statements.push(sql);
        return runStatement();
      });
      const read = await w.reader.read(
        em,
        {
          actor: { via: 'TuDoi', accountId: stranger!.account.taiKhoanId },
          maLichHen: w.old.maLichHen,
          khungGioMoiId: w.slotIds[2]!,
          now: NOW,
          config: {
            soLanTuDoiLichToiDa: 2,
            checkInSauPhut: 15,
            soLichHenToiDaMoiHoSo: 3,
          },
          requestReasonGiven: false,
        },
        'none',
      );
      expect(read.facts.source).toBeNull();
      expect(read.facts.bookability).toBeNull();
    });
    expect(statements).toHaveLength(1);
  });

  it('locate: trả đúng id của lịch cũ, bác sĩ của khung giờ đích (đọc thường, một lần); ngoài phạm vi hay không có lịch ⇒ null', async () => {
    const w = await world();
    const [stranger] = await fx.patients(1);
    const other = await fx.admin.doctor(w.branch);
    const { slotIds } = await fx.doctor.shiftWithSlots(other.profile, {
      ngay: BOOKABLE_DAY,
      ca: 'CaSang',
    });
    const statements: string[] = [];
    const located = await db.transaction('READ COMMITTED', async (em) => {
      interceptQuery(em, (sql, runStatement) => {
        statements.push(sql);
        return runStatement();
      });
      return w.reader.locate(em, {
        actor: w.owner,
        maLichHen: w.old.maLichHen,
        khungGioMoiId: slotIds[0]!,
      });
    });
    expect(located).toEqual({
      lichHenId: w.old.lichHenId,
      benhNhanId: w.patientId,
      hoSoNguoiThanId: null,
      bacSiId: w.doctorId,
      khungGioCuId: w.slotIds[0],
      bacSiCuaKhungGioMoiId: other.account.taiKhoanId,
    });
    expect(statements).toHaveLength(2);
    expect(statements.some(isLockingStatement)).toBe(false);
    await db.transaction('READ COMMITTED', async (em) => {
      expect(
        await w.reader.locate(em, {
          actor: { via: 'TuDoi', accountId: stranger!.account.taiKhoanId },
          maLichHen: w.old.maLichHen,
          khungGioMoiId: w.slotIds[2]!,
        }),
      ).toBeNull();
      expect(
        await w.reader.locate(em, {
          actor: w.owner,
          maLichHen: 'CLX-KHONG-CO',
          khungGioMoiId: w.slotIds[2]!,
        }),
      ).toBeNull();
      expect(
        (
          await w.reader.locate(em, {
            actor: w.owner,
            maLichHen: w.old.maLichHen,
            khungGioMoiId: '999999999',
          })
        )?.bacSiCuaKhungGioMoiId,
      ).toBeNull();
    });
  });
});

describe('KDL-23 reader chỉ ĐỌC, không tự xin khoá tầng 2, 3, 6 và kiểm LẠI dưới khoá', () => {
  it('chế độ none không giữ khoá nào; chế độ locked chỉ có hai câu khoá của BookabilityReader (bac_si rồi khung_gio, hàng đã giữ), không khoá benh_nhan, ho_so_nguoi_than, lich_hen', async () => {
    const w = await world();
    for (const mode of TWO_MODES) {
      const locking: string[] = [];
      await db.transaction('READ COMMITTED', async (em) => {
        const located = await w.reader.locate(em, {
          actor: w.owner,
          maLichHen: w.old.maLichHen,
          khungGioMoiId: w.slotIds[2]!,
        });
        if (mode === 'locked')
          await holdRescheduleChain(em, located!, w.slotIds[2]!);
        interceptQuery(em, (sql, runStatement) => {
          if (isLockingStatement(sql)) locking.push(firstTableOf(sql) ?? '?');
          return runStatement();
        });
        await w.reader.read(
          em,
          {
            actor: w.owner,
            maLichHen: w.old.maLichHen,
            khungGioMoiId: w.slotIds[2]!,
            now: NOW,
            config: await w.reader.config(),
            requestReasonGiven: false,
          },
          mode,
        );
      });
      expect(locking).toEqual(mode === 'none' ? [] : ['bac_si', 'khung_gio']);
    }
  });

  it.each(TWO_MODES)(
    'chế độ %s: không ghi gì (ảnh chụp lich_hen, khung_gio, thong_bao, nhat_ky_hanh_dong, yeu_cau_doi_lich_ngoai_chinh_sach không đổi)',
    async (mode) => {
      const w = await world();
      await insertRequest(w, 'ChoDuyet');
      const before = await snapshot();
      await run(w, mode, { reason: true });
      expect(await snapshot()).toBe(before);
    },
  );

  it('kiểm LẠI dưới khoá: giữa lần đọc thường và lúc giữ khoá có người huỷ lịch ⇒ read thấy DaHuy ⇒ LICH_HEN_KHONG_CHO_DOI', async () => {
    const w = await world();
    const result = await db.transaction('READ COMMITTED', async (em) => {
      const input = {
        actor: w.owner,
        maLichHen: w.old.maLichHen,
        khungGioMoiId: w.slotIds[2]!,
      };
      const located = await w.reader.locate(em, input);
      expect(located).not.toBeNull();
      // một phiên khác huỷ lịch và commit TRƯỚC khi ta giữ khoá
      await db.query(
        "UPDATE lich_hen SET trang_thai = 'DaHuy', thoi_diem_huy = ?, ly_do_huy = 'Huỷ chen giữa' WHERE lich_hen_id = ?",
        ['2026-11-02 08:30:00', w.old.lichHenId],
      );
      await holdRescheduleChain(em, located!, input.khungGioMoiId);
      const read = await w.reader.read(
        em,
        {
          ...input,
          now: NOW,
          config: await w.reader.config(),
          requestReasonGiven: false,
        },
        'locked',
      );
      return read;
    });
    expect(result.facts.source?.trangThai).toBe('DaHuy');
    expect(verdictLabel(evaluateReschedulability(result.facts))).toBe(
      CODES.NOT_RESCHEDULABLE,
    );
  });

  it.each(TWO_MODES)(
    'chế độ %s: now có mili giây được cắt xuống giây (H8), cả facts.now lẫn facts.bookability.now',
    async (mode) => {
      const w = await world();
      const { read } = await run(w, mode, {
        now: new Date('2026-11-02T09:00:00.789+07:00'),
      });
      const whole = new Date('2026-11-02T09:00:00+07:00');
      expect(read.facts.now).toEqual(whole);
      expect(read.facts.bookability?.now).toEqual(whole);
    },
  );
});
