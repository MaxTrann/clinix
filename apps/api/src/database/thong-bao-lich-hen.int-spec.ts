import { QueryFailedError, type DataSource } from 'typeorm';
import { ThongBao } from '../admin/entities/thong-bao.entity.js';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { isDuplicateKeyError, isForeignKeyError } from './mysql-errors.js';
import {
  normalizeStatement,
  officialStatementsFor,
} from './testing/official-schema.js';

// Booking P7 (Q29-A) — thong_bao.lich_hen_id, UNIQUE thong_bao_index_lich_hen và khóa ngoại trên MySQL 8.4 THẬT
// (TBLH-04…TBLH-08, TBLH-11). TBLH-01…03 ở migration-source.spec.ts, TBLH-09 ở migrations.int-spec.ts,
// TBLH-10 là test SHOW CREATE TABLE của schema-parity.int-spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

/** Hai Bệnh nhân và hai lịch hẹn thật (hai khung giờ khác nhau vì khung giờ đang giữ là UNIQUE). */
async function setup() {
  const branch = await fx.branch();
  const doctor = await fx.doctor(branch);
  const patientA = await fx.patient();
  const patientB = await fx.patient();
  const shift = await fx.shift(doctor.profile);
  const slot1 = await fx.slot(shift);
  const slot2 = await fx.slot(shift, {
    ngayGio: new Date('2026-11-02T08:30:00+07:00'),
  });
  const appointment1 = await fx.appointment(
    doctor.profile,
    slot1,
    patientA.account.taiKhoanId,
  );
  const appointment2 = await fx.appointment(
    doctor.profile,
    slot2,
    patientA.account.taiKhoanId,
  );
  return {
    accountA: patientA.account.taiKhoanId,
    accountB: patientB.account.taiKhoanId,
    lichHen1: appointment1.lichHenId,
    lichHen2: appointment2.lichHenId,
  };
}

const insert = (
  taiKhoanId: string,
  loaiSuKien: string,
  lichHenId: string | null,
) =>
  db.query(
    'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, NOW())',
    [taiKhoanId, 'TBLH', loaiSuKien, lichHenId],
  );

async function countRows(): Promise<number> {
  const rows = (await db.query('SELECT COUNT(*) AS total FROM thong_bao')) as {
    total: string | number;
  }[];
  return Number(rows[0]?.total);
}

/** Chạy `work`, trả về lỗi nó ném (không có lỗi thì làm test đỏ). */
async function failure(work: Promise<unknown>): Promise<QueryFailedError> {
  try {
    await work;
  } catch (error) {
    if (error instanceof QueryFailedError) return error;
    throw error;
  }
  throw new Error('Mong đợi lỗi MySQL nhưng câu lệnh thành công');
}

const sqlMessage = (error: QueryFailedError): string =>
  String((error.driverError as { sqlMessage?: string }).sqlMessage);

describe('thong_bao.lich_hen_id trên MySQL thật', () => {
  it('TBLH-04: cột, chỉ mục UNIQUE và khóa ngoại có thật, đúng như file SQL chính thức', async () => {
    const columns = (await db.query(
      `SELECT DATA_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def, COLUMN_COMMENT AS comment,
              ORDINAL_POSITION AS position
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND COLUMN_NAME IN ('yeu_cau_thay_doi_chi_nhanh_id', 'lich_hen_id')
        ORDER BY ORDINAL_POSITION`,
    )) as {
      type: string;
      nullable: string;
      def: string | null;
      comment: string;
      position: number;
    }[];
    const [previous, lichHen] = columns;
    expect(lichHen).toMatchObject({
      type: 'bigint',
      nullable: 'YES',
      def: null,
    });
    // Đứng ngay sau yeu_cau_thay_doi_chi_nhanh_id
    expect(Number(lichHen?.position)).toBe(Number(previous?.position) + 1);
    // COMMENT trong DB = COMMENT ở CREATE TABLE của file SQL chính thức
    const createTable =
      officialStatementsFor(['thong_bao'])
        .map(normalizeStatement)
        .find((sql) => sql.startsWith('CREATE TABLE `thong_bao` (')) ?? '';
    const officialComment =
      /^ {2}`lich_hen_id` bigint COMMENT '([^']*)',$/m.exec(createTable)?.[1];
    expect(officialComment).toBeTruthy();
    expect(lichHen?.comment).toBe(officialComment);

    const index = (await db.query(
      `SELECT NON_UNIQUE AS nonUnique, COLUMN_NAME AS name
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND INDEX_NAME = 'thong_bao_index_lich_hen'
        ORDER BY SEQ_IN_INDEX`,
    )) as { nonUnique: number; name: string }[];
    expect(index.map((row) => Number(row.nonUnique))).toEqual([0, 0, 0]);
    expect(index.map((row) => row.name)).toEqual([
      'lich_hen_id',
      'tai_khoan_id',
      'loai_su_kien',
    ]);

    // Chỉ mục này đã đủ làm chỉ mục cho khóa ngoại: không có chỉ mục ngầm thứ hai bắt đầu bằng lich_hen_id
    const startsWithLichHen = (await db.query(
      `SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND COLUMN_NAME = 'lich_hen_id' AND SEQ_IN_INDEX = 1`,
    )) as { name: string }[];
    expect(startsWithLichHen.map((row) => row.name)).toEqual([
      'thong_bao_index_lich_hen',
    ]);

    const foreignKeys = (await db.query(
      `SELECT REFERENCED_TABLE_NAME AS tableName, REFERENCED_COLUMN_NAME AS columnName
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND COLUMN_NAME = 'lich_hen_id' AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as { tableName: string; columnName: string }[];
    expect(foreignKeys).toEqual([
      { tableName: 'lich_hen', columnName: 'lich_hen_id' },
    ]);
  });

  it('TBLH-05: lich_hen_id không tồn tại bị khóa ngoại từ chối (1452); lịch hẹn thật và NULL chèn được', async () => {
    const { accountA, lichHen1 } = await setup();

    const error = await failure(insert(accountA, 'LichHenDaHuy', '999999999'));
    expect(isForeignKeyError(error)).toBe(true);
    expect((error.driverError as { errno?: number }).errno).toBe(1452);
    expect(await countRows()).toBe(0);

    await insert(accountA, 'LichHenDaHuy', lichHen1);
    await insert(accountA, 'LichHenDaHuy', null);
    expect(await countRows()).toBe(2);
  });

  it('TBLH-06: trùng (lich_hen_id, tai_khoan_id, loai_su_kien) bị UNIQUE từ chối (1062); dòng đầu còn nguyên', async () => {
    const { accountA, lichHen1 } = await setup();
    await insert(accountA, 'LichHenDaHuy', lichHen1);

    const error = await failure(insert(accountA, 'LichHenDaHuy', lichHen1));
    expect(isDuplicateKeyError(error)).toBe(true);
    expect(sqlMessage(error)).toContain('thong_bao_index_lich_hen');
    expect(await countRows()).toBe(1);
  });

  it('TBLH-07: đổi đúng một thành phần (loại sự kiện, tài khoản hoặc lịch hẹn) thì chèn được', async () => {
    const { accountA, accountB, lichHen1, lichHen2 } = await setup();
    await insert(accountA, 'LichHenDaHuy', lichHen1);

    await insert(accountA, 'LichHenVangMat', lichHen1); // khác loại sự kiện
    await insert(accountB, 'LichHenDaHuy', lichHen1); // khác tài khoản
    await insert(accountA, 'LichHenDaHuy', lichHen2); // khác lịch hẹn
    expect(await countRows()).toBe(4);
  });

  it('TBLH-08: nhiều dòng lich_hen_id NULL hợp lệ; trùng theo yêu cầu đổi chi nhánh vẫn bị chặn như cũ', async () => {
    const { accountA } = await setup();

    await insert(accountA, 'LichHenDaHuy', null);
    await insert(accountA, 'LichHenDaHuy', null);
    await insert(accountA, 'LichHenDaHuy', null);
    expect(await countRows()).toBe(3);

    // Không hồi quy: thong_bao_index_yeu_cau_chi_nhanh. Bảng yêu cầu để trống nên tắt kiểm khóa ngoại trên MỘT kết nối.
    const queryRunner = db.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      const insertForRequest = () =>
        queryRunner.query(
          "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, yeu_cau_thay_doi_chi_nhanh_id, thoi_diem_tao) VALUES (?, 'TBLH', 'KetQuaYeuCauThayDoiChiNhanh', 900001, NOW())",
          [accountA],
        );
      await insertForRequest();
      const error = await failure(insertForRequest());
      expect(isDuplicateKeyError(error)).toBe(true);
      expect(sqlMessage(error)).toContain('thong_bao_index_yeu_cau_chi_nhanh');
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.release();
    }
    expect(await countRows()).toBe(4);
  });

  it('TBLH-11: entity ThongBao ghi và đọc lichHenId là chuỗi (hoặc null); lưu trùng bộ ba thì 1062', async () => {
    const { accountA, lichHen1 } = await setup();
    const repo = db.getRepository(ThongBao);
    const draft = {
      taiKhoanId: accountA,
      noiDung: 'TBLH-11',
      loaiSuKien: 'LichHenDaXacNhan',
      thoiDiemTao: new Date(),
    };

    const linked = await repo.save(
      repo.create({ ...draft, lichHenId: lichHen1 }),
    );
    const loadedLinked = await repo.findOneByOrFail({
      thongBaoId: linked.thongBaoId,
    });
    expect(typeof loadedLinked.lichHenId).toBe('string');
    expect(loadedLinked.lichHenId).toBe(lichHen1);

    const plain = await repo.save(repo.create({ ...draft, lichHenId: null }));
    expect(
      (await repo.findOneByOrFail({ thongBaoId: plain.thongBaoId })).lichHenId,
    ).toBeNull();

    const error = await failure(
      repo.save(repo.create({ ...draft, lichHenId: lichHen1 })),
    );
    expect(isDuplicateKeyError(error)).toBe(true);
    expect(await countRows()).toBe(2);
  });
});
