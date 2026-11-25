// Danh mục mã sự kiện thông báo (notification B1; PLAN notification 5.3; Q5).
//
// Đây là SỔ CHỈ ĐỌC: module nào ghi `thong_bao` thì vẫn tự ghi bằng hằng mã của mình (booking, doctor, doctor-exam, payment, wallet, admin).
// Danh mục chỉ cho Trung tâm thông báo (B2) biết mỗi `loai_su_kien` hiển thị tiêu đề gì, thuộc nhóm nào, liên kết tới đâu.
// Test đối chiếu (`notification-catalog.spec.ts`) bắt danh mục thiếu hay thừa mã so với hằng của các module đó.
//
// Chiều phụ thuộc (HTB-07): file này KHÔNG import module khác lúc chạy. Hằng của module khác chỉ được import ở file spec.

/** Bốn loại tài khoản (giống `LOAI_TAI_KHOAN` của auth; spec so hai tập để không lệch). */
export type VaiTro = 'BenhNhan' | 'BacSi' | 'LeTan' | 'QuanTriVien';

export type NhomSuKien = 'LichHen' | 'DoiLich' | 'NghiPhep' | 'Vi' | 'ChiNhanh';

/** Kiểu liên kết trung tính: web tự đổi sang đường dẫn theo vai trò. `null` = không có liên kết. */
export type KieuLienKet =
  'LichHen' | 'Vi' | 'NghiPhep' | 'ThayDoiChiNhanh' | null;

export interface CatalogEntry {
  /** Phần gốc của `loai_su_kien` (không kèm hậu tố `:v{n}`). */
  ma: string;
  /** true nếu nơi ghi gắn thêm `:v{n}` (admin C4). */
  coPhienBan: boolean;
  nhom: NhomSuKien;
  /** ≤ 60 ký tự, hiển thị ở danh sách và chi tiết. Không lưu DB nên đổi ở đây là đổi luôn cho dòng cũ (R8). */
  tieuDe: string;
  /** Vai trò nhận (dùng cho test DMS-08; API không lọc theo cột này). */
  nguoiNhan: readonly VaiTro[];
  /** Có dòng `email_thong_bao` không. Phải khớp `MAIL_EVENTS` của worker thư (DMS-04). */
  coThu: boolean;
  lienKet: KieuLienKet;
  /** Module và notifier ghi mã này (chỉ để người đọc tra). */
  nguon: string;
  /** `ChoModule`: đã khai mã nhưng nơi ghi chưa có trong mã. */
  trangThai: 'CoMa' | 'ChoModule';
}

/** Độ dài tối đa của `thong_bao.noi_dung` (cột `varchar(500)`). Các module ghi đều có hằng 500 riêng; DMS-07 so chúng với số này. */
export const NOTIFICATION_CONTENT_MAX = 500;
/** Độ dài tối đa của `thong_bao.loai_su_kien` (cột `varchar(100)`), tính cả hậu tố `:v{n}`. */
export const EVENT_CODE_MAX = 100;
/** Độ dài tối đa của tiêu đề hiển thị. */
export const TITLE_MAX = 60;
/** Tiêu đề dùng khi gặp mã không có trong danh mục (dữ liệu cũ hay mã lạ): không ném lỗi 500 (TTB-11). */
export const DEFAULT_TITLE = 'Thông báo';

// Lưu ý về cột `coThu` (theo đúng worker thư hiện hành):
//  - `LichHenHoanThanh` có thư từ notification B4.
//  - ba mã nghỉ phép gửi Bác sĩ `NghiPhepDaGui`, `NghiPhepDaDuyet`, `NghiPhepTuChoi` có thư từ notification B5; `NghiPhepChoDuyet` (gửi Quản trị viên) không thư.
// Cột này phải khớp `MAIL_EVENTS` của worker (DMS-04): bật mà worker chưa xử lý, hay ngược lại, đều làm DMS-04 đỏ.
export const NOTIFICATION_CATALOG: readonly CatalogEntry[] = [
  // Lịch hẹn (booking, doctor-exam)
  {
    ma: 'LichHenDaXacNhan',
    coPhienBan: false,
    nhom: 'LichHen',
    tieuDe: 'Đặt lịch thành công',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'LichHen',
    nguon: 'booking BookingNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'LichHenDaHuy',
    coPhienBan: false,
    nhom: 'LichHen',
    tieuDe: 'Lịch hẹn đã huỷ',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'LichHen',
    nguon: 'booking BookingNotifier (kể cả huỷ do nghỉ phép)',
    trangThai: 'CoMa',
  },
  {
    ma: 'LichHenVangMat',
    coPhienBan: false,
    nhom: 'LichHen',
    tieuDe: 'Ghi nhận vắng mặt',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'LichHen',
    nguon: 'booking BookingNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'KhoaDatLichNoShow',
    coPhienBan: false,
    nhom: 'LichHen',
    tieuDe: 'Hạn chế đặt lịch',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'LichHen',
    nguon: 'booking BookingNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'LichHenHoanThanh',
    coPhienBan: false,
    nhom: 'LichHen',
    tieuDe: 'Đã hoàn thành lịch khám',
    nguoiNhan: ['BenhNhan'],
    coThu: true, // notification B4
    lienKet: 'LichHen',
    nguon: 'doctor-exam ExamNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'LichHenDaTiepDon',
    coPhienBan: false,
    nhom: 'LichHen',
    tieuDe: 'Bệnh nhân đã được tiếp đón',
    nguoiNhan: ['BacSi'],
    coThu: false,
    lienKet: 'LichHen',
    nguon: 'booking checkIn (notification B6)',
    trangThai: 'CoMa',
  },

  // Đổi lịch (reschedule B3)
  {
    ma: 'LichHenDaDoiLich',
    coPhienBan: false,
    nhom: 'DoiLich',
    tieuDe: 'Lịch hẹn đã đổi',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'LichHen',
    nguon: 'booking reschedule-notify',
    trangThai: 'CoMa',
  },
  {
    ma: 'YeuCauDoiLichDangCho',
    coPhienBan: false,
    nhom: 'DoiLich',
    tieuDe: 'Yêu cầu đổi lịch đang chờ duyệt',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: null,
    nguon: 'booking reschedule-notify',
    trangThai: 'CoMa',
  },
  {
    ma: 'YeuCauDoiLichDaDuyet',
    coPhienBan: false,
    nhom: 'DoiLich',
    tieuDe: 'Yêu cầu đổi lịch được duyệt',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: null,
    nguon: 'booking reschedule-notify',
    trangThai: 'CoMa',
  },
  {
    ma: 'YeuCauDoiLichBiTuChoi',
    coPhienBan: false,
    nhom: 'DoiLich',
    tieuDe: 'Yêu cầu đổi lịch bị từ chối',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: null,
    nguon: 'booking reschedule-notify',
    trangThai: 'CoMa',
  },

  // Nghỉ phép (doctor LeaveNotifier)
  {
    ma: 'NghiPhepDaGui',
    coPhienBan: false,
    nhom: 'NghiPhep',
    tieuDe: 'Đã gửi yêu cầu nghỉ phép',
    nguoiNhan: ['BacSi'],
    coThu: true, // notification B5
    lienKet: 'NghiPhep',
    nguon: 'doctor LeaveNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'NghiPhepChoDuyet',
    coPhienBan: false,
    nhom: 'NghiPhep',
    tieuDe: 'Có yêu cầu nghỉ phép mới',
    nguoiNhan: ['QuanTriVien'],
    coThu: false,
    lienKet: 'NghiPhep',
    nguon: 'doctor LeaveNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'NghiPhepDaDuyet',
    coPhienBan: false,
    nhom: 'NghiPhep',
    tieuDe: 'Yêu cầu nghỉ phép được duyệt',
    nguoiNhan: ['BacSi'],
    coThu: true, // notification B5
    lienKet: 'NghiPhep',
    nguon: 'doctor LeaveNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'NghiPhepTuChoi',
    coPhienBan: false,
    nhom: 'NghiPhep',
    tieuDe: 'Yêu cầu nghỉ phép bị từ chối',
    nguoiNhan: ['BacSi'],
    coThu: true, // notification B5
    lienKet: 'NghiPhep',
    nguon: 'doctor LeaveNotifier',
    trangThai: 'CoMa',
  },

  // Ví: nạp ví (payment), rút tiền và hoàn tiền (wallet)
  {
    ma: 'NapViThanhCong',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Nạp ví thành công',
    nguoiNhan: ['BenhNhan'],
    coThu: false,
    lienKet: 'Vi',
    nguon: 'payment TopupNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'NapViThatBai',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Nạp ví thất bại',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'Vi',
    nguon: 'payment TopupNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'NapViDaDoiSoat',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Nạp ví đã được cộng',
    nguoiNhan: ['BenhNhan'],
    coThu: false,
    lienKet: 'Vi',
    nguon: 'payment TopupNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'NapViCanXuLy',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Có giao dịch nạp ví cần xử lý',
    nguoiNhan: ['QuanTriVien'],
    coThu: false,
    lienKet: 'Vi',
    nguon: 'payment TopupNotifier (Quản trị viên Toàn hệ thống)',
    trangThai: 'CoMa',
  },
  {
    ma: 'NapViChuaXuLyDuoc',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Nạp ví chưa xử lý được',
    nguoiNhan: ['BenhNhan'],
    coThu: false,
    lienKet: 'Vi',
    nguon: 'payment TopupNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'RutTienDaGui',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Đã gửi yêu cầu rút tiền',
    nguoiNhan: ['BenhNhan'],
    coThu: false,
    lienKet: 'Vi',
    nguon: 'wallet WithdrawalNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'RutTienDuocDuyet',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Yêu cầu rút tiền được duyệt',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'Vi',
    nguon: 'wallet WithdrawalNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'RutTienBiTuChoi',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Yêu cầu rút tiền bị từ chối',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'Vi',
    nguon: 'wallet WithdrawalNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'HoanCocThanhCong',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Đã hoàn tiền cọc',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'LichHen',
    nguon: 'wallet RefundNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'HoanCocCanXuLy',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Có khoản hoàn cọc cần xử lý',
    nguoiNhan: ['QuanTriVien'],
    coThu: false,
    lienKet: 'Vi',
    nguon: 'wallet RefundNotifier (Quản trị viên Toàn hệ thống)',
    trangThai: 'CoMa',
  },
  {
    ma: 'HoanTienDacBiet',
    coPhienBan: false,
    nhom: 'Vi',
    tieuDe: 'Hoàn tiền đặc biệt',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'LichHen',
    nguon: 'wallet hoàn tiền đặc biệt',
    trangThai: 'CoMa',
  },

  // Yêu cầu thay đổi chi nhánh (admin BranchChangeNotifier)
  {
    ma: 'KetQuaYeuCauThayDoiChiNhanh',
    coPhienBan: false,
    nhom: 'ChiNhanh',
    tieuDe: 'Kết quả yêu cầu thay đổi chi nhánh',
    nguoiNhan: ['QuanTriVien'],
    coThu: true,
    lienKet: 'ThayDoiChiNhanh',
    nguon: 'admin BranchChangeNotifier (người đề xuất)',
    trangThai: 'CoMa',
  },
  {
    ma: 'ThayDoiChiNhanhAnhHuongLichHen',
    coPhienBan: true,
    nhom: 'ChiNhanh',
    tieuDe: 'Chi nhánh thay đổi, ảnh hưởng lịch hẹn',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'ThayDoiChiNhanh',
    nguon: 'admin BranchChangeNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'HuyThayDoiChiNhanh',
    coPhienBan: false,
    nhom: 'ChiNhanh',
    tieuDe: 'Thay đổi chi nhánh đã bị huỷ',
    nguoiNhan: ['BenhNhan', 'QuanTriVien'],
    coThu: true,
    lienKet: 'ThayDoiChiNhanh',
    nguon: 'admin BranchChangeNotifier (bệnh nhân đã được báo, người đề xuất)',
    trangThai: 'CoMa',
  },
  {
    ma: 'DoiHieuLucThayDoiChiNhanh',
    coPhienBan: true,
    nhom: 'ChiNhanh',
    tieuDe: 'Thay đổi chi nhánh dời ngày hiệu lực',
    nguoiNhan: ['BenhNhan'],
    coThu: true,
    lienKet: 'ThayDoiChiNhanh',
    nguon: 'admin BranchChangeNotifier',
    trangThai: 'CoMa',
  },
  {
    ma: 'KetQuaDoiHieuLucThayDoiChiNhanh',
    coPhienBan: true,
    nhom: 'ChiNhanh',
    tieuDe: 'Đã dời hiệu lực thay đổi chi nhánh',
    nguoiNhan: ['QuanTriVien'],
    coThu: false,
    lienKet: 'ThayDoiChiNhanh',
    nguon: 'admin BranchChangeNotifier (người đề xuất)',
    trangThai: 'CoMa',
  },
  {
    ma: 'YeuCauThayDoiChiNhanhQuaHan',
    coPhienBan: true,
    nhom: 'ChiNhanh',
    tieuDe: 'Yêu cầu thay đổi chi nhánh quá hạn',
    nguoiNhan: ['QuanTriVien'],
    coThu: false,
    lienKet: 'ThayDoiChiNhanh',
    nguon: 'admin BranchChangeNotifier (Toàn hệ thống, người đề xuất)',
    trangThai: 'CoMa',
  },
  {
    ma: 'RutThayDoiChiNhanh',
    coPhienBan: false,
    nhom: 'ChiNhanh',
    tieuDe: 'Yêu cầu thay đổi chi nhánh đã được rút',
    nguoiNhan: ['QuanTriVien'],
    coThu: false,
    lienKet: 'ThayDoiChiNhanh',
    nguon: 'admin BranchChangeNotifier (Toàn hệ thống)',
    trangThai: 'CoMa',
  },
];

/**
 * Sự kiện ĐÃ biết là sẽ có nhưng module chưa làm nên CHƯA có mã: KHÔNG phải mục của danh mục (L6, DMS-13).
 * Khi module đó thêm hằng `*_EVENTS` mới, test DMS-13 đỏ để nhắc khai mã vào `NOTIFICATION_CATALOG`.
 */
export const CHO_MODULE: readonly { suKien: string; module: string }[] = [
  {
    suKien: 'Lời mời từ danh sách chờ (2.4.68, 2.4.75)',
    module: 'waitlist',
  },
  {
    suKien: 'Kết quả danh sách chờ (2.4.68, 2.4.75)',
    module: 'waitlist',
  },
  {
    suKien: 'Tin nhắn mới (2.4.20, 2.4.21, 2.4.29)',
    module: 'chat',
  },
  {
    suKien: 'Thanh toán cọc thất bại (L5, chỉ khi nhóm muốn)',
    module: 'payment',
  },
];

const CATALOG_BY_CODE = new Map(
  NOTIFICATION_CATALOG.map((entry) => [entry.ma, entry]),
);

/** Phần gốc của mã: bỏ hậu tố `:v{n}`. Cùng cách với `baseEventOf` của worker thư (DMS-06 so hai hàm). */
export function baseCodeOf(loaiSuKien: string): string {
  return loaiSuKien.split(':', 1)[0] ?? loaiSuKien;
}

/** Tra mục danh mục theo `loai_su_kien` đã lưu (có thể kèm `:v{n}`). Mã lạ trả `null`: người gọi dùng `DEFAULT_TITLE`, không liên kết. */
export function findCatalogEntry(loaiSuKien: string): CatalogEntry | null {
  return CATALOG_BY_CODE.get(baseCodeOf(loaiSuKien)) ?? null;
}
