import type { EntityManager } from 'typeorm';

/** Tình trạng một hồ sơ đi khám đối với người gọi: không có (hoặc của người khác), đã ngừng, hoặc đang dùng được. */
export type VisitProfileState = 'missing' | 'inactive' | 'active';

// `benh_nhan_id = ?` nằm TRONG câu SQL (H3): hồ sơ của người khác không bao giờ được đọc, kể cả khi biết id. `FOR UPDATE`: câu ĐỌC CÓ KHOÁ,
// giữ khoá hàng hồ sơ tới hết giao dịch của người gọi và đọc trạng thái mới nhất (không phải ảnh chụp cũ).
const LOCK_VISIT_PROFILE_SQL = `SELECT trang_thai_hieu_luc AS trangThaiHieuLuc
FROM ho_so_nguoi_than
WHERE ho_so_nguoi_than_id = ? AND benh_nhan_id = ?
FOR UPDATE`;

/**
 * Khoá hàng hồ sơ người thân và đọc trạng thái của nó DƯỚI khoá (PLAN patient 5.3, Q13 = B). `hoSoNguoiThanId = null` là hồ sơ BẢN THÂN: luôn dùng được,
 * không truy vấn (sự tồn tại của `benh_nhan` do người gọi tự khoá). `hoSoNguoiThanId` PHẢI là chuỗi: id BIGINT lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm hồ sơ khác.
 *
 * HỢP ĐỒNG KHOÁ giữa ngừng sử dụng hồ sơ (patient B5) và đặt lịch (`booking`), cùng MỘT thứ tự để không deadlock:
 *   1. `SELECT … FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE` (nếu cần khoá cả `tai_khoan` thì khoá `tai_khoan` TRƯỚC `benh_nhan`);
 *   2. `lockVisitProfile(em, benhNhanId, hoSoNguoiThanId)`: kiểm `'active'` DƯỚI khoá, khác thì từ chối đặt lịch;
 *   3. đếm lịch hẹn bằng `findActiveAppointments` và chèn `lich_hen`.
 * Gọi hàm này TRONG giao dịch của người gọi, sau khi đã khoá `benh_nhan`. PLAN `booking` phải xác nhận hợp đồng này trước khi làm X3.
 */
export async function lockVisitProfile(
  em: EntityManager,
  benhNhanId: string,
  hoSoNguoiThanId: string | null,
): Promise<VisitProfileState> {
  if (hoSoNguoiThanId === null) return 'active';
  const rows = await em.query<{ trangThaiHieuLuc: number }[]>(
    LOCK_VISIT_PROFILE_SQL,
    [hoSoNguoiThanId, benhNhanId],
  );
  const row = rows[0];
  if (row === undefined) return 'missing';
  // `tinyint` của MySQL ra số 1 hoặc 0 (không phải boolean)
  return Number(row.trangThaiHieuLuc) === 1 ? 'active' : 'inactive';
}

// Cùng điều kiện với câu khoá ở trên (phạm vi chủ sở hữu nằm TRONG SQL, H3) nhưng KHÔNG `FOR UPDATE`: cho `POST /booking/checks` (B7), chỉ ĐỌC trong một giao dịch `READ ONLY`.
const READ_VISIT_PROFILE_SQL = `SELECT trang_thai_hieu_luc AS trangThaiHieuLuc
FROM ho_so_nguoi_than
WHERE ho_so_nguoi_than_id = ? AND benh_nhan_id = ?`;

/**
 * Như `lockVisitProfile` nhưng ĐỌC THƯỜNG, không khoá hàng nào (task B7, câu (c)): kết quả chỉ để thông tin, quyết định thật ở bước tạo dưới khoá (B8 vẫn dùng
 * `lockVisitProfile`). Hồ sơ của người khác và id không tồn tại cho CÙNG `'missing'` (người gọi đổi thành cùng một 404, QB-01); `hoSoNguoiThanId = null` là bản thân,
 * luôn `'active'`, không truy vấn. `hoSoNguoiThanId` PHẢI là chuỗi (id BIGINT lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm hồ sơ khác).
 */
export async function readVisitProfile(
  em: EntityManager,
  benhNhanId: string,
  hoSoNguoiThanId: string | null,
): Promise<VisitProfileState> {
  if (hoSoNguoiThanId === null) return 'active';
  const rows = await em.query<{ trangThaiHieuLuc: number | string }[]>(
    READ_VISIT_PROFILE_SQL,
    [hoSoNguoiThanId, benhNhanId],
  );
  const row = rows[0];
  if (row === undefined) return 'missing';
  // `tinyint` của MySQL ra số 1 hoặc 0 (không phải boolean)
  return Number(row.trangThaiHieuLuc) === 1 ? 'active' : 'inactive';
}

/** Hồ sơ đi khám có dùng được để đặt lịch mới không: `true` chỉ khi hồ sơ của chính `benhNhanId` và đang hiệu lực (NT-18). Cùng hợp đồng khoá ở trên. */
export async function isVisitProfileUsable(
  em: EntityManager,
  benhNhanId: string,
  hoSoNguoiThanId: string | null,
): Promise<boolean> {
  return (await lockVisitProfile(em, benhNhanId, hoSoNguoiThanId)) === 'active';
}
