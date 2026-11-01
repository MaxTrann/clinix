import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ThongTinPhongKham } from '../entities/thong-tin-phong-kham.entity.js';
import type { UpdateClinicInfoDto } from './clinic-info.dto.js';

@Injectable()
export class ClinicInfoRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  get(): Promise<ThongTinPhongKham | null> {
    return this.db.getRepository(ThongTinPhongKham).findOneBy({ id: 1 });
  }

  upsert(input: UpdateClinicInfoDto): Promise<ThongTinPhongKham> {
    return this.db.transaction(async (manager) => {
      const repository = manager.getRepository(ThongTinPhongKham);
      await repository.upsert(
        {
          id: 1,
          tenThuongHieu: input.tenThuongHieu,
          diaChiTruSo: input.diaChiTruSo,
          duongDayNong: input.duongDayNong,
          email: input.email,
        },
        ['id'],
      );
      return repository.findOneByOrFail({ id: 1 });
    });
  }
}
