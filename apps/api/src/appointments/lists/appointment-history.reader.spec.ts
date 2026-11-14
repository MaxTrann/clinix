import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { findAuditTableViolations } from '../testing/architecture-rules.js';
import {
  AppointmentHistoryReader,
  MAX_OVERRIDE_ENTRIES,
  notOverriddenSql,
} from './appointment-history.reader.js';

// Task B4 — AppointmentHistoryReader với `EntityManager` GIẢ (không DB): hình dạng hai câu SQL và tham số của chúng (LSD-05, LSD-08); dữ liệu thật trên MySQL: appointment-history.reader.int-spec.ts.
// Mã LSD-nn là PLAN 7.39 `[đề xuất]`; AR-04 (không hàm giờ của DB) kiểm thêm ở architecture.spec.ts.
// Task B18 — NSO-02 (PLAN 7.46 `[đề xuất]`; TRACKING 3.40 B18-D): reader xuất thêm mảnh `notOverriddenSql` cho job tự Vắng mặt; panel của B4 giữ NGUYÊN chuỗi, hai bên dựng từ cùng ba hằng điều kiện, AR-08 giữ nguyên chữ.
const LICH_HEN_ID = '4242';
const CREATED = new Date('2026-11-01T01:00:00.000Z');

const flat = (sql: unknown) => String(sql).replace(/\s+/g, ' ').trim();

function setup(
  auditRows: unknown[] = [],
  milestones: unknown[] = [
    { thoiDiemTao: CREATED, thoiDiemHuy: null, lyDoHuy: null },
  ],
) {
  const query = vi
    .fn()
    .mockResolvedValueOnce(milestones)
    .mockResolvedValueOnce(auditRows);
  const em = { query } as unknown as EntityManager;
  return { query, em, reader: new AppointmentHistoryReader() };
}

// Chuỗi câu nhật ký của panel NHƯ TRƯỚC B18 (chép nguyên từ `main` `cb8bf46`): B18 chỉ dựng nó từ ba hằng điều kiện, không được đổi một ký tự
const AUDIT_SQL_BEFORE_B18 = `SELECT nhat_ky_hanh_dong_id AS id, thoi_diem AS thoiDiem, chi_tiet_thay_doi AS changes
FROM nhat_ky_hanh_dong
WHERE loai_doi_tuong = 'lich_hen'
  AND ma_doi_tuong = ?
  AND hanh_dong = 'OverrideLichHen'
  AND ket_qua = 'ThanhCong'
ORDER BY thoi_diem DESC, nhat_ky_hanh_dong_id DESC
LIMIT ?`;

describe('NSO-02 mảnh `notOverriddenSql` và chuỗi của panel dựng từ cùng ba hằng; AR-08 giữ nguyên', () => {
  it('chuỗi câu nhật ký của panel KHÔNG đổi một ký tự so với trước B18 (LSD-05 chạy nguyên)', async () => {
    const { query, em, reader } = setup();
    await reader.read(em, LICH_HEN_ID);
    expect((query.mock.calls[1] as [string])[0]).toBe(AUDIT_SQL_BEFORE_B18);
  });

  it('mảnh đúng chữ: NOT EXISTS tương quan với `<alias>.lich_hen_id`, bốn điều kiện, không `?`', () => {
    expect(flat(notOverriddenSql('lh'))).toBe(
      "NOT EXISTS (SELECT 1 FROM nhat_ky_hanh_dong nk WHERE nk.loai_doi_tuong = 'lich_hen' AND nk.ma_doi_tuong = lh.lich_hen_id AND nk.hanh_dong = 'OverrideLichHen' AND nk.ket_qua = 'ThanhCong')",
    );
    expect(notOverriddenSql('lh')).not.toContain('?');
  });

  it('ba điều kiện của hợp đồng nhật ký override có mặt ở CẢ panel lẫn mảnh (cùng hằng: đổi một hằng thì hai bên đổi theo)', () => {
    const fragment = notOverriddenSql('lh');
    for (const condition of [
      "loai_doi_tuong = 'lich_hen'",
      "hanh_dong = 'OverrideLichHen'",
      "ket_qua = 'ThanhCong'",
    ]) {
      expect(AUDIT_SQL_BEFORE_B18).toContain(condition);
      expect(fragment).toContain(condition);
    }
  });

  it('AR-08: file thật của job KHÔNG có câu đọc bảng nhật ký (chỉ import mảnh); chép mảnh vào đó bằng chữ thì bị bắt', () => {
    const path = 'appointments/noshow/no-show-due.query.ts';
    const source = readFileSync(
      fileURLToPath(new URL('../noshow/no-show-due.query.ts', import.meta.url)),
      'utf8',
    );
    expect(source).toContain('notOverriddenSql');
    expect(findAuditTableViolations([{ path, source }])).toEqual([]);
    const copied = `${source}\nconst copy = \`SELECT 1 FROM nhat_ky_hanh_dong nk\`;`;
    const found = findAuditTableViolations([{ path, source: copied }]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/đọc nhat_ky_hanh_dong/);
  });
});

describe('AppointmentHistoryReader.read', () => {
  it('LSD-05 câu mốc đọc theo KHOÁ CHÍNH `lich_hen_id` của lịch (một câu, trước câu nhật ký)', async () => {
    const { query, em, reader } = setup();
    await reader.read(em, LICH_HEN_ID);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(flat(sql)).toBe(
      'SELECT thoi_diem_tao AS thoiDiemTao, thoi_diem_huy AS thoiDiemHuy, ly_do_huy AS lyDoHuy FROM lich_hen WHERE lich_hen_id = ?',
    );
    expect(params).toStrictEqual([LICH_HEN_ID]);
  });

  it('LSD-05 câu nhật ký có ĐỦ bốn điều kiện: đối tượng là lich_hen, đúng `ma_doi_tuong` của lịch, đúng hành động OverrideLichHen, kết quả ThanhCong', async () => {
    const { query, em, reader } = setup();
    await reader.read(em, LICH_HEN_ID);
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    const text = flat(sql);
    expect(text).toContain('FROM nhat_ky_hanh_dong WHERE');
    expect(text).toContain("loai_doi_tuong = 'lich_hen'");
    expect(text).toContain('ma_doi_tuong = ?');
    expect(text).toContain("hanh_dong = 'OverrideLichHen'");
    expect(text).toContain("ket_qua = 'ThanhCong'");
    // Không chọn cột người thực hiện: tên cột không có trong câu, nên không thể ra JSON
    expect(text).not.toContain('tai_khoan_id');
    expect(text).not.toContain('chi_nhanh_id');
    expect(params[0]).toBe(LICH_HEN_ID);
  });

  it('LSD-08 mới nhất trước và TRẦN số dòng bằng tham số: `ORDER BY thoi_diem DESC, nhat_ky_hanh_dong_id DESC LIMIT ?` với 100', async () => {
    const { query, em, reader } = setup();
    await reader.read(em, LICH_HEN_ID);
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(flat(sql)).toMatch(
      /ORDER BY thoi_diem DESC, nhat_ky_hanh_dong_id DESC LIMIT \?$/,
    );
    expect(MAX_OVERRIDE_ENTRIES).toBe(100);
    expect(params).toStrictEqual([LICH_HEN_ID, 100]);
  });

  it('cả hai câu chạy trên CÙNG một EntityManager (một ảnh chụp), đúng hai câu, không câu ghi, không hàm giờ của DB (AR-04)', async () => {
    const { query, em, reader } = setup();
    await reader.read(em, LICH_HEN_ID);
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls as [string][]) {
      expect(sql).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|REPLACE|NOW\s*\(|CURDATE)/i,
      );
      expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
    }
  });

  it('LSD-01, LSD-04 dựng panel bằng hàm thuần: mốc và dòng nhật ký đi qua `buildStatusHistory` (huỷ qua override không thêm HuyLich)', async () => {
    const { em, reader } = setup(
      [
        {
          id: '9',
          thoiDiem: new Date('2026-11-03T01:00:00.000Z'),
          changes: {
            truoc: { trang_thai: 'DaXacNhan' },
            sau: { trang_thai: 'DaHuy' },
            ly_do: 'trùng lịch',
          },
        },
      ],
      [
        {
          thoiDiemTao: CREATED,
          thoiDiemHuy: new Date('2026-11-03T01:00:00.000Z'),
          lyDoHuy: 'trùng lịch',
        },
      ],
    );
    expect(await reader.read(em, LICH_HEN_ID)).toStrictEqual([
      { thoiDiem: '2026-11-01T01:00:00.000Z', loai: 'TaoLich' },
      {
        thoiDiem: '2026-11-03T01:00:00.000Z',
        loai: 'OverrideLichHen',
        tuTrangThai: 'DaXacNhan',
        denTrangThai: 'DaHuy',
        lyDo: 'trùng lịch',
      },
    ]);
  });

  it('lịch không tồn tại trong ảnh chụp là LỖI LẬP TRÌNH (người gọi vừa đọc hàng chi tiết): ném lỗi và KHÔNG chạy câu nhật ký', async () => {
    const { query, em, reader } = setup([], []);
    await expect(reader.read(em, LICH_HEN_ID)).rejects.toThrow(
      /lịch hẹn không tồn tại/,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
