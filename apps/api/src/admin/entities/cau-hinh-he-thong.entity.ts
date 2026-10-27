import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cau_hinh_he_thong' })
@Check('chk_cau_hinh_mot_dong', '`id` = 1')
@Check(
  'chk_cau_hinh_gia_tri',
  '`thoi_gian_giu_cho` > 0 AND `thoi_han_phan_hoi_loi_moi` > 0 AND `so_lich_hen_toi_da_moi_ho_so` >= 1 AND `nguong_no_show` >= 1 AND `so_lan_tu_doi_lich_toi_da` >= 0 AND `so_muc_cho_toi_da` >= 0 AND `check_in_truoc_phut` >= 0 AND `check_in_sau_phut` >= 0 AND `so_ngay_bao_truoc_doi_gio_lam` >= 0 AND `trong_so_w1` >= 0 AND `trong_so_w2` >= 0',
)
@Check(
  'chk_cau_hinh_nhac_lich',
  'JSON_SCHEMA_VALID(\'{"type":"array","uniqueItems":true,"items":{"type":"integer","minimum":1}}\', `thoi_diem_nhac_lich`)',
)
export class CauHinhHeThong {
  @PrimaryColumn({ name: 'id', type: 'tinyint' })
  id!: number;

  @Column({ name: 'thoi_gian_giu_cho', type: 'int', default: 15 })
  thoiGianGiuCho!: number;

  @Column({
    name: 'thoi_diem_nhac_lich',
    type: 'json',
    default: () => '(json_array(72,24,2))',
  })
  thoiDiemNhacLich!: number[];

  @Column({ name: 'so_lich_hen_toi_da_moi_ho_so', type: 'int' })
  soLichHenToiDaMoiHoSo!: number;

  @Column({ name: 'so_lan_tu_doi_lich_toi_da', type: 'int' })
  soLanTuDoiLichToiDa!: number;

  @Column({ name: 'check_in_truoc_phut', type: 'int' })
  checkInTruocPhut!: number;

  @Column({ name: 'check_in_sau_phut', type: 'int' })
  checkInSauPhut!: number;

  @Column({ name: 'thoi_han_phan_hoi_loi_moi', type: 'int', default: 60 })
  thoiHanPhanHoiLoiMoi!: number;

  @Column({ name: 'so_muc_cho_toi_da', type: 'int', default: 2 })
  soMucChoToiDa!: number;

  @Column({ name: 'nguong_no_show', type: 'int', default: 3 })
  nguongNoShow!: number;

  @Column({ name: 'so_ngay_bao_truoc_doi_gio_lam', type: 'int' })
  soNgayBaoTruocDoiGioLam!: number;

  @Column({ name: 'trong_so_w1', type: 'decimal', precision: 3, scale: 2 })
  trongSoW1!: string;

  @Column({ name: 'trong_so_w2', type: 'decimal', precision: 3, scale: 2 })
  trongSoW2!: string;
}
