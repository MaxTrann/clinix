import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { DOCTOR_VISIBLE_STATES } from './doctor-appointments.dto.js';
import {
  DoctorAppointmentsRepository,
  type DoctorAppointmentFilter,
} from './doctor-appointments.repository.js';

// Task B5 — câu SQL mà repository của Bác sĩ SINH RA (không DB): `lh.bac_si_id = ?` đứng đầu ở CẢ câu đếm, câu theo trạng thái, câu trang và câu chi tiết (DSB-01, DSB-07, QB-06), mọi giá trị đi qua
// `?`, danh sách trắng cột (DSB-06). Kết quả thật trên MySQL: doctor-appointments.int-spec.ts. Mã DSB-nn là PLAN 7.8, 3.20.3.
const filter: DoctorAppointmentFilter = {
  states: DOCTOR_VISIBLE_STATES,
  ca: null,
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
  return { repo: new DoctorAppointmentsRepository(), em, query, call };
}

const selectOf = (sql: string) => sql.slice(0, sql.indexOf('FROM lich_hen'));

describe('điều kiện bác sĩ đứng đầu WHERE ở mọi câu (DSB-01, DSB-07, QB-06)', () => {
  it('DSB-01 câu ĐẾM: `WHERE lh.bac_si_id = ?` đầu tiên, tham số đầu là bác sĩ của token; hai JOIN lấy `ca` nằm giữa FROM và WHERE', async () => {
    const { repo, em, call } = setup([{ total: '3' }]);
    expect(await repo.count(em, '5', filter)).toBe(3);
    const { sql, params } = call();
    expect(sql).toMatch(/^SELECT COUNT\(\*\) AS total FROM lich_hen lh/);
    expect(sql).toContain('WHERE lh.bac_si_id = ?\n  AND lh.trang_thai IN');
    expect(params[0]).toBe('5');
    expect(sql.indexOf('INNER JOIN khung_gio kg')).toBeLessThan(
      sql.indexOf('WHERE'),
    );
    expect(sql.indexOf('INNER JOIN lich_lam_viec llv')).toBeLessThan(
      sql.indexOf('WHERE'),
    );
  });

  it('DSB-11 câu THEO TRẠNG THÁI: cùng điều kiện đầu, `GROUP BY lh.trang_thai`, số đếm ra số', async () => {
    const { repo, em, call } = setup([
      { trangThai: 'DaXacNhan', soLuong: '2' },
      { trangThai: 'DaHuy', soLuong: 1 },
    ]);
    expect(await repo.countByStatus(em, '5', filter)).toStrictEqual([
      { trangThai: 'DaXacNhan', soLuong: 2 },
      { trangThai: 'DaHuy', soLuong: 1 },
    ]);
    const { sql, params } = call();
    expect(sql).toContain('WHERE lh.bac_si_id = ?\n  AND lh.trang_thai IN');
    expect(sql).toMatch(/GROUP BY lh\.trang_thai$/);
    expect(params[0]).toBe('5');
  });

  it('DSB-01, DSB-04 câu TRANG: cùng điều kiện đầu; `LIMIT ? OFFSET ?` đi cuối bằng tham số; sắp theo `thoi_gian` rồi `lich_hen_id` CÙNG chiều', async () => {
    const desc = setup();
    await desc.repo.findPage(desc.em, '5', filter, 'DESC', 20, 40);
    expect(desc.call().sql).toContain(
      'WHERE lh.bac_si_id = ?\n  AND lh.trang_thai IN',
    );
    expect(desc.call().sql).toMatch(
      /ORDER BY lh\.thoi_gian DESC, lh\.lich_hen_id DESC LIMIT \? OFFSET \?$/,
    );
    expect(desc.call().params).toStrictEqual([
      '5',
      ...DOCTOR_VISIBLE_STATES,
      20,
      40,
    ]);
    const asc = setup();
    await asc.repo.findPage(asc.em, '5', filter, 'ASC', 20, 0);
    expect(asc.call().sql).toMatch(
      /ORDER BY lh\.thoi_gian ASC, lh\.lich_hen_id ASC LIMIT \? OFFSET \?$/,
    );
  });

  it('DSB-07 câu CHI TIẾT: `lh.bac_si_id = ?` rồi `lh.ma_lich_hen = ?` rồi tập trạng thái hiển thị trong MỘT câu, không khoá; `DaDoiLich` không nằm trong tham số', async () => {
    const { repo, em, call } = setup();
    expect(await repo.findDetail(em, '5', 'CLX-20261110-ABCDE')).toBeNull();
    const { sql, params } = call();
    expect(sql).toContain(
      'WHERE lh.bac_si_id = ?\n  AND lh.ma_lich_hen = ?\n  AND lh.trang_thai IN (?, ?, ?, ?, ?, ?)',
    );
    expect(sql).not.toMatch(/FOR UPDATE|FOR SHARE/);
    expect(params).toStrictEqual([
      '5',
      'CLX-20261110-ABCDE',
      ...DOCTOR_VISIBLE_STATES,
    ]);
    expect(params).not.toContain('DaDoiLich');
  });
});

describe('bộ lọc và ô tìm (DSB-02, DSB-03, DSB-13)', () => {
  it('DSB-02, DSB-03 thứ tự điều kiện: bác sĩ, trạng thái, `ca` (cột `llv.ca`), từ ngày (>=), đến ngày (<, nửa mở); tham số đúng thứ tự; không `DATE()`', async () => {
    const { repo, em, call } = setup([{ total: 0 }]);
    await repo.count(em, '5', {
      ...filter,
      states: ['DaHuy'],
      ca: 'CaChieu',
      from: '2026-11-01 00:00:00',
      to: '2026-12-01 00:00:00',
    });
    const { sql, params } = call();
    expect(sql).toContain(
      [
        'WHERE lh.bac_si_id = ?',
        'lh.trang_thai IN (?)',
        'llv.ca = ?',
        'lh.thoi_gian >= ?',
        'lh.thoi_gian < ?',
      ].join('\n  AND '),
    );
    expect(params).toStrictEqual([
      '5',
      'DaHuy',
      'CaChieu',
      '2026-11-01 00:00:00',
      '2026-12-01 00:00:00',
    ]);
    expect(sql).not.toMatch(/DATE\s*\(\s*lh\./i);
  });

  it('DSB-03 không `ca` ⇒ không điều kiện `llv.ca` (JOIN vẫn có để lấy cột `ca`)', async () => {
    const { repo, em, call } = setup([{ total: 0 }]);
    await repo.count(em, '5', filter);
    expect(call().sql).not.toContain('llv.ca = ?');
    expect(call().sql).toContain('INNER JOIN lich_lam_viec llv');
  });

  it('DSB-13 `q`: mã lịch, tên người khám (hồ sơ hoặc tài khoản) và SĐT NGƯỜI KHÁM; KHÔNG tên chính bác sĩ (`tbs.ho_ten`), không tên và SĐT người đặt riêng; giá trị người dùng chỉ ở tham số', async () => {
    const { repo, em, call } = setup([{ total: 0 }]);
    await repo.count(em, '5', { ...filter, keyword: '0912 345' });
    const { sql, params } = call();
    const where = sql.slice(sql.indexOf('WHERE'));
    expect(where).toContain('lh.ma_lich_hen LIKE ?');
    expect(where).toContain('COALESCE(hs.ho_ten, tbn.ho_ten)');
    expect(where).toContain(
      'IF(lh.ho_so_nguoi_than_id IS NULL, tbn.so_dien_thoai, hs.so_dien_thoai) LIKE ?',
    );
    expect(where).not.toContain('tbs.ho_ten');
    expect(sql).not.toContain('0912');
    expect(params.slice(-1)).toStrictEqual(['%0912345%']);
    expect(params.slice(1 + DOCTOR_VISIBLE_STATES.length)).toStrictEqual([
      '%0912 345%',
      '%0912 345%',
      '%0912345%',
    ]);
  });
});

describe('danh sách trắng cột (DSB-06, DSB-12)', () => {
  it('DSB-06 hai câu cột (trang, chi tiết): không `*`, không giá, cọc, hạn thanh toán, email, `lich_hen_id`, `benh_nhan_id`, `ly_do_huy`, tên bác sĩ, tên và SĐT người đặt riêng', async () => {
    const page = setup();
    await page.repo.findPage(page.em, '5', filter, 'DESC', 20, 0);
    const detail = setup();
    await detail.repo.findDetail(detail.em, '5', 'CLX-20261110-ABCDE');
    for (const sql of [page.call().sql, detail.call().sql])
      expect(selectOf(sql)).not.toMatch(
        /\*|email|gia_snapshot|tien_coc|han_thanh_toan|ly_do_huy|lich_hen_id|benh_nhan_id|mat_khau|dia_chi|tbs\./,
      );
  });

  it('DSB-12 người khám: ngày sinh, giới tính, SĐT lấy từ TÀI KHOẢN khi khám cho chính mình và từ HỒ SƠ khi khám cho người thân (`IF(… IS NULL, tbn.x, hs.x)`); ngày sinh qua `DATE_FORMAT`', async () => {
    const page = setup();
    await page.repo.findPage(page.em, '5', filter, 'DESC', 20, 0);
    const select = selectOf(page.call().sql);
    for (const column of ['gioi_tinh', 'ngay_sinh', 'so_dien_thoai'])
      expect(select).toContain(
        `IF(lh.ho_so_nguoi_than_id IS NULL, tbn.${column}, hs.${column})`,
      );
    expect(select).toContain('DATE_FORMAT(IF(lh.ho_so_nguoi_than_id IS NULL');
    expect(select).toContain("'%Y-%m-%d') AS ngaySinh");
    expect(select).toContain('hs.moi_quan_he AS quanHe');
    expect(select).toContain('llv.ca AS ca');
  });

  it('DSB-06 chi tiết thêm đúng `chiNhanh` (cn.ten) và `ngayDat` (thoi_diem_tao); câu trang KHÔNG có hai cột này', async () => {
    const page = setup();
    await page.repo.findPage(page.em, '5', filter, 'DESC', 20, 0);
    const detail = setup();
    await detail.repo.findDetail(detail.em, '5', 'CLX-20261110-ABCDE');
    expect(selectOf(detail.call().sql)).toContain('cn.ten AS chiNhanh');
    expect(selectOf(detail.call().sql)).toContain(
      'lh.thoi_diem_tao AS ngayDat',
    );
    expect(selectOf(page.call().sql)).not.toMatch(/chiNhanh|ngayDat|cn\.ten/);
  });

  it('DSB-05 ca biên: không có hàng ⇒ `count` là 0, `findPage` là mảng rỗng, `findDetail` là null', async () => {
    const { repo, em } = setup([]);
    expect(await repo.count(em, '5', filter)).toBe(0);
    expect(await repo.findPage(em, '5', filter, 'DESC', 20, 0)).toStrictEqual(
      [],
    );
    expect(await repo.findDetail(em, '5', 'CLX-20261110-ABCDE')).toBeNull();
  });
});
