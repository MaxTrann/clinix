import type { MigrationInterface, QueryRunner } from 'typeorm';

// Doctor P4 (Q34): thêm 4 hành động và 2 loại đối tượng vào nhat_ky_hanh_dong.
// Giá trị mới thêm CUỐI danh sách để không đổi thứ tự/giá trị đã lưu. Danh sách đầy đủ lấy từ
// migration vận hành (van-hanh) + docs/database/clinix_mysql.sql; MG-08 đối chiếu với admin/entities/enums.ts.
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
];
const HANH_DONG_MOI = [
  'PhanCongLichLamViec',
  'GoLichLamViec',
  'DuyetNghiPhep',
  'TuChoiNghiPhep',
];
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
];
const DOI_TUONG_MOI = ['lich_lam_viec', 'yeu_cau_nghi_phep'];

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

export const NHAT_KY_PHAN_CONG_NGHI_PHEP_UP_SQL = modifyEnums(
  [...HANH_DONG_CU, ...HANH_DONG_MOI],
  [...DOI_TUONG_CU, ...DOI_TUONG_MOI],
);
export const NHAT_KY_PHAN_CONG_NGHI_PHEP_DOWN_SQL = modifyEnums(
  HANH_DONG_CU,
  DOI_TUONG_CU,
);

export class NhatKyPhanCongNghiPhep1793361600000 implements MigrationInterface {
  name = 'NhatKyPhanCongNghiPhep1793361600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(NHAT_KY_PHAN_CONG_NGHI_PHEP_UP_SQL);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Còn dòng nhật ký dùng giá trị mới thì MySQL báo lỗi 1265 và KHÔNG đổi gì (cố ý: không làm mất dấu vết).
    await queryRunner.query(NHAT_KY_PHAN_CONG_NGHI_PHEP_DOWN_SQL);
  }
}
