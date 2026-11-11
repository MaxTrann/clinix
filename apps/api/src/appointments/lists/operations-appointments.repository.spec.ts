import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  OperationsAppointmentsRepository,
  type OperationsAppointmentFilter,
} from './operations-appointments.repository.js';

// Task B3 — câu SQL mà repository của nhân sự SINH RA (không DB): điều kiện chi nhánh đứng đầu ở CẢ câu đếm, câu trang, câu chi tiết (DSV-01, DSV-09, QB-04), mọi giá trị đi qua `?`,
// danh sách trắng cột. Kết quả thật trên MySQL: operations-appointments.int-spec.ts. Mã DSV-nn là PLAN 7.7; DSV-16 là [đề xuất].
const SIX = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
] as const;
const filter: OperationsAppointmentFilter = {
  chiNhanhId: '12',
  states: SIX,
  bacSiId: null,
  chuyenKhoaId: null,
  dichVuKhamId: null,
  from: null,
  to: null,
  keyword: null,
};

function setup(rows: unknown[] = []) {
  const query = vi.fn((_sql: string, _params: unknown[]) =>
    Promise.resolve(rows),
  );
  const em = { query } as unknown as EntityManager;
  const call = () => {
    const [sql, params] = query.mock.calls[0] ?? ['', []];
    return { sql, params };
  };
  return { repo: new OperationsAppointmentsRepository(), em, query, call };
}

describe('điều kiện chi nhánh đứng đầu WHERE ở mọi câu (DSV-01, DSV-09, QB-04)', () => {
  it('DSV-01 câu ĐẾM: `WHERE lh.chi_nhanh_id = ?` đầu tiên, tham số đầu là chi nhánh của phạm vi', async () => {
    const { repo, em, call } = setup([{ total: '3' }]);
    expect(await repo.count(em, filter)).toBe(3);
    const { sql, params } = call();
    expect(sql).toMatch(/^SELECT COUNT\(\*\) AS total FROM lich_hen lh/);
    expect(sql).toContain('WHERE lh.chi_nhanh_id = ?\n  AND lh.trang_thai IN');
    expect(params[0]).toBe('12');
  });

  it('DSV-01 câu TRANG: cùng điều kiện đầu; `LIMIT ? OFFSET ?` đi cuối bằng tham số; sắp tăng dần theo `thoi_gian` rồi `lich_hen_id`', async () => {
    const { repo, em, call } = setup();
    await repo.findPage(em, filter, 'ASC', 20, 40);
    const { sql, params } = call();
    expect(sql).toContain('WHERE lh.chi_nhanh_id = ?\n  AND lh.trang_thai IN');
    expect(sql).toMatch(
      /ORDER BY lh\.thoi_gian ASC, lh\.lich_hen_id ASC LIMIT \? OFFSET \?$/,
    );
    expect(params).toStrictEqual(['12', ...SIX, 20, 40]);
  });

  it('DSV-09 câu CHI TIẾT: `lh.chi_nhanh_id = ?` rồi `lh.ma_lich_hen = ?` trong MỘT câu, không khoá, không lọc trạng thái', async () => {
    const { repo, em, call } = setup();
    expect(await repo.findDetail(em, '12', 'CLX-20261110-ABCDE')).toBeNull();
    const { sql, params } = call();
    expect(sql).toContain(
      'WHERE lh.chi_nhanh_id = ?\n  AND lh.ma_lich_hen = ?',
    );
    expect(sql).not.toMatch(/trang_thai IN|FOR UPDATE|FOR SHARE/);
    expect(params).toStrictEqual(['12', 'CLX-20261110-ABCDE']);
  });

  it('DSV-16 `chiNhanhId` là `undefined` (Toàn hệ thống) ⇒ KHÔNG có điều kiện chi nhánh ở cả ba câu; điều kiện còn lại giữ nguyên', async () => {
    const all = { ...filter, chiNhanhId: undefined };
    const first = setup([{ total: 0 }]);
    await first.repo.count(first.em, all);
    expect(first.call().sql).not.toContain('chi_nhanh_id = ?');
    expect(first.call().sql).toContain('WHERE lh.trang_thai IN');

    const second = setup();
    await second.repo.findPage(second.em, all, 'DESC', 10, 0);
    expect(second.call().sql).not.toContain('chi_nhanh_id = ?');
    expect(second.call().sql).toContain('ORDER BY lh.thoi_gian DESC');

    const third = setup();
    await third.repo.findDetail(third.em, undefined, 'CLX-20261110-ABCDE');
    expect(third.call().sql).toContain('WHERE lh.ma_lich_hen = ?');
    expect(third.call().params).toStrictEqual(['CLX-20261110-ABCDE']);
  });
});

describe('bộ lọc, ô tìm, danh sách trắng (DSV-04, DSV-07, DSV-08, DSV-15)', () => {
  it('DSV-04, DSV-15 bộ lọc thứ tự: chi nhánh, trạng thái, bác sĩ, chuyên khoa (bac_si hiện tại), dịch vụ, ngày; tham số đúng thứ tự `?`', async () => {
    const { repo, em, call } = setup([{ total: 0 }]);
    await repo.count(em, {
      ...filter,
      states: ['DaDoiLich'],
      bacSiId: '9',
      chuyenKhoaId: '3',
      dichVuKhamId: '5',
      from: '2026-11-01 00:00:00',
      to: '2026-12-01 00:00:00',
    });
    const { sql, params } = call();
    expect(sql).toContain(
      [
        'WHERE lh.chi_nhanh_id = ?',
        'lh.trang_thai IN (?)',
        'lh.bac_si_id = ?',
        'bs.chuyen_khoa_id = ?',
        'lh.dich_vu_kham_id = ?',
        'lh.thoi_gian >= ?',
        'lh.thoi_gian < ?',
      ].join('\n  AND '),
    );
    expect(params).toStrictEqual([
      '12',
      'DaDoiLich',
      '9',
      '3',
      '5',
      '2026-11-01 00:00:00',
      '2026-12-01 00:00:00',
    ]);
  });

  it('DSV-07 `q`: mã lịch, tên bác sĩ, tên người khám, tên người đặt và SĐT người đặt; giá trị người dùng chỉ ở tham số, không ở câu SQL', async () => {
    const { repo, em, call } = setup([{ total: 0 }]);
    await repo.count(em, { ...filter, keyword: '0912 345' });
    const { sql, params } = call();
    expect(sql).toContain('lh.ma_lich_hen LIKE ?');
    expect(sql).toContain('tbs.ho_ten');
    expect(sql).toContain('hs.ho_ten');
    expect(sql).toContain('tbn.ho_ten');
    expect(sql).toContain('tbn.so_dien_thoai LIKE ?');
    expect(sql).not.toContain('0912');
    expect(params.slice(-1)).toStrictEqual(['%0912345%']);
  });

  it('DSV-08 hai câu cột (trang, chi tiết) lấy cột theo danh sách trắng: người đặt có họ tên và SĐT, `lich_hen_id` CHỈ ở câu chi tiết (để gọi cổng), không email, ngày sinh, địa chỉ, `benh_nhan_id`, băm', async () => {
    const page = setup();
    await page.repo.findPage(page.em, filter, 'ASC', 20, 0);
    const detail = setup();
    await detail.repo.findDetail(detail.em, '12', 'CLX-20261110-ABCDE');
    const selectOf = (sql: string) =>
      sql.slice(0, sql.indexOf('FROM lich_hen'));
    for (const sql of [page.call().sql, detail.call().sql])
      expect(selectOf(sql)).not.toMatch(
        /\*|email|ngay_sinh|dia_chi|mat_khau|benh_nhan_id|khung_gio|\bbs\.|tbs\.so_dien_thoai/,
      );
    expect(selectOf(page.call().sql)).toContain(
      'tbn.so_dien_thoai AS nguoiDatSoDienThoai',
    );
    expect(selectOf(page.call().sql)).not.toContain('lich_hen_id');
    expect(selectOf(detail.call().sql)).toContain(
      'lh.lich_hen_id AS lichHenId',
    );
    expect(selectOf(detail.call().sql)).toContain('lh.ly_do_huy AS lyDoHuy');
  });

  it('DSV-05 ca biên: không có hàng ⇒ `count` là 0, `findPage` là mảng rỗng, `findDetail` là null', async () => {
    const { repo, em } = setup([]);
    expect(await repo.count(em, filter)).toBe(0);
    expect(await repo.findPage(em, filter, 'ASC', 20, 0)).toStrictEqual([]);
    expect(await repo.findDetail(em, '12', 'CLX-20261110-ABCDE')).toBeNull();
  });
});
