import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  HANH_DONG_NHAY_CAM,
  LOAI_DOI_TUONG_NHAT_KY,
  type HanhDongNhayCam,
  type LoaiDoiTuongNhatKy,
} from './enums.js';

const KET_QUA_NHAT_KY = ['ThanhCong', 'ThatBai'] as const;
type KetQuaNhatKy = (typeof KET_QUA_NHAT_KY)[number];

@Entity({ name: 'nhat_ky_hanh_dong' })
@Index('nhat_ky_hanh_dong_index_29', ['loaiDoiTuong', 'maDoiTuong', 'thoiDiem'])
@Index('nhat_ky_hanh_dong_index_30', ['taiKhoanId', 'thoiDiem'])
@Index('nhat_ky_hanh_dong_index_31', ['chiNhanhId', 'thoiDiem'])
@Check(
  'chk_nhat_ky_cap_nhat_cau_hinh',
  "`hanh_dong` <> 'CapNhatCauHinh' OR (`loai_doi_tuong` = 'cau_hinh_he_thong' AND `ma_doi_tuong` = 1 AND `chi_nhanh_id` IS NULL AND `chi_tiet_thay_doi` IS NOT NULL AND JSON_TYPE(`chi_tiet_thay_doi`) = 'OBJECT' AND JSON_CONTAINS_PATH(`chi_tiet_thay_doi`, 'all', '$.truoc', '$.sau', '$.ly_do') AND JSON_TYPE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.truoc')) = 'OBJECT' AND JSON_TYPE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.sau')) = 'OBJECT' AND JSON_LENGTH(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.truoc')) >= 1 AND JSON_KEYS(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.truoc')) = JSON_KEYS(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.sau')) AND JSON_TYPE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.ly_do')) = 'STRING' AND CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.ly_do')))) >= 1)",
)
export class NhatKyHanhDong {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'nhat_ky_hanh_dong_id' })
  nhatKyHanhDongId!: string;

  @Column({ name: 'tai_khoan_id', type: 'bigint' })
  taiKhoanId!: string;

  @Column({ name: 'chi_nhanh_id', type: 'bigint', nullable: true })
  chiNhanhId!: string | null;

  @Column({ name: 'hanh_dong', type: 'enum', enum: HANH_DONG_NHAY_CAM })
  hanhDong!: HanhDongNhayCam;

  @Column({
    name: 'loai_doi_tuong',
    type: 'enum',
    enum: LOAI_DOI_TUONG_NHAT_KY,
  })
  loaiDoiTuong!: LoaiDoiTuongNhatKy;

  @Column({ name: 'ma_doi_tuong', type: 'bigint' })
  maDoiTuong!: string;

  @Column({ name: 'thoi_diem', type: 'datetime' })
  thoiDiem!: Date;

  @Column({ name: 'ket_qua', type: 'enum', enum: KET_QUA_NHAT_KY })
  ketQua!: KetQuaNhatKy;

  @Column({ name: 'chi_tiet_thay_doi', type: 'json', nullable: true })
  chiTietThayDoi!: Record<string, unknown> | null;
}
