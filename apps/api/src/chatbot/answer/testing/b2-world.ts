import type { DataSource } from 'typeorm';
import { CauHinhHeThong } from '../../../admin/entities/cau-hinh-he-thong.entity.js';
import type { ChiNhanh } from '../../../admin/entities/chi-nhanh.entity.js';
import { MocHoanTien } from '../../../admin/entities/moc-hoan-tien.entity.js';
import { ThongTinPhongKham } from '../../../admin/entities/thong-tin-phong-kham.entity.js';
import { SystemConfigRepository } from '../../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../../admin/system-config/system-config.service.js';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../../database/testing/test-database.js';
import { ExamPriceReader } from '../../../pricing/exam-price.reader.js';
import { PublicDoctorRepository } from '../../../search/doctors/public-doctor.repository.js';
import { PublicDoctorService } from '../../../search/doctors/public-doctor.service.js';
import { DoctorRatingReader } from '../../../search/ratings/doctor-rating.reader.js';
import { SearchFixtures } from '../../../search/testing/search-fixtures.js';
import { ContextBuilder } from '../../context/context-builder.js';
import { PublicDoctorSourceAdapter } from '../../context/doctor-source.js';
import { PublicContextRepository } from '../../context/public-context.repository.js';
import { FakeClock } from '../../testing/fake-clock.js';
import { AnswerReconciler } from '../answer-reconciler.js';
import { EntityResolver } from '../entity-resolver.js';

// Hạ tầng cho TEST TÍCH HỢP của chatbot B2 (MySQL thật, DB `*_test`): dựng đúng các lớp thật nối với `PublicDoctorService`, `SystemConfigService` và
// `PublicContextRepository`, cộng các hàm gieo dữ liệu nhỏ. Dữ liệu tổng hợp, không dữ liệu thật. Chỉ test dùng; không nằm trong luồng chạy.

export interface World {
  readonly db: DataSource;
  readonly fixtures: SearchFixtures;
  readonly repository: PublicContextRepository;
  readonly doctorService: PublicDoctorService;
  readonly doctors: PublicDoctorSourceAdapter;
  readonly config: SystemConfigService;
  readonly clock: FakeClock;
  readonly builder: ContextBuilder;
  readonly resolver: EntityResolver;
  readonly reconciler: AnswerReconciler;
  close(): Promise<void>;
}

export async function openWorld(): Promise<World> {
  const db = await createTestDataSource(readTestDbSettings());
  const prices = new ExamPriceReader(db);
  const doctorService = new PublicDoctorService(
    new PublicDoctorRepository(db, prices),
    prices,
    new DoctorRatingReader(db),
  );
  const repository = new PublicContextRepository(db);
  const doctors = new PublicDoctorSourceAdapter(doctorService);
  const config = new SystemConfigService(new SystemConfigRepository(db));
  const clock = new FakeClock(0);
  const resolver = new EntityResolver({ reader: repository, doctors, config });
  return {
    db,
    fixtures: new SearchFixtures(db),
    repository,
    doctorService,
    doctors,
    config,
    clock,
    builder: new ContextBuilder({ base: repository, doctors, config, clock }),
    resolver,
    reconciler: new AnswerReconciler({ resolver, specialties: repository }),
    close: () => db.destroy(),
  };
}

export const seedClinic = (
  db: DataSource,
  over: Partial<ThongTinPhongKham> = {},
) => {
  const repo = db.getRepository(ThongTinPhongKham);
  return repo.save(
    repo.create({
      id: 1,
      tenThuongHieu: 'Phòng khám mẫu CLINIX',
      diaChiTruSo: 'Địa chỉ trụ sở minh họa',
      duongDayNong: '1900 0000',
      email: 'lienhe@example.invalid',
      ...over,
    }),
  );
};

/** Dòng cấu hình duy nhất: giữ chỗ 15 phút, tự đổi lịch tối đa 2 lần. */
export const seedConfig = (
  db: DataSource,
  over: Partial<CauHinhHeThong> = {},
) =>
  new BookingFixtures(db).systemConfig({
    thoiGianGiuCho: 15,
    soLanTuDoiLichToiDa: 2,
    ...over,
  });

/** Chi nhánh có đủ bảy thứ nhận khám (08:00 đến 12:00 và 13:00 đến 17:00). */
export async function seedBranch(
  world: Pick<World, 'fixtures'>,
  over: Partial<ChiNhanh> = {},
): Promise<ChiNhanh> {
  const branch = await world.fixtures.branchWithCoordinates(over);
  await world.fixtures.admin.weeklySchedule(branch.chiNhanhId);
  return branch;
}

export interface SeededDoctor {
  readonly bacSiId: string;
  readonly chuyenKhoaId: string;
  readonly dichVuKhamId: string;
  readonly chiNhanhId: string;
}

export interface DoctorOptions {
  readonly hoTen: string;
  readonly chuyenKhoaTen: string;
  readonly moTaChuyenKhoa?: string | null;
  readonly dichVuTen: string;
  readonly giaMacDinh?: string;
  readonly mucDatCoc?: string;
  /** Chức danh; mặc định `BS`. */
  readonly chucDanh?: 'BS' | 'BS_CKII' | 'ThS_BS';
}

/** Bác sĩ công khai trong `branch`; đặt tên, giá và cọc cho chuyên khoa và dịch vụ mà fixture vừa tạo riêng cho bác sĩ này. */
export async function seedDoctor(
  world: Pick<World, 'fixtures' | 'db'>,
  branch: ChiNhanh,
  options: DoctorOptions,
): Promise<SeededDoctor> {
  const hocVi = { BS: 'BS', BS_CKII: 'BS', ThS_BS: 'ThS' } as const;
  const chucDanh = options.chucDanh ?? 'BS';
  const { account, profile } = await world.fixtures.publicDoctor(
    branch,
    { chucDanh, hocVi: hocVi[chucDanh] },
    { hoTen: options.hoTen },
  );
  await world.db.query(
    'UPDATE chuyen_khoa SET ten = ?, mo_ta = ? WHERE chuyen_khoa_id = ?',
    [
      options.chuyenKhoaTen,
      options.moTaChuyenKhoa ?? null,
      profile.chuyenKhoaId,
    ],
  );
  await world.db.query(
    'UPDATE dich_vu_kham SET ten = ?, gia_mac_dinh = ?, muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
    [
      options.dichVuTen,
      options.giaMacDinh ?? '200000.00',
      options.mucDatCoc ?? '0.00',
      profile.dichVuKhamId,
    ],
  );
  return {
    bacSiId: account.taiKhoanId,
    chuyenKhoaId: profile.chuyenKhoaId,
    dichVuKhamId: profile.dichVuKhamId,
    chiNhanhId: branch.chiNhanhId,
  };
}

/** Mốc hoàn của dịch vụ, mỗi phần tử là `[số giờ trước giờ hẹn tối thiểu, tỷ lệ hoàn phần trăm]`. */
export async function seedRefundTiers(
  db: DataSource,
  dichVuKhamId: string,
  tiers: readonly (readonly [number, number])[],
): Promise<void> {
  const repo = db.getRepository(MocHoanTien);
  for (const [soGioTruocToiThieu, tyLeHoan] of tiers) {
    await repo.save(
      repo.create({ dichVuKhamId, soGioTruocToiThieu, tyLeHoan }),
    );
  }
}
