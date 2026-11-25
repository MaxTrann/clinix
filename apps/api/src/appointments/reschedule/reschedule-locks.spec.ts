import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { findLockOrderViolation } from '../locking/lock-order.js';
import {
  expectLichLockByPrimaryKey,
  lockedTablesOf,
} from '../testing/lock-chain.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
import {
  lockRequestCreation,
  lockRescheduleChain,
  lockRescheduleRequest,
} from './reschedule-locks.js';

// reschedule B1 — HDL-13 (phần đơn vị; PLAN reschedule 5.4): thứ tự khoá của đổi lịch, bằng `EntityManager` giả ghi lại từng câu (SQL và tham số). Câu SQL THẬT trên MySQL: reschedule-locks.int-spec.ts.
// Hai khung giờ id '9' và '10' bắt lỗi so chuỗi ("9" lớn hơn "10" khi so số, nhỏ hơn khi so chuỗi).
interface Script {
  /** Bảng có hàng trả về rỗng (mô phỏng hàng bị xoá trong lúc chờ khoá) */
  empty?: string[];
  /** `trang_thai_hieu_luc` của hồ sơ người thân */
  hoSoHieuLuc?: number;
  /** Id khung giờ có hàng rỗng (các khung giờ khác vẫn có) */
  emptySlotIds?: string[];
}

const TARGET = {
  benhNhanId: '31',
  hoSoNguoiThanId: '8' as string | null,
  bacSiId: '5',
  lichHenId: '41',
};

function build(script: Script = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn((sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const table = firstTableOf(sql) ?? '';
    if (script.empty?.includes(table)) return Promise.resolve([]);
    if (
      table === 'khung_gio' &&
      script.emptySlotIds?.includes(String(params[0]))
    )
      return Promise.resolve([]);
    switch (table) {
      case 'benh_nhan':
        return Promise.resolve([{ taiKhoanId: '31' }]);
      case 'ho_so_nguoi_than':
        return Promise.resolve([{ trangThaiHieuLuc: script.hoSoHieuLuc ?? 1 }]);
      case 'bac_si':
        return Promise.resolve([{ chiNhanhId: '1', dichVuKhamId: '2' }]);
      case 'khung_gio':
        return Promise.resolve([
          {
            khungGioId: String(params[0]),
            lichLamViecId: '3',
            ngayGio: '2026-11-10 08:00:00',
            trangThai: 'DaDat',
            giuChoDen: null,
          },
        ]);
      case 'lich_hen':
        return Promise.resolve([
          {
            benhNhanId: '31',
            chiNhanhId: '1',
            trangThai: 'DaXacNhan',
            thoiGian: '2026-11-10 08:00:00',
            chinhSachHoan: null,
          },
        ]);
      case 'yeu_cau_doi_lich_ngoai_chinh_sach':
        return Promise.resolve([
          {
            yeuCauId: String(params[0]),
            lichHenId: '41',
            khungGioMongMuonId: '9',
            trangThai: 'ChoDuyet',
          },
        ]);
      default:
        throw new Error(`câu lạ: ${sql}`);
    }
  });
  const em = { query } as unknown as EntityManager;
  const tables = () => calls.map((call) => firstTableOf(call.sql));
  const slotIds = () =>
    calls
      .filter((call) => firstTableOf(call.sql) === 'khung_gio')
      .map((call) => call.params[0]);
  return { em, calls, tables, slotIds };
}

const chain = (
  extra: Partial<Parameters<typeof lockRescheduleChain>[1]> = {},
) => ({
  ...TARGET,
  khungGioCuId: '10',
  khungGioMoiId: '9',
  ...extra,
});

describe('HDL-13 lockRescheduleChain: thứ tự bảng PLAN 5.4', () => {
  it('benh_nhan → ho_so_nguoi_than → bac_si → khung_gio → khung_gio → lich_hen → yeu_cau (duyệt); mọi câu là câu khoá, bac_si FOR SHARE, còn lại FOR UPDATE', async () => {
    const { em, calls, tables } = build();

    const result = await lockRescheduleChain(em, chain({ yeuCauId: '77' }));

    expect(result.kind).toBe('Locked');
    expect(tables()).toEqual([
      'benh_nhan',
      'ho_so_nguoi_than',
      'bac_si',
      'khung_gio',
      'khung_gio',
      'lich_hen',
      'yeu_cau_doi_lich_ngoai_chinh_sach',
    ]);
    expect(calls.every((call) => isLockingStatement(call.sql))).toBe(true);
    for (const call of calls)
      expect(call.sql).toMatch(
        firstTableOf(call.sql) === 'bac_si' ? /FOR SHARE/ : /FOR UPDATE/,
      );
    expect(
      findLockOrderViolation(lockedTablesOf(calls.map((c) => c.sql))),
    ).toBeNull();
  });

  it('khoá benh_nhan của CHỦ lịch cũ, hồ sơ theo (hồ sơ, chủ), bác sĩ của lịch, lich_hen CHỈ theo khoá chính (quy tắc 7, AR-05)', async () => {
    const { em, calls } = build();

    await lockRescheduleChain(em, chain());

    expect(calls[0]?.params).toEqual(['31']);
    expect(calls[1]?.params).toEqual(['8', '31']);
    expect(calls[2]?.params).toEqual(['5']);
    const lichHen = calls.find((call) => firstTableOf(call.sql) === 'lich_hen');
    expect(lichHen?.params).toEqual(['41']);
    expectLichLockByPrimaryKey(lichHen?.sql ?? '');
  });

  it.each([
    ['cũ = 10, mới = 9', '10', '9'],
    ['cũ = 9, mới = 10', '9', '10'],
    [
      'id lớn hơn 2^53 (so chuỗi và so số cho cùng kết quả ở đây)',
      '9223372036854775807',
      '9223372036854775806',
    ],
  ])(
    'hai khung giờ luôn khoá THEO ID TĂNG DẦN so bằng BigInt, bất kể đâu là cũ, đâu là mới (%s)',
    async (_name, cu, moi) => {
      const { em, slotIds } = build();

      await lockRescheduleChain(
        em,
        chain({ khungGioCuId: cu, khungGioMoiId: moi }),
      );

      const expected = [cu, moi].sort((a, b) =>
        BigInt(a) < BigInt(b) ? -1 : 1,
      );
      expect(slotIds()).toEqual(expected);
    },
  );

  it('"9" khoá TRƯỚC "10" (so số, không so chuỗi)', async () => {
    const { em, slotIds } = build();

    await lockRescheduleChain(
      em,
      chain({ khungGioCuId: '10', khungGioMoiId: '9' }),
    );

    expect(slotIds()).toEqual(['9', '10']);
  });

  it('kết quả: slotCu là khung giờ CŨ và slotMoi là khung giờ MỚI dù thứ tự khoá ngược; kèm lịch cũ đọc dưới khoá', async () => {
    const { em } = build();

    const result = await lockRescheduleChain(
      em,
      chain({ khungGioCuId: '10', khungGioMoiId: '9' }),
    );

    if (result.kind !== 'Locked') throw new Error('phải Locked');
    expect(result.slotCu.khungGioId).toBe('10');
    expect(result.slotMoi.khungGioId).toBe('9');
    expect(result.appointment.trangThai).toBe('DaXacNhan');
    expect(result.request).toBeNull();
  });

  it('hồ sơ BẢN THÂN (null) bỏ tầng 3; không có yeuCauId thì không khoá yêu cầu', async () => {
    const { em, tables } = build();

    const result = await lockRescheduleChain(
      em,
      chain({ hoSoNguoiThanId: null }),
    );

    expect(tables()).toEqual([
      'benh_nhan',
      'bac_si',
      'khung_gio',
      'khung_gio',
      'lich_hen',
    ]);
    expect(result.kind === 'Locked' && result.request).toBeNull();
  });

  it('duyệt: yêu cầu khoá theo khoá chính SAU lich_hen và được trả kèm id, lịch, khung giờ mong muốn, trạng thái', async () => {
    const { em, calls } = build();

    const result = await lockRescheduleChain(em, chain({ yeuCauId: '77' }));

    expect(calls.at(-1)?.params).toEqual(['77']);
    expect(result.kind === 'Locked' && result.request).toEqual({
      yeuCauId: '77',
      lichHenId: '41',
      khungGioMongMuonId: '9',
      trangThai: 'ChoDuyet',
    });
  });

  it('hồ sơ người thân ĐÃ NGỪNG vẫn Locked (luật B2 bước 5 từ chối; hàm khoá không quyết)', async () => {
    const { em, tables } = build({ hoSoHieuLuc: 0 });

    const result = await lockRescheduleChain(em, chain());

    expect(result.kind).toBe('Locked');
    expect(tables()).toContain('lich_hen');
  });

  it('khung giờ cũ trùng khung giờ mới ⇒ RangeError TRƯỚC mọi câu (dịch vụ đã từ chối KHUNG_GIO_TRUNG_LICH_CU)', async () => {
    const { em, calls } = build();

    await expect(
      lockRescheduleChain(em, chain({ khungGioCuId: '9', khungGioMoiId: '9' })),
    ).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });
});

describe('HDL-13 lockRescheduleChain: thiếu hàng ở tầng nào thì DỪNG ngay, không xin tầng sau', () => {
  it.each([
    ['benh_nhan', 1],
    ['ho_so_nguoi_than', 2],
    ['bac_si', 3],
    ['khung_gio', 4],
  ])('bảng %s rỗng', async (table, expectedCalls) => {
    const { em, calls } = build({ empty: [table] });

    const result = await lockRescheduleChain(em, chain({ yeuCauId: '77' }));

    expect(result).toEqual({ kind: 'Missing', table });
    expect(calls).toHaveLength(expectedCalls);
  });

  it('lich_hen rỗng ⇒ Missing lich_hen và không khoá yêu cầu', async () => {
    const { em, tables } = build({ empty: ['lich_hen'] });

    expect(await lockRescheduleChain(em, chain({ yeuCauId: '77' }))).toEqual({
      kind: 'Missing',
      table: 'lich_hen',
    });
    expect(tables().at(-1)).toBe('lich_hen');
  });

  it('yêu cầu rỗng ⇒ Missing yeu_cau_doi_lich_ngoai_chinh_sach', async () => {
    const { em } = build({ empty: ['yeu_cau_doi_lich_ngoai_chinh_sach'] });

    expect(await lockRescheduleChain(em, chain({ yeuCauId: '77' }))).toEqual({
      kind: 'Missing',
      table: 'yeu_cau_doi_lich_ngoai_chinh_sach',
    });
  });

  it('khung giờ thứ HAI (id lớn hơn) rỗng cũng là Missing khung_gio và không khoá lich_hen', async () => {
    const { em, slotIds, tables } = build({ emptySlotIds: ['10'] });

    const result = await lockRescheduleChain(em, chain());

    expect(result).toEqual({ kind: 'Missing', table: 'khung_gio' });
    expect(slotIds()).toEqual(['9', '10']);
    expect(tables()).not.toContain('lich_hen');
  });
});

describe('HDL-13 lockRequestCreation: tạo yêu cầu, khung giờ mong muốn TRƯỚC lich_hen (R2)', () => {
  const input = (
    extra: Partial<Parameters<typeof lockRequestCreation>[1]> = {},
  ) => ({
    ...TARGET,
    khungGioMongMuonId: '9',
    ...extra,
  });

  it('benh_nhan → ho_so_nguoi_than → bac_si → MỘT khung_gio → lich_hen; không khoá hàng yêu cầu (chưa có); không vi phạm thứ tự khoá', async () => {
    const { em, calls, tables, slotIds } = build();

    const result = await lockRequestCreation(em, input());

    expect(result.kind).toBe('Locked');
    expect(tables()).toEqual([
      'benh_nhan',
      'ho_so_nguoi_than',
      'bac_si',
      'khung_gio',
      'lich_hen',
    ]);
    expect(slotIds()).toEqual(['9']);
    expect(
      findLockOrderViolation(lockedTablesOf(calls.map((c) => c.sql))),
    ).toBeNull();
    expectLichLockByPrimaryKey(calls.at(-1)?.sql ?? '');
  });

  it('kết quả mang khung giờ mong muốn và lịch cũ đã khoá', async () => {
    const { em } = build();

    const result = await lockRequestCreation(
      em,
      input({ khungGioMongMuonId: '12' }),
    );

    if (result.kind !== 'Locked') throw new Error('phải Locked');
    expect(result.slot.khungGioId).toBe('12');
    expect(result.appointment.trangThai).toBe('DaXacNhan');
  });

  it.each([
    ['benh_nhan', 1],
    ['ho_so_nguoi_than', 2],
    ['bac_si', 3],
    ['khung_gio', 4],
    ['lich_hen', 5],
  ])(
    'bảng %s rỗng ⇒ Missing và dừng sau %i câu',
    async (table, expectedCalls) => {
      const { em, calls } = build({ empty: [table] });

      expect(await lockRequestCreation(em, input())).toEqual({
        kind: 'Missing',
        table,
      });
      expect(calls).toHaveLength(expectedCalls);
    },
  );

  it('hồ sơ BẢN THÂN (null) bỏ tầng 3', async () => {
    const { em, tables } = build();

    await lockRequestCreation(em, input({ hoSoNguoiThanId: null }));

    expect(tables()).toEqual(['benh_nhan', 'bac_si', 'khung_gio', 'lich_hen']);
  });
});

describe('HDL-13 lockRescheduleRequest: tầng 6c, từ chối chỉ khoá hàng này', () => {
  it('MỘT câu FOR UPDATE theo khoá chính, trả id, lịch, khung giờ mong muốn, trạng thái', async () => {
    const { em, calls } = build();

    const request = await lockRescheduleRequest(em, '77');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toMatch(
      /FROM yeu_cau_doi_lich_ngoai_chinh_sach WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = \?\s+FOR UPDATE/,
    );
    expect(calls[0]?.params).toEqual(['77']);
    expect(request).toEqual({
      yeuCauId: '77',
      lichHenId: '41',
      khungGioMongMuonId: '9',
      trangThai: 'ChoDuyet',
    });
  });

  it('không có hàng ⇒ null', async () => {
    const { em } = build({ empty: ['yeu_cau_doi_lich_ngoai_chinh_sach'] });

    expect(await lockRescheduleRequest(em, '77')).toBeNull();
  });
});
