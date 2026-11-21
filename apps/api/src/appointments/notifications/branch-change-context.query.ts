import type { EntityManager } from 'typeorm';

// Dữ kiện cho thư của yêu cầu thay đổi chi nhánh (admin C4), đọc TẠI LÚC GỬI như thư của booking. CHỈ ĐỌC, KHÔNG KHOÁ.
// Chỉ tên, địa chỉ chi nhánh và thời điểm hiệu lực: không đọc `noi_dung_truoc`, `noi_dung_sau`, `ly_do_tu_choi`, `ly_do_huy` (chi tiết của thư là chính `thong_bao.noi_dung` do người gọi soạn).

export interface BranchChangeMailContext {
  tenChiNhanh: string;
  diaChiChiNhanh: string;
  /** `hieu_luc_tu` "dd/MM/yyyy — HH:mm" giờ Việt Nam; `null` khi yêu cầu chưa được duyệt (từ chối, rút) */
  hieuLucTu: string | null;
}

export const READ_BRANCH_CHANGE_CONTEXT_SQL = `SELECT cn.ten AS tenChiNhanh, cn.dia_chi AS diaChiChiNhanh,
       DATE_FORMAT(y.hieu_luc_tu, '%d/%m/%Y — %H:%i') AS hieuLucTu
  FROM yeu_cau_thay_doi_chi_nhanh y
  JOIN chi_nhanh cn ON cn.chi_nhanh_id = y.chi_nhanh_id
 WHERE y.yeu_cau_thay_doi_chi_nhanh_id = ?`;

/** `null` khi không còn yêu cầu (dữ liệu lệch: người gọi ném `THIEU_YEU_CAU`). */
export async function readBranchChangeMailContext(
  em: EntityManager,
  yeuCauId: string,
): Promise<BranchChangeMailContext | null> {
  const rows: BranchChangeMailContext[] = await em.query(
    READ_BRANCH_CHANGE_CONTEXT_SQL,
    [yeuCauId],
  );
  return rows[0] ?? null;
}
