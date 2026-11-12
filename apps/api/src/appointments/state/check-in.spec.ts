import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { expectLichLockByPrimaryKey } from '../testing/lock-chain.js';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../testing/scripted-entity-manager.js';
import {
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
import type { CheckInInput } from './appointment-transition.service.js';
import type { StatusConfig } from './status-config.js';

// Task B12 — CKI-01…CKI-05 (PLAN booking 7.32 `[đề xuất]`; TRACKING 3.26 B12-C, B12-H): `AppointmentTransitionService.checkIn` với `EntityManager` GIẢ (không DB). CT-05, CT-06, CT-07, CT-10 (qua route), CKI-06, CKI-07, CKI-08, CKI-09
// ở `check-in.int-spec.ts` và `check-in.concurrency.int-spec.ts`. `checkIn` nhận `now` và `config` từ người gọi (đọc ngoài giao dịch) và không đọc đồng hồ (H8).

interface Script {
  locked: unknown[];
  update: { affectedRows: number };
}

function setup(script: Partial<Script> = {}) {
  const full: Script = {
    locked: lockedRows('DaXacNhan'),
    update: { affectedRows: 1 },
    ...script,
  };
  const em = new ScriptedEntityManager((sql) => {
    if (sql.includes('FROM lich_hen') && sql.includes('FOR UPDATE'))
      return full.locked;
    if (sql.startsWith('UPDATE lich_hen')) return full.update;
    throw new Error(`câu lạ: ${sql}`);
  });
  const { service, waitlist, notifier } = newTransition();
  // Số câu SQL đã chạy tại MỖI lần hỏi `remainingToCollect`: phải là 1 (sau câu khoá lịch), tức hỏi DƯỚI khoá
  const askedAfter: number[] = [];
  let owed = '0.00';
  const remainingToCollect = vi.fn((_em: EntityManager) => {
    askedAfter.push(em.queries.length);
    return Promise.resolve(owed);
  });
  const leTan = (
    over: {
      now?: Date;
      config?: StatusConfig | null;
      chiNhanhId?: string;
    } = {},
  ): CheckInInput => ({
    lichHenId: LICH_HEN_ID,
    now: over.now ?? THOI_GIAN,
    config: over.config === undefined ? CONFIG : over.config,
    actor: 'LeTan',
    chiNhanhId: over.chiNhanhId ?? CHI_NHANH_ID,
    remainingToCollect,
  });
  const thanhToan = (
    over: { now?: Date; config?: StatusConfig | null } = {},
  ): CheckInInput => ({
    lichHenId: LICH_HEN_ID,
    now: over.now ?? THOI_GIAN,
    config: over.config === undefined ? CONFIG : over.config,
    actor: 'ThanhToan',
  });
  return {
    em,
    service,
    waitlist,
    notifier,
    remainingToCollect,
    askedAfter,
    owes: (amount: string) => {
      owed = amount;
    },
    leTan,
    thanhToan,
    run: (input: CheckInInput) => service.checkIn(em.em, input),
  };
}

const NO_WRITE = ['lock lich_hen'];

describe('CKI-01 kết quả có kiểu và thứ tự kiểm của checkIn (Lễ tân)', () => {
  it('lịch DaXacNhan, đủ tiền, trong cửa sổ: CheckedIn; khoá lịch theo khoá chính, hỏi số còn phải thu DƯỚI khoá, rồi một UPDATE có điều kiện nguồn', async () => {
    const s = setup();
    expect(await s.run(s.leTan())).toEqual({ kind: 'CheckedIn' });
    expect(s.em.labels).toEqual(['lock lich_hen', 'write lich_hen']);
    expect(s.askedAfter).toEqual([1]);
    expect(s.em.queries[1]?.params).toEqual([
      'DaTiepDon',
      LICH_HEN_ID,
      'DaXacNhan',
    ]);
  });

  it('không có lịch đó: NotFound, chỉ một câu khoá, không hỏi tiền, không ghi', async () => {
    const s = setup({ locked: [] });
    expect(await s.run(s.leTan())).toEqual({ kind: 'NotFound' });
    expect(s.em.labels).toEqual(NO_WRITE);
    expect(s.remainingToCollect).not.toHaveBeenCalled();
  });

  it.each(statesExcept('DaXacNhan'))(
    'lịch ở trạng thái %s: InvalidState kèm đúng trạng thái (kể cả DaTiepDon: bấm đúp, không có AlreadyCheckedIn); không hỏi tiền, không ghi',
    async (trangThai: TrangThaiLichHen) => {
      const s = setup({ locked: lockedRows(trangThai) });
      expect(await s.run(s.leTan())).toEqual({
        kind: 'InvalidState',
        trangThai,
      });
      expect(s.em.labels).toEqual(NO_WRITE);
      expect(s.remainingToCollect).not.toHaveBeenCalled();
    },
  );

  it('chưa có cấu hình (null): ConfigMissing, KHÔNG hỏi tiền, không ghi (CT-10)', async () => {
    const s = setup();
    expect(await s.run(s.leTan({ config: null }))).toEqual({
      kind: 'ConfigMissing',
    });
    expect(s.em.labels).toEqual(NO_WRITE);
    expect(s.remainingToCollect).not.toHaveBeenCalled();
  });

  it('còn phải thu: OwedAmount kèm số tiền nguyên văn; không ghi', async () => {
    const s = setup();
    s.owes('50000.00');
    expect(await s.run(s.leTan())).toEqual({
      kind: 'OwedAmount',
      conPhaiThu: '50000.00',
    });
    expect(s.em.labels).toEqual(NO_WRITE);
  });

  it.each(['0', '0.0', '0.00'])(
    'số còn phải thu %s là không còn gì phải thu (so bằng đơn vị 0,01, không so chuỗi): CheckedIn',
    async (amount) => {
      const s = setup();
      s.owes(amount);
      expect(await s.run(s.leTan())).toEqual({ kind: 'CheckedIn' });
    },
  );

  it('ngoài cửa sổ: OutsideWindow kèm hai đầu [thoi_gian − 30 phút, thoi_gian + 15 phút]; không ghi', async () => {
    const s = setup();
    expect(
      await s.run(s.leTan({ now: new Date(TU.getTime() - SECOND) })),
    ).toEqual({ kind: 'OutsideWindow', tu: TU, den: DEN });
    expect(s.em.labels).toEqual(NO_WRITE);
  });

  it('lịch ở chi nhánh khác: NotFound (404 cùng thân), TRƯỚC mọi kiểm trạng thái: lịch DaHuy ở chi nhánh khác cũng là NotFound, không lộ trạng thái', async () => {
    for (const trangThai of ['DaXacNhan', 'DaHuy', 'DaTiepDon'] as const) {
      const s = setup({
        locked: lockedRows(trangThai, { chiNhanhId: KHAC_CHI_NHANH_ID }),
      });
      expect(await s.run(s.leTan())).toEqual({ kind: 'NotFound' });
      expect(s.em.labels).toEqual(NO_WRITE);
      expect(s.remainingToCollect).not.toHaveBeenCalled();
    }
  });

  it('thứ tự kiểm đúng `canTransition`: phạm vi → trạng thái → cấu hình → còn phải thu → cửa sổ', async () => {
    const early = new Date(TU.getTime() - SECOND);
    // trạng thái đứng trước cấu hình
    const a = setup({ locked: lockedRows('DaHuy') });
    expect(await a.run(a.leTan({ config: null }))).toMatchObject({
      kind: 'InvalidState',
    });
    // cấu hình đứng trước còn phải thu (không hỏi tiền khi chưa có cấu hình)
    const b = setup();
    b.owes('1.00');
    expect(await b.run(b.leTan({ config: null, now: early }))).toEqual({
      kind: 'ConfigMissing',
    });
    expect(b.remainingToCollect).not.toHaveBeenCalled();
    // còn phải thu đứng trước cửa sổ: vừa còn nợ vừa ngoài cửa sổ thì báo còn nợ
    const c = setup();
    c.owes('1.00');
    expect(await c.run(c.leTan({ now: early }))).toMatchObject({
      kind: 'OwedAmount',
    });
  });
});

describe('CKI-02 actor ThanhToan (payment B17): không đòi conPhaiThu = 0, vẫn đòi cửa sổ; Lễ tân chỉ hỏi tiền khi cần', () => {
  it('ThanhToan trong cửa sổ: CheckedIn mà KHÔNG gọi cổng nào (đầu vào không có remainingToCollect: không thể bỏ qua kiểm tiền của Lễ tân bằng cờ)', async () => {
    const s = setup();
    expect(await s.run(s.thanhToan())).toEqual({ kind: 'CheckedIn' });
    expect(s.remainingToCollect).not.toHaveBeenCalled();
    expect(s.em.labels).toEqual(['lock lich_hen', 'write lich_hen']);
  });

  it('ThanhToan ngoài cửa sổ (sớm hay muộn): OutsideWindow, không ghi (quy tắc 40: thu tiền mặt cũng phải trong cửa sổ)', async () => {
    for (const now of [
      new Date(TU.getTime() - SECOND),
      new Date(DEN.getTime() + SECOND),
    ]) {
      const s = setup();
      expect(await s.run(s.thanhToan({ now }))).toEqual({
        kind: 'OutsideWindow',
        tu: TU,
        den: DEN,
      });
      expect(s.em.labels).toEqual(NO_WRITE);
    }
  });

  it('ThanhToan: chưa có cấu hình ⇒ ConfigMissing; nguồn không phải DaXacNhan ⇒ InvalidState; không có lịch ⇒ NotFound', async () => {
    const a = setup();
    expect(await a.run(a.thanhToan({ config: null }))).toEqual({
      kind: 'ConfigMissing',
    });
    const b = setup({ locked: lockedRows('DaHuy') });
    expect(await b.run(b.thanhToan())).toEqual({
      kind: 'InvalidState',
      trangThai: 'DaHuy',
    });
    const c = setup({ locked: [] });
    expect(await c.run(c.thanhToan())).toEqual({ kind: 'NotFound' });
  });

  it('ThanhToan không bị giới hạn chi nhánh (payment tự kiểm phạm vi, quy tắc 45 b): lịch ở chi nhánh nào cũng được', async () => {
    const s = setup({
      locked: lockedRows('DaXacNhan', { chiNhanhId: KHAC_CHI_NHANH_ID }),
    });
    expect(await s.run(s.thanhToan())).toEqual({ kind: 'CheckedIn' });
  });

  it('Lễ tân CHỈ hỏi số còn phải thu khi lịch DaXacNhan VÀ đã có cấu hình, và hỏi đúng MỘT lần, SAU câu khoá lịch', async () => {
    const asked = setup();
    await asked.run(asked.leTan());
    expect(asked.remainingToCollect).toHaveBeenCalledTimes(1);
    expect(asked.askedAfter).toEqual([1]);

    for (const [locked, config] of [
      [lockedRows('DaTiepDon'), CONFIG],
      [lockedRows('DaHuy'), CONFIG],
      [lockedRows('DaXacNhan'), null],
    ] as const) {
      const s = setup({ locked: [...locked] });
      await s.run(s.leTan({ config }));
      expect(s.remainingToCollect).not.toHaveBeenCalled();
    }
  });
});

describe('CKI-03 hai biên cửa sổ tiếp đón (đóng hai đầu, Q22; CT-07 ở mức thân)', () => {
  it.each([
    ['đúng đầu sớm (thoi_gian − 30 phút)', TU, 'CheckedIn'],
    ['sớm hơn 1 giây', new Date(TU.getTime() - SECOND), 'OutsideWindow'],
    ['đúng đầu muộn (thoi_gian + 15 phút)', DEN, 'CheckedIn'],
    ['muộn hơn 1 giây', new Date(DEN.getTime() + SECOND), 'OutsideWindow'],
    ['đúng giờ hẹn', THOI_GIAN, 'CheckedIn'],
  ])('%s ⇒ %s', async (_ten, now, kind) => {
    for (const make of ['leTan', 'thanhToan'] as const) {
      const s = setup();
      expect((await s.run(s[make]({ now }))).kind).toBe(kind);
    }
  });

  it('phần mili giây của `now` bị cắt (toSecond): đúng đầu muộn cộng 999 ms vẫn là đúng đầu muộn, còn trong cửa sổ', async () => {
    const s = setup();
    expect(
      await s.run(s.leTan({ now: new Date(DEN.getTime() + 999) })),
    ).toEqual({ kind: 'CheckedIn' });
  });

  it('cấu hình 0 phút: cửa sổ co lại đúng một mốc thoi_gian', async () => {
    const zero: StatusConfig = {
      checkInTruocPhut: 0,
      checkInSauPhut: 0,
      nguongNoShow: 3,
    };
    const ok = setup();
    expect(await ok.run(ok.leTan({ config: zero }))).toEqual({
      kind: 'CheckedIn',
    });
    const late = setup();
    expect(
      await late.run(
        late.leTan({
          config: zero,
          now: new Date(THOI_GIAN.getTime() + SECOND),
        }),
      ),
    ).toMatchObject({ kind: 'OutsideWindow' });
  });
});

describe('CKI-04 chuỗi câu của checkIn: chỉ lich_hen, khoá theo khoá chính, không khung_gio, không benh_nhan, không thông báo', () => {
  it('đúng hai câu: SELECT … FOR UPDATE theo lich_hen_id rồi UPDATE có điều kiện nguồn; không câu nào chạm khung_gio, benh_nhan hay thong_bao', async () => {
    const s = setup();
    await s.run(s.leTan());
    expect(s.em.queries).toHaveLength(2);
    const [lock, update] = s.em.queries.map(({ sql }) => sql) as [
      string,
      string,
    ];
    expectLichLockByPrimaryKey(lock);
    expect(update).toMatch(/^UPDATE lich_hen SET trang_thai = \?/);
    expect(update).toMatch(/WHERE lich_hen_id = \? AND trang_thai = \?/);
    for (const { sql } of s.em.queries)
      for (const table of ['khung_gio', 'benh_nhan', 'thong_bao'])
        expect(touchesTable(sql, table), `${table}: ${sql}`).toBe(false);
  });

  it('không thông báo, không WaitlistPort (PLAN 5.12 không có sự kiện tiếp đón; khung giờ giữ DaDat)', async () => {
    const s = setup();
    await s.run(s.leTan());
    expect(s.notifier.notifyCall.count).toBe(0);
    expect(s.waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('kết quả từ chối KHÔNG ghi gì: mọi nhánh từ chối chỉ có câu khoá', async () => {
    const early = new Date(TU.getTime() - SECOND);
    const cases = [
      setup({ locked: lockedRows('DaHuy') }),
      setup(),
      setup(),
      setup({ locked: [] }),
    ];
    cases[1]?.owes('9.00');
    const inputs = [
      cases[0]?.leTan(),
      cases[1]?.leTan(),
      cases[2]?.leTan({ now: early }),
      cases[3]?.leTan(),
    ];
    for (const [index, s] of cases.entries()) {
      await s.run(inputs[index] as CheckInInput);
      expect(s.em.labels).toEqual(NO_WRITE);
    }
  });
});

describe('CKI-05 họ B: không ném AppException, không bắt lỗi DB (người gọi hoàn tác và thử lại)', () => {
  it('mọi kết quả nghiệp vụ là GIÁ TRỊ trả về, không nhánh nào ném AppException', async () => {
    const early = new Date(TU.getTime() - SECOND);
    const runs = [
      () => setup({ locked: [] }),
      () => setup({ locked: lockedRows('DaHuy') }),
      () => setup(),
    ];
    for (const make of runs) {
      const s = make();
      await expect(s.run(s.leTan())).resolves.toBeDefined();
    }
    const a = setup();
    await expect(a.run(a.leTan({ config: null }))).resolves.toBeDefined();
    const b = setup();
    await expect(b.run(b.leTan({ now: early }))).resolves.toBeDefined();
  });

  it.each([1213, 1205] as const)(
    'lỗi %s từ câu khoá hay câu UPDATE nổi NGUYÊN ra (không bị nuốt thành kết quả, không đổi thành AppException)',
    async (errno) => {
      for (const target of ['FOR UPDATE', 'UPDATE lich_hen']) {
        const s = setup();
        const error = mysqlError(errno);
        s.em.failQuery = (sql) => (sql.includes(target) ? error : undefined);
        await expect(s.run(s.leTan())).rejects.toBe(error);
      }
    },
  );

  it('cổng remainingToCollect ném: lỗi nổi nguyên, chưa ghi gì', async () => {
    const s = setup();
    const boom = new Error('cổng thanh toán hỏng');
    s.remainingToCollect.mockRejectedValueOnce(boom);
    await expect(s.run(s.leTan())).rejects.toBe(boom);
    expect(s.em.labels).toEqual(NO_WRITE);
  });

  it('UPDATE không trúng đúng 1 hàng dưới khoá (dữ liệu lệch): ném Error THƯỜNG (không phải AppException) để người gọi hoàn tác trọn', async () => {
    const s = setup({ update: { affectedRows: 0 } });
    const error = await s.run(s.leTan()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect((error as Error).message).toContain('không còn DaXacNhan');
  });

  it('thân chạy lại được: hai lần gọi liên tiếp trên hai EntityManager mới cho cùng kết quả (không giữ trạng thái giữa các lần)', async () => {
    const first = setup();
    const second = setup();
    expect(await first.run(first.leTan())).toEqual(
      await second.run(second.leTan()),
    );
  });
});
