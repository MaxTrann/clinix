import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { findActiveAppointments } from './active-appointment.query.js';

// Task B5 — truy vấn lịch hẹn đang hoạt động theo hồ sơ đi khám với EntityManager giả (PLAN patient Q11, Q12, Q13; TRACKING B5-B, B5-G).
// MySQL thật: appointments.int-spec.ts và relatives.service.deactivate.int-spec.ts. Mã ca RDA-nn là [đề xuất].
function build(rows: unknown[] = []) {
  const query = vi.fn((_sql: string, _params: unknown[]) =>
    Promise.resolve(rows),
  );
  const em = { query } as unknown as EntityManager;
  return { em, query };
}

describe('findActiveAppointments', () => {
  it('RDA-02 (NT-12, NT-14, Q12) một câu SELECT THƯỜNG (không khoá), null-safe <=> theo hồ sơ, tham số IN lấy từ hằng, sắp thời gian rồi lich_hen_id, không SELECT *', async () => {
    const { em, query } = build();

    await findActiveAppointments(em, '5', '77');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    expect(sql).toContain('lh.ho_so_nguoi_than_id <=> ?');
    expect(sql).toContain('lh.benh_nhan_id = ?');
    expect(sql).toContain('ORDER BY lh.thoi_gian ASC, lh.lich_hen_id ASC');
    // Thứ tự tham số: hồ sơ, bệnh nhân, rồi đúng ba trạng thái chặn; số dấu ? khớp số tham số
    expect(params).toStrictEqual([
      '77',
      '5',
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
    ]);
    expect(sql?.match(/\?/g)).toHaveLength(5);
  });

  it('RDA-02 (NT-14) hồ sơ BẢN THÂN là null: truyền null (không phải chuỗi "null") vào chỗ <=>', async () => {
    const { em, query } = build();

    await findActiveAppointments(em, '5', null);

    expect(query.mock.calls[0]?.[1]?.[0]).toBeNull();
    expect(query.mock.calls[0]?.[1]?.[1]).toBe('5');
  });

  it('RDA-03 (Q11) đổi Date sang chuỗi ISO UTC, giữ nguyên thứ tự hàng, và trả ĐÚNG năm khoá (cột thừa của hàng thô không lọt ra)', async () => {
    const { em } = build([
      {
        maLichHen: 'LH-1',
        thoiGian: new Date('2026-11-02T01:00:00.000Z'),
        trangThai: 'DaTiepDon',
        bacSi: 'Bác Sĩ Một',
        chiNhanh: 'Chi nhánh Một',
        lichHenId: '999',
        benhNhanId: '5',
        giaSnapshot: '100000.00',
      },
      {
        maLichHen: 'LH-2',
        thoiGian: new Date('2026-11-03T02:30:00.000Z'),
        trangThai: 'ChoThanhToan',
        bacSi: 'Bác Sĩ Hai',
        chiNhanh: 'Chi nhánh Hai',
      },
    ]);

    const result = await findActiveAppointments(em, '5', '77');

    expect(result).toStrictEqual([
      {
        maLichHen: 'LH-1',
        thoiGian: '2026-11-02T01:00:00.000Z',
        trangThai: 'DaTiepDon',
        bacSi: 'Bác Sĩ Một',
        chiNhanh: 'Chi nhánh Một',
      },
      {
        maLichHen: 'LH-2',
        thoiGian: '2026-11-03T02:30:00.000Z',
        trangThai: 'ChoThanhToan',
        bacSi: 'Bác Sĩ Hai',
        chiNhanh: 'Chi nhánh Hai',
      },
    ]);
  });

  it('RDA-03 không có lịch nào ⇒ mảng rỗng', async () => {
    const { em } = build([]);
    expect(await findActiveAppointments(em, '5', '77')).toStrictEqual([]);
  });
});
