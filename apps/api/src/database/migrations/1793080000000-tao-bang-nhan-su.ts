import type { MigrationInterface, QueryRunner } from 'typeorm';

// Migration P2 sở hữu các bảng nhân sự và nền; DDL lấy từ schema chính thức.
// prettier-ignore
export const TAO_BANG_NHAN_SU_SQL: readonly string[] = [
  "CREATE TABLE `bac_si` (\n  `tai_khoan_id` bigint PRIMARY KEY,\n  `mo_ta_chuyen_mon` text COMMENT 'Tùy chọn, được để trống: biểu mẫu Tạo tài khoản nhân sự không bắt buộc nhập',\n  `so_nam_kinh_nghiem` int NOT NULL DEFAULT 0 COMMENT '>= 0 (chk_bac_si_kinh_nghiem) [đề xuất]',\n  `hoc_vi` ENUM ('BS', 'ThS', 'TS', 'PGS', 'GS') NOT NULL COMMENT 'Học vị 5 mức: dùng cho điểm xếp hạng AI (kinh_nghiem_norm = min(số năm kinh nghiệm + năm quy đổi học vị, 20) / 20), KHÔNG dùng tra phụ phí. Phải tương thích với chuc_danh (chk_bac_si_chuc_danh_hoc_vi)',\n  `chuc_danh` ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NOT NULL COMMENT 'Chức danh 7 mức: CHỈ dùng tra phụ phí (phu_phi_bac_si.chuc_danh) và hiển thị. Tương thích với hoc_vi: BS, BS_CKI, BS_CKII <-> BS (BS_CKI và BS_CKII <-> BS là [đề xuất], chưa chốt bác sĩ CKI/CKII có thể mang học vị ThS không); ThS_BS <-> ThS; TS_BS <-> TS; PGS_TS_BS <-> PGS; GS_TS_BS <-> GS. ENUM NOT NULL tự lấy giá trị đầu (BS) nếu bỏ trống: service phải bắt buộc nhập tường minh (test GAP)',\n  `chuyen_khoa_id` bigint NOT NULL,\n  `chi_nhanh_id` bigint NOT NULL COMMENT 'Chỉ Quản trị viên Toàn hệ thống đổi trực tiếp trong hồ sơ bác sĩ; chỉ khi bác sĩ không còn lịch hẹn đang hoạt động ở chi nhánh hiện tại và không còn lich_lam_viec có ngay từ hôm nay trở đi ở chi nhánh hiện tại (kiểm tra ở service ngay trước khi lưu; lịch hẹn và ca đã qua giữ để truy vết); ghi nhật ký DoiChiNhanhBacSi',\n  `dich_vu_kham_id` bigint NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `le_tan` (\n  `tai_khoan_id` bigint PRIMARY KEY,\n  `chi_nhanh_id` bigint NOT NULL COMMENT 'Lễ tân luôn được gán đúng 1 chi nhánh'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `quan_tri_vien` (\n  `tai_khoan_id` bigint PRIMARY KEY,\n  `pham_vi_quan_tri` ENUM ('ToanHeThong', 'ChiNhanh') NOT NULL,\n  `chi_nhanh_id` bigint\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `ho_so_nguoi_than` (\n  `ho_so_nguoi_than_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `benh_nhan_id` bigint NOT NULL,\n  `ho_ten` varchar(100) NOT NULL,\n  `ngay_sinh` date NOT NULL,\n  `gioi_tinh` varchar(10) NOT NULL,\n  `dia_chi` varchar(255),\n  `moi_quan_he` ENUM ('Cha', 'Me', 'Vo', 'Chong', 'Con', 'AnhChiEm', 'OngBa', 'Khac') NOT NULL COMMENT '[đề xuất] danh sách giá trị; Khac cho quan hệ không có trong danh sách',\n  `so_dien_thoai` varchar(20),\n  `trang_thai_hieu_luc` boolean NOT NULL DEFAULT true COMMENT 'Không xóa thật, chỉ đổi trạng thái'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `phu_phi_bac_si` (\n  `phu_phi_bac_si_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `chuc_danh` ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NOT NULL COMMENT 'Mã chức danh 7 mức (KHÁC hoc_vi 5 mức dùng cho AI); khớp bac_si.chuc_danh',\n  `so_nam_kinh_nghiem_tu` int NOT NULL DEFAULT 0 COMMENT 'Áp dụng từ mốc số năm này trở lên; >= 0',\n  `phu_phi` decimal(12,2) NOT NULL COMMENT 'Giá trị [cần điền]; các mức ở prototype chỉ là dữ liệu demo, CHƯA phải quyết định; >= 0',\n  `ap_dung` boolean NOT NULL DEFAULT true COMMENT 'false = quy tắc đang TẮT, bị loại khỏi phép tính phụ phí nhưng giữ lại để bật lại; mặc định true [đề xuất]'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `lich_lam_viec` (\n  `lich_lam_viec_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `bac_si_id` bigint NOT NULL,\n  `chi_nhanh_id` bigint NOT NULL COMMENT 'Chi nhánh tại thời điểm phân công, giữ nguyên khi bác sĩ đổi chi nhánh',\n  `ngay` date NOT NULL,\n  `ca` ENUM ('CaSang', 'CaChieu', 'CaToi') NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `khung_gio` (\n  `khung_gio_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `lich_lam_viec_id` bigint NOT NULL,\n  `ngay_gio` datetime NOT NULL,\n  `trang_thai` ENUM ('ConTrong', 'DaDat', 'DangGiuCho', 'HetHan') NOT NULL DEFAULT 'ConTrong',\n  `giu_cho_den` datetime COMMENT 'Hạn giữ chỗ tạm; để trống khi không giữ'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `lich_hen` (\n  `lich_hen_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `ma_lich_hen` varchar(20) UNIQUE NOT NULL,\n  `khung_gio_id` bigint NOT NULL COMMENT 'KHÔNG unique: lịch đã hủy hoặc đã đổi vẫn giữ khung_gio_id để truy vết',\n  `khung_gio_dang_giu` bigint GENERATED ALWAYS AS (IF(`trang_thai` IN ('ChoThanhToan','DaXacNhan','DaTiepDon','HoanThanh','VangMat'), `khung_gio_id`, NULL)) STORED UNIQUE COMMENT 'Bằng khung_gio_id khi lịch còn hiệu lực (ChoThanhToan, DaXacNhan, DaTiepDon, HoanThanh, VangMat); NULL khi DaHuy hoặc DaDoiLich. Cột sinh STORED + UNIQUE: mỗi slot chỉ có 1 lịch còn hiệu lực.',\n  `lich_hen_truoc_id` bigint UNIQUE COMMENT 'Lịch cũ bị thay thế khi đổi lịch. UNIQUE: 1 lịch cũ chỉ sinh tối đa 1 lịch mới. Chỉ tạo lịch mới trong cùng giao dịch với việc chuyển lịch cũ sang DaDoiLich. Lịch không tự trỏ chính nó: kiểm tra ở service (không có CHECK vì MySQL cấm CHECK tham chiếu cột AUTO_INCREMENT). Chi tiết xem tài liệu quy tắc nghiệp vụ.',\n  `benh_nhan_id` bigint NOT NULL COMMENT 'Người đặt',\n  `ho_so_nguoi_than_id` bigint COMMENT 'NULL = chính bệnh nhân đi khám (bản thân); có giá trị = hồ sơ người thân và PHẢI thuộc cùng benh_nhan_id (khóa ngoại kép fk_lich_hen_ho_so_chu_so_huu, DB chặn). Hồ sơ đi khám = (benh_nhan_id, ho_so_nguoi_than_id); khi đếm hoặc so sánh dùng <=> vì NULL = NULL không đúng',\n  `bac_si_id` bigint NOT NULL,\n  `chi_nhanh_id` bigint NOT NULL COMMENT 'Snapshot chi nhánh tại thời điểm đặt',\n  `dich_vu_kham_id` bigint NOT NULL COMMENT 'Snapshot dịch vụ tại thời điểm đặt',\n  `thoi_gian` datetime NOT NULL COMMENT 'Sao chép từ khung_gio.ngay_gio, không đổi',\n  `gia_snapshot` decimal(12,2) NOT NULL COMMENT 'Giá cuối = giá mặc định + phụ phí lúc đặt; lịch mới do đổi lịch sao chép từ lịch trước',\n  `tien_coc_snapshot` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Lịch mới do đổi lịch sao chép từ lịch trước',\n  `chinh_sach_hoan_snapshot` json COMMENT 'Bản sao các mốc hoàn tiền lúc đặt (chính sách không hồi tố); lịch mới do đổi lịch sao chép từ lịch trước',\n  `trang_thai` ENUM ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon', 'HoanThanh', 'DaHuy', 'DaDoiLich', 'VangMat') NOT NULL,\n  `han_thanh_toan` datetime COMMENT 'Quá hạn mà chưa thanh toán thì tự hủy',\n  `thoi_diem_huy` datetime,\n  `ly_do_huy` varchar(255),\n  `ly_do_kham` text,\n  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đặt lịch',\n  `cap_nhat_lan_cuoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Tự cập nhật mỗi khi dòng thay đổi (ON UPDATE trong SQL)'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE UNIQUE INDEX `phu_phi_bac_si_index_2` ON `phu_phi_bac_si` (`chuc_danh`, `so_nam_kinh_nghiem_tu`)",
  "CREATE UNIQUE INDEX `lich_lam_viec_index_3` ON `lich_lam_viec` (`bac_si_id`, `ngay`, `ca`)",
  "CREATE INDEX `lich_lam_viec_index_4` ON `lich_lam_viec` (`chi_nhanh_id`, `ngay`)",
  "CREATE UNIQUE INDEX `khung_gio_index_5` ON `khung_gio` (`lich_lam_viec_id`, `ngay_gio`)",
  "CREATE INDEX `khung_gio_index_6` ON `khung_gio` (`trang_thai`, `ngay_gio`)",
  "CREATE INDEX `khung_gio_index_7` ON `khung_gio` (`trang_thai`, `giu_cho_den`)",
  "CREATE INDEX `lich_hen_index_9` ON `lich_hen` (`benh_nhan_id`, `trang_thai`, `thoi_gian`)",
  "CREATE INDEX `lich_hen_index_10` ON `lich_hen` (`bac_si_id`, `thoi_gian`)",
  "CREATE INDEX `lich_hen_index_11` ON `lich_hen` (`trang_thai`, `han_thanh_toan`)",
  "CREATE INDEX `lich_hen_index_chi_nhanh_benh_nhan` ON `lich_hen` (`chi_nhanh_id`, `benh_nhan_id`)",
  "CREATE INDEX `lich_hen_index_ho_so_benh_nhan_trang_thai` ON `lich_hen` (`ho_so_nguoi_than_id`, `benh_nhan_id`, `trang_thai`)",
  "CREATE UNIQUE INDEX `ho_so_nguoi_than_index_chu_so_huu` ON `ho_so_nguoi_than` (`ho_so_nguoi_than_id`, `benh_nhan_id`)",
  "ALTER TABLE `bac_si` COMMENT = '1 bác sĩ thuộc 1 chuyên khoa và nhận 1 dịch vụ khám chính; chuyên khoa và dịch vụ là hai chiều phân loại độc lập. Giá khám = giá mặc định của dịch vụ + phụ phí (bảng phu_phi_bac_si, tra theo chuc_danh và so_nam_kinh_nghiem; hoc_vi chỉ cho điểm AI). Ràng buộc (kiểm tra ở service): cặp (chi_nhanh_id, dich_vu_kham_id) phải có trong chi_nhanh_dich_vu_kham.'",
  "ALTER TABLE `quan_tri_vien` COMMENT = 'Ràng buộc: phạm vi Chi nhánh thì bắt buộc có chi_nhanh_id; phạm vi Toàn hệ thống thì để trống.'",
  "ALTER TABLE `phu_phi_bac_si` COMMENT = 'Quy tắc phụ phí do Quản trị viên Toàn hệ thống cấu hình, KHÔNG có dòng nào tạo sẵn. Phụ phí hiện hành của bác sĩ = phu_phi của dòng cùng CHỨC DANH, ap_dung = true, so_nam_kinh_nghiem_tu lớn nhất nhưng không vượt số năm của bác sĩ; không có dòng thì bằng 0. Dòng ap_dung = false bị loại khỏi phép tính: tắt mốc cao thì bác sĩ rơi xuống mốc thấp hơn đang áp dụng, không về 0 [cần điền: nhóm xác nhận]. Giá chốt lưu ở lich_hen.gia_snapshot lúc đặt; sửa/tắt/xóa quy tắc hay đổi chức danh, học vị, số năm kinh nghiệm sau đó không đổi lịch đã đặt.'",
  "ALTER TABLE `lich_lam_viec` COMMENT = 'Quy tắc service (DB không chặn): lich_lam_viec.chi_nhanh_id là chi nhánh tại thời điểm phân công. Chỉ phân công vào ngày chi nhánh có hoat_dong = true theo thứ của ngay VÀ ca phải có khoảng nhận khám tương ứng: CaSang cần khoảng sáng, CaChieu cần khoảng chiều; không phân công ca không tồn tại ở ngày đó (thao tác Cả ngày = CaSang + CaChieu chỉ hợp lệ khi cả hai khoảng tồn tại); không phân công vào ngày nghỉ hay chi nhánh chưa khai báo lịch hoạt động. Giờ của ca không có cột riêng: giờ ca là khoảng tương ứng của chi nhánh vào thứ đó [đề xuất]. CaToi vẫn còn trong enum nhưng lịch hoạt động không có khoảng tối nên không phân công được CaToi (nhóm quyết giữ hay bỏ khỏi enum: xem mục 8 của clinix_quy_tac_nghiep_vu.md).'",
  "ALTER TABLE `khung_gio` COMMENT = 'Khung giờ chỉ được sinh, hiển thị ConTrong và được giữ chỗ/đặt khi ngày của ngay_gio là ngày hoạt động của chi nhánh và [ngay_gio, ngay_gio + dich_vu_kham.thoi_luong] nằm TRỌN trong đúng một khoảng nhận khám của chi nhánh vào thứ đó, là khoảng ứng với ca của lich_lam_viec (CaSang: khoảng sáng; CaChieu: khoảng chiều). Không sinh khung giờ xuyên giờ nghỉ trưa hay kết thúc sau giờ kết thúc của khoảng. Các khung giờ trong cùng một khoảng nối liền nhau: khung đầu bắt đầu đúng giờ bắt đầu khoảng, mỗi khung dài đúng dich_vu_kham.thoi_luong, khung sau bắt đầu đúng lúc khung trước kết thúc (khoảng cách giữa các giờ bắt đầu = thời lượng khám); phần dư cuối khoảng không đủ một khung thì không sinh khung giờ (nhóm đồng ý 20/10/2026). Kiểm tra ở service (lúc sinh khung giờ, tính khung giờ trống, giữ chỗ/đặt lịch), DB không chặn.'",
  "ALTER TABLE `bac_si` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`)",
  "ALTER TABLE `bac_si` ADD FOREIGN KEY (`chuyen_khoa_id`) REFERENCES `chuyen_khoa` (`chuyen_khoa_id`)",
  "ALTER TABLE `bac_si` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`)",
  "ALTER TABLE `bac_si` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`)",
  "ALTER TABLE `le_tan` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`)",
  "ALTER TABLE `le_tan` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`)",
  "ALTER TABLE `quan_tri_vien` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`)",
  "ALTER TABLE `quan_tri_vien` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`)",
  "ALTER TABLE `ho_so_nguoi_than` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`)",
  "ALTER TABLE `lich_lam_viec` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`)",
  "ALTER TABLE `lich_lam_viec` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`)",
  "ALTER TABLE `khung_gio` ADD FOREIGN KEY (`lich_lam_viec_id`) REFERENCES `lich_lam_viec` (`lich_lam_viec_id`)",
  "ALTER TABLE `lich_hen` ADD FOREIGN KEY (`khung_gio_id`) REFERENCES `khung_gio` (`khung_gio_id`)",
  "ALTER TABLE `lich_hen` ADD FOREIGN KEY (`lich_hen_truoc_id`) REFERENCES `lich_hen` (`lich_hen_id`)",
  "ALTER TABLE `lich_hen` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`)",
  "ALTER TABLE `lich_hen` ADD CONSTRAINT `fk_lich_hen_ho_so_chu_so_huu` FOREIGN KEY (`ho_so_nguoi_than_id`, `benh_nhan_id`) REFERENCES `ho_so_nguoi_than` (`ho_so_nguoi_than_id`, `benh_nhan_id`)",
  "ALTER TABLE `lich_hen` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`)",
  "ALTER TABLE `lich_hen` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`)",
  "ALTER TABLE `lich_hen` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`)",
  "ALTER TABLE `quan_tri_vien` ADD CONSTRAINT `chk_qtv_pham_vi` CHECK (\n    (`pham_vi_quan_tri` = 'ChiNhanh' AND `chi_nhanh_id` IS NOT NULL) OR (`pham_vi_quan_tri` = 'ToanHeThong' AND `chi_nhanh_id` IS NULL)\n)",
  "ALTER TABLE `bac_si` ADD CONSTRAINT `chk_bac_si_kinh_nghiem` CHECK (\n    `so_nam_kinh_nghiem` >= 0\n)",
  "ALTER TABLE `bac_si` ADD CONSTRAINT `chk_bac_si_chuc_danh_hoc_vi` CHECK (\n    (`chuc_danh` IN ('BS', 'BS_CKI', 'BS_CKII') AND `hoc_vi` = 'BS')\n OR (`chuc_danh` = 'ThS_BS' AND `hoc_vi` = 'ThS')\n OR (`chuc_danh` = 'TS_BS' AND `hoc_vi` = 'TS')\n OR (`chuc_danh` = 'PGS_TS_BS' AND `hoc_vi` = 'PGS')\n OR (`chuc_danh` = 'GS_TS_BS' AND `hoc_vi` = 'GS')\n)",
  "ALTER TABLE `phu_phi_bac_si` ADD CONSTRAINT `chk_phu_phi_bac_si_gia_tri` CHECK (\n    `phu_phi` >= 0 AND `so_nam_kinh_nghiem_tu` >= 0\n)"
];

export class TaoBangNhanSu1793080000000 implements MigrationInterface {
  name = 'TaoBangNhanSu1793080000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_NHAN_SU_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `lich_hen`');
    await queryRunner.query('DROP TABLE `khung_gio`');
    await queryRunner.query('DROP TABLE `lich_lam_viec`');
    await queryRunner.query('DROP TABLE `ho_so_nguoi_than`');
    await queryRunner.query('DROP TABLE `phu_phi_bac_si`');
    await queryRunner.query('DROP TABLE `quan_tri_vien`');
    await queryRunner.query('DROP TABLE `le_tan`');
    await queryRunner.query('DROP TABLE `bac_si`');
  }
}
