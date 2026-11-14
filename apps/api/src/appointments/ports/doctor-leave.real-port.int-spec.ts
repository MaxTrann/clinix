import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { LeaveRequestInput } from '../../doctor/testing/doctor-fixtures.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { BOOKABLE_DAY, BookingFixtures } from '../testing/booking-fixtures.js';
import {
  createAppointmentWorld,
  dataState,
  failureOf,
  lichHenRows,
  lockErrnos,
  transactionOf,
  writeTargets,
  type CreateWorld,
} from '../testing/create-appointment-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
import { recordStatements } from '../testing/statement-recorder.js';

// Task B16a (nửa `doctor` của B16; PLAN booking 5.10 D4, H5; TRACKING 3.39 B16a-E) — cổng nghỉ phép THẬT (`LeaveReader` của `doctor`) trong đường đặt lịch, trên MySQL 8.4 THẬT: DL-17 (`create`), CG-05 (`checks`), chạy lại với cổng
// thật (bản `Fake` đã chạy ở B7 và B8), và LRP-01 (mã mới `[đề xuất]`, PLAN 7.45): thứ tự câu của `create`. `createAppointmentWorld` nhận `leave` thật (B16a); mọi phụ thuộc còn lại như B8. Ca đồng thời (DT-09, LRP-02, DT-17):
// doctor-leave.concurrency.int-spec.ts. Hợp đồng kiểu giữa cổng và `LeaveReader` (BPO-05): doctor-leave.port.int-spec.ts. Ô 0 của thế giới là 08:00 ca SÁNG ngày 10/11/2026 (thứ Ba); ô ca CHIỀU dựng thêm khi cần. Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = () =>
  createAppointmentWorld(db, fx, { leave: new LeaveReader() });

const handled = (w: CreateWorld) => ({
  nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
  thoiDiemXuLy: '2026-11-01 09:00:00',
});
type LeaveShape = Omit<LeaveRequestInput, 'bacSiId' | 'trangThai'>;
const approved = (w: CreateWorld, input: LeaveShape = {}) =>
  fx.doctor.leaveRequest({
    bacSiId: w.doctorId,
    trangThai: 'DaDuyet',
    ...handled(w),
    ...input,
  });
const pending = (w: CreateWorld, input: LeaveShape = {}) =>
  fx.doctor.leaveRequest({ bacSiId: w.doctorId, ...input });
const refused = (w: CreateWorld, input: LeaveShape = {}) =>
  fx.doctor.leaveRequest({
    bacSiId: w.doctorId,
    trangThai: 'TuChoi',
    ...handled(w),
    ...input,
  });
/** Khung giờ đầu (13:00) của ca CHIỀU cùng ngày của bác sĩ thế giới. */
const afternoonSlot = async (w: CreateWorld) =>
  (
    await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: BOOKABLE_DAY,
      ca: 'CaChieu',
    })
  ).slotIds[0]!;

interface Scenario {
  name: string;
  /** Có yêu cầu nghỉ chặn khung giờ hỏi hay không (theo `BLOCKING_LEAVE_STATES` = ChoDuyet, DaDuyet; TuChoi không chặn) */
  blocked: boolean;
  /** Dựng các yêu cầu nghỉ; trả id khung giờ sẽ hỏi */
  setup: (w: CreateWorld) => Promise<string>;
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'DaDuyet CaNgay đúng ngày 10/11, hỏi ô ca sáng',
    blocked: true,
    setup: async (w) => {
      await approved(w, { batDau: BOOKABLE_DAY });
      return w.slot(0);
    },
  },
  {
    name: 'DaDuyet CaNgay nhiều ngày (09 đến 12/11) phủ ngày 10/11',
    blocked: true,
    setup: async (w) => {
      await approved(w, { batDau: '2026-11-09', ketThuc: '2026-11-12' });
      return w.slot(0);
    },
  },
  {
    name: 'ChoDuyet TheoCa CaSang, hỏi ô ca sáng',
    blocked: true,
    setup: async (w) => {
      await pending(w, {
        hinhThuc: 'TheoCa',
        ca: 'CaSang',
        batDau: BOOKABLE_DAY,
      });
      return w.slot(0);
    },
  },
  {
    name: 'ChoDuyet TheoCa CaChieu, hỏi ô ca CHIỀU',
    blocked: true,
    setup: async (w) => {
      await pending(w, {
        hinhThuc: 'TheoCa',
        ca: 'CaChieu',
        batDau: BOOKABLE_DAY,
      });
      return afternoonSlot(w);
    },
  },
  {
    name: 'ChoDuyet và DaDuyet cùng phủ ngày 10/11 (chọn một, vẫn chặn)',
    blocked: true,
    setup: async (w) => {
      await pending(w, { batDau: BOOKABLE_DAY });
      await approved(w, { batDau: BOOKABLE_DAY });
      return w.slot(0);
    },
  },
  {
    name: 'ChoDuyet TheoCa CaChieu, hỏi ô ca SÁNG (ca khác không bị chặn)',
    blocked: false,
    setup: async (w) => {
      await pending(w, {
        hinhThuc: 'TheoCa',
        ca: 'CaChieu',
        batDau: BOOKABLE_DAY,
      });
      return w.slot(0);
    },
  },
  {
    name: 'TuChoi CaNgay đúng ngày (không chặn)',
    blocked: false,
    setup: async (w) => {
      await refused(w, { batDau: BOOKABLE_DAY });
      return w.slot(0);
    },
  },
  {
    name: 'DaDuyet ngày liền TRƯỚC (09/11), biên',
    blocked: false,
    setup: async (w) => {
      await approved(w, { batDau: '2026-11-09' });
      return w.slot(0);
    },
  },
  {
    name: 'DaDuyet ngày liền SAU (11/11), biên',
    blocked: false,
    setup: async (w) => {
      await approved(w, { batDau: '2026-11-11' });
      return w.slot(0);
    },
  },
  {
    name: 'DaDuyet của bác sĩ KHÁC cùng ngày',
    blocked: false,
    setup: async (w) => {
      const other = await fx.admin.doctor(w.branch);
      await fx.doctor.leaveRequest({
        bacSiId: other.account.taiKhoanId,
        trangThai: 'DaDuyet',
        batDau: BOOKABLE_DAY,
        ...handled(w),
      });
      return w.slot(0);
    },
  },
];

/** Sau mỗi ca: INV-01…INV-05 và không khoá nào còn bị giữ trên ba hàng của luồng tạo (sau commit hay hoàn tác). */
async function expectSettled(w: CreateWorld, khungGioId: string) {
  await assertBookingInvariants(db);
  expect(
    await lockErrnos(db, {
      benhNhanId: w.patientId,
      bacSiId: w.doctorId,
      khungGioId,
    }),
  ).toStrictEqual({ benhNhan: null, bacSi: null, khungGio: null });
}

describe('DL-17 (create) với LeaveReader THẬT: 409 BAC_SI_NGHI_PHEP dưới khoá bac_si, chặn đúng ChoDuyet và DaDuyet', () => {
  it.each(SCENARIOS)('$name', async (scenario) => {
    const w = await world();
    const slot = await scenario.setup(w);
    const before = await dataState(db);

    if (scenario.blocked) {
      const { status, body } = await failureOf(w.create(slot));
      expect(status).toBe(409);
      expect(body.maLoi).toBe('BAC_SI_NGHI_PHEP');
      // bị từ chối: KHÔNG ghi gì, không gọi cổng ghi
      expect(await dataState(db)).toStrictEqual(before);
      expect(w.payment.recordZeroPaymentCall.count).toBe(0);
      expect(w.notifier.notifyCall.count).toBe(0);
    } else {
      const created = await w.create(slot);
      expect(created.trangThai).toBe('DaXacNhan');
      expect(await lichHenRows(db)).toMatchObject([
        { khungGioId: slot, trangThai: 'DaXacNhan' },
      ]);
    }
    await expectSettled(w, slot);
  });
});

describe('CG-05 (checks) với LeaveReader THẬT: cùng bảng chặn và không chặn, chỉ đọc', () => {
  it.each(SCENARIOS)('$name', async (scenario) => {
    const w = await world();
    const slot = await scenario.setup(w);
    const before = await dataState(db);

    if (scenario.blocked) {
      const { status, body } = await failureOf(w.check(slot));
      expect(status).toBe(409);
      expect(body.maLoi).toBe('BAC_SI_NGHI_PHEP');
    } else {
      await expect(w.check(slot)).resolves.toBeDefined();
    }
    // `checks` chỉ ĐỌC: dữ liệu không đổi
    expect(await dataState(db)).toStrictEqual(before);
  });
});

describe('LRP-01 thứ tự câu của create với cổng thật: thêm đúng MỘT SELECT thường, sau hai khoá, trước INSERT', () => {
  it('khoá benh_nhan → bac_si → khung_gio KHÔNG đổi; một SELECT yeu_cau_nghi_phep không khoá, nằm sau khung_gio FOR UPDATE và trước INSERT lich_hen; cổng không ghi gì', async () => {
    const w = await world();
    const statements = recordStatements(db);

    await w.create(0);

    const tx = transactionOf(statements);
    // dãy câu KHOÁ y hệt bản `Fake` (create-appointment.service.int-spec: KT-04): cổng thật không thêm khoá nào
    expect(tx.filter(isLockingStatement).map(firstTableOf)).toStrictEqual([
      'benh_nhan',
      'bac_si',
      'khung_gio',
    ]);
    const leaveReads = tx.filter((sql) =>
      /\bFROM\s+`?yeu_cau_nghi_phep`?/i.test(sql),
    );
    expect(leaveReads).toHaveLength(1);
    expect(isLockingStatement(leaveReads[0]!)).toBe(false);
    const slotLockAt = tx.findIndex(
      (sql) => isLockingStatement(sql) && firstTableOf(sql) === 'khung_gio',
    );
    const leaveAt = tx.indexOf(leaveReads[0]!);
    const insertAt = tx.findIndex((sql) =>
      /INSERT\s+INTO\s+lich_hen/i.test(sql),
    );
    expect(slotLockAt).toBeGreaterThanOrEqual(0);
    expect(leaveAt).toBeGreaterThan(slotLockAt);
    expect(insertAt).toBeGreaterThan(leaveAt);
    // cổng chỉ ĐỌC: không câu ghi nào chạm yeu_cau_nghi_phep
    expect(
      writeTargets(tx).filter((target) => target.includes('yeu_cau_nghi_phep')),
    ).toStrictEqual([]);
    await expectSettled(w, w.slot(0));
  });
});
