import type { MigrationInterface, QueryRunner } from 'typeorm';

// doctor-exam P1: hai bảng ho_so_kham và danh_gia_bac_si (một migration cho cả hai vì cùng một phạm vi và cùng chỉ phụ thuộc lich_hen).
// DDL lấy nguyên văn từ docs/database/clinix_mysql.sql (migration-source.spec.ts MGK-01/02 và schema-parity.int-spec.ts MGK-05 so từng
// câu). Không sửa migration đã áp dụng. Tám câu theo đúng thứ tự của file chính thức (xen kẽ hai bảng): hai CREATE TABLE, hai
// ALTER TABLE ... COMMENT (ghi chú bảng; schema-parity so cả COMMENT), hai khóa ngoại sang lich_hen, hai CHECK (chỉ danh_gia_bac_si).
// Ba cột text của ho_so_kham cho NULL: "bắt buộc có nội dung" chỉ kiểm ở service (Q2), DB không ép.
export const TAO_BANG_HO_SO_KHAM_SQL: readonly string[] = [
  'CREATE TABLE `ho_so_kham` (\n  `ho_so_kham_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `lich_hen_id` bigint UNIQUE NOT NULL,\n  `trieu_chung` text,\n  `chan_doan_so_bo` text,\n  `huong_xu_ly` text,\n  `ngay_tai_kham_du_kien` date,\n  `cap_nhat_lan_cuoi` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  "CREATE TABLE `danh_gia_bac_si` (\n  `danh_gia_bac_si_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `lich_hen_id` bigint UNIQUE NOT NULL COMMENT 'Tối đa 1 đánh giá cho mỗi lịch hẹn; bác sĩ và bệnh nhân suy ra qua lich_hen',\n  `so_sao` tinyint NOT NULL COMMENT 'Ràng buộc: 1 đến 5',\n  `nhan_xet` text,\n  `bi_an` boolean NOT NULL DEFAULT false,\n  `ly_do_an` varchar(255) COMMENT 'Bắt buộc khi bi_an = true; để trống khi bi_an = false. Người ẩn và thời điểm ẩn nằm trong nhat_ky_hanh_dong (AnDanhGia)',\n  `thoi_diem_tao` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'ALTER TABLE `ho_so_kham` COMMENT = \'Ghi hồ sơ khám là thao tác độc lập với xác nhận hoàn thành ca khám: bác sĩ ghi được khi lịch hẹn Đã tiếp đón hoặc sau khi Hoàn thành; KHÔNG bắt buộc đã có dòng ho_so_kham trước khi Hoàn thành (quyết định 17/10/2026). Khi bác sĩ lưu, các trường bắt buộc (triệu chứng, chẩn đoán sơ bộ, hướng xử lý) phải có nội dung (kiểm tra ở service; DB cho phép NULL). Chưa có hồ sơ thì giao diện bệnh nhân hiển thị "Chưa có hồ sơ khám", không tạo nội dung giả.\'',
  "ALTER TABLE `danh_gia_bac_si` COMMENT = 'Chỉ cho đánh giá khi lịch hẹn ở trạng thái HoanThanh (kiểm tra ở service). Ràng buộc: bi_an = false thì ly_do_an để trống; bi_an = true thì bắt buộc có ly_do_an.'",
  'ALTER TABLE `ho_so_kham` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)',
  'ALTER TABLE `danh_gia_bac_si` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)',
  'ALTER TABLE `danh_gia_bac_si` ADD CONSTRAINT `chk_danh_gia_so_sao` CHECK (\n    `so_sao` BETWEEN 1 AND 5\n)',
  'ALTER TABLE `danh_gia_bac_si` ADD CONSTRAINT `chk_danh_gia_an` CHECK (\n    (`bi_an` = 0 AND `ly_do_an` IS NULL) OR (`bi_an` = 1 AND `ly_do_an` IS NOT NULL)\n)',
];

export class TaoBangHoSoKham1793620800000 implements MigrationInterface {
  name = 'TaoBangHoSoKham1793620800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_HO_SO_KHAM_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Khóa ngoại và chỉ mục nằm trong bảng nên DROP TABLE là đủ; không bảng nào tham chiếu hai bảng này (cả hai chỉ trỏ sang lich_hen).
    // HỆ QUẢ (theo PLAN doctor-exam P1, không chặn khi còn dòng): `down` xóa LUÔN mọi hồ sơ khám và đánh giá bác sĩ; sau `down`
    // rồi `up` hai bảng RỖNG. Hệ thống chỉ dùng dữ liệu mẫu nên không chặn như migration thong_bao.lich_hen_id.
    await queryRunner.query('DROP TABLE `danh_gia_bac_si`');
    await queryRunner.query('DROP TABLE `ho_so_kham`');
  }
}
