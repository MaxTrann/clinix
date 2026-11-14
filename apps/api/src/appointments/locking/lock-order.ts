// Thứ tự khoá TOÀN CỤC của module `booking` (PLAN booking 5.3; TRACKING 3.3 P1-F). Mọi luồng GHI chỉ được xin khoá THEO CHIỀU này (từ ngoài vào
// trong), được bỏ qua tầng không cần; một thứ tự chung thì không có chu trình chờ nên không deadlock chéo giữa các luồng (H2).
//
//   Tầng  Bảng (chế độ khoá)                                  Luồng xin
//   1     tai_khoan                                           (booking không xin; auth/admin xin TRƯỚC benh_nhan)
//   2     benh_nhan        FOR UPDATE                         tạo lịch hẹn; Vắng mặt (cộng no-show)
//   3     ho_so_nguoi_than FOR UPDATE                         tạo lịch hẹn của hồ sơ người thân (`lockVisitProfile`)
//   4     bac_si           FOR SHARE (booking tạo lịch);      doctor (phân công, gỡ ca, tạo yêu cầu nghỉ, duyệt nghỉ) và admin (đổi chi nhánh
//                          FOR UPDATE (doctor, admin)         bác sĩ) xin FOR UPDATE
//   4b    dich_vu_kham     FOR SHARE                          CHỈ doctor (phân công, ngay sau `bac_si`); booking KHÔNG xin khoá nào trên bảng này
//   5     khung_gio        FOR UPDATE                         tạo, huỷ, hết hạn, xác nhận thanh toán
//   6     lich_hen         FOR UPDATE theo khoá chính         mọi luồng đổi trạng thái (xem quy tắc 7)
//         (lich_hen_id) hoặc ma_lich_hen
//   6b    ho_so_kham,      FOR UPDATE theo khoá chính         CHỈ doctor (phần khám bệnh: ghi hồ sơ khám, ẩn đánh giá), SAU `lich_hen` và TRƯỚC tầng 7;
//         danh_gia_bac_si  hoặc `lich_hen_id` (UNIQUE)        booking KHÔNG xin khoá nào trên hai bảng này (doctor-exam P2; PLAN doctor-exam 5.3)
//   7     giao_dich_thanh_toan → vi_noi_bo → bảng chỉ-thêm    payment, wallet, thông báo, audit; SAU `lich_hen` (payment khoá `lich_hen` TRƯỚC `vi_noi_bo`)
//         (lich_su_hoan_tien, giao_dich_vi, thong_bao, nhat_ky_hanh_dong)
//
// Quy tắc áp dụng (PLAN 5.3):
//  1. Luồng chỉ biết `lich_hen` (huỷ, hết hạn, xác nhận, tiếp đón, Vắng mặt) ĐỌC THƯỜNG một lần để lấy `lich_hen_id`, `khung_gio_id`, `benh_nhan_id` (cả ba
//     bất biến sau khi chèn), rồi khoá theo thứ tự trên, rồi KIỂM LẠI trạng thái, sở hữu, điều kiện dưới khoá.
//  2. Kiểm quyền hay phạm vi (404) làm ở lần đọc thường VÀ kiểm lại dưới khoá.
//  3. Mọi giao dịch ghi mở READ COMMITTED (`withBookingTransaction`; không khoá khoảng chỉ mục).
//  4. Luồng trả KẾT QUẢ CÓ KIỂU thay vì ném `AppException` trong giao dịch; chỉ ném sau commit (nếp `LoginService`, A8).
//  5. Thử lại 1213/1205 CHỈ trước commit (`withBookingTransaction`); tác dụng phụ (hoàn tiền, mời danh sách chờ, gửi thư) chạy SAU commit, đúng một lần.
//  6. Job quét theo lô, MỘT giao dịch riêng cho mỗi lịch hẹn, không khoá nhiều lịch cùng lúc.
//  7. Khoá `lich_hen` CHỈ bằng `lich_hen_id` hoặc `ma_lich_hen` (UNIQUE), KHÔNG BAO GIỜ bằng `WHERE khung_gio_id = ? FOR UPDATE` (cũng không bằng
//     `khung_gio_dang_giu`): đó là chỉ mục phụ của khoá ngoại. Số đo thật doctor X1, M12 (09/11/2026): `cancel` khoá `lich_hen` qua `khung_gio_id` thì
//     DEADLOCK 1213, nạn nhân là `cancel`, với `DELETE khung_gio` của gỡ ca (cả hai cùng đụng chỉ mục `lich_hen.khung_gio_id` và hàng `khung_gio`); khoá theo
//     khoá chính hoặc theo `ma_lich_hen` thì không có chu trình. Thứ tự chung của booking và doctor: `khung_gio` TRƯỚC, `lich_hen` SAU (tầng 5 rồi 6).
//     Test kiến trúc AR-05 (appointments/architecture.spec.ts) quét mã nguồn theo hai hằng bên dưới.
//
// HỢP ĐỒNG KHOÁ VỚI `patient` (tầng 2 và 3; patient B5, Q13; TECH_DEBT dòng 75): luồng TẠO lịch hẹn khoá `benh_nhan`, rồi `lockVisitProfile` (kiểm
// `trang_thai_hieu_luc` DƯỚI khoá), rồi mới đếm bằng `findActiveAppointments` và chèn `lich_hen`; KHÔNG câu đọc thường nào của giao dịch chạy trước hai
// câu khoá đó. Giao dịch ngừng sử dụng hồ sơ (patient) không bao giờ xin `bac_si` hay `khung_gio` nên không có chu trình chờ với luồng tạo.
// Lưu ý: `ACTIVE_APPOINTMENT_STATES` (3 trạng thái) khác tập của cột sinh `khung_gio_dang_giu` (5 trạng thái) CÓ CHỦ ĐÍCH (5.2): đừng "sửa cho khớp".

export type LockTierId = '1' | '2' | '3' | '4' | '4b' | '5' | '6' | '6b' | '7';

/** Một HẠNG khoá: các bảng cùng hạng không có thứ tự bắt buộc với nhau; hạng nhỏ khoá trước. Tầng 7 gồm ba hạng liền nhau (đúng chữ của bảng 5.3). */
export interface LockRank {
  tang: LockTierId;
  bang: readonly string[];
}

export const LOCK_ORDER: readonly LockRank[] = [
  { tang: '1', bang: ['tai_khoan'] },
  { tang: '2', bang: ['benh_nhan'] },
  { tang: '3', bang: ['ho_so_nguoi_than'] },
  { tang: '4', bang: ['bac_si'] },
  { tang: '4b', bang: ['dich_vu_kham'] },
  { tang: '5', bang: ['khung_gio'] },
  { tang: '6', bang: ['lich_hen'] },
  // Hai bảng con của `lich_hen` (khoá ngoại): hàng con khoá SAU hàng cha, TRƯỚC thông báo và nhật ký ở tầng 7. Cùng một hạng: không luồng nào xin cả hai.
  { tang: '6b', bang: ['ho_so_kham', 'danh_gia_bac_si'] },
  { tang: '7', bang: ['giao_dich_thanh_toan'] },
  { tang: '7', bang: ['vi_noi_bo'] },
  {
    tang: '7',
    bang: [
      'lich_su_hoan_tien',
      'giao_dich_vi',
      'thong_bao',
      'nhat_ky_hanh_dong',
    ],
  },
];

/** Quy tắc 7: hai khoá DUY NHẤT được dùng để khoá `lich_hen`. */
export const LICH_HEN_LOCK_KEYS = ['lich_hen_id', 'ma_lich_hen'] as const;

/** Quy tắc 7: cột mà câu khoá `lich_hen` KHÔNG được dùng làm điều kiện (chỉ mục phụ của khoá ngoại, doctor M12). */
export const LICH_HEN_FORBIDDEN_LOCK_COLUMNS = [
  'khung_gio_id',
  'khung_gio_dang_giu',
] as const;

/** Vi phạm đầu tiên của một chuỗi khoá: bảng `sau` bị xin SAU bảng `truoc` nhưng thuộc hạng nhỏ hơn. */
export interface LockOrderViolation {
  /** Vị trí của bước vi phạm trong chuỗi */
  index: number;
  /** Bảng đã xin trước đó, thuộc hạng lớn hơn */
  truoc: string;
  sau: string;
}

const RANK_OF: ReadonlyMap<string, number> = new Map(
  LOCK_ORDER.flatMap((rank, index) =>
    rank.bang.map((table): [string, number] => [table, index]),
  ),
);

/**
 * Kiểm một chuỗi tên bảng theo THỨ TỰ bị khoá (ví dụ ghi lại từ test KT-03, DT) có đi ngược bảng trên không. Lặp lại cùng một bảng hay xin các bảng cùng hạng
 * thì không phải vi phạm. Bảng NGOÀI bảng thứ tự (ví dụ `chi_nhanh`) bị bỏ qua: không có thứ tự nào để vi phạm. Trả vi phạm đầu tiên, hoặc `null`.
 */
export function findLockOrderViolation(
  steps: readonly string[],
): LockOrderViolation | null {
  let highest: { rank: number; table: string } | null = null;
  for (const [index, table] of steps.entries()) {
    const rank = RANK_OF.get(table);
    if (rank === undefined) continue;
    if (highest !== null && rank < highest.rank)
      return { index, truoc: highest.table, sau: table };
    if (highest === null || rank > highest.rank) highest = { rank, table };
  }
  return null;
}
