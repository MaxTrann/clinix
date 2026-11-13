import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { StatusHistoryEntry } from './admin-appointments.dto.js';

// Dựng panel "Lịch sử trạng thái" của Quản trị viên từ dữ liệu đã đọc (task B4; PLAN booking Q28, L26; TRACKING 3.33 B4-E). Hàm THUẦN, không DB, không log: lý do huỷ và lý do override là chữ tự do
// của nhân sự (dữ liệu riêng tư), nên không dòng nào ở đây ghi ra log.

/** Ba mốc của chính `lich_hen`. `thoi_diem_tao` luôn có (NOT NULL); `thoi_diem_huy` và `ly_do_huy` chỉ có khi lịch đã bị huỷ. */
export interface HistoryMilestones {
  thoiDiemTao: Date;
  thoiDiemHuy: Date | null;
  lyDoHuy: string | null;
}

/** Một dòng nhật ký `OverrideLichHen` của lịch: `id` là BIGINT ra chuỗi (nhờ cấu hình driver), `changes` là cột JSON đã parse, KHÔNG tin hình dạng của nó. */
export interface HistoryAuditRow {
  id: string;
  thoiDiem: Date;
  changes: unknown;
}

type OverrideEntry = Extract<StatusHistoryEntry, { loai: 'OverrideLichHen' }>;

// Mục kèm khoá sắp xếp: `rank` 0 là mục nhật ký, 1 là `HuyLich` (cùng giây thì mục nhật ký đứng trước)
interface RankedEntry {
  entry: StatusHistoryEntry;
  time: number;
  rank: 0 | 1;
  id: bigint;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Trạng thái trong ảnh chụp `{ trang_thai }` của nhật ký; `null` khi không phải đối tượng hay giá trị ngoài `TRANG_THAI_LICH_HEN`. */
function stateOf(snapshot: unknown): TrangThaiLichHen | null {
  if (!isRecord(snapshot)) return null;
  const value = snapshot['trang_thai'];
  return TRANG_THAI_LICH_HEN.find((state) => state === value) ?? null;
}

/**
 * Mục override từ `chi_tiet_thay_doi` `{ truoc: { trang_thai }, sau: { trang_thai }, ly_do }` (B14, Q24); `null` khi sai hình dạng (không phải đối tượng, thiếu một trong ba khoá, trạng thái
 * ngoài enum, `ly_do` không phải chuỗi). Khoá thừa bị bỏ, không lọt ra ngoài.
 */
function overrideOf(thoiDiem: Date, changes: unknown): OverrideEntry | null {
  if (!isRecord(changes)) return null;
  const tuTrangThai = stateOf(changes['truoc']);
  const denTrangThai = stateOf(changes['sau']);
  const lyDo = changes['ly_do'];
  if (tuTrangThai === null || denTrangThai === null || typeof lyDo !== 'string')
    return null;
  return {
    thoiDiem: thoiDiem.toISOString(),
    loai: 'OverrideLichHen',
    tuTrangThai,
    denTrangThai,
    lyDo,
  };
}

const compareBigInt = (a: bigint, b: bigint): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Panel của MỘT lịch. `TaoLich` luôn đứng đầu (đồng hồ DB và ứng dụng có thể lệch vài giây); các mục còn lại theo `thoiDiem` tăng, cùng giây thì mục nhật ký trước `HuyLich`, rồi theo id nhật ký
 * tăng (so như SỐ, không như chuỗi). Huỷ qua override ghi CẢ `thoi_diem_huy` lẫn dòng nhật ký có `sau = DaHuy`: khi có dòng nhật ký đó thì BỎ `HuyLich` (mục override đã mang `tuTrangThai` và `lyDo`;
 * `DaHuy` là trạng thái cuối nên chỉ có một lần). Dòng nhật ký sai hình dạng bị bỏ, không làm hỏng cả panel.
 */
export function buildStatusHistory(
  milestones: HistoryMilestones,
  auditRows: readonly HistoryAuditRow[],
): StatusHistoryEntry[] {
  const overrides: { entry: OverrideEntry; time: number; id: bigint }[] = [];
  for (const row of auditRows) {
    const entry = overrideOf(row.thoiDiem, row.changes);
    if (entry !== null)
      overrides.push({
        entry,
        time: row.thoiDiem.getTime(),
        id: BigInt(row.id),
      });
  }
  const ranked = overrides.map((override): RankedEntry => ({
    ...override,
    rank: 0,
  }));
  const overriddenToCancel = overrides.some(
    ({ entry }) => entry.denTrangThai === 'DaHuy',
  );
  if (milestones.thoiDiemHuy !== null && !overriddenToCancel)
    ranked.push({
      entry: {
        thoiDiem: milestones.thoiDiemHuy.toISOString(),
        loai: 'HuyLich',
        denTrangThai: 'DaHuy',
        lyDo: milestones.lyDoHuy,
      },
      time: milestones.thoiDiemHuy.getTime(),
      rank: 1,
      id: 0n,
    });
  ranked.sort(
    (a, b) => a.time - b.time || a.rank - b.rank || compareBigInt(a.id, b.id),
  );
  return [
    { thoiDiem: milestones.thoiDiemTao.toISOString(), loai: 'TaoLich' },
    ...ranked.map(({ entry }) => entry),
  ];
}
