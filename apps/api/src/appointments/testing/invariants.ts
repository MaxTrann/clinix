// Bất biến khung giờ ↔ lịch hẹn INV-01…INV-05 của booking (PLAN booking 5.2, 7.11; TRACKING 3.6 P2-H), nếp `doctor/testing/invariants.ts`: mỗi hàm CHỈ ĐỌC và trả danh sách vi phạm
// (rỗng = đúng); `assertBookingInvariants` chạy cả năm và ném lỗi nêu bất biến nào vỡ. Gọi cuối MỖI ca ghi và ca đồng thời (DT-*, từ B6 trở đi). Chạy trên toàn bộ hai bảng:
// DB test nhỏ, và một dòng sai ở đâu cũng là lỗi.
//
// "Đang giữ khung giờ" = tập trạng thái của biểu thức cột sinh `khung_gio_dang_giu` (entity `lich-hen.entity.ts`): `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`, `HoanThanh`,
// `VangMat`. Khác `ACTIVE_APPOINTMENT_STATES` (3 trạng thái) CÓ CHỦ ĐÍCH (5.2): lịch đã kết thúc vẫn giữ khung giờ, lịch huỷ hay đổi thì thả.
//
// Trạng thái ngày giờ đọc bằng DATE_FORMAT (chuỗi), không để driver đổi sang `Date` (lệch múi giờ, doctor H1, M4).
export type Violation = Record<string, unknown>;

/** Phần của `DataSource`, `EntityManager`, `QueryRunner` mà các hàm kiểm cần. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

const HOLDING_STATES = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'VangMat',
] as const;
/** Lịch đã xác nhận (đã thanh toán) trở đi mà vẫn giữ khung giờ: INV-03 và INV-04 */
const CONFIRMED_STATES = HOLDING_STATES.filter((s) => s !== 'ChoThanhToan');
const sqlList = (states: readonly string[]) =>
  states.map((s) => `'${s}'`).join(', ');

const rows = async (db: Queryable, sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)) as Violation[];

const ts = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

/**
 * INV-01 (I-1): mỗi khung giờ có tối đa MỘT lịch giữ nó. DB đã bảo đảm bằng UNIQUE trên cột sinh `khung_gio_dang_giu`, nên truy vấn này là lưới thứ ba và KHÔNG thể bị
 * vi phạm bằng DML; `lichHenTable` cho phép test chạy cùng truy vấn trên một BẢNG TẠM đã bỏ UNIQUE để chứng minh nó bắt được (chỉ nhận tên viết thường và gạch dưới).
 */
export function checkSlotSingleHolder(
  db: Queryable,
  options: { lichHenTable?: string } = {},
): Promise<Violation[]> {
  const table = options.lichHenTable ?? 'lich_hen';
  if (!/^[a-z_]+$/.test(table))
    throw new Error(`Tên bảng không hợp lệ cho INV-01: ${table}`);
  return rows(
    db,
    `SELECT CAST(khung_gio_id AS CHAR) AS khungGioId, COUNT(*) AS soLich FROM ${table}
      WHERE trang_thai IN (${sqlList(HOLDING_STATES)})
      GROUP BY khung_gio_id HAVING COUNT(*) > 1 ORDER BY khung_gio_id`,
  );
}

/** INV-02 (I-2): lịch `ChoThanhToan` ⇒ khung giờ `DangGiuCho` và `giu_cho_den` = `han_thanh_toan` (hai NULL KHÔNG được coi là bằng: lịch chờ thanh toán phải có hạn). */
export function checkPendingSlotState(db: Queryable): Promise<Violation[]> {
  return rows(
    db,
    `SELECT CAST(l.lich_hen_id AS CHAR) AS lichHenId, CAST(l.khung_gio_id AS CHAR) AS khungGioId,
            k.trang_thai AS trangThaiKhungGio, ${ts('k.giu_cho_den')} AS giuChoDen, ${ts('l.han_thanh_toan')} AS hanThanhToan
       FROM lich_hen l JOIN khung_gio k ON k.khung_gio_id = l.khung_gio_id
      WHERE l.trang_thai = 'ChoThanhToan'
        AND NOT COALESCE(k.trang_thai = 'DangGiuCho' AND k.giu_cho_den IS NOT NULL AND k.giu_cho_den = l.han_thanh_toan, FALSE)
      ORDER BY l.lich_hen_id`,
  );
}

/** INV-03 (I-3): lịch `DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat` ⇒ khung giờ `DaDat` và `giu_cho_den` NULL. */
export function checkConfirmedSlotState(db: Queryable): Promise<Violation[]> {
  return rows(
    db,
    `SELECT CAST(l.lich_hen_id AS CHAR) AS lichHenId, CAST(l.khung_gio_id AS CHAR) AS khungGioId, l.trang_thai AS trangThai,
            k.trang_thai AS trangThaiKhungGio, ${ts('k.giu_cho_den')} AS giuChoDen
       FROM lich_hen l JOIN khung_gio k ON k.khung_gio_id = l.khung_gio_id
      WHERE l.trang_thai IN (${sqlList(CONFIRMED_STATES)})
        AND NOT (k.trang_thai = 'DaDat' AND k.giu_cho_den IS NULL)
      ORDER BY l.lich_hen_id`,
  );
}

/** INV-04 (I-4): khung giờ `DaDat` ⇒ có ĐÚNG MỘT lịch thuộc tập INV-03 giữ nó (lịch `ChoThanhToan`, `DaHuy`, `DaDoiLich` không tính). */
export function checkBookedSlotHasOneHolder(
  db: Queryable,
): Promise<Violation[]> {
  return rows(
    db,
    `SELECT CAST(k.khung_gio_id AS CHAR) AS khungGioId, COUNT(l.lich_hen_id) AS soLich
       FROM khung_gio k
       LEFT JOIN lich_hen l ON l.khung_gio_id = k.khung_gio_id AND l.trang_thai IN (${sqlList(CONFIRMED_STATES)})
      WHERE k.trang_thai = 'DaDat'
      GROUP BY k.khung_gio_id HAVING COUNT(l.lich_hen_id) <> 1
      ORDER BY k.khung_gio_id`,
  );
}

/**
 * INV-05 (I-5): khung giờ `DangGiuCho` mà không có lịch `ChoThanhToan` giữ nó chỉ hợp lệ khi đang giữ cho lời mời danh sách chờ; module booking KHÔNG BAO GIỜ tự tạo
 * trạng thái đó. `exceptSlotIds` liệt kê khung giờ giữ cho lời mời (mặc định rỗng vì `waitlist` chưa có bảng); chỉ đúng các id đó được miễn.
 */
export function checkOrphanHeldSlots(
  db: Queryable,
  options: { exceptSlotIds?: readonly string[] } = {},
): Promise<Violation[]> {
  const except = options.exceptSlotIds ?? [];
  return rows(
    db,
    `SELECT CAST(k.khung_gio_id AS CHAR) AS khungGioId, ${ts('k.giu_cho_den')} AS giuChoDen
       FROM khung_gio k
      WHERE k.trang_thai = 'DangGiuCho'
        AND NOT EXISTS (SELECT 1 FROM lich_hen l WHERE l.khung_gio_id = k.khung_gio_id AND l.trang_thai = 'ChoThanhToan')
        ${except.length > 0 ? `AND k.khung_gio_id NOT IN (${except.map(() => '?').join(', ')})` : ''}
      ORDER BY k.khung_gio_id`,
    [...except],
  );
}

/** Chạy cả năm bất biến; ném lỗi nêu rõ bất biến nào vỡ (gọi cuối mỗi ca ghi và ca đồng thời). */
export async function assertBookingInvariants(
  db: Queryable,
  options: { exceptSlotIds?: readonly string[] } = {},
): Promise<void> {
  const results: Record<string, Violation[]> = {
    'INV-01': await checkSlotSingleHolder(db),
    'INV-02': await checkPendingSlotState(db),
    'INV-03': await checkConfirmedSlotState(db),
    'INV-04': await checkBookedSlotHasOneHolder(db),
    'INV-05': await checkOrphanHeldSlots(db, options),
  };
  // Mỗi bất biến vỡ một dòng: mã, số hàng vi phạm, và chính các hàng đó (khác doctor `assertInvariants` để jscpd không báo trùng)
  const lines = Object.entries(results)
    .filter(([, found]) => found.length > 0)
    .map(
      ([id, found]) => `${id} (${found.length} hàng): ${JSON.stringify(found)}`,
    );
  if (lines.length > 0)
    throw new Error(`Bất biến bị vi phạm:\n${lines.join('\n')}`);
}
