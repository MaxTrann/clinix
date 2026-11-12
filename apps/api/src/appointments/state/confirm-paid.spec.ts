import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { HOLD_EXPIRED_CANCEL_REASON } from '../appointments.constants.js';
import { APPOINTMENT_NOTIFIER } from '../ports/appointment-notifier.port.js';
import { BOOKING_PORT_PROVIDERS } from '../ports/ports.providers.js';
import { AppointmentQueries } from '../queries/appointment-queries.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../testing/fake-ports.js';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../testing/scripted-entity-manager.js';
import { canTransition } from './appointment-state.matrix.js';
import { AppointmentTransitionService } from './appointment-transition.service.js';
import { isHoldExpiredCancellation } from './confirm-paid.js';

// Task B11 — CFP-01…CFP-05 (PLAN booking 7.30; TRACKING 3.24.3): `AppointmentTransitionService.confirmPaid` với `EntityManager` GIẢ (không DB). HG-11, HG-12, HG-13, CG-02, DT-03 và chuỗi khoá thật
// (CFP-06…CFP-08) ở confirm-paid.int-spec.ts và confirm-paid.concurrency.int-spec.ts. `confirmPaid` không nhận `now` và không đọc đồng hồ (Q4).
const LICH_HEN_ID = '41';
const KHUNG_GIO_ID = '7';
const BENH_NHAN_ID = '77';

interface Script {
  keys: unknown[];
  slot: unknown[];
  appointment: unknown[];
  confirm: { affectedRows: number };
  booked: { affectedRows: number };
}

const lockedAppointment = (
  trangThai: TrangThaiLichHen,
  lyDoHuy: string | null = null,
) => [{ trangThai, lyDoHuy, benhNhanId: BENH_NHAN_ID }];

// Kịch bản mặc định: lịch `ChoThanhToan`, khung giờ `DangGiuCho`; hạn giữ chỗ KHÔNG nằm trong dữ liệu `confirmPaid` đọc (Q4: không kiểm đồng hồ)
const defaultScript = (): Script => ({
  keys: [{ khungGioId: KHUNG_GIO_ID }],
  slot: [
    {
      khungGioId: KHUNG_GIO_ID,
      lichLamViecId: '3',
      ngayGio: '2026-11-10 08:00:00',
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 08:15:00',
    },
  ],
  appointment: lockedAppointment('ChoThanhToan'),
  confirm: { affectedRows: 1 },
  booked: { affectedRows: 1 },
});

function scriptedEm(script: Script): ScriptedEntityManager {
  return new ScriptedEntityManager((sql) => {
    if (sql.includes('FROM khung_gio') && sql.includes('FOR UPDATE'))
      return script.slot;
    if (sql.includes('FROM lich_hen') && sql.includes('FOR UPDATE'))
      return script.appointment;
    if (sql.includes('FROM lich_hen')) return script.keys;
    if (sql.startsWith('UPDATE lich_hen')) return script.confirm;
    if (sql.startsWith('UPDATE khung_gio')) return script.booked;
    throw new Error(`câu lạ: ${sql}`);
  });
}

function setup(script: Script = defaultScript()) {
  const em = scriptedEm(script);
  const notifier = new FakeAppointmentNotifier();
  // Thứ tự gồm cả thông báo: nhãn của `notify` chèn vào CÙNG danh sách với nhãn câu SQL
  const order: string[] = [];
  notifier.notifyCall.onCall(() => {
    order.push(`notify@${String(em.queries.length)}`);
  });
  const service = new AppointmentTransitionService(
    {} as unknown as DataSource,
    new SlotHoldService(),
    new FakeWaitlistPort(),
    notifier,
  );
  const confirm = (soTienDaThu = '150000.00') =>
    service.confirmPaid(em.em, { lichHenId: LICH_HEN_ID, soTienDaThu });
  return { em, notifier, order, service, confirm };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CFP-01 khuôn: ô ma trận, chữ lý do huỷ do hết hạn', () => {
  it('ma trận có ô ThanhToan ChoThanhToan sang DaXacNhan (confirmPaid không gọi canTransition lúc chạy: ô là hằng, như expire)', () => {
    expect(
      canTransition({
        actor: 'ThanhToan',
        from: 'ChoThanhToan',
        to: 'DaXacNhan',
      }),
    ).toEqual({ ok: true });
  });

  it.each<[string, TrangThaiLichHen, string | null, boolean]>([
    ['DaHuy đúng chữ hằng', 'DaHuy', HOLD_EXPIRED_CANCEL_REASON, true],
    ['DaHuy chữ khác (người dùng)', 'DaHuy', 'Bệnh nhân huỷ', false],
    ['DaHuy không có lý do', 'DaHuy', null, false],
    [
      'DaHuy chữ gần giống (thêm dấu chấm)',
      'DaHuy',
      `${HOLD_EXPIRED_CANCEL_REASON}.`,
      false,
    ],
    [
      'DaHuy chữ gần giống (viết hoa)',
      'DaHuy',
      HOLD_EXPIRED_CANCEL_REASON.toUpperCase(),
      false,
    ],
    [
      'trạng thái khác mà lý do trùng chữ hằng',
      'DaXacNhan',
      HOLD_EXPIRED_CANCEL_REASON,
      false,
    ],
  ])('isHoldExpiredCancellation: %s', (_ten, trangThai, lyDoHuy, expected) => {
    expect(isHoldExpiredCancellation({ trangThai, lyDoHuy })).toBe(expected);
  });

  it('chữ hằng đúng như TRX-01 đã ghim: "Hết thời gian giữ chỗ" (đổi chữ làm dòng cũ trong DB không còn nhận ra)', () => {
    expect(HOLD_EXPIRED_CANCEL_REASON).toBe('Hết thời gian giữ chỗ');
  });
});

describe('CFP-02 kết quả có kiểu và thứ tự câu của confirmPaid', () => {
  it('lịch ChoThanhToan: Confirmed; đọc thường, khung_gio FOR UPDATE, lich_hen FOR UPDATE theo khoá chính, rồi ghi lịch, ghi khung giờ, rồi thông báo (khung giờ trước lịch: bảng 5.3 tầng 5 rồi 6)', async () => {
    const { em, order, confirm } = setup();
    expect(await confirm()).toEqual({ kind: 'Confirmed' });
    expect(em.labels).toEqual([
      'read lich_hen',
      'lock khung_gio',
      'lock lich_hen',
      'write lich_hen',
      'write khung_gio',
    ]);
    expect(order).toEqual(['notify@5']);
  });

  it('khoá lịch THEO KHOÁ CHÍNH (không theo khung_gio_id, quy tắc 7) và không xin bac_si', async () => {
    const { em, confirm } = setup();
    await confirm();
    const lock = em.queries.find(
      ({ sql }) => sql.includes('FROM lich_hen') && sql.includes('FOR UPDATE'),
    );
    expect(lock?.sql).toContain('WHERE lich_hen_id = ?');
    expect(lock?.sql).not.toMatch(/WHERE[^]*khung_gio/);
    expect(lock?.params).toEqual([LICH_HEN_ID]);
    expect(em.queries.some(({ sql }) => sql.includes('bac_si'))).toBe(false);
  });

  it('UPDATE lịch có điều kiện trạng thái nguồn và đưa han_thanh_toan về NULL; UPDATE khung giờ chuyển DangGiuCho sang DaDat và thả giu_cho_den', async () => {
    const { em, confirm } = setup();
    await confirm();
    const updateLich = em.queries.find(({ sql }) =>
      sql.startsWith('UPDATE lich_hen'),
    );
    expect(updateLich?.sql).toContain("trang_thai = 'DaXacNhan'");
    expect(updateLich?.sql).toContain('han_thanh_toan = NULL');
    expect(updateLich?.sql).toContain("trang_thai = 'ChoThanhToan'");
    expect(updateLich?.params).toEqual([LICH_HEN_ID]);
    const updateSlot = em.queries.find(({ sql }) =>
      sql.startsWith('UPDATE khung_gio'),
    );
    expect(updateSlot?.sql).toContain("trang_thai = 'DaDat'");
    expect(updateSlot?.sql).toContain('giu_cho_den = NULL');
    expect(updateSlot?.sql).toContain("trang_thai = 'DangGiuCho'");
    expect(updateSlot?.params).toEqual([KHUNG_GIO_ID]);
  });

  it('Q4: không đọc đồng hồ (đồng hồ ở năm 2100, hạn giữ chỗ đã qua từ lâu): vẫn Confirmed', async () => {
    vi.useFakeTimers({ now: new Date('2100-01-01T00:00:00+07:00') });
    const { confirm } = setup();
    expect(await confirm()).toEqual({ kind: 'Confirmed' });
  });

  it('lịch DaXacNhan: AlreadyConfirmed, không ghi gì', async () => {
    const script = defaultScript();
    script.appointment = lockedAppointment('DaXacNhan');
    const { em, confirm } = setup(script);
    expect(await confirm()).toEqual({ kind: 'AlreadyConfirmed' });
    expect(em.labels).toEqual([
      'read lich_hen',
      'lock khung_gio',
      'lock lich_hen',
    ]);
  });

  it('lịch DaHuy do hết hạn: HetHanGiuCho, không ghi gì', async () => {
    const script = defaultScript();
    script.appointment = lockedAppointment('DaHuy', HOLD_EXPIRED_CANCEL_REASON);
    const { em, confirm } = setup(script);
    expect(await confirm()).toEqual({ kind: 'HetHanGiuCho' });
    expect(em.labels.some((label) => label.startsWith('write'))).toBe(false);
  });

  it.each<[TrangThaiLichHen, string | null]>([
    ['DaHuy', 'Bệnh nhân huỷ lịch'],
    ['DaHuy', null],
    ['DaTiepDon', null],
    ['HoanThanh', null],
    ['VangMat', null],
    ['DaDoiLich', null],
  ])(
    'lịch %s (lý do huỷ %s): InvalidState kèm đúng trạng thái, không ghi gì',
    async (trangThai, lyDoHuy) => {
      const script = defaultScript();
      script.appointment = lockedAppointment(trangThai, lyDoHuy);
      const { em, confirm } = setup(script);
      expect(await confirm()).toEqual({ kind: 'InvalidState', trangThai });
      expect(em.labels.some((label) => label.startsWith('write'))).toBe(false);
    },
  );

  it('mọi nhánh trả KẾT QUẢ CÓ KIỂU: không nhánh nào ném AppException trong giao dịch của người gọi', async () => {
    for (const trangThai of [
      'ChoThanhToan',
      'DaXacNhan',
      'DaHuy',
      'DaTiepDon',
      'HoanThanh',
      'VangMat',
      'DaDoiLich',
    ] as const) {
      const script = defaultScript();
      script.appointment = lockedAppointment(trangThai);
      const { confirm } = setup(script);
      const outcome = await confirm().catch((error: unknown) => error);
      expect(outcome).not.toBeInstanceOf(AppException);
      expect(outcome).not.toBeInstanceOf(Error);
    }
  });
});

describe('CFP-02 (DI) Nest dựng được dịch vụ với cổng thông báo được tiêm', () => {
  it('provider mặc định (Noop) dựng được; thay APPOINTMENT_NOTIFIER bằng Fake thì confirmPaid gọi đúng bản Fake (dây DI của task B11)', async () => {
    const notifier = new FakeAppointmentNotifier();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AppointmentTransitionService,
        AppointmentQueries,
        SlotHoldService,
        { provide: DataSource, useValue: {} },
        ...BOOKING_PORT_PROVIDERS,
      ],
    })
      .overrideProvider(APPOINTMENT_NOTIFIER)
      .useValue(notifier)
      .compile();
    const em = scriptedEm(defaultScript());
    const outcome = await moduleRef
      .get(AppointmentTransitionService)
      .confirmPaid(em.em, { lichHenId: LICH_HEN_ID, soTienDaThu: '1.00' });
    expect(outcome).toEqual({ kind: 'Confirmed' });
    expect(notifier.notifyCall.count).toBe(1);
    expect(moduleRef.get(AppointmentQueries)).toBeInstanceOf(
      AppointmentQueries,
    );
    await moduleRef.close();
  });
});

describe('CFP-03 thông báo LichHenDaXacNhan: trong giao dịch của người gọi, đúng một lần, chỉ khi Confirmed', () => {
  it('Confirmed: notify nhận ĐÚNG em của người gọi, đúng một lần, với loại sự kiện, lịch, tài khoản đặt và số đã thu chuẩn hoá', async () => {
    const { em, notifier, confirm } = setup();
    await confirm('150000.5');
    expect(notifier.notifyCall.count).toBe(1);
    expect(notifier.notifyCall.calls[0]?.[0]).toBe(em.em);
    expect(notifier.events).toEqual([
      {
        loaiSuKien: 'LichHenDaXacNhan',
        lichHenId: LICH_HEN_ID,
        taiKhoanId: BENH_NHAN_ID,
        daThu: '150000.50',
      },
    ]);
  });

  it.each<[TrangThaiLichHen, string | null]>([
    ['DaXacNhan', null],
    ['DaHuy', HOLD_EXPIRED_CANCEL_REASON],
    ['DaHuy', 'Bệnh nhân huỷ'],
    ['DaTiepDon', null],
  ])(
    'trạng thái %s (lý do %s): không thông báo',
    async (trangThai, lyDoHuy) => {
      const script = defaultScript();
      script.appointment = lockedAppointment(trangThai, lyDoHuy);
      const { notifier, confirm } = setup(script);
      await confirm();
      expect(notifier.notifyCall.count).toBe(0);
    },
  );

  it('gọi hai lần liên tiếp trên cùng dữ liệu ChoThanhToan rồi DaXacNhan: chỉ lần đầu thông báo', async () => {
    const script = defaultScript();
    const { notifier, service, em } = setup(script);
    expect(
      await service.confirmPaid(em.em, {
        lichHenId: LICH_HEN_ID,
        soTienDaThu: '1.00',
      }),
    ).toEqual({ kind: 'Confirmed' });
    script.appointment = lockedAppointment('DaXacNhan');
    expect(
      await service.confirmPaid(em.em, {
        lichHenId: LICH_HEN_ID,
        soTienDaThu: '1.00',
      }),
    ).toEqual({ kind: 'AlreadyConfirmed' });
    expect(notifier.notifyCall.count).toBe(1);
  });
});

describe('CFP-04 không bắt lỗi DB: lỗi nổi nguyên ra giao dịch của người gọi', () => {
  it.each([1213, 1205] as const)(
    'MySQL %s ở từng câu (khung_gio, lich_hen, hai UPDATE): reject đúng đối tượng lỗi đó, không bắt, không đổi thành AppException',
    async (errno) => {
      for (const matcher of [
        /FROM khung_gio/,
        /FROM lich_hen WHERE lich_hen_id = \?\s+FOR UPDATE/,
        /^UPDATE lich_hen/,
        /^UPDATE khung_gio/,
      ]) {
        const { em, confirm } = setup();
        const error = mysqlError(errno);
        em.failQuery = (sql) => (matcher.test(sql) ? error : undefined);
        await expect(confirm()).rejects.toBe(error);
      }
    },
  );

  it.each([1213, 1205] as const)(
    'MySQL %s ở notify (sau khi đã ghi lịch và khung giờ): nổi nguyên, không nuốt',
    async (errno) => {
      const { notifier, confirm } = setup();
      const error = mysqlError(errno);
      notifier.notifyCall.throwsOnce(error);
      await expect(confirm()).rejects.toBe(error);
    },
  );

  it.each<[string, (script: Script) => void, RegExp]>([
    ['lịch không tồn tại', (s) => (s.keys = []), /không tồn tại/],
    ['khung giờ của lịch không tồn tại', (s) => (s.slot = []), /không tồn tại/],
    ['lịch biến mất dưới khoá', (s) => (s.appointment = []), /biến mất/],
    [
      'UPDATE lịch ảnh hưởng 0 hàng',
      (s) => (s.confirm = { affectedRows: 0 }),
      /không còn ChoThanhToan/,
    ],
    [
      'khung giờ không còn DangGiuCho (INV-02 vỡ): markBooked Stale',
      (s) => (s.booked = { affectedRows: 0 }),
      /không còn DangGiuCho/,
    ],
  ])(
    'dữ liệu lệch (%s): ném Error thường (hoàn tác trọn giao dịch của người gọi), không phải AppException, không thông báo',
    async (_ten, mutate, message) => {
      const script = defaultScript();
      mutate(script);
      const { notifier, confirm } = setup(script);
      const error = await confirm().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppException);
      expect((error as Error).message).toMatch(message);
      expect(notifier.notifyCall.count).toBe(0);
    },
  );
});

describe('CFP-05 soTienDaThu: chỉ kiểm định dạng, không phán xét số tiền', () => {
  it.each(['0', '0.00', '150000.00', '150000.5', '0.1'])(
    'định dạng hợp lệ %s: Confirmed',
    async (value) => {
      const { confirm } = setup();
      expect(await confirm(value)).toEqual({ kind: 'Confirmed' });
    },
  );

  it.each(['', '-1', '1.234', 'abc', ' 1', '1e3', '1,5', '.5', '1.', '0x10'])(
    'định dạng sai %j: RangeError TRƯỚC mọi câu SQL',
    async (value) => {
      const { em, notifier, confirm } = setup();
      await expect(confirm(value)).rejects.toBeInstanceOf(RangeError);
      expect(em.queries).toHaveLength(0);
      expect(notifier.notifyCall.count).toBe(0);
    },
  );

  // Bọc từng giá trị trong mảng: `it.each` trải phẳng phần tử là mảng thành nhiều đối số
  it.each([[5], [null], [undefined], [{}], [['1.00']]])(
    'giá trị không phải chuỗi %j: RangeError TRƯỚC mọi câu SQL',
    async (value) => {
      const { em, service } = setup();
      await expect(
        service.confirmPaid(em.em, {
          lichHenId: LICH_HEN_ID,
          soTienDaThu: value as unknown as string,
        }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(em.queries).toHaveLength(0);
    },
  );

  it('không phán xét đủ hay thiếu cọc: không có câu nào đọc tiền cọc, và số rất nhỏ hay rất lớn cho cùng kết quả', async () => {
    for (const value of ['0.00', '0.01', '999999999.99']) {
      const { em, confirm } = setup();
      expect(await confirm(value)).toEqual({ kind: 'Confirmed' });
      expect(em.queries.some(({ sql }) => sql.includes('tien_coc'))).toBe(
        false,
      );
    }
  });
});
