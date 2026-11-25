// Bất biến khung giờ ↔ lịch hẹn INV-01…INV-05 và mốc thời gian ↔ trạng thái INV-06 (booking B19) của booking (PLAN booking 5.2, 7.11; TRACKING 3.6 P2-H), nếp `doctor/testing/invariants.ts`: mỗi hàm CHỈ ĐỌC và trả danh sách vi phạm
// (rỗng = đúng); `assertBookingInvariants` chạy cả năm và ném lỗi nêu bất biến nào vỡ. Gọi cuối MỖI ca ghi và ca đồng thời (DT-*, từ B6 trở đi). Chạy trên toàn bộ hai bảng:
// DB test nhỏ, và một dòng sai ở đâu cũng là lỗi.
//
// "Đang giữ khung giờ" = tập trạng thái của biểu thức cột sinh `khung_gio_dang_giu` (entity `lich-hen.entity.ts`): `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`, `HoanThanh`,
// `VangMat`. Khác `ACTIVE_APPOINTMENT_STATES` (3 trạng thái) CÓ CHỦ ĐÍCH (5.2): lịch đã kết thúc vẫn giữ khung giờ, lịch huỷ hay đổi thì thả.
//
// Trạng thái ngày giờ đọc bằng DATE_FORMAT (chuỗi), không để driver đổi sang `Date` (lệch múi giờ, doctor H1, M4).
//
// ĐỔI LỊCH (reschedule B1; PLAN reschedule 5.3): thêm INV-7 đến INV-10 ở CUỐI file, trong `assertRescheduleInvariants` RIÊNG. KHÔNG gộp vào `assertBookingInvariants` (INV-1 đến INV-6 giữ nguyên): hàng chục file test
// của booking, payment, doctor dựng lịch `DaDoiLich` hay `lich_hen_truoc_id` bằng fixture không có lịch con (INV-7 sẽ đỏ) mà vẫn gọi `assertBookingInvariants`. Test của đổi lịch gọi cả hai hàm.
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';

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

/**
 * INV-06 (booking B19, TRACKING 3.46): mốc thời gian từng bước khớp trạng thái. `thoi_diem_hoan_thanh` khác NULL chỉ khi lịch `HoanThanh` (không vai nào đi ra khỏi `HoanThanh` nên mốc không bao giờ phải xoá);
 * `thoi_diem_tiep_don` khác NULL chỉ khi lịch `DaTiepDon`, `HoanThanh` hoặc `DaHuy` (về `DaXacNhan` hay sang `VangMat` thì mốc bị xoá; huỷ giữ nguyên). `thoi_diem_xac_nhan` không bị ràng buộc: lịch cũ NULL, lịch lùi vẫn giữ.
 */
export function checkMilestonesMatchState(db: Queryable): Promise<Violation[]> {
  return rows(
    db,
    `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, trang_thai AS trangThai, ${ts('thoi_diem_tiep_don')} AS tiepDon, ${ts('thoi_diem_hoan_thanh')} AS hoanThanh
       FROM lich_hen
      WHERE (thoi_diem_hoan_thanh IS NOT NULL AND trang_thai <> 'HoanThanh')
         OR (thoi_diem_tiep_don IS NOT NULL AND trang_thai NOT IN ('DaTiepDon', 'HoanThanh', 'DaHuy'))
      ORDER BY lich_hen_id`,
  );
}

/** Chạy cả sáu bất biến; ném lỗi nêu rõ bất biến nào vỡ (gọi cuối mỗi ca ghi và ca đồng thời). */
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
    'INV-06': await checkMilestonesMatchState(db),
  };
  const lines = violationLines(results);
  if (lines.length > 0)
    throw new Error(`Bất biến bị vi phạm:\n${lines.join('\n')}`);
}

// Mỗi bất biến vỡ một dòng: mã, số hàng vi phạm, và chính các hàng đó (khác doctor `assertInvariants` để jscpd không báo trùng). Dùng chung cho `assertBookingInvariants` và `assertRescheduleInvariants`.
const violationLines = (results: Record<string, Violation[]>): string[] =>
  Object.entries(results)
    .filter(([, found]) => found.length > 0)
    .map(
      ([id, found]) => `${id} (${found.length} hàng): ${JSON.stringify(found)}`,
    );

// ───────────────────────── ĐỔI LỊCH: INV-7 đến INV-10 (reschedule B1; PLAN reschedule 5.3) ─────────────────────────
// Cùng nếp INV-1 đến INV-6: mỗi hàm CHỈ ĐỌC và trả danh sách vi phạm (rỗng = đúng). Chuỗi đổi lịch là các lịch nối nhau bằng `lich_hen_truoc_id` (UNIQUE: mỗi lịch cũ có tối đa MỘT lịch mới; khoá ngoại về chính
// `lich_hen`). Lịch GỐC có `lich_hen_truoc_id` NULL; lịch CUỐI là lịch không còn bị thay. Id luôn `CAST … AS CHAR` (BIGINT); mọi đếm là số. Chạy trên toàn bảng.

const byId = (a: Violation, b: Violation, key: string): number => {
  const x = BigInt(String(a[key]));
  const y = BigInt(String(b[key]));
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * INV-7: lịch `DaDoiLich` ⇔ có ĐÚNG MỘT lịch khác trỏ nó bằng `lich_hen_truoc_id`; và lịch có `lich_hen_truoc_id` khác NULL thì cha của nó là `DaDoiLich`.
 * Hai loại vi phạm: `loi: 'DaDoiLichKhongCoDungMotCon'` (kèm `soCon`) và `loi: 'ChaKhongPhaiDaDoiLich'` (kèm `trangThaiCha`; `lichHenId` là lịch CON).
 */
export async function checkReplacedHasOneChild(
  db: Queryable,
): Promise<Violation[]> {
  // `COUNT` ra CHUỖI từ driver: đổi sang số để so sánh và in đúng kiểu
  const noOneChildRows = await rows(
    db,
    `SELECT 'DaDoiLichKhongCoDungMotCon' AS loi, CAST(p.lich_hen_id AS CHAR) AS lichHenId, COUNT(c.lich_hen_id) AS soCon
       FROM lich_hen p
       LEFT JOIN lich_hen c ON c.lich_hen_truoc_id = p.lich_hen_id
      WHERE p.trang_thai = 'DaDoiLich'
      GROUP BY p.lich_hen_id HAVING COUNT(c.lich_hen_id) <> 1`,
  );
  const noOneChild = noOneChildRows.map((row): Violation => ({
    ...row,
    soCon: Number(row['soCon']),
  }));
  const parentNotReplaced = await rows(
    db,
    `SELECT 'ChaKhongPhaiDaDoiLich' AS loi, CAST(c.lich_hen_id AS CHAR) AS lichHenId, p.trang_thai AS trangThaiCha
       FROM lich_hen c
       JOIN lich_hen p ON p.lich_hen_id = c.lich_hen_truoc_id
      WHERE p.trang_thai <> 'DaDoiLich'`,
  );
  return [...noOneChild, ...parentNotReplaced].sort((a, b) =>
    byId(a, b, 'lichHenId'),
  );
}

/** Tám cột lịch con PHẢI bằng lịch cha (PLAN 5.3 INV-8; ba bản chụp sao chép nguyên, không tính lại giá). So bằng `<=>` (NULL an toàn; JSON so theo giá trị đã phân tích, không theo chuỗi). */
export const CHILD_COPIED_COLUMNS = [
  'benh_nhan_id',
  'ho_so_nguoi_than_id',
  'bac_si_id',
  'chi_nhanh_id',
  'dich_vu_kham_id',
  'gia_snapshot',
  'tien_coc_snapshot',
  'chinh_sach_hoan_snapshot',
] as const;

/**
 * INV-8: lịch con cùng cha về tám cột của `CHILD_COPIED_COLUMNS`, và `so_lan_tu_doi_lich` của con bằng cha hoặc cha + 1 (Bệnh nhân tự đổi cộng 1; Lễ tân đổi hộ và duyệt yêu cầu giữ nguyên).
 * Mỗi vi phạm kèm `lichHenId` (lịch con), `lichHenTruocId` và `cotLech` (tên các cột lệch, cách nhau bằng dấu phẩy; `so_lan_tu_doi_lich` nếu bộ đếm lệch).
 */
export function checkChildMatchesParent(db: Queryable): Promise<Violation[]> {
  const columnFlags = CHILD_COPIED_COLUMNS.map(
    (column) => `IF(c.${column} <=> p.${column}, NULL, '${column}')`,
  );
  const counterFlag = `IF(c.so_lan_tu_doi_lich IN (p.so_lan_tu_doi_lich, p.so_lan_tu_doi_lich + 1), NULL, 'so_lan_tu_doi_lich')`;
  return rows(
    db,
    `SELECT lichHenId, lichHenTruocId, cotLech FROM (
       SELECT CAST(c.lich_hen_id AS CHAR) AS lichHenId, CAST(c.lich_hen_truoc_id AS CHAR) AS lichHenTruocId,
              CONCAT_WS(',', ${columnFlags.join(', ')}, ${counterFlag}) AS cotLech
         FROM lich_hen c
         JOIN lich_hen p ON p.lich_hen_id = c.lich_hen_truoc_id
     ) lech
      WHERE cotLech <> ''
      ORDER BY CAST(lichHenId AS UNSIGNED)`,
  );
}

/**
 * INV-9: mỗi chuỗi có ĐÚNG MỘT lịch không phải `DaDoiLich` (lịch cuối: đang sống, hoặc đã `HoanThanh`, `DaHuy`, `VangMat`), không có vòng, và số lịch `<= MAX_CHAIN_DEPTH`.
 * Đi từ mọi lịch GỐC (`lich_hen_truoc_id` NULL) xuống bằng đệ quy. Ba loại: `loi: 'SoLichCuoiKhacMot'` (kèm `gocId`, `soLich`, `soLichCuoi`), `loi: 'ChuoiQuaDai'` (kèm `gocId`, `soLich`) và `loi: 'Vong'`
 * (`lichHenId` có `lich_hen_truoc_id` mà không nằm dưới gốc nào: các lịch trỏ vòng quanh nhau không bao giờ chạm gốc). Đệ quy từ gốc luôn dừng vì mỗi lịch chỉ có MỘT cha.
 */
export async function checkChainHasOneLeaf(
  db: Queryable,
): Promise<Violation[]> {
  const chainCte = `WITH RECURSIVE chuoi (lich_hen_id, goc_id) AS (
       SELECT lich_hen_id, lich_hen_id FROM lich_hen WHERE lich_hen_truoc_id IS NULL
       UNION ALL
       SELECT l.lich_hen_id, chuoi.goc_id FROM lich_hen l JOIN chuoi ON l.lich_hen_truoc_id = chuoi.lich_hen_id
     )`;
  const perChain = await rows(
    db,
    `${chainCte}
     SELECT CAST(chuoi.goc_id AS CHAR) AS gocId, COUNT(*) AS soLich, SUM(l.trang_thai <> 'DaDoiLich') AS soLichCuoi
       FROM chuoi JOIN lich_hen l ON l.lich_hen_id = chuoi.lich_hen_id
      GROUP BY chuoi.goc_id
     HAVING SUM(l.trang_thai <> 'DaDoiLich') <> 1 OR COUNT(*) > ?`,
    [MAX_CHAIN_DEPTH],
  );
  const cyclic = await rows(
    db,
    `${chainCte}
     SELECT 'Vong' AS loi, CAST(l.lich_hen_id AS CHAR) AS lichHenId
       FROM lich_hen l
      WHERE l.lich_hen_truoc_id IS NOT NULL AND l.lich_hen_id NOT IN (SELECT lich_hen_id FROM chuoi)`,
  );
  const perChainViolations = perChain.map((row): Violation => {
    const soLich = Number(row['soLich']);
    const soLichCuoi = Number(row['soLichCuoi']);
    return {
      loi: soLichCuoi === 1 ? 'ChuoiQuaDai' : 'SoLichCuoiKhacMot',
      gocId: row['gocId'],
      soLich,
      soLichCuoi,
    };
  });
  return [...perChainViolations, ...cyclic];
}

/** Ba bảng tiền mà đổi lịch KHÔNG được đụng (PLAN 5.3 INV-10; payment Q11, Q22, E13: tiền luôn trỏ lịch GỐC, đổi lịch không tạo giao dịch). */
export const MONEY_TABLES = [
  'giao_dich_thanh_toan',
  'giao_dich_vi',
  'lich_su_hoan_tien',
] as const;
export type MoneyTable = (typeof MONEY_TABLES)[number];

/** Số hàng và tổng `so_tien` (chuỗi decimal, không bao giờ số thực) của từng bảng tiền. */
export type MoneyTotals = Record<MoneyTable, { soHang: number; tong: string }>;

/** Chụp số hàng và tổng của ba bảng tiền: gọi TRƯỚC và SAU mỗi ca đổi lịch rồi so bằng `checkMoneyUnchanged`. */
export async function captureMoneyTotals(db: Queryable): Promise<MoneyTotals> {
  const entries = await Promise.all(
    MONEY_TABLES.map(async (table) => {
      const [row] = await rows(
        db,
        `SELECT COUNT(*) AS soHang, CAST(COALESCE(SUM(so_tien), 0) AS CHAR) AS tong FROM ${table}`,
      );
      return [
        table,
        { soHang: Number(row?.['soHang']), tong: String(row?.['tong']) },
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as MoneyTotals;
}

/** INV-10: ba bảng tiền không đổi số hàng và tổng giữa hai lần chụp. Mỗi bảng đổi là một vi phạm kèm `bang`, `truoc`, `sau`. */
export function checkMoneyUnchanged(
  before: MoneyTotals,
  after: MoneyTotals,
): Violation[] {
  return MONEY_TABLES.filter(
    (table) =>
      before[table].soHang !== after[table].soHang ||
      before[table].tong !== after[table].tong,
  ).map((table) => ({
    bang: table,
    truoc: before[table],
    sau: after[table],
  }));
}

/**
 * Chạy INV-7, INV-8, INV-9 và (khi có `moneyBefore`, đã chụp TRƯỚC ca đổi) INV-10; ném lỗi nêu bất biến nào vỡ. Gọi CÙNG `assertBookingInvariants` ở cuối mỗi ca ghi và ca đồng thời của đổi lịch (INV-1 đến INV-6 giữ nguyên).
 */
export async function assertRescheduleInvariants(
  db: Queryable,
  options: { moneyBefore?: MoneyTotals } = {},
): Promise<void> {
  const results: Record<string, Violation[]> = {
    'INV-7': await checkReplacedHasOneChild(db),
    'INV-8': await checkChildMatchesParent(db),
    'INV-9': await checkChainHasOneLeaf(db),
  };
  if (options.moneyBefore !== undefined)
    results['INV-10'] = checkMoneyUnchanged(
      options.moneyBefore,
      await captureMoneyTotals(db),
    );
  const lines = violationLines(results);
  if (lines.length > 0)
    throw new Error(`Bất biến đổi lịch bị vi phạm:\n${lines.join('\n')}`);
}
