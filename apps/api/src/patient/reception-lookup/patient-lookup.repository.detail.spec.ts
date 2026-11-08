import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { buildLookupPatterns } from '../validation/keyword-policy.js';
import { PatientLookupRepository } from './patient-lookup.repository.js';

// Task B7 — HÌNH DẠNG câu SQL của chi tiết một bệnh nhân và phép ánh xạ hàng thô, đọc bằng EntityManager giả ghi lại câu lệnh và tham số (PLAN patient 5.4, 5.7;
// TRACKING B7-E, B7-G). Hành vi thật trên MySQL: patient-lookup.detail.int-spec.ts. Mã ca PDR-nn là [đề xuất]. Câu SQL được chuẩn hoá khoảng trắng trước khi so.
// File MỚI (không sửa patient-lookup.repository.spec.ts của B6).
const repository = new PatientLookupRepository();

interface Call {
  sql: string;
  params: unknown[];
}

function fakeManager(rows: unknown[]) {
  const calls: Call[] = [];
  const query = vi.fn((sql: string, params: unknown[]) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return Promise.resolve(rows);
  });
  return { em: { query } as unknown as EntityManager, calls };
}

// Câu SQL chi tiết: gọi findDetail và lấy câu đã ghi
async function detailCall(id = '5') {
  const fake = fakeManager([]);
  await repository.findDetail(fake.em, id);
  return fake.calls[0]!;
}

// Hàng thô như MySQL trả (thoiDiemTao là Date nhờ driver; soLanVangMat là số), kèm cột thừa để thử danh sách trắng
const rawRow = () => ({
  hoTen: 'Nguyễn Văn Thử',
  email: 'thu@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: null,
  thoiDiemTao: new Date('2026-11-08T01:00:00.000Z'),
  trangThai: 'NgungHoatDong',
  soLanVangMat: 4,
  matKhauBam: '$argon2id$gia',
  loaiTaiKhoan: 'BenhNhan',
});

describe('PatientLookupRepository.findDetail — hình dạng SQL', () => {
  it('PDR-01 (H4) câu chỉ nhắc tai_khoan và benh_nhan: không lich_hen, le_tan, vi_noi_bo, ma_xac_thuc, phien_dang_nhap, nhat_ky_hanh_dong, ho_so_nguoi_than (người thân do RelativesRepository lo)', async () => {
    const { sql } = await detailCall();

    const tables = [...sql.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/gi)].map(
      (m) => m[1],
    );
    expect(tables).toStrictEqual(['tai_khoan', 'benh_nhan']);
    for (const other of [
      'lich_hen',
      'le_tan',
      'vi_noi_bo',
      'ma_xac_thuc',
      'phien_dang_nhap',
      'nhat_ky_hanh_dong',
      'ho_so_nguoi_than',
      'bac_si',
      'quan_tri_vien',
    ]) {
      expect(sql).not.toContain(other);
    }
  });

  it('PDR-02 (TC-12, Q17) có INNER JOIN benh_nhan, loai_tai_khoan = BenhNhan VÀ tai_khoan_id = ?; không lọc trang_thai hay da_xac_minh_email; không khoá, không ghi, không SELECT *', async () => {
    const { sql } = await detailCall();

    expect(sql).toContain(
      'INNER JOIN benh_nhan b ON b.tai_khoan_id = t.tai_khoan_id',
    );
    expect(sql).toContain("t.loai_tai_khoan = 'BenhNhan'");
    expect(sql).toContain('t.tai_khoan_id = ?');
    expect(sql).not.toMatch(/LEFT\s+JOIN/i);
    const where = sql.slice(sql.indexOf('WHERE'));
    expect(where).not.toContain('trang_thai');
    expect(where).not.toContain('da_xac_minh_email');
    expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    expect(sql).not.toMatch(/\bt\.\*|\bb\.\*/);
    expect(sql).not.toMatch(/\b(LIMIT|OFFSET)\b/i);
  });

  it('PDR-03 (H3, Q27) tham số đúng MỘT phần tử: id là chuỗi, nguyên vẹn cả khi lớn hơn 2^53', async () => {
    const small = await detailCall('5');
    const big = await detailCall('9007199254740993');

    expect(small.params).toStrictEqual(['5']);
    expect(big.params).toStrictEqual(['9007199254740993']);
    expect(typeof big.params[0]).toBe('string');
  });

  it('PDR-04 (Q18, H4) danh sách cột đúng chín alias theo thứ tự PLAN 5.7; ngaySinh qua DATE_FORMAT; soLanVangMat từ so_lan_no_show; không mật khẩu băm, khoá đăng nhập, ảnh, loại tài khoản, cờ khoá đặt lịch', async () => {
    const { sql } = await detailCall();

    const selectList = sql.slice(0, sql.indexOf(' FROM '));
    const aliases = [...selectList.matchAll(/\bAS (\w+)/g)].map((m) => m[1]);
    expect(aliases).toStrictEqual([
      'hoTen',
      'email',
      'soDienThoai',
      'gioiTinh',
      'ngaySinh',
      'diaChi',
      'thoiDiemTao',
      'trangThai',
      'soLanVangMat',
    ]);
    expect(selectList).toContain(
      "DATE_FORMAT(t.ngay_sinh, '%Y-%m-%d') AS ngaySinh",
    );
    expect(selectList).toContain('b.so_lan_no_show AS soLanVangMat');
    expect(selectList).toContain('t.thoi_diem_tao AS thoiDiemTao');
    for (const column of [
      'mat_khau_bam',
      'khoa_dang_nhap_den',
      'so_lan_dang_nhap_sai',
      'anh_dai_dien',
      'loai_tai_khoan',
      'khoa_dat_lich_do_no_show',
      'da_xac_minh_email',
      'tai_khoan_id',
    ]) {
      expect(selectList, column).not.toContain(column);
    }
  });

  it('PDR-05 (TC-11, Q18) ánh xạ: không hàng ⇒ null; thoiDiemTao thành chuỗi ISO 8601 UTC đúng; khoá thừa của hàng thô không lọt ra; null và số 0 giữ nguyên', async () => {
    expect(await repository.findDetail(fakeManager([]).em, '5')).toBeNull();

    const found = await repository.findDetail(fakeManager([rawRow()]).em, '5');
    expect(found).toStrictEqual({
      hoTen: 'Nguyễn Văn Thử',
      email: 'thu@example.invalid',
      soDienThoai: '0901234567',
      gioiTinh: 'Nam',
      ngaySinh: '1990-05-15',
      diaChi: null,
      thoiDiemTao: '2026-11-08T01:00:00.000Z',
      trangThai: 'NgungHoatDong',
      soLanVangMat: 4,
    });
    expect(Object.keys(found ?? {})).toStrictEqual([
      'hoTen',
      'email',
      'soDienThoai',
      'gioiTinh',
      'ngaySinh',
      'diaChi',
      'thoiDiemTao',
      'trangThai',
      'soLanVangMat',
    ]);

    const nulls = await repository.findDetail(
      fakeManager([
        {
          ...rawRow(),
          gioiTinh: null,
          ngaySinh: null,
          diaChi: null,
          soLanVangMat: 0,
          // nửa đêm giờ VN: qua NGÀY UTC (đã đo ở TRACKING B7-C)
          thoiDiemTao: new Date('2026-11-07T17:00:00.000Z'),
        },
      ]).em,
      '5',
    );
    expect(nulls).toMatchObject({
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
      soLanVangMat: 0,
      thoiDiemTao: '2026-11-07T17:00:00.000Z',
    });
  });

  it('PDR-06 (một định nghĩa "ai tra cứu được") câu chi tiết và hai câu của danh sách dùng CÙNG đoạn FROM, INNER JOIN và loai_tai_khoan', async () => {
    const detail = (await detailCall()).sql;
    const counting = fakeManager([{ total: '0' }]);
    await repository.count(counting.em, buildLookupPatterns('nguyen'));
    const paging = fakeManager([]);
    await repository.findPage(paging.em, buildLookupPatterns('nguyen'), 20, 0);
    const shared =
      "FROM tai_khoan t INNER JOIN benh_nhan b ON b.tai_khoan_id = t.tai_khoan_id WHERE t.loai_tai_khoan = 'BenhNhan'";

    for (const sql of [detail, counting.calls[0]!.sql, paging.calls[0]!.sql]) {
      expect(sql).toContain(shared);
    }
  });
});
