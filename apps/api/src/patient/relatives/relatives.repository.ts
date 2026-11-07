import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { MoiQuanHeNguoiThan } from '../../admin/entities/enums.js';
import {
  findActiveAppointments,
  type ActiveAppointment,
} from '../../appointments/active-appointment.query.js';
import {
  lockVisitProfile,
  type VisitProfileState,
} from '../../appointments/visit-profile.query.js';
import type { RelativeResponse } from './relatives.dto.js';

/**
 * Năm giá trị người dùng nhập khi tạo (task B3) hoặc sửa (task B4) hồ sơ người thân. Cố ý KHÔNG có `diaChi`, `trangThaiHieuLuc`, `benhNhanId`:
 * địa chỉ luôn NULL (Q8) và trạng thái luôn hiệu lực nằm CỨNG trong câu INSERT; câu UPDATE chỉ đặt đúng năm cột này; chủ sở hữu là tham số riêng
 * của hàm ghi (TRACKING B3-D, B4-D). Dùng `null`, không `undefined`, cho số điện thoại để chắc chắn ghi NULL.
 */
export interface NewRelative {
  hoTen: string;
  moiQuanHe: MoiQuanHeNguoiThan;
  gioiTinh: string;
  ngaySinh: string;
  soDienThoai: string | null;
}

// Hàng thô của câu SELECT: `tinyint` của MySQL ra số 1 hoặc 0 (không phải boolean), nên có kiểu riêng rồi mới đổi sang RelativeResponse.
interface RelativeRow extends Omit<RelativeResponse, 'trangThaiHieuLuc'> {
  trangThaiHieuLuc: number;
}

// MỘT nơi định nghĩa cột trả về cho người thân (PLAN 5.4): `GET /patient/relatives` (B3) và chi tiết bệnh nhân của Lễ tân (B7) đều dùng hằng này.
// Liệt kê tường minh, không `SELECT *`: không có benh_nhan_id, dia_chi.
//  - `ngay_sinh` PHẢI qua DATE_FORMAT: câu SQL thô trả cột DATE thành `Date` lệch múi giờ (1900-01-01 ra 1899-12-31T17:00:00.000Z ở +07:00).
//  - `ho_so_nguoi_than_id` (BIGINT) ra chuỗi nhờ cấu hình driver (bigNumberStrings), giữ chính xác cả khi vượt 2^53.
const RELATIVE_COLUMNS = `h.ho_so_nguoi_than_id AS hoSoNguoiThanId, h.ho_ten AS hoTen, h.moi_quan_he AS moiQuanHe,
  h.gioi_tinh AS gioiTinh, DATE_FORMAT(h.ngay_sinh, '%Y-%m-%d') AS ngaySinh, h.so_dien_thoai AS soDienThoai,
  h.trang_thai_hieu_luc AS trangThaiHieuLuc`;

// `benh_nhan_id = ?` nằm TRONG câu SQL (H3): hồ sơ của người khác không bao giờ được đọc, kể cả khi biết id.
// Đang sử dụng trước (trang_thai_hieu_luc 1 trước 0), rồi hồ sơ tạo trước xếp trước (id tăng dần).
const FIND_RELATIVES_SQL = `SELECT ${RELATIVE_COLUMNS}
FROM ho_so_nguoi_than h
WHERE h.benh_nhan_id = ?
ORDER BY h.trang_thai_hieu_luc DESC, h.ho_so_nguoi_than_id ASC`;

const FIND_RELATIVE_BY_ID_SQL = `SELECT ${RELATIVE_COLUMNS}
FROM ho_so_nguoi_than h
WHERE h.benh_nhan_id = ? AND h.ho_so_nguoi_than_id = ?`;

// `dia_chi = NULL` và `trang_thai_hieu_luc = TRUE` cứng trong câu lệnh, KHÔNG là tham số: dù ai đó đưa thêm thuộc tính vào đối tượng
// cũng không ghi được địa chỉ hay tạo hồ sơ đã ngừng. Thứ tự tham số: benh_nhan_id, ho_ten, ngay_sinh, gioi_tinh, moi_quan_he, so_dien_thoai.
const INSERT_RELATIVE_SQL = `INSERT INTO ho_so_nguoi_than
  (benh_nhan_id, ho_ten, ngay_sinh, gioi_tinh, dia_chi, moi_quan_he, so_dien_thoai, trang_thai_hieu_luc)
VALUES (?, ?, ?, ?, NULL, ?, ?, TRUE)`;

// ĐÚNG năm cột (PLAN 5.3, TRACKING B4-D): `dia_chi`, `benh_nhan_id`, `trang_thai_hieu_luc` không bao giờ nằm trong SET. `benh_nhan_id = ?` (H3) và
// `trang_thai_hieu_luc = TRUE` (hồ sơ đã ngừng không sửa được, Q9) nằm TRONG câu lệnh nên một câu duy nhất vừa kiểm chủ sở hữu vừa kiểm hiệu lực.
// Thứ tự tham số: ho_ten, moi_quan_he, gioi_tinh, ngay_sinh, so_dien_thoai, ho_so_nguoi_than_id, benh_nhan_id.
const UPDATE_RELATIVE_SQL = `UPDATE ho_so_nguoi_than
SET ho_ten = ?, moi_quan_he = ?, gioi_tinh = ?, ngay_sinh = ?, so_dien_thoai = ?
WHERE ho_so_nguoi_than_id = ? AND benh_nhan_id = ? AND trang_thai_hieu_luc = TRUE`;

// Câu ĐỌC CÓ KHOÁ thứ nhất của ngừng sử dụng (task B5): khoá chung với `booking` (quy tắc 37). 0 hàng = tài khoản không có dòng `benh_nhan`.
const LOCK_PATIENT_SQL =
  'SELECT tai_khoan_id AS id FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE';

// Ngừng sử dụng: chỉ đặt MỘT cột. `benh_nhan_id = ?` (H3) và `trang_thai_hieu_luc = TRUE` nằm TRONG câu lệnh nên `affectedRows` là 1 khi và chỉ khi hồ sơ của
// người gọi đang hiệu lực. Thứ tự tham số: ho_so_nguoi_than_id, benh_nhan_id.
const DEACTIVATE_RELATIVE_SQL = `UPDATE ho_so_nguoi_than SET trang_thai_hieu_luc = FALSE
WHERE ho_so_nguoi_than_id = ? AND benh_nhan_id = ? AND trang_thai_hieu_luc = TRUE`;

// Chọn từng khoá một (không trải nguyên hàng) để cột thừa không bao giờ lọt ra ngoài
function toRelative(row: RelativeRow): RelativeResponse {
  return {
    hoSoNguoiThanId: row.hoSoNguoiThanId,
    hoTen: row.hoTen,
    moiQuanHe: row.moiQuanHe,
    gioiTinh: row.gioiTinh,
    ngaySinh: row.ngaySinh,
    soDienThoai: row.soDienThoai,
    trangThaiHieuLuc: Number(row.trangThaiHieuLuc) === 1,
  };
}

/**
 * Đọc/ghi bảng `ho_so_nguoi_than` (task B3; PLAN patient 5.3, 5.4). Mọi hàm nhận `em` để gọi trong giao dịch của service, và
 * `benhNhanId` là tham số BẮT BUỘC (không lấy từ token trong repository): B7 gọi `findRelatives` với id của bệnh nhân được tra cứu.
 */
@Injectable()
export class RelativesRepository {
  /** Mọi hồ sơ (cả hai trạng thái) của MỘT bệnh nhân: đang sử dụng trước, rồi id tăng dần. Chưa có ⇒ mảng rỗng. */
  async findRelatives(
    em: EntityManager,
    benhNhanId: string,
  ): Promise<RelativeResponse[]> {
    const rows = await em.query<RelativeRow[]>(FIND_RELATIVES_SQL, [
      benhNhanId,
    ]);
    return rows.map(toRelative);
  }

  /**
   * Một hồ sơ của `benhNhanId`; `null` nếu không có HOẶC thuộc người khác (không phân biệt hai trường hợp, H3).
   * Câu ĐỌC THƯỜNG: KHÔNG được gọi trong giao dịch ngừng sử dụng (B5) trước hai câu khoá `lockPatient`, `lockRelative` (bất biến ở `RelativesService.deactivate`).
   */
  async findRelativeById(
    em: EntityManager,
    benhNhanId: string,
    hoSoNguoiThanId: string,
  ): Promise<RelativeResponse | null> {
    const rows = await em.query<RelativeRow[]>(FIND_RELATIVE_BY_ID_SQL, [
      benhNhanId,
      hoSoNguoiThanId,
    ]);
    const row = rows[0];
    return row === undefined ? null : toRelative(row);
  }

  /**
   * Thêm MỘT hồ sơ hiệu lực, địa chỉ NULL; trả id vừa tạo dạng chuỗi. PHẢI gọi trong giao dịch: `LAST_INSERT_ID()` tính theo KẾT NỐI,
   * mà `dataSource.manager` có thể dùng kết nối khác cho mỗi lệnh. Không dùng `insertId` dạng số, `identifiers` của QueryBuilder hay
   * `repository.save`: id BIGINT vượt 2^53 bị mất chính xác hoặc sai chữ số (đã thử thật, TRACKING B3-D).
   * `benhNhanId` không có hàng cha ⇒ MySQL 1452 (khoá ngoại): service đổi thành 403.
   */
  async insertRelative(
    em: EntityManager,
    benhNhanId: string,
    input: NewRelative,
  ): Promise<string> {
    await em.query(INSERT_RELATIVE_SQL, [
      benhNhanId,
      input.hoTen,
      input.ngaySinh,
      input.gioiTinh,
      input.moiQuanHe,
      input.soDienThoai,
    ]);
    const rows = await em.query<{ id: string }[]>(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id',
    );
    // Luôn đúng một hàng; '0' (LAST_INSERT_ID khi không có gì được chèn) chỉ là chốt phòng thủ: đọc lại sẽ không thấy ⇒ service báo lỗi nội bộ
    return rows[0]?.id ?? '0';
  }

  /**
   * Sửa năm cột của MỘT hồ sơ ĐANG HIỆU LỰC của `benhNhanId`; trả số hàng KHỚP điều kiện (0 hoặc 1). 0 nghĩa là hồ sơ không có, không thuộc `benhNhanId`
   * hoặc đã ngừng: service đọc lại bằng `findRelativeById` để biết là 404 hay 409.
   * PHỤ THUỘC cờ kết nối `FOUND_ROWS` mà `mysql2` bật mặc định: `affectedRows` là số hàng KHỚP chứ không phải số hàng ĐỔI, nên PUT giống hệt dữ liệu cũ
   * (bảng không có cột "cập nhật lúc") vẫn trả 1, không thành 404 hay 409 oan. Đã đo thật (TRACKING B4-D); RUI-02 sẽ đỏ nếu cờ này bị tắt.
   * `hoSoNguoiThanId` PHẢI là chuỗi: id BIGINT lớn hơn 2^53 mà ép `Number` sẽ sửa nhầm hồ sơ khác (đã đo, TRACKING B4-F).
   */
  async updateRelative(
    em: EntityManager,
    benhNhanId: string,
    hoSoNguoiThanId: string,
    input: NewRelative,
  ): Promise<number> {
    const result: { affectedRows: number } = await em.query(
      UPDATE_RELATIVE_SQL,
      [
        input.hoTen,
        input.moiQuanHe,
        input.gioiTinh,
        input.ngaySinh,
        input.soDienThoai,
        hoSoNguoiThanId,
        benhNhanId,
      ],
    );
    return result.affectedRows;
  }

  /**
   * Ngừng sử dụng, câu 1 (ĐỌC CÓ KHOÁ): khoá hàng `benh_nhan` của người gọi; `false` nếu tài khoản không có dòng `benh_nhan`. PHẢI là câu đầu tiên của giao dịch
   * (xem bất biến ở `RelativesService.deactivate`). `benhNhanId` là tham số bắt buộc, không lấy từ token ở đây.
   */
  async lockPatient(em: EntityManager, benhNhanId: string): Promise<boolean> {
    const rows = await em.query<{ id: string }[]>(LOCK_PATIENT_SQL, [
      benhNhanId,
    ]);
    return rows.length > 0;
  }

  /**
   * Ngừng sử dụng, câu 2 (ĐỌC CÓ KHOÁ): khoá hàng hồ sơ của `benhNhanId` và đọc trạng thái DƯỚI khoá. `'missing'` cho cả "không có" lẫn "của người khác" (H3).
   * Dùng đúng `lockVisitProfile` của `appointments/` để "hồ sơ dùng được" chỉ có MỘT định nghĩa, chung với `booking`. Chỉ gọi sau `lockPatient`.
   */
  lockRelative(
    em: EntityManager,
    benhNhanId: string,
    hoSoNguoiThanId: string,
  ): Promise<VisitProfileState> {
    return lockVisitProfile(em, benhNhanId, hoSoNguoiThanId);
  }

  /**
   * Ngừng sử dụng, câu 3 (ĐỌC THƯỜNG): lịch hẹn đang chặn của đúng hồ sơ người thân đó, sắp theo thời gian. Bọc mỏng `findActiveAppointments` để service giả được repository.
   * Đây phải là câu `SELECT` thường ĐẦU TIÊN của giao dịch, nằm SAU `lockPatient` và `lockRelative`: không bao giờ gọi trước hai câu khoá.
   */
  findBlockingAppointments(
    em: EntityManager,
    benhNhanId: string,
    hoSoNguoiThanId: string,
  ): Promise<ActiveAppointment[]> {
    return findActiveAppointments(em, benhNhanId, hoSoNguoiThanId);
  }

  /**
   * Ngừng sử dụng, câu 5 (GHI): đặt `trang_thai_hieu_luc = FALSE` cho MỘT hồ sơ ĐANG HIỆU LỰC của `benhNhanId`; trả số hàng KHỚP (phụ thuộc cờ `FOUND_ROWS` như `updateRelative`).
   * Sau hai câu khoá, kết quả phải là 1. Không đụng cột nào khác và không đụng `lich_hen`. `hoSoNguoiThanId` PHẢI là chuỗi (id BIGINT lớn hơn 2^53).
   */
  async deactivateRelative(
    em: EntityManager,
    benhNhanId: string,
    hoSoNguoiThanId: string,
  ): Promise<number> {
    const result: { affectedRows: number } = await em.query(
      DEACTIVATE_RELATIVE_SQL,
      [hoSoNguoiThanId, benhNhanId],
    );
    return result.affectedRows;
  }
}
