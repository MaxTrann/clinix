import type { MigrationInterface, QueryRunner } from 'typeorm';

// Reschedule P1 (issue #634, scope #9 "Đổi lịch hẹn"; Q1, Q5, Q6): một migration cho cả phần nền dữ liệu của scope.
//   1. Bảng `yeu_cau_doi_lich_ngoai_chinh_sach` (tám câu TRÍCH NGUYÊN VĂN từ docs/database/clinix_mysql.sql): bảng này có trong file SQL chính thức nhưng chưa migration nào tạo
//      (migration vận hành chỉ nhắc tên bảng trong ENUM `loai_doi_tuong`); FK của `thong_bao` và entity mới cần bảng nên tạo ở đây. KHÔNG đổi bảng so với file chính thức.
//   2. `lich_hen.so_lan_tu_doi_lich` (int NOT NULL DEFAULT 0, CHECK >= 0): bộ đếm số lần Bệnh nhân TỰ đổi; lịch có trước nhận 0 (không điền giả).
//   3. `thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id` + UNIQUE `thong_bao_index_yeu_cau_doi_lich` + khóa ngoại. Thứ tự cột, chỉ mục, khóa ngoại (nếp P7): chỉ mục tạo TRƯỚC khóa
//      ngoại để MySQL không sinh chỉ mục ngầm và `SHOW CREATE TABLE` trùng DB dựng từ file SQL chính thức.
//   4. ENUM `nhat_ky_hanh_dong.hanh_dong` thêm `DoiLichHo` Ở CUỐI (giữ nguyên 26 giá trị cũ và thứ tự).
// Văn bản phải khớp docs/database/clinix_mysql.sql (migration-source.spec.ts, MDL-04, so từng ký tự).
// CẢNH BÁO `down` (MDL-06): xuống migration này BỎ cột bộ đếm, cột và chỉ mục thông báo, giá trị ENUM và CẢ BẢNG yêu cầu đổi lịch. DDL của MySQL tự commit nên `down` đếm dữ liệu sẽ mất
// TRƯỚC mọi câu DDL và CHẶN (không đổi gì) khi còn dòng nào; chỉ báo SỐ dòng, không id, tên hay lý do.

// Tám câu của bảng yêu cầu, đúng thứ tự trong file SQL chính thức: bảng, chỉ mục, COMMENT bảng, ba khóa ngoại, hai CHECK.
export const DOI_LICH_TAO_BANG_YEU_CAU_SQL: readonly string[] = [
  "CREATE TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` (\n  `yeu_cau_doi_lich_ngoai_chinh_sach_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `lich_hen_id` bigint NOT NULL,\n  `khung_gio_mong_muon_id` bigint NOT NULL,\n  `ly_do_yeu_cau` text NOT NULL COMMENT 'Lý do bệnh nhân cần đổi lịch',\n  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',\n  `ghi_chu_xu_ly` varchar(255) COMMENT 'Ghi chú của Lễ tân hoặc Quản trị viên khi duyệt hoặc từ chối',\n  `nguoi_xu_ly_id` bigint COMMENT 'Lễ tân hoặc Quản trị viên',\n  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có',\n  `thoi_diem_tao` datetime NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE INDEX `yeu_cau_doi_lich_ngoai_chinh_sach_index_12` ON `yeu_cau_doi_lich_ngoai_chinh_sach` (`trang_thai`, `thoi_diem_tao`)',
  "ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` COMMENT = 'Ràng buộc: khi đã xử lý (khác ChoDuyet) thì bắt buộc có ghi_chu_xu_ly.'",
  'ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)',
  'ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`khung_gio_mong_muon_id`) REFERENCES `khung_gio` (`khung_gio_id`)',
  'ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `tai_khoan` (`tai_khoan_id`)',
  "ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD CONSTRAINT `chk_doi_lich_xu_ly` CHECK (\n    `trang_thai` = 'ChoDuyet' OR `ghi_chu_xu_ly` IS NOT NULL\n)",
  "ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD CONSTRAINT `chk_doi_lich_nguoi_xu_ly` CHECK (\n    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)\n)",
];

export const DOI_LICH_LICH_HEN_SQL: readonly string[] = [
  "ALTER TABLE `lich_hen` ADD COLUMN `so_lan_tu_doi_lich` int NOT NULL DEFAULT 0 COMMENT 'Số lần Bệnh nhân đã TỰ đổi trong chuỗi đổi lịch tính tới lịch này (reschedule P1, Q1). Lịch mới = lịch cũ + 1 khi Bệnh nhân tự đổi; bằng lịch cũ khi Lễ tân đổi hộ hoặc Lễ tân/QTV duyệt yêu cầu ngoài chính sách; lịch không phải do đổi lịch tạo, và mọi lịch tạo trước P1, = 0' AFTER `lich_hen_truoc_id`",
  'ALTER TABLE `lich_hen` ADD CONSTRAINT `chk_lich_hen_so_lan_tu_doi` CHECK (\n    `so_lan_tu_doi_lich` >= 0\n)',
];

export const DOI_LICH_THONG_BAO_SQL: readonly string[] = [
  "ALTER TABLE `thong_bao` ADD COLUMN `yeu_cau_doi_lich_ngoai_chinh_sach_id` bigint COMMENT 'Chỉ có với thông báo sinh từ một yêu cầu đổi lịch ngoài chính sách (reschedule P1, Q5); khi có thì thông báo không gắn lịch hẹn (tránh trùng UNIQUE thong_bao_index_lich_hen khi một lịch có nhiều yêu cầu theo thời gian). Cùng (yêu cầu, tài khoản, loại sự kiện) chỉ có 1 thông báo' AFTER `lich_hen_id`",
  'CREATE UNIQUE INDEX `thong_bao_index_yeu_cau_doi_lich` ON `thong_bao` (`yeu_cau_doi_lich_ngoai_chinh_sach_id`, `tai_khoan_id`, `loai_su_kien`)',
  'ALTER TABLE `thong_bao` ADD FOREIGN KEY (`yeu_cau_doi_lich_ngoai_chinh_sach_id`) REFERENCES `yeu_cau_doi_lich_ngoai_chinh_sach` (`yeu_cau_doi_lich_ngoai_chinh_sach_id`)',
];

// 26 giá trị `hanh_dong` đã có trước migration này, đúng thứ tự trong CREATE TABLE `nhat_ky_hanh_dong` (loai_doi_tuong KHÔNG đổi).
export const HANH_DONG_TRUOC_DOI_LICH: readonly string[] = [
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
  'DuyetRutTien',
  'TuChoiRutTien',
];
export const HANH_DONG_DOI_LICH = 'DoiLichHo';

function modifyHanhDong(values: readonly string[]): string {
  const list = values.map((value) => `'${value}'`).join(', ');
  return `ALTER TABLE \`nhat_ky_hanh_dong\` MODIFY \`hanh_dong\` ENUM (${list}) NOT NULL`;
}

export const DOI_LICH_NHAT_KY_UP_SQL = modifyHanhDong([
  ...HANH_DONG_TRUOC_DOI_LICH,
  HANH_DONG_DOI_LICH,
]);
export const DOI_LICH_NHAT_KY_DOWN_SQL = modifyHanhDong(
  HANH_DONG_TRUOC_DOI_LICH,
);

/** Mười bốn câu của `up`, theo thứ tự chạy (bảng yêu cầu phải có trước khóa ngoại của `thong_bao`). */
export const DOI_LICH_UP_SQL: readonly string[] = [
  ...DOI_LICH_TAO_BANG_YEU_CAU_SQL,
  ...DOI_LICH_LICH_HEN_SQL,
  ...DOI_LICH_THONG_BAO_SQL,
  DOI_LICH_NHAT_KY_UP_SQL,
];

// Bốn thứ `down` sẽ làm mất; đếm trong MỘT câu, trước mọi câu DDL.
export const DOI_LICH_DEM_DU_LIEU_SQL =
  'SELECT ' +
  '(SELECT COUNT(*) FROM `lich_hen` WHERE `so_lan_tu_doi_lich` <> 0) AS lichHen, ' +
  '(SELECT COUNT(*) FROM `thong_bao` WHERE `yeu_cau_doi_lich_ngoai_chinh_sach_id` IS NOT NULL) AS thongBao, ' +
  "(SELECT COUNT(*) FROM `nhat_ky_hanh_dong` WHERE `hanh_dong` = 'DoiLichHo') AS nhatKy, " +
  '(SELECT COUNT(*) FROM `yeu_cau_doi_lich_ngoai_chinh_sach`) AS yeuCau';

// Các câu của `down` sau khi đã bỏ khóa ngoại của thong_bao (tên khóa ngoại do MySQL đặt nên tra tên thật ở `down`). Thứ tự: chỉ mục -> cột thong_bao; CHECK -> cột lich_hen (MySQL
// không cho bỏ cột còn nằm trong CHECK); ENUM về 26 giá trị; cuối cùng bỏ bảng (khóa ngoại của chính nó nằm trong bảng).
export const DOI_LICH_DOWN_SQL: readonly string[] = [
  'DROP INDEX `thong_bao_index_yeu_cau_doi_lich` ON `thong_bao`',
  'ALTER TABLE `thong_bao` DROP COLUMN `yeu_cau_doi_lich_ngoai_chinh_sach_id`',
  'ALTER TABLE `lich_hen` DROP CHECK `chk_lich_hen_so_lan_tu_doi`',
  'ALTER TABLE `lich_hen` DROP COLUMN `so_lan_tu_doi_lich`',
  DOI_LICH_NHAT_KY_DOWN_SQL,
  'DROP TABLE `yeu_cau_doi_lich_ngoai_chinh_sach`',
];

interface DoiLichCounts {
  lichHen: string | number;
  thongBao: string | number;
  nhatKy: string | number;
  yeuCau: string | number;
}

export class DoiLich1793966400000 implements MigrationInterface {
  name = 'DoiLich1793966400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of DOI_LICH_UP_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DDL tự commit nên không hoàn tác được nửa chừng: đếm TRƯỚC mọi câu DDL, còn dòng nào sẽ mất thì dừng, DB nguyên vẹn (cùng nếp P7, B19, UX7, payment P1).
    const [used] = (await queryRunner.query(
      DOI_LICH_DEM_DU_LIEU_SQL,
    )) as DoiLichCounts[];
    const lichHen = Number(used?.lichHen ?? 0);
    const thongBao = Number(used?.thongBao ?? 0);
    const nhatKy = Number(used?.nhatKy ?? 0);
    const yeuCau = Number(used?.yeuCau ?? 0);
    if (lichHen + thongBao + nhatKy + yeuCau > 0) {
      throw new Error(
        `Không hoàn tác được ${this.name}: còn ${lichHen} lịch hẹn có so_lan_tu_doi_lich khác 0, ${thongBao} thông báo gắn yêu cầu đổi lịch, ${nhatKy} dòng nhật ký DoiLichHo và ${yeuCau} yêu cầu đổi lịch ngoài chính sách. ` +
          'Dữ liệu được giữ nguyên và DB không đổi; xử lý các dòng này rồi chạy lại.',
      );
    }

    // Khóa ngoại khai không tên nên MySQL tự đặt (thong_bao_ibfk_N): tra tên thật, bỏ TRƯỚC chỉ mục (lỗi 1553) và cột (lỗi 1828).
    const foreignKeys = (await queryRunner.query(
      'SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE ' +
        'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = ?',
      [
        'thong_bao',
        'yeu_cau_doi_lich_ngoai_chinh_sach_id',
        'yeu_cau_doi_lich_ngoai_chinh_sach',
      ],
    )) as { name: string }[];
    for (const { name } of foreignKeys) {
      await queryRunner.query(
        `ALTER TABLE \`thong_bao\` DROP FOREIGN KEY \`${name}\``,
      );
    }
    for (const statement of DOI_LICH_DOWN_SQL) {
      await queryRunner.query(statement);
    }
  }
}
