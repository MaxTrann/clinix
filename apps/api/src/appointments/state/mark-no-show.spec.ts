import { describe, expect, it, vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import {
  expectLichLockByPrimaryKey,
  lockedTablesOf,
} from '../testing/lock-chain.js';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../testing/scripted-entity-manager.js';
import {
  BENH_NHAN_ID,
  CHI_NHANH_ID,
  CONFIG,
  DEN,
  KHAC_CHI_NHANH_ID,
  LICH_HEN_ID,
  lockedRows,
  newTransition,
  SECOND,
  statesExcept,
  THOI_GIAN,
  touchesTable,
  TU,
} from '../testing/status-unit-helpers.js';
import type { MarkNoShowInput } from './appointment-transition.service.js';
import type { StatusConfig } from './status-config.js';

// Task B12 — NSH-01…NSH-08 (PLAN booking 7.32 `[đề xuất]`; TRACKING 3.26 B12-D, B12-H): `AppointmentTransitionService.markNoShow` với `EntityManager` GIẢ (không DB), cùng VM-05…VM-08, VM-14 ở mức thân.
// Ca MySQL thật (VM-05…VM-08, VM-14, VM-15, NSH-06 hoàn tác thật, NSH-07, NSH-09, NSH-10): `mark-no-show.int-spec.ts` và `mark-no-show.concurrency.int-spec.ts`.
const AFTER_WINDOW = new Date(DEN.getTime() + SECOND);

interface Counter {
  soLan: number;
  khoa: boolean;
}

interface Script {
  keys: unknown[];
  locked: unknown[];
  counter: Counter | null;
  counterRows: number;
  lichRows: number;
  flagRows: number;
}

function setup(script: Partial<Script> = {}, counter?: Counter) {
  const full: Script = {
    keys: [
      { khungGioId: '7', benhNhanId: BENH_NHAN_ID, chiNhanhId: CHI_NHANH_ID },
    ],
    locked: lockedRows('DaXacNhan'),
    counter: counter ?? { soLan: 0, khoa: false },
    counterRows: 1,
    lichRows: 1,
    flagRows: 1,
    ...script,
  };
  // Bộ đếm có TRẠNG THÁI như DB thật: `UPDATE … + 1` và `UPDATE cờ` đổi nó, các câu đọc thấy giá trị mới
  const em = new ScriptedEntityManager((sql) => {
    const row = () =>
      full.counter === null
        ? []
        : [{ soLan: full.counter.soLan, khoa: full.counter.khoa ? 1 : 0 }];
    if (sql.startsWith('UPDATE benh_nhan SET so_lan_no_show')) {
      if (full.counter !== null) full.counter.soLan += 1;
      return { affectedRows: full.counterRows };
    }
    if (sql.startsWith('UPDATE benh_nhan SET khoa_dat_lich_do_no_show')) {
      if (full.counter !== null) full.counter.khoa = true;
      return { affectedRows: full.flagRows };
    }
    if (sql.includes('FROM benh_nhan')) return row();
    if (sql.includes('FROM lich_hen') && sql.includes('FOR UPDATE'))
      return full.locked;
    if (sql.includes('FROM lich_hen')) return full.keys;
    if (sql.startsWith('UPDATE lich_hen'))
      return { affectedRows: full.lichRows };
    throw new Error(`câu lạ: ${sql}`);
  });
  const { service, waitlist, notifier } = newTransition();
  // Số câu SQL đã chạy tại MỖI lần `notify`: thông báo phải SAU mọi lần ghi
  const notifiedAfter: number[] = [];
  notifier.notifyCall.onCall(() => {
    notifiedAfter.push(em.queries.length);
  });
  const leTan = (
    over: {
      now?: Date;
      config?: StatusConfig | null;
      chiNhanhId?: string;
    } = {},
  ): MarkNoShowInput => ({
    lichHenId: LICH_HEN_ID,
    now: over.now ?? AFTER_WINDOW,
    config: over.config === undefined ? CONFIG : over.config,
    actor: 'LeTan',
    chiNhanhId: over.chiNhanhId ?? CHI_NHANH_ID,
  });
  const canAct = vi.fn(
    (target: { chiNhanhId: string }) => target.chiNhanhId === CHI_NHANH_ID,
  );
  const quanTriVien = (
    over: { now?: Date; config?: StatusConfig | null } = {},
  ): MarkNoShowInput => ({
    lichHenId: LICH_HEN_ID,
    now: over.now ?? new Date(TU.getTime() - 24 * 3_600_000),
    config: over.config === undefined ? CONFIG : over.config,
    actor: 'QuanTriVien',
    canAct,
  });
  const isDue = vi.fn((_em: unknown) => Promise.resolve(true));
  const heThong = (
    over: { now?: Date; config?: StatusConfig | null } = {},
  ): MarkNoShowInput => ({
    lichHenId: LICH_HEN_ID,
    now: over.now ?? THOI_GIAN,
    config: over.config === undefined ? CONFIG : over.config,
    actor: 'HeThong',
    isDue,
  });
  return {
    em,
    service,
    waitlist,
    notifier,
    notifiedAfter,
    counter: full.counter,
    canAct,
    isDue,
    leTan,
    quanTriVien,
    heThong,
    run: (input: MarkNoShowInput) => service.markNoShow(em.em, input),
  };
}

const READ_AND_LOCKS = ['read lich_hen', 'lock benh_nhan', 'lock lich_hen'];
const FULL_CHAIN = [
  ...READ_AND_LOCKS,
  'write lich_hen',
  'write benh_nhan',
  'read benh_nhan',
];

describe('NSH-01 kết quả có kiểu và thứ tự kiểm của markNoShow', () => {
  it('Lễ tân, lịch DaXacNhan, sau hết cửa sổ, chưa tới ngưỡng: NoShowed (số mới 1, chưa khoá); chuỗi đọc thường, khoá benh_nhan, khoá lịch, ghi lịch, cộng số, đọc lại', async () => {
    const s = setup();
    expect(await s.run(s.leTan())).toEqual({
      kind: 'NoShowed',
      soLanNoShow: 1,
      khoaDatLich: false,
    });
    expect(s.em.labels).toEqual(FULL_CHAIN);
  });

  it('không có lịch đó: NotFound sau câu đọc thường đầu tiên, CHƯA xin khoá nào', async () => {
    const s = setup({ keys: [] });
    expect(await s.run(s.leTan())).toEqual({ kind: 'NotFound' });
    expect(s.em.labels).toEqual(['read lich_hen']);
  });

  it('Lễ tân ở chi nhánh khác: NotFound ngay ở lần đọc thường, TRƯỚC khi xin khoá benh_nhan (người ngoài phạm vi không được tranh khoá của người khác)', async () => {
    const s = setup();
    expect(await s.run(s.leTan({ chiNhanhId: KHAC_CHI_NHANH_ID }))).toEqual({
      kind: 'NotFound',
    });
    expect(s.em.labels).toEqual(['read lich_hen']);
  });

  it('phạm vi kiểm LẠI dưới khoá (5.3 quy tắc 2): lần đọc thường đúng chi nhánh nhưng hàng dưới khoá ở chi nhánh khác ⇒ NotFound, không ghi', async () => {
    const s = setup({
      locked: lockedRows('DaXacNhan', { chiNhanhId: KHAC_CHI_NHANH_ID }),
    });
    expect(await s.run(s.leTan())).toEqual({ kind: 'NotFound' });
    expect(s.em.labels).toEqual(READ_AND_LOCKS);
  });

  it('hàng lịch biến mất giữa đọc thường và khoá lịch: NotFound, không ghi', async () => {
    const s = setup({ locked: [] });
    expect(await s.run(s.leTan())).toEqual({ kind: 'NotFound' });
    expect(s.em.labels).toEqual(READ_AND_LOCKS);
  });

  it.each(statesExcept('DaXacNhan'))(
    'Lễ tân, lịch ở trạng thái %s: InvalidState kèm đúng trạng thái (VangMat là bấm đúp: không cộng số lần thứ hai); không ghi, không thông báo',
    async (trangThai: TrangThaiLichHen) => {
      const s = setup({ locked: lockedRows(trangThai) });
      expect(await s.run(s.leTan())).toEqual({
        kind: 'InvalidState',
        trangThai,
      });
      expect(s.em.labels).toEqual(READ_AND_LOCKS);
      expect(s.notifier.notifyCall.count).toBe(0);
    },
  );

  it('Lễ tân chưa quá hết cửa sổ (đúng mốc thoi_gian + 15 phút còn trong cửa sổ): NotDue, không ghi (CT-04)', async () => {
    for (const now of [TU, THOI_GIAN, DEN]) {
      const s = setup();
      expect(await s.run(s.leTan({ now }))).toEqual({ kind: 'NotDue' });
      expect(s.em.labels).toEqual(READ_AND_LOCKS);
    }
  });

  it('chưa có cấu hình: ConfigMissing (không đoán ngưỡng, quy tắc 35), không ghi, với CẢ ba vai trò', async () => {
    const a = setup();
    expect(await a.run(a.leTan({ config: null }))).toEqual({
      kind: 'ConfigMissing',
    });
    const b = setup();
    expect(await b.run(b.quanTriVien({ config: null }))).toEqual({
      kind: 'ConfigMissing',
    });
    const c = setup();
    expect(await c.run(c.heThong({ config: null }))).toEqual({
      kind: 'ConfigMissing',
    });
    for (const s of [a, b, c]) expect(s.em.labels).toEqual(READ_AND_LOCKS);
    // `isDue` của job chưa được hỏi khi chưa có cấu hình: không tốn câu SQL của job vô ích
    expect(c.isDue).not.toHaveBeenCalled();
  });

  it('thứ tự kiểm: phạm vi → trạng thái → cấu hình → điều kiện đến hạn (lịch DaHuy chưa có cấu hình là InvalidState, không phải ConfigMissing)', async () => {
    const s = setup({ locked: lockedRows('DaHuy') });
    expect(await s.run(s.leTan({ config: null }))).toMatchObject({
      kind: 'InvalidState',
    });
  });

  it('dữ liệu lệch ném Error THƯỜNG (không phải AppException): tài khoản đặt không có hàng benh_nhan; lịch đổi tài khoản đặt giữa hai lần đọc', async () => {
    const noPatient = setup({ counter: null });
    const e1 = await noPatient
      .run(noPatient.leTan())
      .catch((caught: unknown) => caught);
    expect(e1).toBeInstanceOf(Error);
    expect(e1).not.toBeInstanceOf(AppException);

    const moved = setup({
      locked: lockedRows('DaXacNhan', { benhNhanId: '999' }),
    });
    const e2 = await moved
      .run(moved.leTan())
      .catch((caught: unknown) => caught);
    expect(e2).toBeInstanceOf(Error);
    expect(e2).not.toBeInstanceOf(AppException);
    expect(moved.em.labels).toEqual(READ_AND_LOCKS);
  });
});

describe('NSH-02 ba biến thể actor: LeTan, QuanTriVien, HeThong', () => {
  it('LeTan: cửa sổ nửa mở, chỉ SAU thoi_gian + sau (Q22): +1 giây được, đúng mốc không; mili giây của now bị cắt', async () => {
    const ok = setup();
    expect((await ok.run(ok.leTan({ now: AFTER_WINDOW }))).kind).toBe(
      'NoShowed',
    );
    const edge = setup();
    expect(
      (await edge.run(edge.leTan({ now: new Date(DEN.getTime() + 999) }))).kind,
    ).toBe('NotDue');
  });

  it('QuanTriVien: KHÔNG điều kiện thời gian (quy tắc 40), được cả từ DaXacNhan lẫn DaTiepDon (ô Q24), dù `now` còn cách giờ hẹn một ngày', async () => {
    for (const trangThai of ['DaXacNhan', 'DaTiepDon'] as const) {
      const s = setup({ locked: lockedRows(trangThai) });
      expect((await s.run(s.quanTriVien())).kind).toBe('NoShowed');
      expect(s.em.queries[3]?.params).toEqual([
        'VangMat',
        LICH_HEN_ID,
        trangThai,
      ]);
    }
  });

  it.each(statesExcept('DaXacNhan', 'DaTiepDon'))(
    'QuanTriVien, nguồn %s: InvalidState (ma trận Q24 không có ô sang VangMat), không ghi',
    async (trangThai: TrangThaiLichHen) => {
      const s = setup({ locked: lockedRows(trangThai) });
      expect(await s.run(s.quanTriVien())).toEqual({
        kind: 'InvalidState',
        trangThai,
      });
      expect(s.em.labels).toEqual(READ_AND_LOCKS);
    },
  );

  it('QuanTriVien: canAct kiểm HAI LẦN (đọc thường và dưới khoá); sai ở lần đầu ⇒ NotFound TRƯỚC mọi khoá, sai ở lần hai ⇒ NotFound sau khoá', async () => {
    const early = setup();
    early.canAct.mockReturnValue(false);
    expect(await early.run(early.quanTriVien())).toEqual({ kind: 'NotFound' });
    expect(early.em.labels).toEqual(['read lich_hen']);
    expect(early.canAct).toHaveBeenCalledWith({ chiNhanhId: CHI_NHANH_ID });

    const late = setup();
    late.canAct.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(await late.run(late.quanTriVien())).toEqual({ kind: 'NotFound' });
    expect(late.em.labels).toEqual(READ_AND_LOCKS);
    expect(late.canAct).toHaveBeenCalledTimes(2);
  });

  it('HeThong: isDue(em) được hỏi SAU khi đã khoá lịch và qua ma trận; đúng ⇒ NoShowed; sai ⇒ NotDue và không ghi', async () => {
    const due = setup();
    expect((await due.run(due.heThong())).kind).toBe('NoShowed');
    expect(due.isDue).toHaveBeenCalledTimes(1);
    expect(due.isDue).toHaveBeenCalledWith(due.em);

    const notDue = setup();
    notDue.isDue.mockResolvedValueOnce(false);
    expect(await notDue.run(notDue.heThong())).toEqual({ kind: 'NotDue' });
    expect(notDue.em.labels).toEqual(READ_AND_LOCKS);
    expect(notDue.notifier.notifyCall.count).toBe(0);
  });

  it('HeThong: lịch không còn DaXacNhan (kể cả DaTiepDon: ma trận chỉ cho HeThong đi từ DaXacNhan) ⇒ InvalidState và isDue KHÔNG được hỏi', async () => {
    for (const trangThai of statesExcept('DaXacNhan')) {
      const s = setup({ locked: lockedRows(trangThai) });
      expect(await s.run(s.heThong())).toEqual({
        kind: 'InvalidState',
        trangThai,
      });
      expect(s.isDue).not.toHaveBeenCalled();
    }
  });
});

describe('NSH-03 chuỗi khoá: benh_nhan (tầng 2) TRƯỚC lich_hen (tầng 6), không khung_gio', () => {
  it('đúng thứ tự câu: đọc thường lich_hen, benh_nhan FOR UPDATE, lich_hen FOR UPDATE theo khoá chính; bảng bị khoá theo thứ tự 5.3', async () => {
    const s = setup();
    await s.run(s.leTan());
    const sql = s.em.queries.map((query) => query.sql);
    expect(s.em.labels.slice(0, 3)).toEqual(READ_AND_LOCKS);
    expect(sql[0]).not.toMatch(/FOR\s+UPDATE/i);
    expect(sql[1]).toMatch(/WHERE tai_khoan_id = \? FOR UPDATE/);
    expect(s.em.queries[1]?.params).toEqual([BENH_NHAN_ID]);
    expectLichLockByPrimaryKey(sql[2] as string);
    expect(lockedTablesOf(sql)).toEqual(['benh_nhan', 'lich_hen']);
    expect(findLockOrderViolation(lockedTablesOf(sql))).toBeNull();
  });

  it('KHÔNG câu nào chạm khung_gio (khung giờ giữ DaDat, INV-3), KHÔNG WaitlistPort (VM-08 ở mức thân); khoá chỉ theo khoá chính của hai bảng', async () => {
    const s = setup();
    await s.run(s.leTan());
    for (const { sql } of s.em.queries)
      expect(touchesTable(sql, 'khung_gio'), sql).toBe(false);
    expect(s.waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('ghi lịch bằng UPDATE có điều kiện nguồn, cộng số ngay trong SQL (không đọc rồi ghi lại giá trị tính ở ứng dụng)', async () => {
    const s = setup();
    await s.run(s.leTan());
    expect(s.em.queries[3]?.sql).toMatch(
      /^UPDATE lich_hen SET trang_thai = \?\s+WHERE lich_hen_id = \? AND trang_thai = \?/,
    );
    expect(s.em.queries[4]?.sql).toMatch(
      /^UPDATE benh_nhan SET so_lan_no_show = so_lan_no_show \+ 1\s+WHERE tai_khoan_id = \?/,
    );
    expect(s.em.queries[4]?.params).toEqual([BENH_NHAN_ID]);
  });
});

describe('NSH-04 ngưỡng no-show: đạt HOẶC vượt (>=), cờ đã bật không bật lại (VM-05, VM-06, VM-07)', () => {
  it.each<[string, Counter, number, boolean]>([
    ['0 ⇒ 1 so với ngưỡng 3: chưa khoá', { soLan: 0, khoa: false }, 3, false],
    ['1 ⇒ 2 so với ngưỡng 3: chưa khoá', { soLan: 1, khoa: false }, 3, false],
    [
      '2 ⇒ 3 so với ngưỡng 3: ĐẠT ngưỡng ⇒ khoá',
      { soLan: 2, khoa: false },
      3,
      true,
    ],
    [
      '3 ⇒ 4 cờ tắt (sau khi Quản trị viên mở khoá): khoá lại NGAY (Q25, VM-07)',
      { soLan: 3, khoa: false },
      3,
      true,
    ],
    [
      '2 ⇒ 3 cờ đã bật: chỉ tăng số, không bật lại, không cảnh báo lặp (VM-06)',
      { soLan: 2, khoa: true },
      3,
      false,
    ],
    ['5 ⇒ 6 cờ đã bật: chỉ tăng số', { soLan: 5, khoa: true }, 3, false],
    ['0 ⇒ 1 so với ngưỡng 1: khoá ngay', { soLan: 0, khoa: false }, 1, true],
  ])('%s', async (_ten, before, nguong, locks) => {
    const s = setup({}, { ...before });
    const config: StatusConfig = { ...CONFIG, nguongNoShow: nguong };
    expect(await s.run(s.leTan({ config }))).toEqual({
      kind: 'NoShowed',
      soLanNoShow: before.soLan + 1,
      khoaDatLich: locks,
    });
    const flagWrites = s.em.queries.filter(({ sql }) =>
      sql.startsWith('UPDATE benh_nhan SET khoa_dat_lich_do_no_show'),
    );
    expect(flagWrites).toHaveLength(locks ? 1 : 0);
    const events = s.notifier.events.map((event) => event.loaiSuKien);
    expect(events).toEqual(
      locks
        ? [
            BOOKING_NOTIFICATION_EVENTS.NO_SHOW,
            BOOKING_NOTIFICATION_EVENTS.NO_SHOW_LOCK,
          ]
        : [BOOKING_NOTIFICATION_EVENTS.NO_SHOW],
    );
  });

  it('cờ chỉ bật khi đang tắt (UPDATE có điều kiện khoa = 0: lưới an toàn); không trúng đúng 1 hàng là dữ liệu lệch ⇒ Error', async () => {
    const s = setup({ flagRows: 0 }, { soLan: 2, khoa: false });
    const error = await s.run(s.leTan()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect(s.em.queries.at(-1)?.sql).toMatch(
      /AND khoa_dat_lich_do_no_show = 0/,
    );
  });
});

describe('NSH-05 thông báo: đúng tài khoản ĐẶT, đúng lịch, SAU mọi lần ghi, một lần (CT-12, VM-05, VM-14)', () => {
  it('LichHenVangMat cho tài khoản đặt (lịch của hồ sơ người thân vẫn gửi cho tài khoản đặt) và gắn với lịch này; ghi SAU câu đọc lại bộ đếm', async () => {
    const s = setup();
    await s.run(s.leTan());
    expect(s.notifier.events).toEqual([
      {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.NO_SHOW,
        lichHenId: LICH_HEN_ID,
        taiKhoanId: BENH_NHAN_ID,
      },
    ]);
    expect(s.notifiedAfter).toEqual([s.em.queries.length]);
  });

  it('khi cờ vừa bật: thêm KhoaDatLichNoShow cho cùng tài khoản đặt và cùng lịch, SAU LichHenVangMat và sau cả hai lần ghi bộ đếm', async () => {
    const s = setup({}, { soLan: 2, khoa: false });
    await s.run(s.leTan());
    expect(s.notifier.events).toEqual([
      {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.NO_SHOW,
        lichHenId: LICH_HEN_ID,
        taiKhoanId: BENH_NHAN_ID,
      },
      {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.NO_SHOW_LOCK,
        lichHenId: LICH_HEN_ID,
        taiKhoanId: BENH_NHAN_ID,
      },
    ]);
    expect(s.notifiedAfter).toEqual([s.em.queries.length, s.em.queries.length]);
    expect(s.em.labels.at(-1)).toBe('write benh_nhan');
  });

  it('notify nhận ĐÚNG `em` của người gọi (cùng một đối tượng, không phải một kết nối khác), ở cả hai thông báo: thông báo hoàn tác cùng giao dịch (M17: ghi ngoài giao dịch)', async () => {
    const s = setup({}, { soLan: 2, khoa: false });
    // em giả có sẵn `connection.manager` để một lời gọi SAI sang kết nối khác vẫn chạy TỚI `notify` (không nổ TypeError) và bị khẳng định này bắt
    Object.assign(s.em.em, { connection: { manager: {} } });
    expect((await s.run(s.leTan())).kind).toBe('NoShowed');
    expect(s.notifier.notifyCall.count).toBe(2);
    for (const [manager] of s.notifier.notifyCall.calls)
      expect(manager).toBe(s.em.em);
  });

  it('mọi nhánh từ chối: không thông báo, không cộng số lần, không ghi bộ đếm', async () => {
    const refused = [
      { s: setup({ keys: [] }), now: AFTER_WINDOW },
      { s: setup({ locked: lockedRows('VangMat') }), now: AFTER_WINDOW },
      { s: setup(), now: THOI_GIAN },
    ];
    for (const { s, now } of refused) {
      expect((await s.run(s.leTan({ now }))).kind).not.toBe('NoShowed');
      expect(s.notifier.notifyCall.count).toBe(0);
      expect(
        s.em.queries.some(({ sql }) => sql.startsWith('UPDATE benh_nhan')),
      ).toBe(false);
    }
  });
});

describe('NSH-06 họ B: không ném AppException, không bắt lỗi DB; lỗi sau lần ghi đầu nổi nguyên để người gọi hoàn tác trọn', () => {
  it.each([1213, 1205] as const)(
    'lỗi %s ở BẤT KỲ câu ghi hay khoá nào (khoá benh_nhan, khoá lịch, UPDATE lịch, cộng số) nổi NGUYÊN ra',
    async (errno) => {
      for (const target of [
        'FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE',
        'FROM lich_hen WHERE lich_hen_id = ?\nFOR UPDATE',
        'UPDATE lich_hen',
        'UPDATE benh_nhan SET so_lan_no_show',
      ]) {
        const s = setup();
        const error = mysqlError(errno);
        s.em.failQuery = (sql) => (sql.includes(target) ? error : undefined);
        await expect(s.run(s.leTan())).rejects.toBe(error);
      }
    },
  );

  it('UPDATE lịch hay cộng số không trúng đúng 1 hàng (dữ liệu lệch dưới khoá): Error THƯỜNG, không phải AppException', async () => {
    for (const script of [{ lichRows: 0 }, { counterRows: 0 }]) {
      const s = setup(script);
      const error = await s.run(s.leTan()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppException);
    }
  });

  it('notify ném: lỗi nổi nguyên (không bị nuốt), để thông báo hoàn tác cùng giao dịch', async () => {
    const s = setup();
    const boom = new Error('ghi thông báo hỏng');
    s.notifier.notifyCall.throwsOnce(boom);
    await expect(s.run(s.leTan())).rejects.toBe(boom);
  });
});

describe('NSH-08 khung giờ và danh sách chờ: Vắng mặt KHÔNG giải phóng khung giờ (VM-08, quy tắc 44)', () => {
  it.each(['leTan', 'quanTriVien', 'heThong'] as const)(
    'vai trò %s: không câu SQL nào chạm khung_gio, WaitlistPort không được gọi',
    async (role) => {
      const s = setup();
      expect((await s.run(s[role]())).kind).toBe('NoShowed');
      for (const { sql } of s.em.queries)
        expect(touchesTable(sql, 'khung_gio'), sql).toBe(false);
      expect(s.waitlist.onSlotReleasedCall.count).toBe(0);
    },
  );
});
