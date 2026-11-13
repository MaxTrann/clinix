import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  AppointmentHistoryReader,
  MAX_OVERRIDE_ENTRIES,
} from './appointment-history.reader.js';

// Task B4 — AppointmentHistoryReader với `EntityManager` GIẢ (không DB): hình dạng hai câu SQL và tham số của chúng (LSD-05, LSD-08); dữ liệu thật trên MySQL: appointment-history.reader.int-spec.ts.
// Mã LSD-nn là PLAN 7.39 `[đề xuất]`; AR-04 (không hàm giờ của DB) kiểm thêm ở architecture.spec.ts.
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
