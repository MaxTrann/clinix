import type { MigrationInterface, QueryRunner } from 'typeorm';

// chat P1 (issue #706, scope #11 "Nhắn tin"; PLAN chat 5.2, Q7, Q10, Q21): ba bảng `hoi_thoai`, `tai_khoan_hoi_thoai`, `tin_nhan` lần đầu có migration (trước đây chỉ có DDL ở docs/database).
// `tin_nhan` dùng bản DDL ĐÃ SỬA ở chat P1: thêm `ma_gui` (chống gửi trùng), ba cột metadata tệp, UNIQUE `(nguoi_gui_id, ma_gui)` và hai CHECK.
// DDL TRÍCH NGUYÊN VĂN, không đổi chữ nào (migration-source.spec.ts so từng câu; schema-parity.int-spec.ts so SHOW CREATE TABLE).
// Mười chín câu theo đúng thứ tự trong file chính thức: ba CREATE TABLE, bốn chỉ mục, hai COMMENT bảng, bảy khóa ngoại, ba CHECK.
// UNIQUE `(nguoi_gui_id, ma_gui)` được tạo TRƯỚC khóa ngoại `nguoi_gui_id` nên MySQL dùng nó làm chỉ mục cho khóa ngoại, không sinh chỉ mục ngầm riêng (PLAN 5.2 (c), số đo M4 ở X1).
export const TAO_BANG_CHAT_SQL: readonly string[] = [
  "CREATE TABLE `hoi_thoai` (\n  `hoi_thoai_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `loai` ENUM ('BenhNhan_BacSi', 'BenhNhan_LeTan') NOT NULL,\n  `chi_nhanh_id` bigint COMMENT 'BenhNhan_LeTan: bắt buộc (hộp thư chung chi nhánh); BenhNhan_BacSi: để trống',\n  `nguoi_tao_id` bigint NOT NULL,\n  `thoi_diem_tao` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `tai_khoan_hoi_thoai` (\n  `tai_khoan_id` bigint,\n  `hoi_thoai_id` bigint,\n  `tin_nhan_cuoi_da_doc_id` bigint COMMENT 'Tin mới nhất người này đã đọc; để trống = chưa đọc gì',\n  PRIMARY KEY (`tai_khoan_id`, `hoi_thoai_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `tin_nhan` (\n  `tin_nhan_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `hoi_thoai_id` bigint NOT NULL,\n  `nguoi_gui_id` bigint NOT NULL,\n  `ma_gui` char(36) COMMENT 'Mã ý định gửi do client sinh (UUID); NULL cho tin nạp sẵn. Duy nhất theo người gửi',\n  `noi_dung` text NOT NULL COMMENT 'Văn bản thuần; rỗng chỉ khi có tệp đính kèm',\n  `tep_dinh_kem` varchar(255) COMMENT 'Khoá lưu trữ của tệp trên volume riêng; NULL nếu không có tệp',\n  `tep_ten_goc` varchar(255),\n  `tep_loai` varchar(100) COMMENT 'Kiểu MIME do máy chủ xác định từ nội dung tệp',\n  `tep_dung_luong` int COMMENT 'Số byte đã lưu',\n  `thoi_diem_gui` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE INDEX `hoi_thoai_index_26` ON `hoi_thoai` (`chi_nhanh_id`, `loai`, `thoi_diem_tao`)',
  'CREATE INDEX `tai_khoan_hoi_thoai_index_27` ON `tai_khoan_hoi_thoai` (`hoi_thoai_id`, `tai_khoan_id`)',
  'CREATE INDEX `tin_nhan_index_28` ON `tin_nhan` (`hoi_thoai_id`, `tin_nhan_id`)',
  'CREATE UNIQUE INDEX `tin_nhan_index_nguoi_gui_ma_gui` ON `tin_nhan` (`nguoi_gui_id`, `ma_gui`)',
  "ALTER TABLE `hoi_thoai` COMMENT = 'Ràng buộc: BenhNhan_LeTan thì bắt buộc có chi_nhanh_id; BenhNhan_BacSi thì để trống. Hội thoại không có trạng thái đóng.'",
  "ALTER TABLE `tai_khoan_hoi_thoai` COMMENT = 'Tin chưa đọc = tin có tin_nhan_id lớn hơn mốc đã đọc (hoặc tất cả nếu để trống) và người gửi khác chính mình. Mốc phải thuộc cùng hội thoại (kiểm tra ở service). Hộp thư chung Lễ tân: mỗi Lễ tân có dòng riêng, tạo khi mở hoặc trả lời hội thoại lần đầu; chưa có dòng thì coi như chưa đọc.'",
  'ALTER TABLE `hoi_thoai` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`)',
  'ALTER TABLE `hoi_thoai` ADD FOREIGN KEY (`nguoi_tao_id`) REFERENCES `tai_khoan` (`tai_khoan_id`)',
  'ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`)',
  'ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`hoi_thoai_id`) REFERENCES `hoi_thoai` (`hoi_thoai_id`)',
  'ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`tin_nhan_cuoi_da_doc_id`) REFERENCES `tin_nhan` (`tin_nhan_id`)',
  'ALTER TABLE `tin_nhan` ADD FOREIGN KEY (`hoi_thoai_id`) REFERENCES `hoi_thoai` (`hoi_thoai_id`)',
  'ALTER TABLE `tin_nhan` ADD FOREIGN KEY (`nguoi_gui_id`) REFERENCES `tai_khoan` (`tai_khoan_id`)',
  "ALTER TABLE `hoi_thoai` ADD CONSTRAINT `chk_hoi_thoai_chi_nhanh` CHECK (\n    (`loai` = 'BenhNhan_LeTan' AND `chi_nhanh_id` IS NOT NULL) OR (`loai` = 'BenhNhan_BacSi' AND `chi_nhanh_id` IS NULL)\n)",
  'ALTER TABLE `tin_nhan` ADD CONSTRAINT `chk_tin_nhan_tep` CHECK (\n    (`tep_dinh_kem` IS NULL AND `tep_ten_goc` IS NULL AND `tep_loai` IS NULL AND `tep_dung_luong` IS NULL)\n OR (`tep_dinh_kem` IS NOT NULL AND `tep_ten_goc` IS NOT NULL AND `tep_loai` IS NOT NULL\n     AND `tep_dung_luong` IS NOT NULL AND `tep_dung_luong` BETWEEN 1 AND 10485760)\n)',
  "ALTER TABLE `tin_nhan` ADD CONSTRAINT `chk_tin_nhan_noi_dung` CHECK (\n    `noi_dung` <> '' OR `tep_dinh_kem` IS NOT NULL\n)",
];

export class TaoBangChat1794225600000 implements MigrationInterface {
  name = 'TaoBangChat1794225600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_CHAT_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // TỪ CHỐI khi còn tin nhắn (PLAN chat T11): xoá bảng là mất hội thoại thật của người dùng, không hoàn tác được. Phải tự xử lý dữ liệu rồi mới hạ migration.
    const rows: { n: string | number }[] = await queryRunner.query(
      'SELECT COUNT(*) AS n FROM `tin_nhan`',
    );
    if (Number(rows[0]?.n ?? 0) > 0)
      throw new Error(
        'Không hạ migration chat khi bảng tin_nhan còn dữ liệu (xoá tin nhắn thủ công trước nếu thật sự muốn)',
      );
    // Thứ tự xoá theo khóa ngoại: tai_khoan_hoi_thoai trỏ tới tin_nhan và hoi_thoai; tin_nhan trỏ tới hoi_thoai.
    await queryRunner.query('DROP TABLE `tai_khoan_hoi_thoai`');
    await queryRunner.query('DROP TABLE `tin_nhan`');
    await queryRunner.query('DROP TABLE `hoi_thoai`');
  }
}
