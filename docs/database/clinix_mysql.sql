-- ============================================================================
-- CLINIX - Database (MySQL 8.0.16+) - bản 2
-- Sinh từ clinix_v2.dbml (38 bảng, 23 enum) rồi bổ sung CHECK, cột sinh, charset.
-- Cần MySQL >= 8.0.16 để CHECK thật sự được thực thi (bản cũ chỉ phân tích cú pháp).
-- ============================================================================
-- QUY TẮC DO DATABASE BẢO VỆ (CHECK / UNIQUE / cột sinh)
--   * Mỗi khung giờ chỉ có 1 lịch hẹn còn hiệu lực  [lich_hen.khung_gio_dang_giu]
--   * Mỗi khung giờ chỉ có 1 người đang được mời từ danh sách chờ  [muc_cho_danh_sach_cho.khung_gio_dang_moi]
--   * Trạng thái DaMoi thì phải có khung giờ được mời  [chk_muc_cho_da_moi]
--   * 1 lịch cũ chỉ sinh tối đa 1 lịch mới khi đổi lịch; lịch không tự trỏ chính nó  [lich_hen.lich_hen_truoc_id UNIQUE + chk_lich_hen_truoc]
--   * Quản trị viên: phạm vi Chi nhánh phải có chi_nhanh_id, Toàn hệ thống thì không  [chk_qtv_pham_vi]
--   * Tỷ lệ hoàn tiền từ 0 đến 100  [chk_moc_hoan_ty_le]
--   * Nghỉ phép: CaNgay (không có ca, được nghỉ nhiều ngày) hoặc TheoCa (bắt buộc có ca, chỉ 1 ngày)  [chk_nghi_phep_hinh_thuc]
--   * Yêu cầu đổi lịch đã xử lý (khác ChoDuyet) phải có ghi chú xử lý  [chk_doi_lich_xu_ly]
--   * Yêu cầu nghỉ phép, đổi lịch ngoài chính sách, rút tiền: ChoDuyet thì chưa có người và thời điểm xử lý; DaDuyet hoặc TuChoi thì phải có cả hai  [chk_nghi_phep_xu_ly, chk_doi_lich_nguoi_xu_ly, chk_rut_tien_xu_ly]
--   * Ví: số dư >= 0, tiền đang giữ >= 0 và không vượt số dư  [chk_vi_so_du]
--   * Giao dịch thanh toán: NapVi không gắn lịch hẹn, ThanhToanLichHen bắt buộc gắn lịch hẹn  [chk_gd_thanh_toan_loai]
--   * Sổ cái ví: mỗi dòng tham chiếu đúng 1 nguồn theo loại (Nap/ThanhToan, HoanTien, Rut)  [chk_gd_vi_tham_chieu]
--   * Sổ cái ví: Nap/HoanTien là số dương, ThanhToan/Rut là số âm [đề xuất]  [chk_gd_vi_dau_so_tien]
--   * Đánh giá: 1 đến 5 sao; ẩn đánh giá thì bắt buộc có lý do, không ẩn thì không có lý do  [chk_danh_gia_so_sao, chk_danh_gia_an]
--   * Mỗi lịch hẹn có tối đa 1 đánh giá, 1 hồ sơ khám  [danh_gia_bac_si.lich_hen_id, ho_so_kham.lich_hen_id]
--   * Hội thoại với Lễ tân phải có chi nhánh, hội thoại với Bác sĩ thì không  [chk_hoi_thoai_chi_nhanh]
--   * Bảng cấu hình hệ thống và thông tin phòng khám chỉ có đúng 1 dòng (id = 1)  [chk_cau_hinh_mot_dong, chk_phong_kham_mot_dong]
--   * Không trùng khung giờ trong 1 lịch làm việc; không trùng lịch làm việc (bác sĩ, ngày, ca)  [khung_gio, lich_lam_viec]
--   * Không trùng mã giao dịch cổng thanh toán trong cùng phương thức (chống xử lý lặp)  [giao_dich_thanh_toan (phuong_thuc, ma_giao_dich_cong)]
--
-- QUY TẮC DO TẦNG ỨNG DỤNG (SERVICE) BẢO VỆ - database không tự kiểm tra
--   * Cặp (chi nhánh, dịch vụ) của bác sĩ và của lịch hẹn phải có trong chi_nhanh_dich_vu_kham
--   * Đổi lịch: tạo lịch mới, đổi lịch cũ sang DaDoiLich trong CÙNG 1 giao dịch; chỉ cho đổi khi lịch cũ ở DaXacNhan [đề xuất, chưa xác nhận]
--   * Lịch mới do đổi lịch sao chép gia_snapshot, tien_coc_snapshot, chinh_sach_hoan_snapshot từ lịch trước
--   * Tài chính sau đổi lịch: không tạo giao dịch thanh toán mới; lần theo lich_hen_truoc_id về lịch gốc để tìm giao dịch (xem truy vấn mẫu cuối file)
--   * Hồ sơ người thân của lịch hẹn phải thuộc đúng bệnh nhân đặt lịch
--   * lich_hen.bac_si_id, chi_nhanh_id, thoi_gian khớp với khung giờ (dữ liệu snapshot)
--   * loai_tai_khoan của tai_khoan khớp đúng 1 bảng con (benh_nhan / bac_si / le_tan / quan_tri_vien)
--   * Chỉ cho đánh giá khi lịch hẹn ở trạng thái HoanThanh
--   * Hoàn thành ca khám cần ít nhất 1 ghi chú khám không rỗng
--   * Danh sách chờ: không đăng ký trùng (bệnh nhân, bác sĩ, ngày, ca) khi còn DangCho hoặc DaMoi
--   * Phụ phí bác sĩ = dòng cùng học vị có so_nam_kinh_nghiem_tu lớn nhất nhưng không vượt số năm kinh nghiệm
--   * Rút tiền: tạo yêu cầu tăng so_tien_dang_giu; duyệt ghi giao_dich_vi loại Rut và giảm cả so_du lẫn so_tien_dang_giu; từ chối chỉ giảm so_tien_dang_giu
--   * Đổi chi nhánh công tác của bác sĩ (Quản trị viên sửa trực tiếp hồ sơ, không có yêu cầu riêng) chỉ khi bác sĩ không còn lịch hẹn đang hoạt động ở chi nhánh hiện tại; ghi nhật ký DoiChiNhanhBacSi
--   * Mốc đã đọc của chat (tin_nhan_cuoi_da_doc_id) phải thuộc cùng hội thoại
-- ============================================================================

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS `clinix` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `clinix`;
CREATE TABLE `tai_khoan` (
  `tai_khoan_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ho_ten` varchar(100) NOT NULL,
  `ngay_sinh` date COMMENT 'Có thể để trống: lúc đăng ký chỉ nhập họ tên, email, SĐT, mật khẩu',
  `gioi_tinh` varchar(10) COMMENT 'Có thể để trống (như ngày sinh)',
  `so_dien_thoai` varchar(20) NOT NULL,
  `anh_dai_dien` varchar(255),
  `dia_chi` varchar(255),
  `email` varchar(255) UNIQUE NOT NULL,
  `mat_khau_bam` varchar(255) NOT NULL,
  `trang_thai` ENUM ('DangHoatDong', 'NgungHoatDong') NOT NULL DEFAULT 'DangHoatDong',
  `da_xac_minh_email` boolean NOT NULL DEFAULT false COMMENT 'false thì không được đặt lịch',
  `bat_buoc_doi_mat_khau` boolean NOT NULL DEFAULT false,
  `loai_tai_khoan` ENUM ('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien') NOT NULL COMMENT 'Cột đề xuất thêm để biết nhanh loại tài khoản, không cần JOIN 4 bảng con',
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đăng ký tài khoản'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `benh_nhan` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `khoa_dat_lich_do_no_show` boolean NOT NULL DEFAULT false COMMENT 'Quản trị viên mở khóa thủ công nên là trạng thái độc lập',
  `so_lan_no_show` int NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bac_si` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `mo_ta_chuyen_mon` text,
  `so_nam_kinh_nghiem` int NOT NULL DEFAULT 0,
  `hoc_vi` ENUM ('BS', 'ThS', 'TS', 'PGS', 'GS') NOT NULL,
  `chuyen_khoa_id` bigint NOT NULL,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Quản trị viên đổi trực tiếp trong hồ sơ bác sĩ; chỉ khi bác sĩ không còn lịch hẹn đang hoạt động ở chi nhánh hiện tại (kiểm tra ở service); ghi nhật ký DoiChiNhanhBacSi',
  `dich_vu_kham_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `le_tan` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Lễ tân luôn được gán đúng 1 chi nhánh'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quan_tri_vien` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `pham_vi_quan_tri` ENUM ('ToanHeThong', 'ChiNhanh') NOT NULL,
  `chi_nhanh_id` bigint
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ho_so_nguoi_than` (
  `ho_so_nguoi_than_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `benh_nhan_id` bigint NOT NULL,
  `ho_ten` varchar(100) NOT NULL,
  `ngay_sinh` date NOT NULL,
  `gioi_tinh` varchar(10) NOT NULL,
  `dia_chi` varchar(255),
  `moi_quan_he` ENUM ('Cha', 'Me', 'Vo', 'Chong', 'Con', 'AnhChiEm', 'OngBa', 'Khac') NOT NULL COMMENT '[đề xuất] danh sách giá trị; Khac cho quan hệ không có trong danh sách',
  `so_dien_thoai` varchar(20),
  `trang_thai_hieu_luc` boolean NOT NULL DEFAULT true COMMENT 'Không xóa thật, chỉ đổi trạng thái'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ma_xac_thuc` (
  `ma_xac_thuc_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tai_khoan_id` bigint NOT NULL,
  `loai` ENUM ('DangKy', 'QuenMatKhau', 'KichHoatNhanSu') NOT NULL,
  `ma_bam` varchar(255) NOT NULL COMMENT 'Lưu bản băm của OTP hoặc token, không lưu bản rõ',
  `het_han_luc` datetime NOT NULL,
  `da_dung_luc` datetime COMMENT 'Để trống = chưa dùng; liên kết kích hoạt chỉ dùng 1 lần',
  `so_lan_nhap_sai` int NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chi_nhanh` (
  `chi_nhanh_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(100) NOT NULL,
  `dia_chi` varchar(255) NOT NULL,
  `toa_do_lat` decimal(10,7),
  `toa_do_lng` decimal(10,7),
  `gio_mo_cua` time NOT NULL,
  `gio_dong_cua` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chuyen_khoa` (
  `chuyen_khoa_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(100) NOT NULL COMMENT 'Lĩnh vực chuyên môn của bác sĩ. Ví dụ: Cơ Xương Khớp, Thần kinh, Tiêu hóa, Nội tổng quát, Y học gia đình, Tâm thần',
  `mo_ta` text,
  `anh_dai_dien` varchar(255) COMMENT 'Đường dẫn ảnh minh họa hiển thị trên thẻ chuyên khoa; có thể để trống',
  `trang_thai_hoat_dong` ENUM ('DangHoatDong', 'NgungHoatDong') NOT NULL DEFAULT 'DangHoatDong'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nhom_dich_vu` (
  `nhom_dich_vu_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(100) UNIQUE NOT NULL COMMENT 'Ví dụ: Khám chuyên khoa, Khám tổng quát, Khám từ xa, Xét nghiệm y học, Sức khỏe tinh thần, Khám nha khoa',
  `thu_tu_hien_thi` int NOT NULL DEFAULT 0 COMMENT '[đề xuất] Thứ tự hiển thị trên màn điều hướng'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dich_vu_kham` (
  `dich_vu_kham_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `nhom_dich_vu_id` bigint NOT NULL,
  `ten` varchar(100) NOT NULL,
  `thoi_luong` int NOT NULL COMMENT 'phút',
  `gia_mac_dinh` decimal(12,2) NOT NULL,
  `muc_dat_coc` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Mức cọc cố định theo dịch vụ; 0 = không đặt cọc'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `moc_hoan_tien` (
  `moc_hoan_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `dich_vu_kham_id` bigint NOT NULL,
  `so_gio_truoc_toi_thieu` int NOT NULL COMMENT 'Hủy trước giờ hẹn ít nhất bấy nhiêu giờ thì áp dụng tỷ lệ này',
  `ty_le_hoan` tinyint NOT NULL COMMENT 'Ràng buộc: 0 đến 100. Ví dụ [đề xuất]: 24 giờ -> 100, 2 giờ -> 50, 0 giờ -> 0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chi_nhanh_dich_vu_kham` (
  `chi_nhanh_id` bigint,
  `dich_vu_kham_id` bigint,
  PRIMARY KEY (`chi_nhanh_id`, `dich_vu_kham_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `phu_phi_bac_si` (
  `phu_phi_bac_si_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `hoc_vi` ENUM ('BS', 'ThS', 'TS', 'PGS', 'GS') NOT NULL,
  `so_nam_kinh_nghiem_tu` int NOT NULL DEFAULT 0 COMMENT 'Áp dụng từ mốc số năm này trở lên',
  `phu_phi` decimal(12,2) NOT NULL COMMENT 'Giá trị [cần điền]; 150.000 chỉ là ví dụ minh họa'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `thong_tin_phong_kham` (
  `id` tinyint PRIMARY KEY COMMENT 'Luôn bằng 1, bảng chỉ có 1 dòng',
  `ten_thuong_hieu` varchar(100),
  `dia_chi_tru_so` varchar(255),
  `duong_day_nong` varchar(20),
  `email` varchar(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cau_hinh_he_thong` (
  `id` tinyint PRIMARY KEY COMMENT 'Luôn bằng 1, bảng chỉ có 1 dòng',
  `thoi_luong_khung_gio_mac_dinh` int NOT NULL COMMENT 'phút; [cần điền]',
  `thoi_gian_giu_cho` int NOT NULL DEFAULT 15 COMMENT 'phút; [đề xuất] 15',
  `thoi_diem_nhac_lich` json NOT NULL DEFAULT (json_array(72,24,2)) COMMENT 'Mảng số giờ trước giờ hẹn; [đề xuất] 72, 24, 2',
  `so_ngay_dat_truoc_toi_da` int NOT NULL COMMENT '[cần điền]',
  `so_lich_hen_toi_da_moi_tk` int NOT NULL COMMENT '[cần điền]',
  `so_lan_tu_doi_lich_toi_da` int NOT NULL COMMENT '[cần điền]',
  `check_in_truoc_phut` int NOT NULL COMMENT '[cần điền]',
  `check_in_sau_phut` int NOT NULL COMMENT '[cần điền]',
  `thoi_han_phan_hoi_loi_moi` int NOT NULL DEFAULT 60 COMMENT 'phút; [đề xuất] 60',
  `so_muc_cho_toi_da` int NOT NULL DEFAULT 2 COMMENT '[đề xuất] 2',
  `nguong_no_show` int NOT NULL DEFAULT 3 COMMENT '[đề xuất] 3 lần',
  `so_ngay_bao_truoc_doi_gio_lam` int NOT NULL COMMENT '[cần điền]',
  `bac_si_uu_tien_id` bigint COMMENT 'Ghim ưu tiên 1 bác sĩ khi gợi ý; để trống = không ghim',
  `trong_so_w1` decimal(3,2) NOT NULL COMMENT '[cần điền]',
  `trong_so_w2` decimal(3,2) NOT NULL COMMENT '[cần điền]'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lich_lam_viec` (
  `lich_lam_viec_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `bac_si_id` bigint NOT NULL,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Chi nhánh tại thời điểm phân công, giữ nguyên khi bác sĩ đổi chi nhánh',
  `ngay` date NOT NULL,
  `ca` ENUM ('CaSang', 'CaChieu', 'CaToi') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `khung_gio` (
  `khung_gio_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_lam_viec_id` bigint NOT NULL,
  `ngay_gio` datetime NOT NULL,
  `trang_thai` ENUM ('ConTrong', 'DaDat', 'DangGiuCho', 'HetHan') NOT NULL DEFAULT 'ConTrong',
  `giu_cho_den` datetime COMMENT 'Hạn giữ chỗ tạm; để trống khi không giữ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_nghi_phep` (
  `yeu_cau_nghi_phep_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `bac_si_id` bigint NOT NULL,
  `hinh_thuc_nghi` ENUM ('CaNgay', 'TheoCa') NOT NULL,
  `ngay_bat_dau` date NOT NULL,
  `ngay_ket_thuc` date NOT NULL,
  `ca` ENUM ('CaSang', 'CaChieu', 'CaToi') COMMENT 'Bắt buộc khi nghỉ theo ca (TheoCa)',
  `ly_do` text NOT NULL,
  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',
  `nguoi_xu_ly_id` bigint,
  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lich_hen` (
  `lich_hen_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ma_lich_hen` varchar(20) UNIQUE NOT NULL,
  `khung_gio_id` bigint NOT NULL COMMENT 'KHÔNG unique: lịch đã hủy hoặc đã đổi vẫn giữ khung_gio_id để truy vết',
  `khung_gio_dang_giu` bigint GENERATED ALWAYS AS (IF(`trang_thai` IN ('ChoThanhToan','DaXacNhan','DaTiepDon','HoanThanh','VangMat'), `khung_gio_id`, NULL)) STORED UNIQUE COMMENT 'Bằng khung_gio_id khi lịch còn hiệu lực (ChoThanhToan, DaXacNhan, DaTiepDon, HoanThanh, VangMat); NULL khi DaHuy hoặc DaDoiLich. Cột sinh STORED + UNIQUE: mỗi slot chỉ có 1 lịch còn hiệu lực.',
  `lich_hen_truoc_id` bigint UNIQUE COMMENT 'Lịch cũ bị thay thế khi đổi lịch. UNIQUE: 1 lịch cũ chỉ sinh tối đa 1 lịch mới. Chỉ tạo lịch mới trong cùng giao dịch với việc chuyển lịch cũ sang DaDoiLich. Chi tiết xem tài liệu quy tắc nghiệp vụ.',
  `benh_nhan_id` bigint NOT NULL COMMENT 'Người đặt',
  `ho_so_nguoi_than_id` bigint COMMENT 'Để trống = chính bệnh nhân đi khám; nếu có thì phải thuộc cùng benh_nhan_id (kiểm tra ở service)',
  `bac_si_id` bigint NOT NULL,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Snapshot chi nhánh tại thời điểm đặt',
  `dich_vu_kham_id` bigint NOT NULL COMMENT 'Snapshot dịch vụ tại thời điểm đặt',
  `thoi_gian` datetime NOT NULL COMMENT 'Sao chép từ khung_gio.ngay_gio, không đổi',
  `gia_snapshot` decimal(12,2) NOT NULL COMMENT 'Giá cuối = giá mặc định + phụ phí lúc đặt; lịch mới do đổi lịch sao chép từ lịch trước',
  `tien_coc_snapshot` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Lịch mới do đổi lịch sao chép từ lịch trước',
  `chinh_sach_hoan_snapshot` json COMMENT 'Bản sao các mốc hoàn tiền lúc đặt (chính sách không hồi tố); lịch mới do đổi lịch sao chép từ lịch trước',
  `trang_thai` ENUM ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon', 'HoanThanh', 'DaHuy', 'DaDoiLich', 'VangMat') NOT NULL,
  `han_thanh_toan` datetime COMMENT 'Quá hạn mà chưa thanh toán thì tự hủy',
  `thoi_diem_huy` datetime,
  `ly_do_huy` varchar(255),
  `ly_do_kham` text,
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đặt lịch',
  `cap_nhat_lan_cuoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Tự cập nhật mỗi khi dòng thay đổi (ON UPDATE trong SQL)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` (
  `yeu_cau_doi_lich_ngoai_chinh_sach_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_hen_id` bigint NOT NULL,
  `khung_gio_mong_muon_id` bigint NOT NULL,
  `ly_do_yeu_cau` text NOT NULL COMMENT 'Lý do bệnh nhân cần đổi lịch',
  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',
  `ghi_chu_xu_ly` varchar(255) COMMENT 'Ghi chú của Lễ tân hoặc Quản trị viên khi duyệt hoặc từ chối',
  `nguoi_xu_ly_id` bigint COMMENT 'Lễ tân hoặc Quản trị viên',
  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ho_so_kham` (
  `ho_so_kham_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_hen_id` bigint UNIQUE NOT NULL,
  `trieu_chung` text,
  `chan_doan_so_bo` text,
  `huong_xu_ly` text,
  `ngay_tai_kham_du_kien` date,
  `cap_nhat_lan_cuoi` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `muc_cho_danh_sach_cho` (
  `muc_cho_danh_sach_cho_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `benh_nhan_id` bigint NOT NULL,
  `bac_si_id` bigint NOT NULL,
  `ngay_mong_muon` date NOT NULL,
  `ca_mong_muon` ENUM ('CaSang', 'CaChieu', 'CaToi') NOT NULL,
  `thoi_diem_dang_ky` datetime NOT NULL COMMENT 'Dùng để xếp thứ hạng',
  `trang_thai` ENUM ('DangCho', 'DaMoi', 'DaChapNhan', 'DaTuChoi', 'HetHan') NOT NULL DEFAULT 'DangCho',
  `khung_gio_duoc_moi_id` bigint COMMENT 'Slot đang giữ cho lời mời',
  `khung_gio_dang_moi` bigint GENERATED ALWAYS AS (IF(`trang_thai` = 'DaMoi', `khung_gio_duoc_moi_id`, NULL)) STORED UNIQUE COMMENT 'Bằng khung_gio_duoc_moi_id khi trạng thái = DaMoi, còn lại NULL. Cột sinh STORED + UNIQUE: mỗi lúc chỉ 1 ứng viên cho 1 slot',
  `thoi_han_phan_hoi` datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `vi_noi_bo` (
  `vi_noi_bo_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `benh_nhan_id` bigint UNIQUE NOT NULL,
  `so_du` decimal(12,2) NOT NULL DEFAULT 0,
  `so_tien_dang_giu` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Tiền đang giữ cho yêu cầu rút chờ duyệt'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `giao_dich_thanh_toan` (
  `giao_dich_thanh_toan_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `vi_noi_bo_id` bigint COMMENT 'NapVi hoặc thanh toán bằng ví; để trống khi thu tiền mặt tại quầy',
  `lich_hen_id` bigint COMMENT 'Chỉ có khi ThanhToanLichHen; trỏ LỊCH GỐC của chuỗi đổi lịch, không đổi khi đổi lịch',
  `loai` ENUM ('NapVi', 'ThanhToanLichHen') NOT NULL,
  `phuong_thuc` ENUM ('Vi', 'VNPay', 'MoMo', 'TienMatTaiQuay') NOT NULL,
  `so_tien` decimal(12,2) NOT NULL,
  `trang_thai` ENUM ('KhoiTao', 'DangXuLy', 'ThanhCong', 'ThatBai', 'HetHan') NOT NULL DEFAULT 'KhoiTao',
  `ma_giao_dich_cong` varchar(100) COMMENT 'Mã cổng thanh toán trả về; chống xử lý trùng (idempotent)',
  `trang_thai_doi_soat` ENUM ('KhongCan', 'ChoDoiSoat', 'DaDoiSoat') NOT NULL DEFAULT 'KhongCan',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lich_su_hoan_tien` (
  `lich_su_hoan_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `giao_dich_thanh_toan_id` bigint NOT NULL COMMENT 'Khoản cọc được hoàn = giao dịch thanh toán của lịch gốc',
  `vi_noi_bo_id` bigint NOT NULL COMMENT 'Tiền hoàn chỉ về ví, không hoàn tiền mặt',
  `so_tien` decimal(12,2) NOT NULL,
  `ly_do` varchar(255),
  `trang_thai` ENUM ('ThanhCong', 'ThatBai') NOT NULL,
  `so_lan_thu` int NOT NULL DEFAULT 1 COMMENT 'Mỗi dòng = 1 lần thử, kể cả thất bại',
  `thoi_diem` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_rut_tien` (
  `yeu_cau_rut_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `vi_noi_bo_id` bigint NOT NULL,
  `so_tien` decimal(12,2) NOT NULL,
  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',
  `nguoi_xu_ly_id` bigint,
  `thoi_diem_yeu_cau` datetime NOT NULL,
  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `giao_dich_vi` (
  `giao_dich_vi_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `vi_noi_bo_id` bigint NOT NULL,
  `loai` ENUM ('Nap', 'ThanhToan', 'HoanTien', 'Rut') NOT NULL,
  `so_tien` decimal(12,2) NOT NULL COMMENT 'Có dấu: dương = tiền vào, âm = tiền ra',
  `so_du_sau` decimal(12,2) NOT NULL,
  `giao_dich_thanh_toan_id` bigint,
  `lich_su_hoan_tien_id` bigint,
  `yeu_cau_rut_tien_id` bigint,
  `thoi_diem` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `danh_gia_bac_si` (
  `danh_gia_bac_si_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_hen_id` bigint UNIQUE NOT NULL COMMENT 'Tối đa 1 đánh giá cho mỗi lịch hẹn; bác sĩ và bệnh nhân suy ra qua lich_hen',
  `so_sao` tinyint NOT NULL COMMENT 'Ràng buộc: 1 đến 5',
  `nhan_xet` text,
  `bi_an` boolean NOT NULL DEFAULT false,
  `ly_do_an` varchar(255) COMMENT 'Bắt buộc khi bi_an = true; để trống khi bi_an = false. Người ẩn và thời điểm ẩn nằm trong nhat_ky_hanh_dong (AnDanhGia)',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bai_viet` (
  `bai_viet_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tac_gia_id` bigint NOT NULL,
  `tieu_de` varchar(255) NOT NULL,
  `mo_ta_ngan` varchar(500),
  `noi_dung` text NOT NULL,
  `anh_dai_dien` varchar(255),
  `trang_thai` ENUM ('BanNhap', 'DaXuatBan', 'LuuTruAn') NOT NULL DEFAULT 'BanNhap',
  `thoi_diem_xuat_ban` datetime,
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cap_nhat_lan_cuoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Tự cập nhật mỗi khi dòng thay đổi (ON UPDATE trong SQL)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hashtag` (
  `hashtag_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(50) UNIQUE NOT NULL COMMENT 'Chuẩn hóa chữ thường',
  `trang_thai_hoat_dong` boolean NOT NULL DEFAULT true
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bai_viet_hashtag` (
  `bai_viet_id` bigint,
  `hashtag_id` bigint,
  PRIMARY KEY (`bai_viet_id`, `hashtag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `benh_nhan_danh_gia_bai_viet` (
  `benh_nhan_id` bigint,
  `bai_viet_id` bigint,
  `loai` ENUM ('Thich', 'KhongThich') NOT NULL,
  PRIMARY KEY (`benh_nhan_id`, `bai_viet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `thong_bao` (
  `thong_bao_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tai_khoan_id` bigint NOT NULL,
  `noi_dung` varchar(500) NOT NULL,
  `loai_su_kien` varchar(100) NOT NULL,
  `trang_thai_doc` boolean NOT NULL DEFAULT false,
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hoi_thoai` (
  `hoi_thoai_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `loai` ENUM ('BenhNhan_BacSi', 'BenhNhan_LeTan') NOT NULL,
  `chi_nhanh_id` bigint COMMENT 'BenhNhan_LeTan: bắt buộc (hộp thư chung chi nhánh); BenhNhan_BacSi: để trống',
  `nguoi_tao_id` bigint NOT NULL,
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tai_khoan_hoi_thoai` (
  `tai_khoan_id` bigint,
  `hoi_thoai_id` bigint,
  `tin_nhan_cuoi_da_doc_id` bigint COMMENT 'Tin mới nhất người này đã đọc; để trống = chưa đọc gì',
  PRIMARY KEY (`tai_khoan_id`, `hoi_thoai_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tin_nhan` (
  `tin_nhan_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `hoi_thoai_id` bigint NOT NULL,
  `nguoi_gui_id` bigint NOT NULL,
  `noi_dung` text NOT NULL,
  `tep_dinh_kem` varchar(255),
  `thoi_diem_gui` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nhat_ky_hanh_dong` (
  `nhat_ky_hanh_dong_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tai_khoan_id` bigint NOT NULL COMMENT 'Người thực hiện',
  `chi_nhanh_id` bigint COMMENT 'Chi nhánh liên quan, để Quản trị viên phạm vi Chi nhánh lọc nhật ký',
  `hanh_dong` ENUM ('DoiQuyen', 'OverrideLichHen', 'HoanTienDacBiet', 'DoiChiNhanhBacSi', 'ChinhNoShow', 'AnDanhGia', 'XuLyDoiLichNgoaiChinhSach', 'SuaGhiChuKham', 'BacSiHuyDotXuat') NOT NULL,
  `loai_doi_tuong` ENUM ('tai_khoan', 'benh_nhan', 'lich_hen', 'ho_so_kham', 'danh_gia_bac_si', 'giao_dich_thanh_toan', 'yeu_cau_doi_lich_ngoai_chinh_sach') NOT NULL COMMENT 'Bảng bị tác động',
  `ma_doi_tuong` bigint NOT NULL COMMENT 'Khóa chính của bản ghi bị tác động; không có FK để nhật ký còn nguyên khi bản ghi gốc bị xóa hoặc ẩn',
  `thoi_diem` datetime NOT NULL,
  `ket_qua` ENUM ('ThanhCong', 'ThatBai') NOT NULL,
  `chi_tiet_thay_doi` json COMMENT 'Nội dung trước và sau khi thay đổi'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX `ma_xac_thuc_index_0` ON `ma_xac_thuc` (`tai_khoan_id`, `loai`, `het_han_luc`);

CREATE UNIQUE INDEX `moc_hoan_tien_index_1` ON `moc_hoan_tien` (`dich_vu_kham_id`, `so_gio_truoc_toi_thieu`);

CREATE UNIQUE INDEX `phu_phi_bac_si_index_2` ON `phu_phi_bac_si` (`hoc_vi`, `so_nam_kinh_nghiem_tu`);

CREATE UNIQUE INDEX `lich_lam_viec_index_3` ON `lich_lam_viec` (`bac_si_id`, `ngay`, `ca`);

CREATE INDEX `lich_lam_viec_index_4` ON `lich_lam_viec` (`chi_nhanh_id`, `ngay`);

CREATE UNIQUE INDEX `khung_gio_index_5` ON `khung_gio` (`lich_lam_viec_id`, `ngay_gio`);

CREATE INDEX `khung_gio_index_6` ON `khung_gio` (`trang_thai`, `ngay_gio`);

CREATE INDEX `khung_gio_index_7` ON `khung_gio` (`trang_thai`, `giu_cho_den`);

CREATE INDEX `yeu_cau_nghi_phep_index_8` ON `yeu_cau_nghi_phep` (`bac_si_id`, `ngay_bat_dau`, `trang_thai`);

CREATE INDEX `lich_hen_index_9` ON `lich_hen` (`benh_nhan_id`, `trang_thai`, `thoi_gian`);

CREATE INDEX `lich_hen_index_10` ON `lich_hen` (`bac_si_id`, `thoi_gian`);

CREATE INDEX `lich_hen_index_11` ON `lich_hen` (`trang_thai`, `han_thanh_toan`);

CREATE INDEX `yeu_cau_doi_lich_ngoai_chinh_sach_index_12` ON `yeu_cau_doi_lich_ngoai_chinh_sach` (`trang_thai`, `thoi_diem_tao`);

CREATE INDEX `muc_cho_danh_sach_cho_index_13` ON `muc_cho_danh_sach_cho` (`bac_si_id`, `ngay_mong_muon`, `ca_mong_muon`, `trang_thai`, `thoi_diem_dang_ky`);

CREATE INDEX `muc_cho_danh_sach_cho_index_14` ON `muc_cho_danh_sach_cho` (`trang_thai`, `thoi_han_phan_hoi`);

CREATE INDEX `muc_cho_danh_sach_cho_index_15` ON `muc_cho_danh_sach_cho` (`benh_nhan_id`, `trang_thai`);

CREATE UNIQUE INDEX `giao_dich_thanh_toan_index_16` ON `giao_dich_thanh_toan` (`phuong_thuc`, `ma_giao_dich_cong`);

CREATE INDEX `giao_dich_thanh_toan_index_17` ON `giao_dich_thanh_toan` (`vi_noi_bo_id`, `thoi_diem_tao`);

CREATE INDEX `giao_dich_thanh_toan_index_18` ON `giao_dich_thanh_toan` (`trang_thai`, `thoi_diem_tao`);

CREATE INDEX `giao_dich_thanh_toan_index_19` ON `giao_dich_thanh_toan` (`trang_thai_doi_soat`);

CREATE UNIQUE INDEX `lich_su_hoan_tien_index_20` ON `lich_su_hoan_tien` (`giao_dich_thanh_toan_id`, `so_lan_thu`);

CREATE INDEX `yeu_cau_rut_tien_index_21` ON `yeu_cau_rut_tien` (`trang_thai`, `thoi_diem_yeu_cau`);

CREATE INDEX `giao_dich_vi_index_22` ON `giao_dich_vi` (`vi_noi_bo_id`, `thoi_diem`);

CREATE INDEX `bai_viet_hashtag_index_23` ON `bai_viet_hashtag` (`hashtag_id`, `bai_viet_id`);

CREATE INDEX `benh_nhan_danh_gia_bai_viet_index_24` ON `benh_nhan_danh_gia_bai_viet` (`bai_viet_id`, `loai`);

CREATE INDEX `thong_bao_index_25` ON `thong_bao` (`tai_khoan_id`, `trang_thai_doc`, `thoi_diem_tao`);

CREATE INDEX `hoi_thoai_index_26` ON `hoi_thoai` (`chi_nhanh_id`, `loai`, `thoi_diem_tao`);

CREATE INDEX `tai_khoan_hoi_thoai_index_27` ON `tai_khoan_hoi_thoai` (`hoi_thoai_id`, `tai_khoan_id`);

CREATE INDEX `tin_nhan_index_28` ON `tin_nhan` (`hoi_thoai_id`, `tin_nhan_id`);

CREATE INDEX `nhat_ky_hanh_dong_index_29` ON `nhat_ky_hanh_dong` (`loai_doi_tuong`, `ma_doi_tuong`, `thoi_diem`);

CREATE INDEX `nhat_ky_hanh_dong_index_30` ON `nhat_ky_hanh_dong` (`tai_khoan_id`, `thoi_diem`);

CREATE INDEX `nhat_ky_hanh_dong_index_31` ON `nhat_ky_hanh_dong` (`chi_nhanh_id`, `thoi_diem`);

ALTER TABLE `bac_si` COMMENT = '1 bác sĩ thuộc 1 chuyên khoa và nhận 1 dịch vụ khám chính; chuyên khoa và dịch vụ là hai chiều phân loại độc lập. Giá khám = giá mặc định của dịch vụ + phụ phí (bảng phu_phi_bac_si). Ràng buộc (kiểm tra ở service): cặp (chi_nhanh_id, dich_vu_kham_id) phải có trong chi_nhanh_dich_vu_kham.';

ALTER TABLE `quan_tri_vien` COMMENT = 'Ràng buộc: phạm vi Chi nhánh thì bắt buộc có chi_nhanh_id; phạm vi Toàn hệ thống thì để trống.';

ALTER TABLE `nhom_dich_vu` COMMENT = 'Chỉ để phân loại và điều hướng, không dùng trực tiếp để đặt lịch hay tính giá.';

ALTER TABLE `chi_nhanh_dich_vu_kham` COMMENT = 'Dịch vụ của bác sĩ phải nằm trong danh sách này của chi nhánh bác sĩ công tác. Lúc đặt lịch, cặp (chi nhánh, dịch vụ) cũng phải có ở đây.';

ALTER TABLE `phu_phi_bac_si` COMMENT = 'Quy tắc phụ phí do Quản trị viên cấu hình. Phụ phí của bác sĩ = dòng cùng học vị có so_nam_kinh_nghiem_tu lớn nhất nhưng không vượt số năm của bác sĩ; không có dòng thì bằng 0. Giá chốt lưu ở lich_hen.gia_snapshot.';

ALTER TABLE `cau_hinh_he_thong` COMMENT = 'Bảng 1 dòng. Cột chưa có mặc định là [cần điền], phải nhập khi khởi tạo dữ liệu.';

ALTER TABLE `yeu_cau_nghi_phep` COMMENT = 'Ràng buộc theo hình thức nghỉ. CaNgay: không có ca, ngày bắt đầu <= ngày kết thúc (được nghỉ nhiều ngày). TheoCa: bắt buộc có ca, chỉ nghỉ 1 ngày.';

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` COMMENT = 'Ràng buộc: khi đã xử lý (khác ChoDuyet) thì bắt buộc có ghi_chu_xu_ly.';

ALTER TABLE `ho_so_kham` COMMENT = 'Cần ít nhất 1 ghi chú không rỗng (kiểm tra ở service) mới cho xác nhận hoàn thành ca khám.';

ALTER TABLE `muc_cho_danh_sach_cho` COMMENT = 'Không cho đăng ký trùng tiêu chí (bệnh nhân, bác sĩ, ngày, ca) khi còn DangCho hoặc DaMoi (kiểm tra ở service).';

ALTER TABLE `vi_noi_bo` COMMENT = 'Ràng buộc: so_du >= 0, so_tien_dang_giu >= 0 và so_tien_dang_giu <= so_du. Số dư khả dụng = so_du - so_tien_dang_giu (tính khi đọc, không lưu).';

ALTER TABLE `giao_dich_thanh_toan` COMMENT = 'Ràng buộc: NapVi thì lich_hen_id để trống và có vi_noi_bo_id; ThanhToanLichHen thì bắt buộc có lich_hen_id.';

ALTER TABLE `yeu_cau_rut_tien` COMMENT = 'Tạo yêu cầu: so_tien_dang_giu tăng so_tien. Duyệt: ghi giao_dich_vi loại Rut, so_du và so_tien_dang_giu cùng giảm so_tien. Từ chối: so_tien_dang_giu giảm so_tien.';

ALTER TABLE `giao_dich_vi` COMMENT = 'Sổ cái lịch sử nạp/trừ/hoàn/rút, chỉ thêm không sửa. Ràng buộc: đúng 1 trong 3 cột tham chiếu có giá trị, tùy theo loại.';

ALTER TABLE `danh_gia_bac_si` COMMENT = 'Chỉ cho đánh giá khi lịch hẹn ở trạng thái HoanThanh (kiểm tra ở service). Ràng buộc: bi_an = false thì ly_do_an để trống; bi_an = true thì bắt buộc có ly_do_an.';

ALTER TABLE `hoi_thoai` COMMENT = 'Ràng buộc: BenhNhan_LeTan thì bắt buộc có chi_nhanh_id; BenhNhan_BacSi thì để trống. Hội thoại không có trạng thái đóng.';

ALTER TABLE `tai_khoan_hoi_thoai` COMMENT = 'Tin chưa đọc = tin có tin_nhan_id lớn hơn mốc đã đọc (hoặc tất cả nếu để trống) và người gửi khác chính mình. Mốc phải thuộc cùng hội thoại (kiểm tra ở service). Hộp thư chung Lễ tân: mỗi Lễ tân có dòng riêng, tạo khi mở hoặc trả lời hội thoại lần đầu; chưa có dòng thì coi như chưa đọc.';

ALTER TABLE `benh_nhan` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`chuyen_khoa_id`) REFERENCES `chuyen_khoa` (`chuyen_khoa_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `le_tan` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `le_tan` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `quan_tri_vien` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `quan_tri_vien` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `ho_so_nguoi_than` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `ma_xac_thuc` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `dich_vu_kham` ADD FOREIGN KEY (`nhom_dich_vu_id`) REFERENCES `nhom_dich_vu` (`nhom_dich_vu_id`);

ALTER TABLE `moc_hoan_tien` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `chi_nhanh_dich_vu_kham` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `chi_nhanh_dich_vu_kham` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `cau_hinh_he_thong` ADD FOREIGN KEY (`bac_si_uu_tien_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `lich_lam_viec` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `lich_lam_viec` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `khung_gio` ADD FOREIGN KEY (`lich_lam_viec_id`) REFERENCES `lich_lam_viec` (`lich_lam_viec_id`);

ALTER TABLE `yeu_cau_nghi_phep` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `yeu_cau_nghi_phep` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`khung_gio_id`) REFERENCES `khung_gio` (`khung_gio_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`lich_hen_truoc_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`ho_so_nguoi_than_id`) REFERENCES `ho_so_nguoi_than` (`ho_so_nguoi_than_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`khung_gio_mong_muon_id`) REFERENCES `khung_gio` (`khung_gio_id`);

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `ho_so_kham` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `muc_cho_danh_sach_cho` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `muc_cho_danh_sach_cho` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `muc_cho_danh_sach_cho` ADD FOREIGN KEY (`khung_gio_duoc_moi_id`) REFERENCES `khung_gio` (`khung_gio_id`);

ALTER TABLE `vi_noi_bo` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `lich_su_hoan_tien` ADD FOREIGN KEY (`giao_dich_thanh_toan_id`) REFERENCES `giao_dich_thanh_toan` (`giao_dich_thanh_toan_id`);

ALTER TABLE `lich_su_hoan_tien` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `yeu_cau_rut_tien` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `yeu_cau_rut_tien` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`giao_dich_thanh_toan_id`) REFERENCES `giao_dich_thanh_toan` (`giao_dich_thanh_toan_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`lich_su_hoan_tien_id`) REFERENCES `lich_su_hoan_tien` (`lich_su_hoan_tien_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`yeu_cau_rut_tien_id`) REFERENCES `yeu_cau_rut_tien` (`yeu_cau_rut_tien_id`);

ALTER TABLE `danh_gia_bac_si` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `bai_viet` ADD FOREIGN KEY (`tac_gia_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `bai_viet_hashtag` ADD FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet` (`bai_viet_id`);

ALTER TABLE `bai_viet_hashtag` ADD FOREIGN KEY (`hashtag_id`) REFERENCES `hashtag` (`hashtag_id`);

ALTER TABLE `benh_nhan_danh_gia_bai_viet` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `benh_nhan_danh_gia_bai_viet` ADD FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet` (`bai_viet_id`);

ALTER TABLE `thong_bao` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `hoi_thoai` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `hoi_thoai` ADD FOREIGN KEY (`nguoi_tao_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`hoi_thoai_id`) REFERENCES `hoi_thoai` (`hoi_thoai_id`);

ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`tin_nhan_cuoi_da_doc_id`) REFERENCES `tin_nhan` (`tin_nhan_id`);

ALTER TABLE `tin_nhan` ADD FOREIGN KEY (`hoi_thoai_id`) REFERENCES `hoi_thoai` (`hoi_thoai_id`);

ALTER TABLE `tin_nhan` ADD FOREIGN KEY (`nguoi_gui_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `nhat_ky_hanh_dong` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `nhat_ky_hanh_dong` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

-- ============================================================================
-- RÀNG BUỘC CHECK (đặt sau khi tạo bảng và khóa ngoại)
-- ============================================================================
ALTER TABLE `quan_tri_vien` ADD CONSTRAINT `chk_qtv_pham_vi` CHECK (
    (`pham_vi_quan_tri` = 'ChiNhanh' AND `chi_nhanh_id` IS NOT NULL) OR (`pham_vi_quan_tri` = 'ToanHeThong' AND `chi_nhanh_id` IS NULL)
);
ALTER TABLE `moc_hoan_tien` ADD CONSTRAINT `chk_moc_hoan_ty_le` CHECK (
    `ty_le_hoan` BETWEEN 0 AND 100
);
ALTER TABLE `yeu_cau_nghi_phep` ADD CONSTRAINT `chk_nghi_phep_hinh_thuc` CHECK (
    (`hinh_thuc_nghi` = 'CaNgay' AND `ca` IS NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`)
    OR (`hinh_thuc_nghi` = 'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` = `ngay_ket_thuc`)
);
ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD CONSTRAINT `chk_doi_lich_xu_ly` CHECK (
    `trang_thai` = 'ChoDuyet' OR `ghi_chu_xu_ly` IS NOT NULL
);
ALTER TABLE `yeu_cau_nghi_phep` ADD CONSTRAINT `chk_nghi_phep_xu_ly` CHECK (
    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)
);
ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD CONSTRAINT `chk_doi_lich_nguoi_xu_ly` CHECK (
    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)
);
ALTER TABLE `yeu_cau_rut_tien` ADD CONSTRAINT `chk_rut_tien_xu_ly` CHECK (
    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)
);
ALTER TABLE `lich_hen` ADD CONSTRAINT `chk_lich_hen_truoc` CHECK (
    `lich_hen_truoc_id` IS NULL OR `lich_hen_truoc_id` <> `lich_hen_id`
);
ALTER TABLE `muc_cho_danh_sach_cho` ADD CONSTRAINT `chk_muc_cho_da_moi` CHECK (
    `trang_thai` <> 'DaMoi' OR `khung_gio_duoc_moi_id` IS NOT NULL
);
ALTER TABLE `vi_noi_bo` ADD CONSTRAINT `chk_vi_so_du` CHECK (
    `so_du` >= 0 AND `so_tien_dang_giu` >= 0 AND `so_tien_dang_giu` <= `so_du`
);
ALTER TABLE `giao_dich_thanh_toan` ADD CONSTRAINT `chk_gd_thanh_toan_loai` CHECK (
    (`loai` = 'NapVi' AND `lich_hen_id` IS NULL AND `vi_noi_bo_id` IS NOT NULL) OR (`loai` = 'ThanhToanLichHen' AND `lich_hen_id` IS NOT NULL)
);
ALTER TABLE `giao_dich_vi` ADD CONSTRAINT `chk_gd_vi_tham_chieu` CHECK (
    (`loai` IN ('Nap','ThanhToan') AND `giao_dich_thanh_toan_id` IS NOT NULL AND `lich_su_hoan_tien_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL)
    OR (`loai` = 'HoanTien' AND `lich_su_hoan_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL)
    OR (`loai` = 'Rut' AND `yeu_cau_rut_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `lich_su_hoan_tien_id` IS NULL)
);
ALTER TABLE `giao_dich_vi` ADD CONSTRAINT `chk_gd_vi_dau_so_tien` CHECK (
    (`loai` IN ('Nap','HoanTien') AND `so_tien` > 0) OR (`loai` IN ('ThanhToan','Rut') AND `so_tien` < 0)
);
ALTER TABLE `danh_gia_bac_si` ADD CONSTRAINT `chk_danh_gia_so_sao` CHECK (
    `so_sao` BETWEEN 1 AND 5
);
ALTER TABLE `danh_gia_bac_si` ADD CONSTRAINT `chk_danh_gia_an` CHECK (
    (`bi_an` = 0 AND `ly_do_an` IS NULL) OR (`bi_an` = 1 AND `ly_do_an` IS NOT NULL)
);
ALTER TABLE `hoi_thoai` ADD CONSTRAINT `chk_hoi_thoai_chi_nhanh` CHECK (
    (`loai` = 'BenhNhan_LeTan' AND `chi_nhanh_id` IS NOT NULL) OR (`loai` = 'BenhNhan_BacSi' AND `chi_nhanh_id` IS NULL)
);
ALTER TABLE `cau_hinh_he_thong` ADD CONSTRAINT `chk_cau_hinh_mot_dong` CHECK (
    `id` = 1
);
ALTER TABLE `thong_tin_phong_kham` ADD CONSTRAINT `chk_phong_kham_mot_dong` CHECK (
    `id` = 1
);

-- ============================================================================
-- TÙY CHỌN (đang tắt): khóa ngoại kép để DB tự chặn bác sĩ nhận dịch vụ mà chi nhánh không cung cấp.
-- Nhóm chọn kiểm tra ở service nên để comment. Nếu bật, khi chuyển chi nhánh phải cập nhật cả 2 cột.
-- ============================================================================
-- ALTER TABLE `bac_si` ADD CONSTRAINT `fk_bac_si_chi_nhanh_dich_vu`
--   FOREIGN KEY (`chi_nhanh_id`, `dich_vu_kham_id`)
--   REFERENCES `chi_nhanh_dich_vu_kham` (`chi_nhanh_id`, `dich_vu_kham_id`);

-- ============================================================================
-- TRUY VẤN MẪU (comment): từ 1 lịch hẹn lần ngược về LỊCH GỐC của chuỗi đổi lịch để lấy giao dịch thanh toán
-- ============================================================================
-- WITH RECURSIVE chuoi AS (
--   SELECT lich_hen_id, lich_hen_truoc_id FROM lich_hen WHERE lich_hen_id = :lich_hen_hien_tai
--   UNION ALL
--   SELECT l.lich_hen_id, l.lich_hen_truoc_id FROM lich_hen l JOIN chuoi c ON l.lich_hen_id = c.lich_hen_truoc_id
-- )
-- SELECT g.* FROM giao_dich_thanh_toan g
-- JOIN chuoi c ON g.lich_hen_id = c.lich_hen_id
-- WHERE c.lich_hen_truoc_id IS NULL;
