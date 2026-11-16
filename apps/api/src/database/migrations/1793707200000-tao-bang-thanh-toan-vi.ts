import type { MigrationInterface, QueryRunner } from 'typeorm';

// payment P1: năm bảng tiền (giao_dich_thanh_toan, lich_su_hoan_tien, yeu_cau_rut_tien, giao_dich_vi, lan_doi_soat_nap_vi) và mở rộng ENUM
// nhat_ky_hanh_dong cho rút tiền (Q17). DDL lấy nguyên văn từ docs/database/clinix_mysql.sql, đúng thứ tự trong file đó (xen kẽ các bảng):
// migration-source.spec.ts (MGT-02) so từng câu, schema-parity.int-spec.ts so SHOW CREATE TABLE. Không sửa migration đã áp dụng.
// Hai điểm mới so với DDL cũ của docs: lich_su_hoan_tien có thêm cột loai (Q23) và lan_doi_soat_nap_vi là bảng mới (Q9).
export const TAO_BANG_THANH_TOAN_VI_SQL: readonly string[] = [
  "CREATE TABLE `giao_dich_thanh_toan` (\n  `giao_dich_thanh_toan_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `vi_noi_bo_id` bigint COMMENT 'NapVi hoặc thanh toán bằng ví; để trống khi thu tiền mặt tại quầy',\n  `lich_hen_id` bigint COMMENT 'Chỉ có khi ThanhToanLichHen; trỏ LỊCH GỐC của chuỗi đổi lịch, không đổi khi đổi lịch',\n  `loai` ENUM ('NapVi', 'ThanhToanLichHen') NOT NULL,\n  `phuong_thuc` ENUM ('Vi', 'VNPay', 'MoMo', 'TienMatTaiQuay') NOT NULL,\n  `so_tien` decimal(12,2) NOT NULL,\n  `trang_thai` ENUM ('KhoiTao', 'DangXuLy', 'ThanhCong', 'ThatBai', 'HetHan') NOT NULL DEFAULT 'KhoiTao',\n  `ma_giao_dich_cong` varchar(100) COMMENT 'Mã cổng thanh toán trả về; chống xử lý trùng (idempotent)',\n  `trang_thai_doi_soat` ENUM ('KhongCan', 'ChoDoiSoat', 'DaDoiSoat') NOT NULL DEFAULT 'KhongCan',\n  `nguoi_thu_id` bigint COMMENT 'Lễ tân XÁC NHẬN ĐÃ NHẬN tiền mặt (không phải người tạo bản ghi, không phải người thanh toán). Bắt buộc khi phuong_thuc = TienMatTaiQuay, để trống với mọi phương thức khác (chk_gd_tien_mat_nguoi_thu). Khóa ngoại tới le_tan nên không thể là bác sĩ, bệnh nhân hay quản trị viên. Service lấy từ phiên đăng nhập của Lễ tân (không nhận từ giao diện) và kiểm tra Lễ tân thuộc chi nhánh của lịch hẹn lúc thu; DB không chặn chi nhánh',\n  `thoi_diem_tao` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `lich_su_hoan_tien` (\n  `lich_su_hoan_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `giao_dich_thanh_toan_id` bigint NOT NULL COMMENT 'Khoản cọc được hoàn = giao dịch thanh toán của lịch gốc',\n  `vi_noi_bo_id` bigint NOT NULL COMMENT 'Tiền hoàn chỉ về ví, không hoàn tiền mặt',\n  `loai` ENUM ('TuDong', 'DacBiet') NOT NULL DEFAULT 'TuDong' COMMENT 'TuDong: hoàn cọc khi huỷ lịch (kể cả các lần thử lại); DacBiet: Quản trị viên hoàn tiền đặc biệt, mỗi khoản thanh toán tối đa một dòng DacBiet (kiểm ở service)',\n  `so_tien` decimal(12,2) NOT NULL,\n  `ly_do` varchar(255),\n  `trang_thai` ENUM ('ThanhCong', 'ThatBai') NOT NULL,\n  `so_lan_thu` int NOT NULL DEFAULT 1 COMMENT 'Mỗi dòng = 1 lần thử, kể cả thất bại',\n  `thoi_diem` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `yeu_cau_rut_tien` (\n  `yeu_cau_rut_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `vi_noi_bo_id` bigint NOT NULL,\n  `so_tien` decimal(12,2) NOT NULL,\n  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',\n  `nguoi_xu_ly_id` bigint,\n  `thoi_diem_yeu_cau` datetime NOT NULL,\n  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `giao_dich_vi` (\n  `giao_dich_vi_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `vi_noi_bo_id` bigint NOT NULL,\n  `loai` ENUM ('Nap', 'ThanhToan', 'HoanTien', 'Rut') NOT NULL,\n  `so_tien` decimal(12,2) NOT NULL COMMENT 'Có dấu: dương = tiền vào, âm = tiền ra',\n  `so_du_sau` decimal(12,2) NOT NULL,\n  `giao_dich_thanh_toan_id` bigint,\n  `lich_su_hoan_tien_id` bigint,\n  `yeu_cau_rut_tien_id` bigint,\n  `thoi_diem` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `lan_doi_soat_nap_vi` (\n  `lan_doi_soat_nap_vi_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `giao_dich_thanh_toan_id` bigint NOT NULL COMMENT 'Giao dịch nạp ví (loai = NapVi) đã được cổng xác nhận thành công nhưng chưa cộng được vào ví',\n  `so_lan_thu` int NOT NULL COMMENT '0 = lần cộng đầu bị lỗi lúc xác minh; 1 đến 3 = job tự động; từ 4 = Quản trị viên xử lý',\n  `ket_qua` ENUM ('ThanhCong', 'ThatBai', 'KhongTheXuLy') NOT NULL,\n  `nguoi_xu_ly_id` bigint COMMENT 'Quản trị viên xử lý; để trống khi là job tự động',\n  `ly_do` varchar(255) COMMENT 'Mã lỗi dạng mã hoặc lý do của Quản trị viên; không ghi văn bản lỗi gốc của cổng',\n  `thoi_diem` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE UNIQUE INDEX `giao_dich_thanh_toan_index_16` ON `giao_dich_thanh_toan` (`phuong_thuc`, `ma_giao_dich_cong`)',
  'CREATE INDEX `giao_dich_thanh_toan_index_17` ON `giao_dich_thanh_toan` (`vi_noi_bo_id`, `thoi_diem_tao`)',
  'CREATE INDEX `giao_dich_thanh_toan_index_18` ON `giao_dich_thanh_toan` (`trang_thai`, `thoi_diem_tao`)',
  'CREATE INDEX `giao_dich_thanh_toan_index_19` ON `giao_dich_thanh_toan` (`trang_thai_doi_soat`)',
  'CREATE UNIQUE INDEX `lich_su_hoan_tien_index_20` ON `lich_su_hoan_tien` (`giao_dich_thanh_toan_id`, `so_lan_thu`)',
  'CREATE INDEX `yeu_cau_rut_tien_index_21` ON `yeu_cau_rut_tien` (`trang_thai`, `thoi_diem_yeu_cau`)',
  'CREATE INDEX `giao_dich_vi_index_22` ON `giao_dich_vi` (`vi_noi_bo_id`, `thoi_diem`)',
  'CREATE UNIQUE INDEX `lan_doi_soat_nap_vi_index_lan_thu` ON `lan_doi_soat_nap_vi` (`giao_dich_thanh_toan_id`, `so_lan_thu`)',
  "ALTER TABLE `giao_dich_thanh_toan` COMMENT = 'Ràng buộc: NapVi thì lich_hen_id để trống và có vi_noi_bo_id; ThanhToanLichHen thì bắt buộc có lich_hen_id. Thu tiền mặt tại quầy (phuong_thuc = TienMatTaiQuay): chỉ ThanhToanLichHen, bắt buộc có lich_hen_id (lịch gốc) và nguoi_thu_id, không có vi_noi_bo_id và ma_giao_dich_cong, so_tien > 0, trang_thai = ThanhCong (dòng chỉ được tạo khi Lễ tân đã thu đủ phần còn lại; thu không thành công thì không tạo dòng); mọi phương thức khác thì nguoi_thu_id để trống (chk_gd_tien_mat_nguoi_thu). Một lịch hẹn có thể có nhiều dòng (khoản cọc và khoản thu còn lại) nên KHÔNG có UNIQUE theo lich_hen_id. Service chịu trách nhiệm: lấy nguoi_thu_id từ phiên đăng nhập, Lễ tân đúng chi nhánh của lịch hẹn, thu đủ đúng số còn phải thu, chống ghi trùng và ghi cùng giao dịch với việc chuyển DaTiepDon (xem clinix_quy_tac_nghiep_vu.md mục 2 dòng 45 đến 47).'",
  "ALTER TABLE `yeu_cau_rut_tien` COMMENT = 'Tạo yêu cầu: so_tien_dang_giu tăng so_tien. Duyệt: ghi giao_dich_vi loại Rut, so_du và so_tien_dang_giu cùng giảm so_tien. Từ chối: so_tien_dang_giu giảm so_tien.'",
  "ALTER TABLE `giao_dich_vi` COMMENT = 'Sổ cái lịch sử nạp/trừ/hoàn/rút, chỉ thêm không sửa. Ràng buộc: đúng 1 trong 3 cột tham chiếu có giá trị, tùy theo loại.'",
  "ALTER TABLE `lan_doi_soat_nap_vi` COMMENT = 'Lịch sử các lần đối soát nạp ví, chỉ thêm không sửa; mỗi dòng một lần thử. Job tự động ghi tối đa 3 lần (nguoi_xu_ly_id trống); Quản trị viên chọn Cộng ví (ThanhCong) hoặc Không thể xử lý (KhongTheXuLy, bắt buộc ly_do, kiểm ở service).'",
  'ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`)',
  'ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)',
  'ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`nguoi_thu_id`) REFERENCES `le_tan` (`tai_khoan_id`)',
  'ALTER TABLE `lich_su_hoan_tien` ADD FOREIGN KEY (`giao_dich_thanh_toan_id`) REFERENCES `giao_dich_thanh_toan` (`giao_dich_thanh_toan_id`)',
  'ALTER TABLE `lich_su_hoan_tien` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`)',
  'ALTER TABLE `yeu_cau_rut_tien` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`)',
  'ALTER TABLE `yeu_cau_rut_tien` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`)',
  'ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`)',
  'ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`giao_dich_thanh_toan_id`) REFERENCES `giao_dich_thanh_toan` (`giao_dich_thanh_toan_id`)',
  'ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`lich_su_hoan_tien_id`) REFERENCES `lich_su_hoan_tien` (`lich_su_hoan_tien_id`)',
  'ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`yeu_cau_rut_tien_id`) REFERENCES `yeu_cau_rut_tien` (`yeu_cau_rut_tien_id`)',
  'ALTER TABLE `lan_doi_soat_nap_vi` ADD FOREIGN KEY (`giao_dich_thanh_toan_id`) REFERENCES `giao_dich_thanh_toan` (`giao_dich_thanh_toan_id`)',
  'ALTER TABLE `lan_doi_soat_nap_vi` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`)',
  "ALTER TABLE `yeu_cau_rut_tien` ADD CONSTRAINT `chk_rut_tien_xu_ly` CHECK (\n    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)\n)",
  "ALTER TABLE `giao_dich_thanh_toan` ADD CONSTRAINT `chk_gd_thanh_toan_loai` CHECK (\n    (`loai` = 'NapVi' AND `lich_hen_id` IS NULL AND `vi_noi_bo_id` IS NOT NULL) OR (`loai` = 'ThanhToanLichHen' AND `lich_hen_id` IS NOT NULL)\n)",
  "ALTER TABLE `giao_dich_thanh_toan` ADD CONSTRAINT `chk_gd_tien_mat_nguoi_thu` CHECK (\n    (`phuong_thuc` = 'TienMatTaiQuay' AND `loai` = 'ThanhToanLichHen' AND `lich_hen_id` IS NOT NULL AND `vi_noi_bo_id` IS NULL\n       AND `ma_giao_dich_cong` IS NULL AND `so_tien` > 0 AND `trang_thai` = 'ThanhCong' AND `nguoi_thu_id` IS NOT NULL)\n OR (`phuong_thuc` <> 'TienMatTaiQuay' AND `nguoi_thu_id` IS NULL)\n)",
  "ALTER TABLE `giao_dich_vi` ADD CONSTRAINT `chk_gd_vi_tham_chieu` CHECK (\n    (`loai` IN ('Nap','ThanhToan') AND `giao_dich_thanh_toan_id` IS NOT NULL AND `lich_su_hoan_tien_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL)\n    OR (`loai` = 'HoanTien' AND `lich_su_hoan_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL)\n    OR (`loai` = 'Rut' AND `yeu_cau_rut_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `lich_su_hoan_tien_id` IS NULL)\n)",
  "ALTER TABLE `giao_dich_vi` ADD CONSTRAINT `chk_gd_vi_dau_so_tien` CHECK (\n    (`loai` IN ('Nap','HoanTien') AND `so_tien` > 0) OR (`loai` IN ('ThanhToan','Rut') AND `so_tien` < 0)\n)",
];

// Giá trị mới thêm CUỐI danh sách để không đổi giá trị đã lưu (cùng nếp migration doctor P4). Hai danh sách phải khớp
// docs/database/clinix_mysql.sql và HANH_DONG_NHAY_CAM, LOAI_DOI_TUONG_NHAT_KY ở admin/entities/enums.ts (audit-enum-parity, MGT-10).
const HANH_DONG_CU = [
  'DoiQuyen',
  'OverrideLichHen',
  'HoanTienDacBiet',
  'DoiChiNhanhBacSi',
  'ChinhNoShow',
  'AnDanhGia',
  'XuLyDoiLichNgoaiChinhSach',
  'SuaGhiChuKham',
  'BacSiHuyDotXuat',
  'CapNhatCauHinh',
  'XuLyNapViChuaCong',
  'TaoTaiKhoanNhanSu',
  'KhoaTaiKhoan',
  'MoKhoaTaiKhoan',
  'MoKhoaNoShow',
  'DuyetThayDoiChiNhanh',
  'TuChoiThayDoiChiNhanh',
  'RutThayDoiChiNhanh',
  'HuyThayDoiChiNhanh',
  'DoiHieuLucThayDoiChiNhanh',
  'PhanCongLichLamViec',
  'GoLichLamViec',
  'DuyetNghiPhep',
  'TuChoiNghiPhep',
];
const HANH_DONG_MOI = ['DuyetRutTien', 'TuChoiRutTien'];
const DOI_TUONG_CU = [
  'tai_khoan',
  'benh_nhan',
  'lich_hen',
  'ho_so_kham',
  'danh_gia_bac_si',
  'giao_dich_thanh_toan',
  'yeu_cau_doi_lich_ngoai_chinh_sach',
  'cau_hinh_he_thong',
  'yeu_cau_thay_doi_chi_nhanh',
  'lich_lam_viec',
  'yeu_cau_nghi_phep',
];
const DOI_TUONG_MOI = ['yeu_cau_rut_tien'];

function enumList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

function modifyEnums(hanhDong: string[], doiTuong: string[]): string {
  return (
    'ALTER TABLE `nhat_ky_hanh_dong` ' +
    `MODIFY \`hanh_dong\` ENUM (${enumList(hanhDong)}) NOT NULL, ` +
    `MODIFY \`loai_doi_tuong\` ENUM (${enumList(doiTuong)}) NOT NULL COMMENT 'Bảng bị tác động'`
  );
}

export const NHAT_KY_RUT_TIEN_UP_SQL = modifyEnums(
  [...HANH_DONG_CU, ...HANH_DONG_MOI],
  [...DOI_TUONG_CU, ...DOI_TUONG_MOI],
);
export const NHAT_KY_RUT_TIEN_DOWN_SQL = modifyEnums(
  HANH_DONG_CU,
  DOI_TUONG_CU,
);

// Đếm dòng nhật ký còn dùng giá trị ENUM mới; `down` gọi trước mọi câu DDL (xem down).
export const DEM_NHAT_KY_RUT_TIEN_SQL =
  'SELECT COUNT(*) AS soDong FROM `nhat_ky_hanh_dong` WHERE `hanh_dong` IN (' +
  enumList(HANH_DONG_MOI) +
  ') OR `loai_doi_tuong` IN (' +
  enumList(DOI_TUONG_MOI) +
  ')';

// Thứ tự xoá bảng: bảng con (có khóa ngoại) trước, bảng cha sau.
export const BANG_THANH_TOAN_VI_XOA_THEO_THU_TU = [
  'lan_doi_soat_nap_vi',
  'giao_dich_vi',
  'yeu_cau_rut_tien',
  'lich_su_hoan_tien',
  'giao_dich_thanh_toan',
] as const;

export class TaoBangThanhToanVi1793707200000 implements MigrationInterface {
  name = 'TaoBangThanhToanVi1793707200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_THANH_TOAN_VI_SQL) {
      await queryRunner.query(statement);
    }
    await queryRunner.query(NHAT_KY_RUT_TIEN_UP_SQL);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DDL của MySQL tự commit nên KHÔNG hoàn tác được nửa chừng: phải kiểm TRƯỚC mọi câu DDL (4.7 #5). Còn dòng nhật ký dùng giá
    // trị ENUM mới ⇒ dừng ngay với thông báo rõ, không xoá nhật ký, DB nguyên vẹn (5 bảng, cột, ENUM mở rộng và dòng nhật ký còn đủ).
    const rows = (await queryRunner.query(DEM_NHAT_KY_RUT_TIEN_SQL)) as {
      soDong: string | number;
    }[];
    const soDong = Number(rows[0]?.soDong ?? 0);
    if (soDong > 0) {
      throw new Error(
        `Không hoàn tác được migration ${this.name}: còn ${soDong} dòng nhat_ky_hanh_dong dùng DuyetRutTien, TuChoiRutTien hoặc yeu_cau_rut_tien. ` +
          'Nhật ký được giữ nguyên và DB không đổi; xử lý các dòng này rồi chạy lại.',
      );
    }
    // MODIFY ENUM trước: lúc này chắc chắn không dòng nào dùng giá trị mới nên không lỗi 1265.
    await queryRunner.query(NHAT_KY_RUT_TIEN_DOWN_SQL);
    // Khóa ngoại và chỉ mục nằm trong bảng nên DROP TABLE là đủ. HỆ QUẢ: xoá luôn mọi dòng của năm bảng (hệ thống chỉ dùng dữ liệu mẫu).
    for (const table of BANG_THANH_TOAN_VI_XOA_THEO_THU_TU) {
      await queryRunner.query(`DROP TABLE \`${table}\``);
    }
  }
}
