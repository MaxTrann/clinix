import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ShiftRange } from '../branch-hours/branch-hours.types.js';
import { generateSlotStarts } from './slot-generator.rules.js';

// D1 — sinh khung giờ cho MỘT ca. Hàm thường (không DI) để seed và test gọi được; `SlotGeneratorService` chỉ bọc mỏng.

/** Lô tối đa mỗi câu INSERT (Q7 (i)) `[đề xuất]`. */
export const SLOT_INSERT_BATCH = 500;

export interface SyncShiftSlotsInput {
  lichLamViecId: string;
  /** Ngày lịch 'YYYY-MM-DD' của ca. */
  ngay: string;
  /** Khoảng nhận khám của ca (giây từ 00:00), lấy từ `shiftWindow`. */
  khoang: ShiftRange;
  thoiLuongPhut: number;
}

export interface SyncShiftSlotsResult {
  moi: number;
  daCo: number;
}

/** Giây ⇒ 'HH:MM:SS' (ghi chuỗi, không qua Date: H1, M4). */
function formatHHMMSS(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

/**
 * Sinh toàn bộ khung giờ nối liền của ca, trạng thái `ConTrong`. Chạy lại KHÔNG đổi gì:
 * `ON DUPLICATE KEY UPDATE` chỉ là phép gán không đổi nên không bao giờ ghi `trang_thai`/`giu_cho_den`
 * của ô đã có (D7). Cần chạy trong giao dịch của bên gọi (`em`).
 */
export async function syncShiftSlots(
  em: EntityManager,
  input: SyncShiftSlotsInput,
): Promise<SyncShiftSlotsResult> {
  const starts = generateSlotStarts(input.khoang, input.thoiLuongPhut);
  if (starts.length === 0) return { moi: 0, daCo: 0 };

  // Đếm trước/sau để biết bao nhiêu ô thật sự mới: affectedRows không đáng tin với phép gán không đổi.
  const countSql =
    'SELECT COUNT(*) AS so FROM khung_gio WHERE lich_lam_viec_id = ?';
  const before = await em.query<{ so: string }[]>(countSql, [
    input.lichLamViecId,
  ]);

  for (let from = 0; from < starts.length; from += SLOT_INSERT_BATCH) {
    const batch = starts.slice(from, from + SLOT_INSERT_BATCH);
    const placeholders = batch.map(() => "(?, ?, 'ConTrong')").join(', ');
    const params = batch.flatMap((start) => [
      input.lichLamViecId,
      `${input.ngay} ${formatHHMMSS(start)}`,
    ]);
    await em.query(
      `INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE lich_lam_viec_id = lich_lam_viec_id`,
      params,
    );
  }

  const after = await em.query<{ so: string }[]>(countSql, [
    input.lichLamViecId,
  ]);
  const moi = Math.max(0, Number(after[0].so) - Number(before[0].so));
  return { moi, daCo: starts.length - moi };
}

@Injectable()
export class SlotGeneratorService {
  syncShift(
    em: EntityManager,
    input: SyncShiftSlotsInput,
  ): Promise<SyncShiftSlotsResult> {
    return syncShiftSlots(em, input);
  }
}
