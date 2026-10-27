import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'thong_tin_phong_kham' })
@Check('chk_phong_kham_mot_dong', '`id` = 1')
export class ThongTinPhongKham {
  @PrimaryColumn({ name: 'id', type: 'tinyint' })
  id!: number;

  @Column({
    name: 'ten_thuong_hieu',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  tenThuongHieu!: string | null;

  @Column({
    name: 'dia_chi_tru_so',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  diaChiTruSo!: string | null;

  @Column({
    name: 'duong_day_nong',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  duongDayNong!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email!: string | null;
}
