import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CauHinhHeThong } from '../entities/cau-hinh-he-thong.entity.js';

@Injectable()
export class SystemConfigRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  get(): Promise<CauHinhHeThong | null> {
    return this.db.getRepository(CauHinhHeThong).findOneBy({ id: 1 });
  }

  count(): Promise<number> {
    return this.db.getRepository(CauHinhHeThong).countBy({ id: 1 });
  }
}
