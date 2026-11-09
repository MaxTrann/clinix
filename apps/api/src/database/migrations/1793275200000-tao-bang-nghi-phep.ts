import type { MigrationInterface, QueryRunner } from 'typeorm';

// Doctor P1: bảng yeu_cau_nghi_phep. DDL lấy nguyên văn từ docs/database/clinix_mysql.sql
// (schema-parity.int-spec.ts so từng câu). Không sửa migration đã áp dụng.
export const TAO_BANG_NGHI_PHEP_SQL: readonly string[] = [
  "CREATE TABLE `yeu_cau_nghi_phep` (\n  `yeu_cau_nghi_phep_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `bac_si_id` bigint NOT NULL,\n  `hinh_thuc_nghi` ENUM ('CaNgay', 'TheoCa') NOT NULL,\n  `ngay_bat_dau` date NOT NULL,\n  `ngay_ket_thuc` date NOT NULL,\n  `ca` ENUM ('CaSang', 'CaChieu', 'CaToi') COMMENT 'Bắt buộc khi nghỉ theo ca (TheoCa)',\n  `ly_do` text NOT NULL,\n  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',\n  `nguoi_xu_ly_id` bigint,\n  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có',\n  `thoi_diem_tao` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE INDEX `yeu_cau_nghi_phep_index_8` ON `yeu_cau_nghi_phep` (`bac_si_id`, `ngay_bat_dau`, `trang_thai`)',
  "ALTER TABLE `yeu_cau_nghi_phep` COMMENT = 'Ràng buộc theo hình thức nghỉ. CaNgay: không có ca, ngày bắt đầu <= ngày kết thúc (được nghỉ nhiều ngày). TheoCa: bắt buộc có ca, chỉ nghỉ 1 ngày.'",
  'ALTER TABLE `yeu_cau_nghi_phep` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`)',
  'ALTER TABLE `yeu_cau_nghi_phep` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`)',
  "ALTER TABLE `yeu_cau_nghi_phep` ADD CONSTRAINT `chk_nghi_phep_hinh_thuc` CHECK (\n    (`hinh_thuc_nghi` = 'CaNgay' AND `ca` IS NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`)\n    OR (`hinh_thuc_nghi` = 'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` = `ngay_ket_thuc`)\n)",
  "ALTER TABLE `yeu_cau_nghi_phep` ADD CONSTRAINT `chk_nghi_phep_xu_ly` CHECK (\n    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)\n)",
];

export class TaoBangNghiPhep1793275200000 implements MigrationInterface {
  name = 'TaoBangNghiPhep1793275200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_NGHI_PHEP_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Khóa ngoại và chỉ mục nằm trong bảng nên DROP TABLE là đủ.
    await queryRunner.query('DROP TABLE `yeu_cau_nghi_phep`');
  }
}
