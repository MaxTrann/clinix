import type { DataSource } from 'typeorm';
import { isBigintId } from '../../appointments/lists/list-query.rules.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { sanitizeDataText } from '../context/context-builder.js';
import type { NowSource } from '../context/context.types.js';
import {
  BRANCH_DIRECTORY_TTL_MS,
  EMERGENCY_BRANCH_LIMIT,
} from './ask.constants.js';

// Địa chỉ chi nhánh cho câu KHẨN CẤP (chatbot B3; PLAN chatbot 5.4 bước 3, Q6; F1 TRACKING 3.7: địa chỉ phải nằm TRONG `doan`, web không tự lấy).
// Chỉ đọc: MỘT câu SQL trong `runReadOnly`. Câu khẩn cấp MIỄN giới hạn tốc độ nên không được thành đường khuếch đại tải DB: bản chụp dùng tối đa 60 giây, chỉ giữ MỘT bản,
// nhiều lời gọi đồng thời chung một lần đọc. Đọc lỗi KHÔNG vào đệm và KHÔNG ném: câu khẩn cấp vẫn ra, chỉ thiếu khối địa chỉ.

export interface BranchAddress {
  readonly id: string;
  readonly ten: string;
  readonly diaChi: string;
}

export type BranchLoader = () => Promise<readonly BranchAddress[]>;

/** Bộ nạp thật: đọc mọi chi nhánh theo tên; chữ lấy từ DB được làm sạch (một dòng, không ký tự điều khiển). */
export function createBranchLoader(db: DataSource): BranchLoader {
  return () =>
    runReadOnly(db, async (manager) => {
      const rows = await manager.query<
        { id: string | number; ten: string; diaChi: string }[]
      >(
        `SELECT chi_nhanh_id AS id, ten AS ten, dia_chi AS diaChi
         FROM chi_nhanh ORDER BY ten ASC, chi_nhanh_id ASC`,
      );
      return rows.map((row) => ({
        id: String(row.id),
        ten: sanitizeDataText(row.ten),
        diaChi: sanitizeDataText(row.diaChi),
      }));
    });
}

interface Snapshot {
  readonly at: number;
  readonly rows: readonly BranchAddress[];
}

export class BranchDirectory {
  private snapshot: Snapshot | null = null;
  private inFlight: Promise<readonly BranchAddress[]> | null = null;

  constructor(
    private readonly deps: { load: BranchLoader; clock: NowSource },
  ) {}

  /**
   * `preferredId` hợp lệ và có thật thì chỉ chi nhánh đó; ngược lại (chưa chọn, id lạ, không tồn tại) thì tối đa `EMERGENCY_BRANCH_LIMIT` chi nhánh đầu theo tên.
   * Không bao giờ ném: lỗi đọc cho danh sách rỗng.
   */
  async addressesFor(preferredId?: string): Promise<BranchAddress[]> {
    let rows: readonly BranchAddress[];
    try {
      rows = await this.rows();
    } catch {
      return [];
    }
    if (isBigintId(preferredId)) {
      const chosen = rows.find((row) => row.id === preferredId);
      if (chosen !== undefined) return [chosen];
    }
    return rows.slice(0, EMERGENCY_BRANCH_LIMIT);
  }

  private async rows(): Promise<readonly BranchAddress[]> {
    const now = this.deps.clock.now();
    const cached = this.snapshot;
    if (cached !== null && now - cached.at < BRANCH_DIRECTORY_TTL_MS) {
      return cached.rows;
    }
    // Nhiều lời gọi cùng lúc chung MỘT lần đọc; lần đọc lỗi không vào đệm
    this.inFlight ??= this.deps.load().then(
      (rows) => {
        this.snapshot = { at: now, rows };
        this.inFlight = null;
        return rows;
      },
      (error: unknown) => {
        this.inFlight = null;
        throw error;
      },
    );
    return this.inFlight;
  }
}
