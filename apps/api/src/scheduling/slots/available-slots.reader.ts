import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { nowVN } from '../../common/time/time.js';
import {
  BranchHoursReader,
  hoursKey,
  type BranchWeekdayPair,
} from '../branch-hours/branch-hours.reader.js';
import type { CaLamViec } from '../branch-hours/branch-hours.types.js';
import { checkSlotWithinBranchHours } from '../branch-hours/slot-hours.rules.js';
import { isoWeekdayOf } from '../branch-hours/time-of-day.js';
import { leaveCoversShift } from '../leave/leave-overlap.rules.js';
import { LeaveReader } from '../leave/leave.reader.js';
import {
  deriveDayStatus,
  deriveSlotStatus,
  type DayStatus,
  type StoredSlotStatus,
} from './slot-status.rules.js';

export interface AvailableSlot {
  khungGioId: string;
  /** ISO 8601 UTC. */
  batDau: string;
  ketThuc: string;
  ca: CaLamViec;
  trangThai: StoredSlotStatus;
}

export interface DoctorDaySlots {
  bacSiId: string;
  ngay: string;
  trangThaiNgay: DayStatus;
  /** Thứ ISO của ngày, chỉ có khi `ChiNhanhNghi`. */
  thuNghi?: number;
  khungGio: AvailableSlot[];
}

interface Row {
  bacSiId: string;
  chiNhanhHienTaiId: string;
  thoiLuong: number | string;
  lichLamViecId: string | null;
  chiNhanhCaId: string | null;
  ca: CaLamViec | null;
  khungGioId: string | null;
  ngayGio: string | null;
  trangThai: StoredSlotStatus | null;
  giuChoDen: string | null;
}

// DATE_FORMAT để lấy chuỗi giờ VN đúng nguyên văn, không phụ thuộc cách driver đổi DATETIME ra Date (M4).
const FMT = "'%Y-%m-%d %H:%i:%s'";
const SELECT_ROWS = `
  SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId, CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhHienTaiId, dv.thoi_luong AS thoiLuong,
         CAST(lv.lich_lam_viec_id AS CHAR) AS lichLamViecId, CAST(lv.chi_nhanh_id AS CHAR) AS chiNhanhCaId, lv.ca AS ca,
         CAST(kg.khung_gio_id AS CHAR) AS khungGioId, DATE_FORMAT(kg.ngay_gio, ${FMT}) AS ngayGio,
         kg.trang_thai AS trangThai, DATE_FORMAT(kg.giu_cho_den, ${FMT}) AS giuChoDen
    FROM bac_si b
    JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = b.dich_vu_kham_id
    LEFT JOIN lich_lam_viec lv ON lv.bac_si_id = b.tai_khoan_id AND lv.ngay = ?
    LEFT JOIN khung_gio kg ON kg.lich_lam_viec_id = lv.lich_lam_viec_id`;

/** 'YYYY-MM-DD HH:MM:SS' giờ VN ⇒ Date (cộng độ lệch +07:00 cố định, không qua múi giờ máy). */
const vnToDate = (text: string): Date =>
  new Date(`${text.replace(' ', 'T')}+07:00`);

/**
 * D3 — khung giờ còn trống (PLAN doctor 5.5). Chỉ ĐỌC, không khoá; chạy trong `em` của bên gọi (không có thì dùng kết nối thường).
 * Đúng 3 truy vấn cho cả trang bác sĩ: (1) bác sĩ + ca + khung giờ + thời lượng, (2) nghỉ phép, (3) giờ chi nhánh — dưới trần 4 của H14.
 */
@Injectable()
export class AvailableSlotsReader {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    private readonly branchHours: BranchHoursReader,
    private readonly leaves: LeaveReader,
  ) {}

  async list(
    input: { bacSiId: string; ngay: string; now?: Date },
    em?: EntityManager,
  ): Promise<DoctorDaySlots> {
    const [day] = await this.listMany(
      { bacSiIds: [input.bacSiId], ngay: input.ngay, now: input.now },
      em,
    );
    return day as DoctorDaySlots;
  }

  /** Mỗi id trong `bacSiIds` có đúng một phần tử (đúng thứ tự, bỏ trùng); bác sĩ không tồn tại ⇒ `KhongCoLich`, rỗng. */
  async listMany(
    input: { bacSiIds: readonly string[]; ngay: string; now?: Date },
    em: EntityManager = this.dataSource.manager,
  ): Promise<DoctorDaySlots[]> {
    const now = input.now ?? nowVN(); // một mốc cho cả request (H18)
    const ids = [...new Set(input.bacSiIds)];
    if (ids.length === 0) return [];
    const thu = isoWeekdayOf(input.ngay);

    const rows: Row[] = await em.query(
      `${SELECT_ROWS} WHERE b.tai_khoan_id IN (${ids.map(() => '?').join(', ')}) ORDER BY b.tai_khoan_id, lv.ca, kg.ngay_gio`,
      [input.ngay, ...ids],
    );
    const leaves = await this.leaves.listBlocking(em, {
      bacSiIds: ids,
      tuNgay: input.ngay,
      denNgay: input.ngay,
    });
    // Giờ của ca lấy theo chi nhánh GHI TRÊN CA (D12); bác sĩ không có ca thì theo chi nhánh hiện tại.
    const pairs = new Map<string, BranchWeekdayPair>();
    for (const row of rows) {
      const pair = {
        chiNhanhId: row.chiNhanhCaId ?? row.chiNhanhHienTaiId,
        thuTrongTuan: thu,
      };
      pairs.set(hoursKey(pair), pair);
    }
    const hours = await this.branchHours.loadMany(em, [...pairs.values()]);

    return ids.map((bacSiId): DoctorDaySlots => {
      const mine = rows.filter((row) => row.bacSiId === bacSiId);
      const myLeaves = leaves.filter((leave) => leave.bacSiId === bacSiId);
      const shifts = new Map<string, Row[]>();
      for (const row of mine)
        if (row.lichLamViecId)
          shifts.set(row.lichLamViecId, [
            ...(shifts.get(row.lichLamViecId) ?? []),
            row,
          ]);

      const khungGio: AvailableSlot[] = [];
      let soCaBiNghiPhep = 0;
      for (const slots of shifts.values()) {
        const { ca, chiNhanhCaId, thoiLuong } = slots[0] as Row & {
          ca: CaLamViec;
          chiNhanhCaId: string;
        };
        if (
          myLeaves.some((l) => leaveCoversShift(l, { ngay: input.ngay, ca }))
        ) {
          soCaBiNghiPhep += 1;
          continue;
        }
        const ngayHoatDong =
          hours.get(
            hoursKey({ chiNhanhId: chiNhanhCaId, thuTrongTuan: thu }),
          ) ?? null;
        for (const slot of slots) {
          if (!slot.khungGioId) continue; // ca chưa có khung giờ
          const batDau = vnToDate(slot.ngayGio as string);
          const phut = Number(thoiLuong);
          // Ô ngoài giờ nhận khám hiện hành bị ẩn (không trả ô "bị chặn").
          if (
            !checkSlotWithinBranchHours({
              ngayGio: batDau,
              thoiLuongPhut: phut,
              ca,
              ngayHoatDong,
            }).ok
          )
            continue;
          khungGio.push({
            khungGioId: slot.khungGioId,
            batDau: batDau.toISOString(),
            ketThuc: new Date(batDau.getTime() + phut * 60_000).toISOString(),
            ca,
            trangThai: deriveSlotStatus({
              ngayGio: batDau,
              trangThai: slot.trangThai as StoredSlotStatus,
              giuChoDen: slot.giuChoDen ? vnToDate(slot.giuChoDen) : null,
              now,
            }),
          });
        }
      }

      const hienTai = mine[0];
      const hoursNow = hienTai
        ? hours.get(
            hoursKey({
              chiNhanhId: hienTai.chiNhanhHienTaiId,
              thuTrongTuan: thu,
            }),
          )
        : null;
      // Bác sĩ không tồn tại (không có dòng nào) ⇒ KhongCoLich, không ném lỗi (AV-15).
      const trangThaiNgay = deriveDayStatus({
        soCa: shifts.size,
        soCaBiNghiPhep,
        chiNhanhHienTaiNhanKham: !hienTai || Boolean(hoursNow?.hoatDong),
      });
      return {
        bacSiId,
        ngay: input.ngay,
        trangThaiNgay,
        ...(trangThaiNgay === 'ChiNhanhNghi' && { thuNghi: thu }),
        khungGio,
      };
    });
  }
}
