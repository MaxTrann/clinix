import type { MigrationInterface, QueryRunner } from 'typeorm';

// Booking B19 (issue #551, phương án "ba cột mốc"): lich_hen thêm thoi_diem_xac_nhan, thoi_diem_tiep_don, thoi_diem_hoan_thanh để chi tiết lịch hẹn
// hiện giờ THẬT của từng bước. Cùng nếp migration P7 (thong_bao.lich_hen_id): dùng ALTER (lich_hen đã có từ migration nhân sự P2), văn bản phải khớp
// docs/database/clinix_mysql.sql: mỗi câu ADD COLUMN dùng đúng dòng cột của CREATE TABLE `lich_hen` và đúng cột đứng trước nó (migration-source.spec.ts, MOC-01,
// so từng ký tự). Cột nullable, không DEFAULT, không CHECK nên dòng cũ không phải điền lại (lịch cũ hiện "—", không điền giả).
export const MOC_THOI_GIAN_LICH_HEN_UP_SQL: readonly string[] = [
  "ALTER TABLE `lich_hen` ADD COLUMN `thoi_diem_xac_nhan` datetime COMMENT 'Lúc lịch thành DaXacNhan lần đầu (booking B19): lịch cọc 0đ bằng thoi_diem_tao, lịch có cọc là lúc xác nhận thanh toán. NULL khi chưa xác nhận hoặc lịch tạo trước B19 (không điền giả). Giữ nguyên khi lịch lùi trạng thái hoặc bị hủy' AFTER `thoi_diem_tao`",
  "ALTER TABLE `lich_hen` ADD COLUMN `thoi_diem_tiep_don` datetime COMMENT 'Lúc lịch thành DaTiepDon (Lễ tân tiếp đón, thu tiền mặt tại quầy hoặc Quản trị viên chuyển trạng thái, booking B19). Bị xóa (NULL) khi lịch về DaXacNhan hoặc sang VangMat, giữ nguyên khi hủy. NULL ở lịch tạo trước B19' AFTER `thoi_diem_xac_nhan`",
  "ALTER TABLE `lich_hen` ADD COLUMN `thoi_diem_hoan_thanh` datetime COMMENT 'Lúc Bác sĩ hoàn thành ca khám, lịch thành HoanThanh (booking B19). HoanThanh là trạng thái cuối nên mốc này không bị xóa. NULL khi chưa hoàn thành hoặc lịch tạo trước B19' AFTER `thoi_diem_tiep_don`",
];

// Thứ tự gỡ ngược với thứ tự thêm (cột sau trước cột trước)
export const MOC_THOI_GIAN_LICH_HEN_COLUMNS: readonly string[] = [
  'thoi_diem_xac_nhan',
  'thoi_diem_tiep_don',
  'thoi_diem_hoan_thanh',
];

export class MocThoiGianLichHen1793793600000 implements MigrationInterface {
  name = 'MocThoiGianLichHen1793793600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of MOC_THOI_GIAN_LICH_HEN_UP_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Còn lịch có mốc thì DROP COLUMN làm mất dữ liệu không khôi phục được: chặn, không đổi gì (cùng tinh thần migration P7 và nhật ký)
    const [used] = (await queryRunner.query(
      'SELECT COUNT(*) AS total FROM `lich_hen` WHERE `thoi_diem_xac_nhan` IS NOT NULL OR `thoi_diem_tiep_don` IS NOT NULL OR `thoi_diem_hoan_thanh` IS NOT NULL',
    )) as { total: string | number }[];
    if (Number(used?.total ?? 0) > 0) {
      throw new Error(
        `Không hoàn tác được ${this.name}: còn ${String(used?.total)} lịch hẹn có mốc thời gian (thoi_diem_xac_nhan, thoi_diem_tiep_don hoặc thoi_diem_hoan_thanh khác NULL).`,
      );
    }

    for (const column of [...MOC_THOI_GIAN_LICH_HEN_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE \`lich_hen\` DROP COLUMN \`${column}\``,
      );
    }
  }
}
