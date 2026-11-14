import {
  checkConfirmedSlotState,
  type Queryable,
  type Violation,
} from '../../../appointments/testing/invariants.js';

export type { Queryable, Violation };

// Bất biến IVK-01…IVK-05 của phần khám bệnh (doctor-exam; PLAN 7.9), nếp `appointments/testing/invariants.ts`: mỗi hàm CHỈ ĐỌC và trả danh sách vi phạm (rỗng = đúng); `assertExamInvariants`
// chạy cả năm và ném lỗi nêu bất biến nào vỡ. Gọi cuối MỖI ca ghi và ca đồng thời (DHK-*, từ B1 trở đi; `runExamRounds` của exam-concurrency.ts gọi sau mỗi vòng). Chạy trên toàn bộ các bảng
// liên quan: DB test nhỏ, một dòng sai ở đâu cũng là lỗi. Tên bảng tuỳ chọn (IVK-01, IVK-03) chỉ để test chứng minh truy vấn BẮT được khi DB không còn chặn (bảng tạm đã bỏ UNIQUE, CHECK).

const rows = async (db: Queryable, sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)) as Violation[];

/** Chỉ nhận tên bảng viết thường và gạch dưới (tên ghép vào câu SQL). */
function tableName(table: string): string {
  if (!/^[a-z_]+$/.test(table))
    throw new Error(`Tên bảng không hợp lệ: ${table}`);
  return table;
}

export interface OnePerAppointmentTables {
  hoSoKhamTable?: string;
  danhGiaTable?: string;
}

/**
 * IVK-01 (quy tắc 15): mỗi lịch hẹn có tối đa MỘT `ho_so_kham` và MỘT `danh_gia_bac_si`. DB đã bảo đảm bằng UNIQUE `lich_hen_id` ở mỗi bảng nên truy vấn này là lưới thứ hai và KHÔNG thể
 * bị vi phạm bằng DML; `tables` cho test chạy cùng truy vấn trên BẢNG TẠM đã bỏ UNIQUE để chứng minh nó bắt được.
 */
export async function checkOnePerAppointment(
  db: Queryable,
  tables: OnePerAppointmentTables = {},
): Promise<Violation[]> {
  const duplicates = (bang: string, table: string) =>
    rows(
      db,
      `SELECT '${bang}' AS bang, CAST(lich_hen_id AS CHAR) AS lichHenId, COUNT(*) AS soDong
         FROM ${tableName(table)} GROUP BY lich_hen_id HAVING COUNT(*) > 1 ORDER BY lich_hen_id`,
    );
  return [
    ...(await duplicates('ho_so_kham', tables.hoSoKhamTable ?? 'ho_so_kham')),
    ...(await duplicates(
      'danh_gia_bac_si',
      tables.danhGiaTable ?? 'danh_gia_bac_si',
    )),
  ];
}

/** IVK-02 (quy tắc 8): mọi `danh_gia_bac_si` thuộc lịch `HoanThanh`. DB KHÔNG chặn (khoá ngoại chỉ cần lịch tồn tại), nên đây là hàng rào duy nhất ngoài service. */
export function checkRatingOnCompletedOnly(
  db: Queryable,
): Promise<Violation[]> {
  return rows(
    db,
    `SELECT CAST(d.danh_gia_bac_si_id AS CHAR) AS danhGiaId, CAST(d.lich_hen_id AS CHAR) AS lichHenId, l.trang_thai AS trangThai
       FROM danh_gia_bac_si d JOIN lich_hen l ON l.lich_hen_id = d.lich_hen_id
      WHERE l.trang_thai <> 'HoanThanh'
      ORDER BY d.danh_gia_bac_si_id`,
  );
}

/**
 * IVK-03 (CHECK `chk_danh_gia_an`): `bi_an = 1` ⇔ `ly_do_an IS NOT NULL`. DB đã chặn bằng CHECK nên truy vấn này là lưới thứ hai; `danhGiaTable` cho test chạy trên bảng tạm đã bỏ CHECK.
 * `ly_do_an = ''` với `bi_an = 1` KHÔNG là vi phạm ở đây (chuỗi rỗng khác NULL; chỉ service chặn chuỗi rỗng, đúng MGK-03).
 */
export function checkHiddenReasonConsistent(
  db: Queryable,
  options: { danhGiaTable?: string } = {},
): Promise<Violation[]> {
  return rows(
    db,
    `SELECT CAST(danh_gia_bac_si_id AS CHAR) AS danhGiaId, bi_an AS biAn, ly_do_an AS lyDoAn
       FROM ${tableName(options.danhGiaTable ?? 'danh_gia_bac_si')}
      WHERE (bi_an = 1) <> (ly_do_an IS NOT NULL)
      ORDER BY danh_gia_bac_si_id`,
  );
}

/**
 * IVK-04 (PLAN 5.12): nhật ký khớp trạng thái. (a) Đánh giá `bi_an = 1` có ĐÚNG MỘT dòng `AnDanhGia` thành công, đánh giá `bi_an = 0` không có dòng nào; (b) mọi dòng `AnDanhGia` thành công
 * trỏ một đánh giá có thật, mọi dòng `SuaGhiChuKham` thành công trỏ một `ho_so_kham` có thật. Bảng nhật ký không có khoá ngoại nên DB không chặn. Dòng `ThatBai` KHÔNG tính `[đề xuất]`.
 */
export async function checkAuditMatchesState(
  db: Queryable,
): Promise<Violation[]> {
  const ratingVsAudit = await rows(
    db,
    `SELECT 'danh_gia' AS loai, CAST(d.danh_gia_bac_si_id AS CHAR) AS maDoiTuong, d.bi_an AS biAn, COUNT(n.nhat_ky_hanh_dong_id) AS soDong
       FROM danh_gia_bac_si d
       LEFT JOIN nhat_ky_hanh_dong n ON n.hanh_dong = 'AnDanhGia' AND n.loai_doi_tuong = 'danh_gia_bac_si'
                                    AND n.ma_doi_tuong = d.danh_gia_bac_si_id AND n.ket_qua = 'ThanhCong'
      GROUP BY d.danh_gia_bac_si_id, d.bi_an
     HAVING (d.bi_an = 1 AND COUNT(n.nhat_ky_hanh_dong_id) <> 1) OR (d.bi_an = 0 AND COUNT(n.nhat_ky_hanh_dong_id) <> 0)
      ORDER BY d.danh_gia_bac_si_id`,
  );
  const orphans = await rows(
    db,
    `SELECT 'mo_coi' AS loai, CAST(n.ma_doi_tuong AS CHAR) AS maDoiTuong, n.hanh_dong AS hanhDong
       FROM nhat_ky_hanh_dong n
       LEFT JOIN danh_gia_bac_si d ON n.loai_doi_tuong = 'danh_gia_bac_si' AND d.danh_gia_bac_si_id = n.ma_doi_tuong
       LEFT JOIN ho_so_kham h ON n.loai_doi_tuong = 'ho_so_kham' AND h.ho_so_kham_id = n.ma_doi_tuong
      WHERE n.ket_qua = 'ThanhCong'
        AND ((n.hanh_dong = 'AnDanhGia' AND d.danh_gia_bac_si_id IS NULL)
          OR (n.hanh_dong = 'SuaGhiChuKham' AND h.ho_so_kham_id IS NULL))
      ORDER BY n.nhat_ky_hanh_dong_id`,
  );
  return [...ratingVsAudit, ...orphans];
}

/**
 * IVK-05 (AR-01, AR-07): mọi lịch `HoanThanh` vẫn giữ khung giờ `DaDat` và `giu_cho_den` NULL (`complete` không đụng `khung_gio`). Dùng lại INV-03 của booking, lọc đúng `HoanThanh`.
 * GIỚI HẠN: từ trạng thái không chứng minh được "đến từ `complete`"; phần đó do AR-01, AR-06, AR-07 và ma trận trạng thái (đường duy nhất `DaTiepDon → HoanThanh`) bảo đảm.
 */
export async function checkCompletedKeepsSlot(
  db: Queryable,
): Promise<Violation[]> {
  return (await checkConfirmedSlotState(db)).filter(
    (violation) => violation.trangThai === 'HoanThanh',
  );
}

/** Chạy cả năm bất biến; ném lỗi nêu rõ bất biến nào vỡ và các hàng vi phạm (gọi cuối mỗi ca ghi và ca đồng thời). */
export async function assertExamInvariants(db: Queryable): Promise<void> {
  const checks: readonly [string, () => Promise<Violation[]>][] = [
    ['IVK-01', () => checkOnePerAppointment(db)],
    ['IVK-02', () => checkRatingOnCompletedOnly(db)],
    ['IVK-03', () => checkHiddenReasonConsistent(db)],
    ['IVK-04', () => checkAuditMatchesState(db)],
    ['IVK-05', () => checkCompletedKeepsSlot(db)],
  ];
  const broken: string[] = [];
  for (const [id, check] of checks) {
    const found = await check();
    if (found.length > 0)
      broken.push(`${id} (${found.length} hàng): ${JSON.stringify(found)}`);
  }
  if (broken.length > 0)
    throw new Error(
      `Bất biến phần khám bệnh bị vi phạm:\n${broken.join('\n')}`,
    );
}
