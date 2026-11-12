import { describe, expect, it } from 'vitest';
import { toSecond } from '../../common/time/time.js';
import { ACTIVE_APPOINTMENT_STATES } from '../active-appointment-states.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import {
  affectedByLeaveClause,
  findAffectedByLeave,
  LEAVE_AFFECTED_STATES,
  listAffectedByLeave,
  type AffectedByLeaveFilter,
} from './affected-by-leave.query.js';

// Task B11 — AFL-01, AFL-02, và phần ĐƠN VỊ của AFL-03 cho `findAffectedByLeave` và `listAffectedByLeave` (PLAN booking 7.30; TRACKING 3.24.3): một hàm lọc duy nhất, khoảng nửa mở trên `thoi_gian`, kiểm đầu
// vào, ánh xạ danh sách trắng. `EntityManager` GIẢ (không DB). Dữ liệu thật (CG-08, CG-11…CG-18, AFL-04, AFL-05) ở affected-by-leave.int-spec.ts.
const NOW = new Date('2026-11-10T09:00:00.789+07:00');
const baseFilter = (): AffectedByLeaveFilter => ({
  bacSiId: '9',
  tuNgay: '2026-11-10',
  denNgay: '2026-11-12',
  now: NOW,
});

const WHERE_PART = /\bWHERE\b([^]*?)(?:\bORDER BY\b|$)/;
const whereOf = (sql: string): string =>
  (WHERE_PART.exec(sql)?.[1] ?? '').trim();

describe('AFL-01 MỘT hàm lọc: định nghĩa "bị ảnh hưởng"', () => {
  it('cả ngày (không ca): bác sĩ, hai trạng thái, thoi_gian > now, khoảng nửa mở [tuNgay 00:00, ngày kế của denNgay 00:00); không JOIN', () => {
    const clause = affectedByLeaveClause(baseFilter());
    expect(clause.joins).toBe('');
    expect(clause.where).toBe(
      'lh.bac_si_id = ? AND lh.trang_thai IN (?, ?) AND lh.thoi_gian > ? AND lh.thoi_gian >= ? AND lh.thoi_gian < ?',
    );
    expect(clause.params).toEqual([
      '9',
      'ChoThanhToan',
      'DaXacNhan',
      new Date('2026-11-10T09:00:00+07:00'),
      '2026-11-10 00:00:00',
      '2026-11-13 00:00:00',
    ]);
  });

  it('`now` đi qua toSecond: mili giây bị cắt (so sánh thoi_gian > now ở đúng giây, M4)', () => {
    const { params } = affectedByLeaveClause(baseFilter());
    expect(params[3]).toEqual(toSecond(NOW));
    expect((params[3] as Date).getMilliseconds()).toBe(0);
  });

  it('theo ca: thêm hai JOIN khung_gio, lich_lam_viec và điều kiện llv.ca ở CUỐI, tham số ca ở cuối', () => {
    const clause = affectedByLeaveClause({ ...baseFilter(), ca: 'CaChieu' });
    expect(clause.joins).toContain(
      'INNER JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id',
    );
    expect(clause.joins).toContain(
      'INNER JOIN lich_lam_viec llv ON llv.lich_lam_viec_id = kg.lich_lam_viec_id',
    );
    expect(clause.where.endsWith('AND llv.ca = ?')).toBe(true);
    expect(clause.params.at(-1)).toBe('CaChieu');
    expect(clause.params).toHaveLength(7);
  });

  it.each([
    ['2026-11-12', '2026-11-13 00:00:00'],
    ['2026-11-30', '2026-12-01 00:00:00'],
    ['2026-12-31', '2027-01-01 00:00:00'],
    ['2026-02-28', '2026-03-01 00:00:00'],
    ['2028-02-28', '2028-02-29 00:00:00'],
    ['2028-02-29', '2028-03-01 00:00:00'],
  ])(
    'denNgay %s: cận trên nửa mở %s (cả ngày denNgay còn trong khoảng; số học trên chuỗi, không qua múi giờ máy)',
    (denNgay, expected) => {
      const { params } = affectedByLeaveClause({
        ...baseFilter(),
        tuNgay: '2026-01-01',
        denNgay,
      });
      expect(params.at(-1)).toBe(expected);
    },
  );

  it('denNgay là ngày cuối MySQL biểu diễn được: bỏ cận trên (không tràn sang năm 10000)', () => {
    const clause = affectedByLeaveClause({
      ...baseFilter(),
      denNgay: '9999-12-31',
    });
    expect(clause.where).not.toContain('lh.thoi_gian <');
    expect(clause.params).toHaveLength(5);
  });

  it('không bọc DATE() quanh thoi_gian, không dùng đồng hồ của DB (NOW, CURDATE…): chỉ so cột với tham số', () => {
    const { joins, where } = affectedByLeaveClause({
      ...baseFilter(),
      ca: 'CaSang',
    });
    for (const text of [joins, where]) {
      expect(text).not.toMatch(/\bDATE\s*\(/i);
      expect(text).not.toMatch(
        /\b(?:NOW|CURDATE|CURTIME|SYSDATE|UTC_TIMESTAMP)\s*\(|CURRENT_/i,
      );
    }
    expect(where).toContain('lh.thoi_gian > ?');
  });

  it('tập trạng thái bị ảnh hưởng là ChoThanhToan và DaXacNhan: tập con của ACTIVE_APPOINTMENT_STATES, khác đúng ở DaTiepDon (cố ý)', () => {
    expect([...LEAVE_AFFECTED_STATES]).toEqual(['ChoThanhToan', 'DaXacNhan']);
    for (const state of LEAVE_AFFECTED_STATES)
      expect(ACTIVE_APPOINTMENT_STATES).toContain(state);
    expect(
      ACTIVE_APPOINTMENT_STATES.filter(
        (state) => !LEAVE_AFFECTED_STATES.includes(state as never),
      ),
    ).toEqual(['DaTiepDon']);
  });

  it('findAffectedByLeave và listAffectedByLeave dùng CÙNG điều kiện và tham số (CG-14 mức đơn vị): hai câu đầu của list và câu của find có cùng WHERE và cùng params', async () => {
    const filter = { ...baseFilter(), ca: 'CaSang' as const };
    const found = new ScriptedEntityManager(() => []);
    await findAffectedByLeave(found.em, filter);
    const listed = new ScriptedEntityManager((sql) =>
      sql.includes('COUNT(*)') ? [{ tong: 2, soBenhNhan: 1, soCoCoc: 0 }] : [],
    );
    await listAffectedByLeave(listed.em, { ...filter, limit: 5 });

    const [findQuery] = found.queries;
    const [totalsQuery, pageQuery] = listed.queries;
    expect(findQuery).toBeDefined();
    expect(totalsQuery).toBeDefined();
    expect(pageQuery).toBeDefined();
    expect(whereOf(totalsQuery?.sql ?? '')).toBe(whereOf(findQuery?.sql ?? ''));
    expect(whereOf(pageQuery?.sql ?? '')).toBe(whereOf(findQuery?.sql ?? ''));
    expect(totalsQuery?.params).toEqual(findQuery?.params);
    expect(pageQuery?.params).toEqual([...(findQuery?.params ?? []), 5]);
  });

  it('findAffectedByLeave: sắp thoi_gian tăng rồi lich_hen_id, không LIMIT; trả đúng hai khoá lichHenId và maLichHen (không trải hàng thô)', async () => {
    const em = new ScriptedEntityManager(() => [
      {
        lichHenId: '5',
        maLichHen: 'CLX-20261110-AAAAA',
        benhNhanId: '1',
        lyDoKham: 'x',
      },
    ]);
    const result = await findAffectedByLeave(em.em, baseFilter());
    expect(em.queries[0]?.sql).toContain(
      'ORDER BY lh.thoi_gian, lh.lich_hen_id',
    );
    expect(em.queries[0]?.sql).not.toMatch(/\bLIMIT\b/);
    expect(result).toEqual([
      { lichHenId: '5', maLichHen: 'CLX-20261110-AAAAA' },
    ]);
    expect(Object.keys(result[0] ?? {})).toEqual(['lichHenId', 'maLichHen']);
  });
});

describe('AFL-02 kiểm đầu vào: lỗi lập trình ⇒ RangeError TRƯỚC mọi câu SQL; khoảng ngược không phải lỗi', () => {
  const rejects = async (filter: unknown, limit?: number) => {
    const em = new ScriptedEntityManager(() => []);
    const call =
      limit === undefined
        ? findAffectedByLeave(em.em, filter as AffectedByLeaveFilter)
        : listAffectedByLeave(em.em, {
            ...(filter as AffectedByLeaveFilter),
            limit,
          });
    await expect(call).rejects.toBeInstanceOf(RangeError);
    expect(em.queries).toHaveLength(0);
  };

  it.each(['', 'abc', '0', '-1', '01', '1.5', '9223372036854775808'])(
    'bacSiId %j không phải id hợp lệ',
    (bacSiId) => rejects({ ...baseFilter(), bacSiId }),
  );

  it.each([[5], [undefined], [null]])(
    'bacSiId không phải chuỗi %j',
    (bacSiId) => rejects({ ...baseFilter(), bacSiId }),
  );

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-1-1',
    '26-11-10',
    '2026-11-10T00:00:00',
    '',
    'hôm nay',
  ])('tuNgay hay denNgay sai hoặc không có thật %j', async (bad) => {
    await rejects({ ...baseFilter(), tuNgay: bad });
    await rejects({ ...baseFilter(), denNgay: bad });
  });

  it.each([[undefined], [null], [20261110]])(
    'tuNgay hay denNgay không phải chuỗi %j',
    async (bad) => {
      await rejects({ ...baseFilter(), tuNgay: bad });
      await rejects({ ...baseFilter(), denNgay: bad });
    },
  );

  it.each([['CaKhuya'], [''], ['cacsang'], [7], [null]])('ca lạ %j', (ca) =>
    rejects({ ...baseFilter(), ca }),
  );

  it.each([
    [new Date('không phải ngày')],
    ['2026-11-10T09:00:00Z'],
    [1799999999000],
    [undefined],
    [null],
  ])('now không phải Date hợp lệ %j (không bao giờ đọc đồng hồ thay)', (now) =>
    rejects({ ...baseFilter(), now }),
  );

  it.each([
    [-1],
    [1.5],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    ['5' as unknown as number],
    [Number.MAX_SAFE_INTEGER + 1],
  ])('limit %j không phải số nguyên không âm', (limit) =>
    rejects(baseFilter(), limit),
  );

  it('tuNgay sau denNgay: khoảng rỗng, KHÔNG ném (find ra mảng rỗng, list ra tong 0)', async () => {
    const em = new ScriptedEntityManager((sql) =>
      sql.includes('COUNT(*)')
        ? [{ tong: 0, soBenhNhan: 0, soCoCoc: null }]
        : [],
    );
    const filter = {
      ...baseFilter(),
      tuNgay: '2026-11-12',
      denNgay: '2026-11-10',
    };
    expect(await findAffectedByLeave(em.em, filter)).toEqual([]);
    expect(await listAffectedByLeave(em.em, { ...filter, limit: 10 })).toEqual({
      tong: 0,
      soBenhNhan: 0,
      soCoCoc: 0,
      items: [],
    });
  });
});

describe('AFL-03 (đơn vị) listAffectedByLeave: số liệu, danh sách trắng, limit', () => {
  const pageRow = (overrides: Record<string, unknown> = {}) => ({
    maLichHen: 'CLX-20261110-AAAAA',
    thoiGian: new Date('2026-11-10T01:00:00Z'),
    trangThai: 'DaXacNhan',
    nguoiKham: 'Nguyễn Văn A',
    tienCocSnapshot: '50000.00',
    // Cột thừa mà hàng thô có thể mang: KHÔNG được lọt ra
    lichHenId: '5',
    benhNhanId: '3',
    lyDoKham: 'đau đầu',
    soDienThoai: '0900000000',
    email: 'a@example.com',
    giaSnapshot: '300000.00',
    ...overrides,
  });

  const setup = (totals: unknown, rows: unknown[]) =>
    new ScriptedEntityManager((sql) =>
      sql.includes('COUNT(*)') ? [totals] : rows,
    );

  it('ánh xạ số liệu (SUM của MySQL là chuỗi decimal, rỗng là NULL) và items đúng danh sách trắng: năm khoá, nguoiKham chỉ có hoTen, thoiGian ISO UTC', async () => {
    const em = setup({ tong: 3, soBenhNhan: '2', soCoCoc: '1' }, [pageRow()]);
    const result = await listAffectedByLeave(em.em, {
      ...baseFilter(),
      limit: 50,
    });
    expect(result).toEqual({
      tong: 3,
      soBenhNhan: 2,
      soCoCoc: 1,
      items: [
        {
          maLichHen: 'CLX-20261110-AAAAA',
          thoiGian: '2026-11-10T01:00:00.000Z',
          trangThai: 'DaXacNhan',
          nguoiKham: { hoTen: 'Nguyễn Văn A' },
          tienCocSnapshot: '50000.00',
        },
      ],
    });
    const item = result.items[0];
    expect(Object.keys(item ?? {}).sort()).toEqual([
      'maLichHen',
      'nguoiKham',
      'thoiGian',
      'tienCocSnapshot',
      'trangThai',
    ]);
    expect(Object.keys(item?.nguoiKham ?? {})).toEqual(['hoTen']);
  });

  it('tập rỗng: SUM là NULL ⇒ soCoCoc 0; bỏ câu trang (chỉ MỘT câu chạy)', async () => {
    const em = setup({ tong: 0, soBenhNhan: 0, soCoCoc: null }, [pageRow()]);
    const result = await listAffectedByLeave(em.em, {
      ...baseFilter(),
      limit: 50,
    });
    expect(result).toEqual({ tong: 0, soBenhNhan: 0, soCoCoc: 0, items: [] });
    expect(em.queries).toHaveLength(1);
  });

  it('limit = 0: các số đếm vẫn đúng, items rỗng, không chạy câu trang', async () => {
    const em = setup({ tong: 4, soBenhNhan: 3, soCoCoc: 2 }, [pageRow()]);
    const result = await listAffectedByLeave(em.em, {
      ...baseFilter(),
      limit: 0,
    });
    expect(result).toEqual({ tong: 4, soBenhNhan: 3, soCoCoc: 2, items: [] });
    expect(em.queries).toHaveLength(1);
  });

  it('câu đếm: tong KHÔNG phụ thuộc limit (limit chỉ ở câu trang, qua tham số), soBenhNhan đếm benh_nhan_id KHÁC NHAU, soCoCoc đếm cọc > 0', async () => {
    const em = setup({ tong: 9, soBenhNhan: 2, soCoCoc: 1 }, [pageRow()]);
    const result = await listAffectedByLeave(em.em, {
      ...baseFilter(),
      limit: 1,
    });
    expect(result.tong).toBe(9);
    const [totals, page] = em.queries;
    expect(totals?.sql).toContain('COUNT(DISTINCT lh.benh_nhan_id)');
    expect(totals?.sql).toContain('SUM(lh.tien_coc_snapshot > 0)');
    expect(totals?.sql).not.toMatch(/\bLIMIT\b/);
    expect(page?.sql).toContain('LIMIT ?');
    expect(page?.params.at(-1)).toBe(1);
  });

  it('câu trang: cột chọn là danh sách trắng (không SĐT, email, lý do khám, giá, id), tên người khám dùng biểu thức chung, sắp thoi_gian rồi lich_hen_id', async () => {
    const em = setup({ tong: 1, soBenhNhan: 1, soCoCoc: 0 }, [pageRow()]);
    await listAffectedByLeave(em.em, { ...baseFilter(), limit: 10 });
    const sql = em.queries[1]?.sql ?? '';
    const select = /SELECT([^]*?)\bFROM lich_hen\b/.exec(sql)?.[1] ?? '';
    expect(select).toContain('COALESCE(hs.ho_ten, tbn.ho_ten) AS nguoiKham');
    expect(select).not.toMatch(
      /ly_do_kham|so_dien_thoai|email|gia_snapshot|benh_nhan_id|lich_hen_id|ma_the|\*/,
    );
    expect(sql).toContain('ORDER BY lh.thoi_gian, lh.lich_hen_id');
  });
});
