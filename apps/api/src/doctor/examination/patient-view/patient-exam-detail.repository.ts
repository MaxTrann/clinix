import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ExamDetailRow } from './patient-exam-detail.mapper.js';
import { EXAM_VISIT_JOINS } from './patient-exam-records.repository.js';

// SQL thô của chi tiết hồ sơ khám của Bệnh nhân (doctor-exam B5; PLAN 5.6; XHS-06…XHS-10, XHS-14, XHS-18, XHS-19). Chỉ ĐỌC, không khoá. Mọi giá trị người dùng đi qua tham số `?`.
// Không ghi log: nội dung khám, tên người khám, mã lịch là dữ liệu cá nhân. Người gọi truyền `manager` của MỘT lần gọi `runReadOnly`.

// MỘT câu. Đánh giá chỉ lấy ba cột (`so_sao`, `nhan_xet`, `thoi_diem_tao`): `bi_an` và `ly_do_an` KHÔNG có trong SELECT nên không thể lộ dù mapper sai (Q19; XHS-19 quét câu này).
// Chi nhánh theo SNAPSHOT `lh.chi_nhanh_id` (chi nhánh lúc đặt), không theo `bs.chi_nhanh_id` hiện tại. Ngày tái khám qua `DATE_FORMAT` (cột DATE: tránh `Date` bị lệch múi giờ; X1 M11).
// Phần nối dùng chung với danh sách ở `EXAM_VISIT_JOINS`; chỉ thêm INNER JOIN `chi_nhanh`. Hai LEFT JOIN `ho_so_kham`, `danh_gia_bac_si` UNIQUE theo `lich_hen_id` nên không nhân dòng.
// Điều kiện CHỦ SỞ HỮU `lh.benh_nhan_id = ?` (từ access token) luôn ĐẦU TIÊN rồi mới tới mã: lịch của người khác, lịch chưa `HoanThanh` hay không có đều ra CÙNG "không dòng" (H10).
const DETAIL_SQL = `SELECT lh.ma_lich_hen AS maLichHen, lh.thoi_gian AS thoiGian, ck.ten AS chuyenKhoa, ch.ten AS chiNhanh,
  tbs.ho_ten AS bacSiHoTen, bs.chuc_danh AS chucDanh,
  COALESCE(hs.ho_ten, tbn.ho_ten) AS nguoiKhamHoTen, hs.moi_quan_he AS quanHe,
  (hsk.ho_so_kham_id IS NOT NULL) AS coHoSoKham,
  hsk.trieu_chung AS trieuChung, hsk.chan_doan_so_bo AS chanDoanSoBo, hsk.huong_xu_ly AS huongXuLy,
  DATE_FORMAT(hsk.ngay_tai_kham_du_kien, '%Y-%m-%d') AS ngayTaiKham, hsk.cap_nhat_lan_cuoi AS capNhatLanCuoi,
  (dg.danh_gia_bac_si_id IS NOT NULL) AS coDanhGia,
  dg.so_sao AS soSao, dg.nhan_xet AS nhanXet, dg.thoi_diem_tao AS thoiDiemTaoDanhGia
${EXAM_VISIT_JOINS}
INNER JOIN chi_nhanh ch ON ch.chi_nhanh_id = lh.chi_nhanh_id
WHERE lh.benh_nhan_id = ?
  AND lh.ma_lich_hen = ?
  AND lh.trang_thai = 'HoanThanh'`;

@Injectable()
export class PatientExamDetailRepository {
  /** Hàng của lịch, hoặc `undefined` khi không có (của người khác, chưa `HoanThanh`, không tồn tại). `maLichHen` đã chuẩn hoá chữ hoa (`ParseAppointmentCodePipe`); `ma_lich_hen` UNIQUE nên tối đa một hàng. */
  async findDetail(
    em: EntityManager,
    patientId: string,
    maLichHen: string,
  ): Promise<ExamDetailRow | undefined> {
    const rows = await em.query<ExamDetailRow[]>(DETAIL_SQL, [
      patientId,
      maLichHen,
    ]);
    return rows[0];
  }
}
