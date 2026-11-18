import { describe, expect, it } from 'vitest';
import {
  MILESTONE_COLUMNS,
  toMilestones,
  type MilestoneColumns,
} from './status-milestones.mapper.js';

// Booking B19 — MOC-23 (TRACKING 3.46.3): hàm ánh xạ DÙNG CHUNG của ba mapper và đoạn SQL chọn ba cột. Hàm thuần, không DB. Hành vi từng vai ở `*-appointment.mapper.spec.ts` (MOC-19 đến MOC-21),
// cột thật trên MySQL ở `status-milestones.int-spec.ts` (MOC-19 đến MOC-22).
const columns = (over: Partial<MilestoneColumns> = {}): MilestoneColumns => ({
  thoiDiemXacNhan: null,
  thoiDiemTiepDon: null,
  thoiDiemHoanThanh: null,
  ...over,
});

describe('MOC-23 toMilestones', () => {
  it('đúng ba khoá theo MÃ BƯỚC, giá trị ISO 8601 UTC của từng cột (không hoán xacNhan, tiepDon, hoanThanh)', () => {
    const moc = toMilestones(
      columns({
        thoiDiemXacNhan: new Date('2026-11-01T01:00:00.000Z'),
        thoiDiemTiepDon: new Date('2026-11-10T02:00:00.000Z'),
        thoiDiemHoanThanh: new Date('2026-11-10T03:00:00.000Z'),
      }),
    );
    expect(moc).toStrictEqual({
      xacNhan: '2026-11-01T01:00:00.000Z',
      tiepDon: '2026-11-10T02:00:00.000Z',
      hoanThanh: '2026-11-10T03:00:00.000Z',
    });
  });

  it('cột NULL ⇒ null (lịch cũ trước B19, bước chưa tới, bước bị xoá khi lùi); không bao giờ Invalid Date, chuỗi rỗng hay undefined', () => {
    expect(toMilestones(columns())).toStrictEqual({
      xacNhan: null,
      tiepDon: null,
      hoanThanh: null,
    });
    // MỘT mốc có, hai mốc NULL: mỗi cột độc lập
    expect(
      toMilestones(
        columns({ thoiDiemTiepDon: new Date('2026-11-10T02:00:00.000Z') }),
      ),
    ).toStrictEqual({
      xacNhan: null,
      tiepDon: '2026-11-10T02:00:00.000Z',
      hoanThanh: null,
    });
  });

  it('không sửa hàng thô và không trải hàng thô ra kết quả (không khoá thừa, không Date)', () => {
    const row = {
      ...columns({ thoiDiemXacNhan: new Date('2026-11-01T01:00:00.000Z') }),
      lichHenId: '9001',
    };
    const before = JSON.stringify(row);
    const moc = toMilestones(row);
    expect(JSON.stringify(row)).toBe(before);
    expect(Object.keys(moc).sort()).toStrictEqual([
      'hoanThanh',
      'tiepDon',
      'xacNhan',
    ]);
    expect(JSON.stringify(moc)).not.toContain('9001');
    for (const value of Object.values(moc))
      expect(value === null || typeof value === 'string').toBe(true);
  });

  it('đoạn SQL chọn đúng ba cột của lich_hen với alias trùng khoá của hàng thô; không cột nào khác', () => {
    expect(MILESTONE_COLUMNS).toBe(
      'lh.thoi_diem_xac_nhan AS thoiDiemXacNhan, lh.thoi_diem_tiep_don AS thoiDiemTiepDon, lh.thoi_diem_hoan_thanh AS thoiDiemHoanThanh',
    );
    expect(MILESTONE_COLUMNS.match(/ AS /g)).toHaveLength(3);
  });
});
