// Bất biến sổ ví IVT-01…IVT-07 (payment P3; PLAN payment 5.2, mục 7.15) viết thành truy vấn kiểm trên MySQL thật. Chạy SAU mọi test đồng thời và mọi test ghi ví: dữ liệu đúng ⇒ không dòng nào;
// dữ liệu cố ý lệch ⇒ đúng bất biến đó báo (kiểm HAI CHIỀU ở wallet-invariants.int-spec.ts: một bộ kiểm không bao giờ bắt được gì thì vô dụng). Mỗi truy vấn trả các id vi phạm.
// Nằm ở `testing/` nên luật QTT-08 (không NOW(), không ghi lich_hen) không quét; file này chỉ ĐỌC.

export type InvariantCode =
  'IVT-01' | 'IVT-02' | 'IVT-03' | 'IVT-04' | 'IVT-05' | 'IVT-06' | 'IVT-07';

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/** IVT-01: `so_du` = tổng `giao_dich_vi.so_tien` của ví (số dư đầu 0); ví chưa có dòng sổ cái thì `so_du` phải bằng 0. */
export const IVT01_SQL = `
  SELECT CAST(v.vi_noi_bo_id AS CHAR) AS id
    FROM vi_noi_bo v
    LEFT JOIN (SELECT vi_noi_bo_id, SUM(so_tien) AS tong FROM giao_dich_vi GROUP BY vi_noi_bo_id) g ON g.vi_noi_bo_id = v.vi_noi_bo_id
   WHERE v.so_du <> COALESCE(g.tong, 0)`;

/** IVT-02: `so_tien_dang_giu` = tổng `yeu_cau_rut_tien.so_tien` đang `ChoDuyet`. */
export const IVT02_SQL = `
  SELECT CAST(v.vi_noi_bo_id AS CHAR) AS id
    FROM vi_noi_bo v
    LEFT JOIN (SELECT vi_noi_bo_id, SUM(so_tien) AS tong FROM yeu_cau_rut_tien WHERE trang_thai = 'ChoDuyet' GROUP BY vi_noi_bo_id) y ON y.vi_noi_bo_id = v.vi_noi_bo_id
   WHERE v.so_tien_dang_giu <> COALESCE(y.tong, 0)`;

/** IVT-03: `0 <= so_tien_dang_giu <= so_du`. Nhận tên bảng để test hai chiều chạy trên bảng tạm (`chk_vi_so_du` của DB không cho chèn dòng lệch vào `vi_noi_bo`). */
export const ivt03Sql = (table = 'vi_noi_bo') => `
  SELECT CAST(vi_noi_bo_id AS CHAR) AS id
    FROM ${table}
   WHERE so_tien_dang_giu < 0 OR so_du < 0 OR so_tien_dang_giu > so_du`;

/** IVT-04: `NapVi` `ThanhCong` không `ChoDoiSoat` ⇒ đúng một dòng `Nap`; `ChoDoiSoat` ⇒ không dòng nào. */
export const IVT04_SQL = `
  SELECT CAST(g.giao_dich_thanh_toan_id AS CHAR) AS id
    FROM giao_dich_thanh_toan g
   WHERE g.loai = 'NapVi' AND g.trang_thai = 'ThanhCong'
     AND (SELECT COUNT(*) FROM giao_dich_vi v WHERE v.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id AND v.loai = 'Nap')
         <> IF(g.trang_thai_doi_soat = 'ChoDoiSoat', 0, 1)`;

/** IVT-05: `ThanhToanLichHen` qua `Vi` với `so_tien > 0` ⇒ đúng một dòng `ThanhToan` và dòng đó là số âm cùng độ lớn. */
export const IVT05_SQL = `
  SELECT CAST(g.giao_dich_thanh_toan_id AS CHAR) AS id
    FROM giao_dich_thanh_toan g
   WHERE g.loai = 'ThanhToanLichHen' AND g.phuong_thuc = 'Vi' AND g.trang_thai = 'ThanhCong' AND g.so_tien > 0
     AND ((SELECT COUNT(*) FROM giao_dich_vi v WHERE v.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id AND v.loai = 'ThanhToan') <> 1
          OR (SELECT COUNT(*) FROM giao_dich_vi v
               WHERE v.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id AND v.loai = 'ThanhToan' AND v.so_tien = -g.so_tien) <> 1)`;

/** IVT-06: tổng hoàn `ThanhCong` của một khoản ≤ `so_tien` của nó; mỗi dòng hoàn `ThanhCong` có đúng một dòng sổ `HoanTien`. */
export const IVT06_SQL = `
  SELECT CAST(g.giao_dich_thanh_toan_id AS CHAR) AS id
    FROM giao_dich_thanh_toan g
   WHERE (SELECT COALESCE(SUM(h.so_tien), 0) FROM lich_su_hoan_tien h
           WHERE h.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id AND h.trang_thai = 'ThanhCong') > g.so_tien
   UNION
  SELECT CAST(h.giao_dich_thanh_toan_id AS CHAR)
    FROM lich_su_hoan_tien h
   WHERE h.trang_thai = 'ThanhCong'
     AND (SELECT COUNT(*) FROM giao_dich_vi v WHERE v.lich_su_hoan_tien_id = h.lich_su_hoan_tien_id AND v.loai = 'HoanTien') <> 1`;

// Gốc của mỗi lịch trong chuỗi đổi lịch (giao dịch trỏ lịch gốc; gom theo gốc để bắt cả giao dịch trỏ nhầm lịch giữa chuỗi).
const ROOTS_CTE = `
  WITH RECURSIVE goc (lich_hen_id, goc_id) AS (
    SELECT lich_hen_id, lich_hen_id FROM lich_hen WHERE lich_hen_truoc_id IS NULL
    UNION ALL
    SELECT lh.lich_hen_id, goc.goc_id FROM lich_hen lh JOIN goc ON lh.lich_hen_truoc_id = goc.lich_hen_id
  )`;

/** IVT-07 (phần duy nhất): mỗi chuỗi lịch có tối đa MỘT `ThanhToanLichHen` qua `Vi` với `so_tien > 0` và tối đa MỘT `TienMatTaiQuay`. */
export const IVT07_UNIQUE_SQL = `${ROOTS_CTE}
  SELECT CAST(goc.goc_id AS CHAR) AS id
    FROM giao_dich_thanh_toan g JOIN goc ON goc.lich_hen_id = g.lich_hen_id
   WHERE g.loai = 'ThanhToanLichHen' AND g.trang_thai = 'ThanhCong'
   GROUP BY goc.goc_id
  HAVING SUM(g.phuong_thuc = 'Vi' AND g.so_tien > 0) > 1 OR SUM(g.phuong_thuc = 'TienMatTaiQuay') > 1`;

/**
 * IVT-07 (phần đủ cọc, TẮT mặc định): lịch ở `DaXacNhan` trở đi mà `tien_coc_snapshot > 0` thì tổng đã thu qua `Vi` của cả chuỗi ≥ cọc. PLAN loại "lịch tạo trước khi có `payment`":
 * dữ liệu dựng bằng fixture của booking có lịch `DaXacNhan` kèm cọc mà chưa có giao dịch nên không thể bật mặc định; các test ghi `confirmPaid` (B5 trở đi) bật bằng `requireDepositCovered`. `[đề xuất]`
 */
export const IVT07_DEPOSIT_SQL = `${ROOTS_CTE}
  SELECT CAST(lh.lich_hen_id AS CHAR) AS id
    FROM lich_hen lh JOIN goc ON goc.lich_hen_id = lh.lich_hen_id
   WHERE lh.trang_thai IN ('DaXacNhan', 'DaTiepDon', 'HoanThanh', 'VangMat') AND lh.tien_coc_snapshot > 0
     AND (SELECT COALESCE(SUM(g.so_tien), 0) FROM giao_dich_thanh_toan g JOIN goc g2 ON g2.lich_hen_id = g.lich_hen_id
           WHERE g2.goc_id = goc.goc_id AND g.loai = 'ThanhToanLichHen' AND g.phuong_thuc = 'Vi' AND g.trang_thai = 'ThanhCong') < lh.tien_coc_snapshot`;

export interface InvariantOptions {
  /** Bật phần "đủ cọc" của IVT-07 (xem `IVT07_DEPOSIT_SQL`). Mặc định tắt. */
  requireDepositCovered?: boolean;
}

const ids = async (db: Queryable, sql: string): Promise<string[]> =>
  ((await db.query(sql)) as { id: string }[]).map((row) => row.id);

/** Chạy mọi bất biến; trả các id vi phạm theo mã. Mảng rỗng ở mọi mã = đạt. */
export async function findWalletInvariantViolations(
  db: Queryable,
  options: InvariantOptions = {},
): Promise<Record<InvariantCode, string[]>> {
  const deposit = options.requireDepositCovered
    ? await ids(db, IVT07_DEPOSIT_SQL)
    : [];
  const unique = await ids(db, IVT07_UNIQUE_SQL);
  return {
    'IVT-01': await ids(db, IVT01_SQL),
    'IVT-02': await ids(db, IVT02_SQL),
    'IVT-03': await ids(db, ivt03Sql()),
    'IVT-04': await ids(db, IVT04_SQL),
    'IVT-05': await ids(db, IVT05_SQL),
    'IVT-06': await ids(db, IVT06_SQL),
    'IVT-07': [...unique, ...deposit],
  };
}

/** Ném lỗi nêu mã và id vi phạm nếu có bất biến nào sai; dùng cuối mỗi test ghi ví. */
export async function assertWalletInvariants(
  db: Queryable,
  options: InvariantOptions = {},
): Promise<void> {
  const violations = await findWalletInvariantViolations(db, options);
  const broken = Object.entries(violations).filter(
    ([, found]) => found.length > 0,
  );
  if (broken.length > 0)
    throw new Error(
      `Bất biến sổ ví bị vi phạm: ${broken.map(([code, found]) => `${code} (id ${found.join(', ')})`).join('; ')}`,
    );
}
