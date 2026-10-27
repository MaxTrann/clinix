import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  TRANG_THAI_YEU_CAU_THAY_DOI_CHI_NHANH,
  type TrangThaiYeuCauThayDoiChiNhanh,
} from './enums.js';

@Entity({ name: 'yeu_cau_thay_doi_chi_nhanh' })
@Check(
  'chk_yc_chi_nhanh_noi_dung',
  "JSON_TYPE(`noi_dung_truoc`) = 'OBJECT' AND JSON_LENGTH(`noi_dung_truoc`) > 0 AND JSON_TYPE(`noi_dung_sau`) = 'OBJECT' AND JSON_LENGTH(`noi_dung_sau`) > 0",
)
@Check(
  'chk_yc_chi_nhanh_xu_ly',
  "`so_lan_doi_hieu_luc` >= 0 AND ((`trang_thai` = 'ChoDuyet' AND `nguoi_duyet_id` IS NULL AND `thoi_diem_duyet` IS NULL AND `ly_do_tu_choi` IS NULL AND `so_ngay_bao_truoc` IS NULL AND `hieu_luc_tu` IS NULL AND `ap_dung_luc` IS NULL AND `nguoi_huy_id` IS NULL AND `thoi_diem_huy` IS NULL AND `ly_do_huy` IS NULL AND `qua_han_luc` IS NULL AND `so_lan_doi_hieu_luc` = 0) OR (`trang_thai` = 'DaDuyet' AND `nguoi_duyet_id` IS NOT NULL AND `thoi_diem_duyet` IS NOT NULL AND `ly_do_tu_choi` IS NULL AND `so_ngay_bao_truoc` IS NOT NULL AND `so_ngay_bao_truoc` >= 0 AND `hieu_luc_tu` IS NOT NULL AND `hieu_luc_tu` >= DATE_ADD(`thoi_diem_duyet`, INTERVAL `so_ngay_bao_truoc` DAY) AND (`ap_dung_luc` IS NULL OR `ap_dung_luc` >= `hieu_luc_tu`) AND `nguoi_huy_id` IS NULL AND `thoi_diem_huy` IS NULL AND `ly_do_huy` IS NULL AND (`qua_han_luc` IS NULL OR `qua_han_luc` >= `hieu_luc_tu`)) OR (`trang_thai` = 'TuChoi' AND `nguoi_duyet_id` IS NOT NULL AND `thoi_diem_duyet` IS NOT NULL AND `ly_do_tu_choi` IS NOT NULL AND `so_ngay_bao_truoc` IS NULL AND `hieu_luc_tu` IS NULL AND `ap_dung_luc` IS NULL AND `nguoi_huy_id` IS NULL AND `thoi_diem_huy` IS NULL AND `ly_do_huy` IS NULL AND `qua_han_luc` IS NULL AND `so_lan_doi_hieu_luc` = 0) OR (`trang_thai` = 'DaRut' AND `nguoi_duyet_id` IS NULL AND `thoi_diem_duyet` IS NULL AND `ly_do_tu_choi` IS NULL AND `so_ngay_bao_truoc` IS NULL AND `hieu_luc_tu` IS NULL AND `ap_dung_luc` IS NULL AND `nguoi_huy_id` IS NULL AND `thoi_diem_huy` IS NULL AND `ly_do_huy` IS NULL AND `qua_han_luc` IS NULL AND `so_lan_doi_hieu_luc` = 0) OR (`trang_thai` = 'DaHuy' AND `nguoi_duyet_id` IS NOT NULL AND `thoi_diem_duyet` IS NOT NULL AND `ly_do_tu_choi` IS NULL AND `so_ngay_bao_truoc` IS NOT NULL AND `so_ngay_bao_truoc` >= 0 AND `hieu_luc_tu` IS NOT NULL AND `hieu_luc_tu` >= DATE_ADD(`thoi_diem_duyet`, INTERVAL `so_ngay_bao_truoc` DAY) AND `ap_dung_luc` IS NULL AND `nguoi_huy_id` IS NOT NULL AND `thoi_diem_huy` IS NOT NULL AND `ly_do_huy` IS NOT NULL AND CHAR_LENGTH(TRIM(`ly_do_huy`)) >= 1 AND (`qua_han_luc` IS NULL OR `qua_han_luc` >= `hieu_luc_tu`)))",
)
@Index('yeu_cau_thay_doi_chi_nhanh_index_chi_nhanh', [
  'chiNhanhId',
  'trangThai',
])
@Index('yeu_cau_thay_doi_chi_nhanh_index_hieu_luc', ['trangThai', 'hieuLucTu'])
@Index('yeu_cau_thay_doi_chi_nhanh_unique_dang_mo', ['dangMoChiNhanh'], {
  unique: true,
})
export class YeuCauThayDoiChiNhanh {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'yeu_cau_thay_doi_chi_nhanh_id',
  })
  yeuCauThayDoiChiNhanhId!: string;

  @Column({ name: 'chi_nhanh_id', type: 'bigint' })
  chiNhanhId!: string;

  @Column({ name: 'nguoi_de_xuat_id', type: 'bigint' })
  nguoiDeXuatId!: string;

  @Column({ name: 'noi_dung_truoc', type: 'json' })
  noiDungTruoc!: Record<string, unknown>;

  @Column({ name: 'noi_dung_sau', type: 'json' })
  noiDungSau!: Record<string, unknown>;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_YEU_CAU_THAY_DOI_CHI_NHANH,
    default: 'ChoDuyet',
  })
  trangThai!: TrangThaiYeuCauThayDoiChiNhanh;

  @Column({
    name: 'thoi_diem_tao',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  thoiDiemTao!: Date;

  @Column({ name: 'nguoi_duyet_id', type: 'bigint', nullable: true })
  nguoiDuyetId!: string | null;

  @Column({ name: 'thoi_diem_duyet', type: 'datetime', nullable: true })
  thoiDiemDuyet!: Date | null;

  @Column({
    name: 'ly_do_tu_choi',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  lyDoTuChoi!: string | null;

  @Column({ name: 'so_ngay_bao_truoc', type: 'int', nullable: true })
  soNgayBaoTruoc!: number | null;

  @Column({ name: 'hieu_luc_tu', type: 'datetime', nullable: true })
  hieuLucTu!: Date | null;

  @Column({ name: 'ap_dung_luc', type: 'datetime', nullable: true })
  apDungLuc!: Date | null;

  @Column({ name: 'nguoi_huy_id', type: 'bigint', nullable: true })
  nguoiHuyId!: string | null;

  @Column({ name: 'thoi_diem_huy', type: 'datetime', nullable: true })
  thoiDiemHuy!: Date | null;

  @Column({ name: 'ly_do_huy', type: 'varchar', length: 255, nullable: true })
  lyDoHuy!: string | null;

  @Column({ name: 'qua_han_luc', type: 'datetime', nullable: true })
  quaHanLuc!: Date | null;

  @Column({ name: 'so_lan_doi_hieu_luc', type: 'int', default: 0 })
  soLanDoiHieuLuc!: number;

  @Column({
    name: 'dang_mo_chi_nhanh',
    type: 'bigint',
    nullable: true,
    asExpression:
      "IF((`trang_thai` = 'ChoDuyet' OR (`trang_thai` = 'DaDuyet' AND `ap_dung_luc` IS NULL)), `chi_nhanh_id`, NULL)",
    generatedType: 'STORED',
    insert: false,
    update: false,
  })
  dangMoChiNhanh!: string | null;
}
