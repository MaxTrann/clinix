import type { DataSource } from 'typeorm';
import { PendingBranchChangesReader } from '../../admin/branch-change-requests/pending-branch-changes.reader.js';
import type { ScheduleRowValue } from '../../admin/branches/impact/branch-diff.js';
import { BranchImpactService } from '../../admin/branches/impact/branch-impact.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
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
import { FakePendingBranchChangesPort } from '../testing/fake-ports.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  closedRow,
  PendingChangeFixtures,
  scheduleRow,
  type PendingChangeInput,
} from '../testing/pending-change-fixtures.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
import { recordStatements } from '../testing/statement-recorder.js';
import { PendingBranchChangesAdapter } from './pending-branch-changes.adapter.js';
import type { PendingBranchChangesPort } from './pending-branch-changes.port.js';

// Task B16b (nửa `admin` của B16; PLAN booking 5.10 B; admin Q6, Q48; TRACKING 3.50.3) — cổng thay đổi chi nhánh THẬT (`PendingBranchChangesAdapter` bọc `PendingBranchChangesReader` của admin B10) trong đường đặt lịch, trên MySQL 8.4 THẬT:
// DL-18 (`create`), CG-06 (`checks`) chạy lại với YÊU CẦU THẬT trong `yeu_cau_thay_doi_chi_nhanh` (bản `Fake` đã chạy ở B7, B8), và PBC-12…PBC-17 (mã mới `[đề xuất]`, PLAN 7.53): thứ tự câu, thứ tự lỗi, hợp đồng kiểu, đồng nhất
// với `BranchImpactService` của admin B8, ràng buộc UNIQUE. Ca đồng thời (PBC-20…PBC-22): pending-branch-changes.concurrency.int-spec.ts. Thế giới: Thứ Ba 10/11/2026, ô sáng 08:00 đến 11:30 (index 0 đến 7, thứ Ba), ô chiều dựng thêm khi cần
// (13:00 đến 16:30). Lịch hiện hành sáng 08:00 đến 12:00, chiều 13:00 đến 17:00. Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
let changes: PendingChangeFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
  changes = new PendingChangeFixtures(d);
});

const realPending = (): PendingBranchChangesPort =>
  new PendingBranchChangesAdapter(new PendingBranchChangesReader());
const world = () => createAppointmentWorld(db, fx, { pending: realPending() });

/** Chèn một yêu cầu của chi nhánh của thế giới (người đề xuất và người duyệt là Quản trị viên Toàn hệ thống của thế giới). */
const request = (w: CreateWorld, over: Partial<PendingChangeInput> = {}) =>
  changes.insert({
    chiNhanhId: w.branch.chiNhanhId,
    proposerId: w.systemAdmin.account.taiKhoanId,
    approverId: w.systemAdmin.account.taiKhoanId,
    ...over,
  });
/** Id khung giờ chiều thứ `index` (13:00 + 30 phút × index) cùng ngày của bác sĩ thế giới. */
const afternoonSlot = async (w: CreateWorld, index: number) =>
  (
    await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: BOOKABLE_DAY,
      ca: 'CaChieu',
    })
  ).slotIds[index]!;

const TUESDAY = 2;
const WEDNESDAY = 3;

interface Scenario {
  name: string;
  /** Có yêu cầu thật loại khung giờ hỏi hay không */
  blocked: boolean;
  /** Dựng yêu cầu; trả id khung giờ sẽ hỏi */
  setup: (w: CreateWorld) => Promise<string>;
}

const SCENARIOS: readonly Scenario[] = [
  // ----- CHẶN -----
  {
    name: 'Thứ Ba đóng, hỏi ô sáng 08:00',
    blocked: true,
    setup: async (w) => {
      await request(w, { lichHoatDong: [closedRow(TUESDAY)] });
      return w.slot(0);
    },
  },
  {
    name: 'sáng mới 08:00 đến 11:00, hỏi ô 11:00 (kết thúc 11:30, vượt giờ đóng mới)',
    blocked: true,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [scheduleRow(TUESDAY, { gioKetThucSang: '11:00:00' })],
      });
      return w.slot(6);
    },
  },
  {
    name: 'sáng mới bắt đầu 08:30, hỏi ô 08:00 (trước giờ mở mới)',
    blocked: true,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [scheduleRow(TUESDAY, { gioBatDauSang: '08:30:00' })],
      });
      return w.slot(0);
    },
  },
  {
    name: 'chiều mới kết thúc 16:00, hỏi ô chiều 16:00 (kết thúc 16:30)',
    blocked: true,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [scheduleRow(TUESDAY, { gioKetThucChieu: '16:00:00' })],
      });
      return afternoonSlot(w, 6);
    },
  },
  {
    name: 'ô CaSang 11:30 nằm trong khoảng CHIỀU mới (11:30 đến 17:00) nhưng ngoài khoảng sáng mới ⇒ chặn theo ĐÚNG ca',
    blocked: true,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [
          scheduleRow(TUESDAY, {
            gioKetThucSang: '11:00:00',
            gioBatDauChieu: '11:30:00',
          }),
        ],
      });
      return w.slot(7);
    },
  },
  {
    name: 'dịch vụ của bác sĩ bị bỏ khỏi chi nhánh (yêu cầu chỉ đổi dịch vụ)',
    blocked: true,
    setup: async (w) => {
      await request(w, {
        dichVuTruoc: [w.dichVuKhamId, '999999'],
        dichVuSau: ['999999'],
      });
      return w.slot(0);
    },
  },
  {
    name: 'yêu cầu QUÁ HẠN (qua_han_luc có) vẫn chặn (CN-108)',
    blocked: true,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [closedRow(TUESDAY)],
        quaHanLuc: '2026-11-09 07:00:00',
      });
      return w.slot(0);
    },
  },
  {
    name: 'ĐÚNG hieu_luc_tu (10/11 08:30), hỏi ô 08:30 của ngày đóng ⇒ chặn (`>=`)',
    blocked: true,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [closedRow(TUESDAY)],
        hieuLucTu: '2026-11-10 08:30:00',
      });
      return w.slot(1);
    },
  },
  // ----- KHÔNG CHẶN -----
  {
    name: 'chỉ đổi giờ chiều, hỏi ô sáng 08:00 (nằm trọn khoảng sáng giữ nguyên)',
    blocked: false,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [scheduleRow(TUESDAY, { gioKetThucChieu: '16:00:00' })],
      });
      return w.slot(0);
    },
  },
  {
    name: 'biên cuối khoảng: sáng mới 08:00 đến 11:00, hỏi ô 10:30 (kết thúc đúng 11:00)',
    blocked: false,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [scheduleRow(TUESDAY, { gioKetThucSang: '11:00:00' })],
      });
      return w.slot(5);
    },
  },
  {
    name: 'ô CaChieu 13:00 nằm trọn khoảng chiều mới 11:30 đến 17:00',
    blocked: false,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [
          scheduleRow(TUESDAY, {
            gioKetThucSang: '11:00:00',
            gioBatDauChieu: '11:30:00',
          }),
        ],
      });
      return afternoonSlot(w, 0);
    },
  },
  {
    name: 'thứ không đổi: Thứ Tư đóng, hỏi ô Thứ Ba',
    blocked: false,
    setup: async (w) => {
      await request(w, { lichHoatDong: [closedRow(WEDNESDAY)] });
      return w.slot(0);
    },
  },
  {
    name: 'khung giờ TRƯỚC hieu_luc_tu: Thứ Ba đóng từ 10/11 08:30, hỏi ô 08:00 (biên)',
    blocked: false,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [closedRow(TUESDAY)],
        hieuLucTu: '2026-11-10 08:30:00',
      });
      return w.slot(0);
    },
  },
  {
    name: 'dịch vụ bị bỏ nhưng khung giờ TRƯỚC hieu_luc_tu (10/11 09:00, hỏi ô 08:00)',
    blocked: false,
    setup: async (w) => {
      await request(w, {
        dichVuTruoc: [w.dichVuKhamId],
        dichVuSau: [],
        hieuLucTu: '2026-11-10 09:00:00',
      });
      return w.slot(0);
    },
  },
  {
    name: 'dịch vụ KHÁC bị bỏ',
    blocked: false,
    setup: async (w) => {
      await request(w, {
        dichVuTruoc: [w.dichVuKhamId, '999999'],
        dichVuSau: [w.dichVuKhamId],
      });
      return w.slot(0);
    },
  },
  ...(['ChoDuyet', 'TuChoi', 'DaRut', 'DaHuy'] as const).map(
    (trangThai): Scenario => ({
      name: `yêu cầu ${trangThai} đóng Thứ Ba (chưa hoặc không còn là "đã duyệt chưa áp dụng")`,
      blocked: false,
      setup: async (w) => {
        await request(w, { trangThai, lichHoatDong: [closedRow(TUESDAY)] });
        return w.slot(0);
      },
    }),
  ),
  {
    name: 'DaDuyet nhưng ĐÃ ÁP DỤNG (ap_dung_luc có): lịch mới đã là lịch hiện hành',
    blocked: false,
    setup: async (w) => {
      await request(w, {
        lichHoatDong: [closedRow(TUESDAY)],
        apDungLuc: '2026-11-09 07:05:00',
      });
      return w.slot(0);
    },
  },
  {
    name: 'yêu cầu của chi nhánh KHÁC đóng Thứ Ba',
    blocked: false,
    setup: async (w) => {
      const other = await fx.admin.branch();
      await request(w, {
        chiNhanhId: other.chiNhanhId,
        lichHoatDong: [closedRow(TUESDAY)],
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

describe('DL-18 (create) với yêu cầu thay đổi chi nhánh THẬT: 409 KHUNG_GIO_NGOAI_LICH_MOI dưới khoá, chỉ khi yêu cầu `DaDuyet` chưa áp dụng loại khung giờ', () => {
  it.each(SCENARIOS)('$name', async (scenario) => {
    const w = await world();
    const slot = await scenario.setup(w);
    const before = await dataState(db);

    if (scenario.blocked) {
      const { status, body } = await failureOf(w.create(slot));
      expect(status).toBe(409);
      expect(body.maLoi).toBe(BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE);
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

describe('CG-06 (checks) với yêu cầu thay đổi chi nhánh THẬT: cùng bảng chặn và không chặn, chỉ đọc', () => {
  it.each(SCENARIOS)('$name', async (scenario) => {
    const w = await world();
    const slot = await scenario.setup(w);
    const before = await dataState(db);

    if (scenario.blocked) {
      const { status, body } = await failureOf(w.check(slot));
      expect(status).toBe(409);
      expect(body.maLoi).toBe(BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE);
      expect(body.thongBao).toBe(
        'Chi nhánh sắp thay đổi lịch nhận khám nên không nhận đặt vào khung giờ này.',
      );
    } else {
      await expect(w.check(slot)).resolves.toBeDefined();
    }
    // `checks` chỉ ĐỌC: dữ liệu không đổi
    expect(await dataState(db)).toStrictEqual(before);
  });
});

describe('PBC-12 thứ tự câu của create với cổng thật: thêm đúng MỘT SELECT thường, sau hai khoá, trước INSERT', () => {
  it('khoá benh_nhan → bac_si → khung_gio KHÔNG đổi; một SELECT yeu_cau_thay_doi_chi_nhanh không khoá, TRONG giao dịch, sau khung_gio FOR UPDATE và trước INSERT lich_hen; cổng không ghi gì', async () => {
    const w = await world();
    await request(w, { lichHoatDong: [closedRow(WEDNESDAY)] });
    const statements = recordStatements(db);

    await w.create(0);

    const tx = transactionOf(statements);
    // dãy câu KHOÁ y hệt bản `Fake`: cổng thật không thêm khoá nào
    expect(tx.filter(isLockingStatement).map(firstTableOf)).toStrictEqual([
      'benh_nhan',
      'bac_si',
      'khung_gio',
    ]);
    const reads = tx.filter((sql) =>
      /\bFROM\s+`?yeu_cau_thay_doi_chi_nhanh(?![\w])/i.test(sql),
    );
    expect(reads).toHaveLength(1);
    expect(isLockingStatement(reads[0]!)).toBe(false);
    const slotLockAt = tx.findIndex(
      (sql) => isLockingStatement(sql) && firstTableOf(sql) === 'khung_gio',
    );
    const readAt = tx.indexOf(reads[0]!);
    const insertAt = tx.findIndex((sql) =>
      /INSERT\s+INTO\s+lich_hen/i.test(sql),
    );
    expect(slotLockAt).toBeGreaterThanOrEqual(0);
    expect(readAt).toBeGreaterThan(slotLockAt);
    expect(insertAt).toBeGreaterThan(readAt);
    // cổng chỉ ĐỌC: không câu ghi nào chạm bảng yêu cầu
    expect(
      writeTargets(tx).filter((target) =>
        target.includes('yeu_cau_thay_doi_chi_nhanh'),
      ),
    ).toStrictEqual([]);
    await assertBookingInvariants(db);
  });

  it('`checks` (chế độ none): cũng đúng MỘT SELECT yeu_cau_thay_doi_chi_nhanh và không câu ghi nào', async () => {
    const w = await world();
    await request(w, { lichHoatDong: [closedRow(WEDNESDAY)] });
    const statements = recordStatements(db);

    await w.check(0);

    const reads = statements.filter((sql) =>
      /\bFROM\s+`?yeu_cau_thay_doi_chi_nhanh(?![\w])/i.test(sql),
    );
    expect(reads).toHaveLength(1);
    expect(isLockingStatement(reads[0]!)).toBe(false);
    expect(
      writeTargets(statements).filter((target) =>
        target.includes('yeu_cau_thay_doi_chi_nhanh'),
      ),
    ).toStrictEqual([]);
  });
});

describe('PBC-13 thứ tự lỗi 5.4 bước 3: giờ nhận khám hiện tại, nghỉ phép, vùng bị loại, số lịch, trùng giờ', () => {
  it('giờ nhận khám HIỆN TẠI (A6) thắng vùng bị loại: ô 09:30 ngoài giờ sáng hiện hành (đóng 09:00) ⇒ NGOAI_GIO_HOAT_DONG dù yêu cầu đóng Thứ Ba', async () => {
    const w = await world();
    await db.query(
      "UPDATE chi_nhanh_lich_hoat_dong SET gio_ket_thuc_sang = '09:00:00' WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?",
      [w.branch.chiNhanhId, TUESDAY],
    );
    await request(w, { lichHoatDong: [closedRow(TUESDAY)] });

    const { body } = await failureOf(w.check(3));

    expect(body.maLoi).toBe(BOOKING_ERROR_CODES.OUTSIDE_OPENING_HOURS);
  });

  it('nghỉ phép thắng vùng bị loại: cả hai cùng đúng ⇒ BAC_SI_NGHI_PHEP (cổng nghỉ phép THẬT)', async () => {
    const w = await createAppointmentWorld(db, fx, {
      leave: new LeaveReader(),
      pending: realPending(),
    });
    await fx.doctor.leaveRequest({
      bacSiId: w.doctorId,
      trangThai: 'DaDuyet',
      batDau: BOOKABLE_DAY,
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-01 09:00:00',
    });
    await request(w, { lichHoatDong: [closedRow(TUESDAY)] });

    const { body } = await failureOf(w.check(0));

    expect(body.maLoi).toBe(BOOKING_ERROR_CODES.DOCTOR_ON_LEAVE);
  });

  it('vùng bị loại thắng VUOT_SO_LICH_HEN_TOI_DA: đối chứng chưa có yêu cầu ⇒ VUOT_SO_LICH_HEN_TOI_DA, thêm yêu cầu ⇒ KHUNG_GIO_NGOAI_LICH_MOI', async () => {
    const w = await world();
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 1 });
    await w.book('DaXacNhan', 4);
    expect((await failureOf(w.check(0))).body.maLoi).toBe(
      BOOKING_ERROR_CODES.OVER_MAX_APPOINTMENTS,
    );

    await request(w, { lichHoatDong: [closedRow(TUESDAY)] });

    expect((await failureOf(w.check(0))).body.maLoi).toBe(
      BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
    );
  });

  it('vùng bị loại thắng LICH_HEN_TRUNG_THOI_GIAN: đối chứng chưa có yêu cầu ⇒ trùng giờ, thêm yêu cầu ⇒ KHUNG_GIO_NGOAI_LICH_MOI', async () => {
    const w = await world();
    await w.bookAtOtherDoctor();
    expect((await failureOf(w.check(0))).body.maLoi).toBe(
      BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT,
    );

    await request(w, { lichHoatDong: [closedRow(TUESDAY)] });

    expect((await failureOf(w.check(0))).body.maLoi).toBe(
      BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
    );
  });
});

describe('PBC-15 hợp đồng kiểu và hình dạng kết quả của cổng thật', () => {
  it('PendingBranchChangesAdapter gán được cho PendingBranchChangesPort (kiểm kiểu bằng tsc); kết quả khi chặn có đúng khoá của FakePendingBranchChangesPort, id là chuỗi; không chặn trả null', async () => {
    // Dòng dưới là kiểm kiểu lúc BIÊN DỊCH: admin hay booking đổi chữ ký thì `tsc` đỏ ngay
    const port: PendingBranchChangesPort = new PendingBranchChangesAdapter(
      new PendingBranchChangesReader(),
    );
    const w = await world();
    const id = await request(w, { lichHoatDong: [closedRow(TUESDAY)] });
    const ask = (ngayGio: string) =>
      port.findBlocking(db.manager, {
        chiNhanhId: w.branch.chiNhanhId,
        ngayGio: new Date(ngayGio),
        thoiLuongPhut: 30,
        dichVuKhamId: w.dichVuKhamId,
        ca: 'CaSang',
      });

    const fromReal = await ask('2026-11-10T08:00:00+07:00');
    const fromFake = await new FakePendingBranchChangesPort()
      .blocks()
      .findBlocking(db.manager, {
        chiNhanhId: w.branch.chiNhanhId,
        ngayGio: new Date('2026-11-10T08:00:00+07:00'),
        thoiLuongPhut: 30,
        dichVuKhamId: w.dichVuKhamId,
        ca: 'CaSang',
      });

    expect(Object.keys(fromReal ?? {}).sort()).toEqual(
      Object.keys(fromFake ?? {}).sort(),
    );
    expect(fromReal).toStrictEqual({ yeuCauThayDoiChiNhanhId: id });
    expect(typeof fromReal?.yeuCauThayDoiChiNhanhId).toBe('string');
    // Thứ Tư không đổi ⇒ null
    await expect(ask('2026-11-11T08:00:00+07:00')).resolves.toBeNull();
  });
});

describe('PBC-16 ĐỒNG NHẤT với admin B8: adapter chặn khi và chỉ khi khung giờ ConTrong thuộc `khungGioTrong` của BranchImpactService.compute', () => {
  const EFFECTIVE_FROM = '2026-11-09 07:00:00';
  const cases: [string, ScheduleRowValue, number][] = [
    [
      'sáng mới 08:30 đến 11:00, chiều giữ nguyên',
      scheduleRow(TUESDAY, {
        gioBatDauSang: '08:30:00',
        gioKetThucSang: '11:00:00',
      }),
      3,
    ],
    [
      'sáng giữ nguyên, chiều mới 14:00 đến 16:00',
      scheduleRow(TUESDAY, {
        gioBatDauChieu: '14:00:00',
        gioKetThucChieu: '16:00:00',
      }),
      4,
    ],
    ['ngày đóng', closedRow(TUESDAY), 16],
    [
      'sáng mới 08:00 đến 11:00, chiều mới 11:30 đến 17:00 (khoảng chiều phủ ô cuối của ca sáng)',
      scheduleRow(TUESDAY, {
        gioKetThucSang: '11:00:00',
        gioBatDauChieu: '11:30:00',
      }),
      2,
    ],
    [
      'chỉ còn chiều (khoảng sáng null)',
      scheduleRow(TUESDAY, { gioBatDauSang: null, gioKetThucSang: null }),
      8,
    ],
  ];

  it.each(cases)('%s', async (_name, row, expectedBlocked) => {
    const w = await world();
    const morning = w.slotIds.map(
      (id, i) => [id, 8 * 60 + 30 * i, 'CaSang'] as const,
    );
    const afternoonIds = (
      await fx.doctor.shiftWithSlots(w.doctor.profile, {
        ngay: BOOKABLE_DAY,
        ca: 'CaChieu',
      })
    ).slotIds;
    const afternoon = afternoonIds.map(
      (id, i) => [id, 13 * 60 + 30 * i, 'CaChieu'] as const,
    );
    await request(w, { lichHoatDong: [row], hieuLucTu: EFFECTIVE_FROM });

    const adapter = realPending();
    const blockedByAdapter: string[] = [];
    for (const [id, minutes, ca] of [...morning, ...afternoon]) {
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      const found = await adapter.findBlocking(db.manager, {
        chiNhanhId: w.branch.chiNhanhId,
        ngayGio: new Date(`${BOOKABLE_DAY}T${hh}:${mm}:00+07:00`),
        thoiLuongPhut: 30,
        dichVuKhamId: w.dichVuKhamId,
        ca,
      });
      if (found !== null) blockedByAdapter.push(id);
    }
    const impact = await new BranchImpactService().compute(db.manager, {
      chiNhanhId: w.branch.chiNhanhId,
      tuLuc: new Date('2026-11-09T07:00:00+07:00'),
      changedDays: [row],
      removedServiceIds: [],
    });
    const outsideByAdmin = impact.khungGioTrong.map((s) => s.khungGioId);

    expect(blockedByAdapter.sort()).toStrictEqual(outsideByAdmin.sort());
    expect(blockedByAdapter).toHaveLength(expectedBlocked);
  });
});

describe('PBC-17 ràng buộc DB: mỗi chi nhánh chỉ MỘT yêu cầu mở (vì sao "nhiều yêu cầu" chỉ kiểm ở mức đơn vị, PBC-06)', () => {
  it('yêu cầu mở thứ hai cùng chi nhánh (đã có DaDuyet chưa áp dụng) bị ER_DUP_ENTRY 1062; sau khi áp dụng thì chèn được', async () => {
    const w = await world();
    const first = await request(w, { lichHoatDong: [closedRow(TUESDAY)] });

    await expect(
      request(w, {
        trangThai: 'ChoDuyet',
        lichHoatDong: [closedRow(WEDNESDAY)],
      }),
    ).rejects.toMatchObject({ driverError: { errno: 1062 } });

    await db.query(
      "UPDATE yeu_cau_thay_doi_chi_nhanh SET ap_dung_luc = '2026-11-09 07:05:00' WHERE yeu_cau_thay_doi_chi_nhanh_id = ?",
      [first],
    );
    await expect(
      request(w, {
        trangThai: 'ChoDuyet',
        lichHoatDong: [closedRow(WEDNESDAY)],
      }),
    ).resolves.toEqual(expect.any(String));
  });
});
