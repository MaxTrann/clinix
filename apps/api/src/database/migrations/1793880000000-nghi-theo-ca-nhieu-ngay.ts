import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TAO_BANG_NGHI_PHEP_SQL } from './1793275200000-tao-bang-nghi-phep.js';

// Doctor UX7 (issue #582, G7 phương án A): yêu cầu nghỉ THEO CA được kéo dài nhiều ngày (một yêu cầu = khoảng ngày + MỘT ca). Chỉ đổi nhánh `TheoCa` của CHECK
// `chk_nghi_phep_hinh_thuc` từ `ngay_bat_dau = ngay_ket_thuc` thành `ngay_bat_dau <= ngay_ket_thuc` (ca vẫn bắt buộc) và câu COMMENT của bảng nói về nó. Không thêm cột,
// không đổi dòng nào: mọi dòng `TheoCa` đã có (một ngày) vẫn thoả CHECK mới. Văn bản phải khớp docs/database/clinix_mysql.sql (migration-source.spec.ts, NTC-01, so từng ký tự).
// Một câu ALTER duy nhất gỡ và thêm lại CHECK để không có khoảnh khắc nào bảng thiếu CHECK (DDL của MySQL 8 là nguyên tử trong MỘT câu).
export const NGHI_THEO_CA_NHIEU_NGAY_UP_SQL: readonly string[] = [
  "ALTER TABLE `yeu_cau_nghi_phep` DROP CHECK `chk_nghi_phep_hinh_thuc`, ADD CONSTRAINT `chk_nghi_phep_hinh_thuc` CHECK (\n    (`hinh_thuc_nghi` = 'CaNgay' AND `ca` IS NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`)\n    OR (`hinh_thuc_nghi` = 'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`)\n)",
  "ALTER TABLE `yeu_cau_nghi_phep` COMMENT = 'Ràng buộc theo hình thức nghỉ. CaNgay: không có ca, ngày bắt đầu <= ngày kết thúc (được nghỉ nhiều ngày). TheoCa: bắt buộc có ca, ngày bắt đầu <= ngày kết thúc (được nghỉ nhiều ngày, một ca).'",
];

// Chữ CŨ lấy thẳng từ migration nghỉ phép gốc (không sao chép lần hai nên không thể lệch): câu `ADD CONSTRAINT` của CHECK và câu COMMENT.
const OLD_CHECK_STATEMENT = TAO_BANG_NGHI_PHEP_SQL.find((sql) =>
  sql.includes('ADD CONSTRAINT `chk_nghi_phep_hinh_thuc`'),
);
const OLD_COMMENT_STATEMENT = TAO_BANG_NGHI_PHEP_SQL.find((sql) =>
  sql.startsWith('ALTER TABLE `yeu_cau_nghi_phep` COMMENT = '),
);
const ADD_PREFIX = 'ALTER TABLE `yeu_cau_nghi_phep` ADD CONSTRAINT ';

/** Hai câu đưa CHECK và COMMENT về chữ cũ (nhánh `TheoCa` đúng một ngày); dùng ở `down` và để test so với migration gốc. */
export function nghiTheoCaNhieuNgayDownSql(): readonly string[] {
  if (
    OLD_CHECK_STATEMENT === undefined ||
    !OLD_CHECK_STATEMENT.startsWith(ADD_PREFIX) ||
    OLD_COMMENT_STATEMENT === undefined
  ) {
    throw new Error(
      'Không tìm thấy CHECK hoặc COMMENT cũ trong migration nghỉ phép gốc',
    );
  }
  return [
    `ALTER TABLE \`yeu_cau_nghi_phep\` DROP CHECK \`chk_nghi_phep_hinh_thuc\`, ADD CONSTRAINT ${OLD_CHECK_STATEMENT.slice(ADD_PREFIX.length)}`,
    OLD_COMMENT_STATEMENT,
  ];
}

export class NghiTheoCaNhieuNgay1793880000000 implements MigrationInterface {
  name = 'NghiTheoCaNhieuNgay1793880000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of NGHI_THEO_CA_NHIEU_NGAY_UP_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Còn yêu cầu `TheoCa` kéo dài nhiều ngày (mọi trạng thái) thì CHECK cũ bị vi phạm và MySQL sẽ từ chối giữa chừng: chặn TRƯỚC mọi câu DDL, không đổi gì,
    // không xoá hay tách dữ liệu của người dùng. Thông báo chỉ có SỐ dòng (không id, không lý do nghỉ).
    const [multiDay] = (await queryRunner.query(
      "SELECT COUNT(*) AS total FROM `yeu_cau_nghi_phep` WHERE `hinh_thuc_nghi` = 'TheoCa' AND `ngay_bat_dau` <> `ngay_ket_thuc`",
    )) as { total: string | number }[];
    if (Number(multiDay?.total ?? 0) > 0) {
      throw new Error(
        `Không hoàn tác được ${this.name}: còn ${String(multiDay?.total)} yêu cầu nghỉ theo ca kéo dài nhiều ngày (hinh_thuc_nghi = 'TheoCa' và ngay_bat_dau khác ngay_ket_thuc), sẽ vi phạm CHECK cũ.`,
      );
    }

    for (const statement of nghiTheoCaNhieuNgayDownSql()) {
      await queryRunner.query(statement);
    }
  }
}
