import type { DataSource, EntityTarget } from 'typeorm';
import {
  HANH_DONG_NHAY_CAM,
  TRANG_THAI_YEU_CAU_DOI_LICH,
} from '../admin/entities/enums.js';
import { LichHen } from '../admin/entities/lich-hen.entity.js';
import { ThongBao } from '../admin/entities/thong-bao.entity.js';
import { YeuCauDoiLichNgoaiChinhSach } from '../admin/entities/yeu-cau-doi-lich-ngoai-chinh-sach.entity.js';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import {
  normalizeStatement,
  officialStatementsFor,
} from './testing/official-schema.js';

// Reschedule P1 (issue #634) — ràng buộc thật của migration DoiLich1793966400000 trên MySQL 8.4 THẬT (MDL-01 phần CHECK, MDL-02, MDL-03, MDL-05, MDL-07).
// MDL-04, MDL-08, MDL-09 (chữ DDL) ở migration-source.spec.ts; MDL-01 (up, down), MDL-06 ở migrations.int-spec.ts; SHOW CREATE TABLE so với file SQL chính thức ở schema-parity.int-spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

/** Bệnh nhân, Lễ tân, một lịch hẹn thật và một khung giờ trống khác (khung giờ mong muốn của yêu cầu). */
async function world() {
  const branch = await fx.branch();
  const doctor = await fx.doctor(branch);
  const patient = await fx.patient();
  const staff = await fx.receptionist(branch);
  const shift = await fx.shift(doctor.profile);
  const slot = await fx.slot(shift);
  const wanted = await fx.slot(shift, {
    ngayGio: new Date('2026-11-02T08:30:00+07:00'),
  });
  const appointment = await fx.appointment(
    doctor.profile,
    slot,
    patient.account.taiKhoanId,
  );
  return {
    branch,
    doctor,
    slot,
    patientId: patient.account.taiKhoanId,
    staffId: staff.account.taiKhoanId,
    appointment,
    wantedSlot: wanted,
    wantedSlotId: wanted.khungGioId,
  };
}

type World = Awaited<ReturnType<typeof world>>;

/** Yêu cầu hợp lệ (ChoDuyet, chưa ai xử lý); `overrides` ghi đè từng trường để dựng ca sai. */
const requestOf = (
  w: World,
  overrides: Partial<YeuCauDoiLichNgoaiChinhSach> = {},
) =>
  db.getRepository(YeuCauDoiLichNgoaiChinhSach).save(
    db.getRepository(YeuCauDoiLichNgoaiChinhSach).create({
      lichHenId: w.appointment.lichHenId,
      khungGioMongMuonId: w.wantedSlotId,
      lyDoYeuCau: 'MDL-LY-DO',
      thoiDiemTao: new Date(),
      ...overrides,
    }),
  );

const insertNotice = (
  accountId: string,
  kind: string,
  requestId: string | null,
) =>
  db.query(
    'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, yeu_cau_doi_lich_ngoai_chinh_sach_id, thoi_diem_tao) VALUES (?, ?, ?, ?, NOW())',
    [accountId, 'MDL', kind, requestId],
  );

const countOf = async (table: string): Promise<number> =>
  Number(
    (
      (await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``)) as {
        total: string | number;
      }[]
    )[0]?.total,
  );

/** So biểu thức CHECK không phụ thuộc cách MySQL viết lại (thêm `_utf8mb4`, ngoặc, chữ thường). */
const canon = (expression: string): string =>
  expression.toLowerCase().replace(/_utf8mb4|[`()\\\s]/g, '');

describe('lich_hen.so_lan_tu_doi_lich và CHECK chk_lich_hen_so_lan_tu_doi', () => {
  it('MDL-01: lịch tạo không nói đến bộ đếm nhận 0; 0, 1 và số lớn được nhận; đọc lại ra number', async () => {
    const w = await world();
    const repo = db.getRepository(LichHen);
    const fresh = await repo.findOneByOrFail({
      lichHenId: w.appointment.lichHenId,
    });
    expect(fresh.soLanTuDoiLich).toBe(0);
    for (const value of [1, 2, 2147483647]) {
      await repo.update(
        { lichHenId: w.appointment.lichHenId },
        { soLanTuDoiLich: value },
      );
      expect(
        (await repo.findOneByOrFail({ lichHenId: w.appointment.lichHenId }))
          .soLanTuDoiLich,
      ).toBe(value);
    }
  });

  it('MDL-01 (ca âm): -1 bị CHECK chặn ở INSERT lẫn UPDATE, dòng cũ giữ nguyên giá trị', async () => {
    const w = await world();
    const repo = db.getRepository(LichHen);
    // Dùng khung giờ CÒN TRỐNG (không phải khung giờ của lịch có sẵn) để lý do từ chối chỉ có thể là CHECK, không lẫn với UNIQUE khung_gio_dang_giu;
    // chèn lại cùng khung giờ với bộ đếm 0 được ngay sau đó chứng minh điều ấy.
    await expect(
      fx.appointment(w.doctor.profile, w.wantedSlot, w.patientId, {
        soLanTuDoiLich: -1,
      }),
    ).rejects.toThrow(/chk_lich_hen_so_lan_tu_doi/);
    await fx.appointment(w.doctor.profile, w.wantedSlot, w.patientId, {
      soLanTuDoiLich: 0,
    });
    await repo.update(
      { lichHenId: w.appointment.lichHenId },
      { soLanTuDoiLich: 3 },
    );
    await expect(
      repo.update(
        { lichHenId: w.appointment.lichHenId },
        { soLanTuDoiLich: -1 },
      ),
    ).rejects.toThrow(/chk_lich_hen_so_lan_tu_doi/);
    expect(
      (await repo.findOneByOrFail({ lichHenId: w.appointment.lichHenId }))
        .soLanTuDoiLich,
    ).toBe(3);
  });
});

describe('thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id: UNIQUE và khóa ngoại', () => {
  it('MDL-02: cùng (yêu cầu, tài khoản, loại) ⇒ lỗi trùng; khác yêu cầu, khác tài khoản hay khác loại ⇒ được', async () => {
    const w = await world();
    const first = await requestOf(w);
    const second = await requestOf(w);
    const otherAccount = (await fx.patient()).account.taiKhoanId;
    await insertNotice(w.patientId, 'DOI', first.yeuCauDoiLichNgoaiChinhSachId);
    await expect(
      insertNotice(w.patientId, 'DOI', first.yeuCauDoiLichNgoaiChinhSachId),
    ).rejects.toThrow(/Duplicate entry.*thong_bao_index_yeu_cau_doi_lich/s);
    // Một lịch có nhiều yêu cầu theo thời gian: mỗi yêu cầu có thông báo riêng
    await insertNotice(
      w.patientId,
      'DOI',
      second.yeuCauDoiLichNgoaiChinhSachId,
    );
    await insertNotice(
      otherAccount,
      'DOI',
      first.yeuCauDoiLichNgoaiChinhSachId,
    );
    await insertNotice(
      w.patientId,
      'KHAC',
      first.yeuCauDoiLichNgoaiChinhSachId,
    );
    expect(await countOf('thong_bao')).toBe(4);
  });

  it('MDL-02 (biên): nhiều thông báo KHÔNG thuộc yêu cầu (cột NULL) cùng tài khoản và loại vẫn được; UNIQUE của lịch hẹn (P7) không bị ảnh hưởng', async () => {
    const w = await world();
    for (let i = 0; i < 3; i++) await insertNotice(w.patientId, 'DOI', null);
    expect(await countOf('thong_bao')).toBe(3);
    const insertForAppointment = () =>
      db.query(
        'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, NOW())',
        [w.patientId, 'MDL', 'LICH', w.appointment.lichHenId],
      );
    await insertForAppointment();
    await expect(insertForAppointment()).rejects.toThrow(
      /Duplicate entry.*thong_bao_index_lich_hen/s,
    );
  });

  it('MDL-02 (khóa ngoại): id yêu cầu không tồn tại bị từ chối; không xoá được yêu cầu còn thông báo tham chiếu, xoá được khi hết thông báo', async () => {
    const w = await world();
    await expect(insertNotice(w.patientId, 'DOI', '999999')).rejects.toThrow(
      /foreign key constraint fails/i,
    );
    const request = await requestOf(w);
    await insertNotice(
      w.patientId,
      'DOI',
      request.yeuCauDoiLichNgoaiChinhSachId,
    );
    const repo = db.getRepository(YeuCauDoiLichNgoaiChinhSach);
    await expect(
      repo.delete({
        yeuCauDoiLichNgoaiChinhSachId: request.yeuCauDoiLichNgoaiChinhSachId,
      }),
    ).rejects.toThrow(/foreign key constraint fails/i);
    await db.query('DELETE FROM thong_bao');
    await repo.delete({
      yeuCauDoiLichNgoaiChinhSachId: request.yeuCauDoiLichNgoaiChinhSachId,
    });
    expect(await countOf('yeu_cau_doi_lich_ngoai_chinh_sach')).toBe(0);
  });
});

describe('ENUM nhat_ky_hanh_dong.hanh_dong có DoiLichHo ở cuối', () => {
  const readDbEnum = async (): Promise<string[]> => {
    const rows = (await db.query(
      "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nhat_ky_hanh_dong' AND COLUMN_NAME = 'hanh_dong'",
    )) as { type: string }[];
    return [...(rows[0]?.type ?? '').matchAll(/'([^']+)'/g)].map(
      (match) => match[1] as string,
    );
  };

  it('MDL-03: 27 giá trị, DoiLichHo cuối, 26 giá trị cũ giữ nguyên thứ tự; DB = file SQL chính thức = HANH_DONG_NHAY_CAM (so cả thứ tự)', async () => {
    const dbValues = await readDbEnum();
    const create =
      officialStatementsFor(['nhat_ky_hanh_dong'])
        .map(normalizeStatement)
        .find((sql) => sql.startsWith('CREATE TABLE')) ?? '';
    const officialValues = [
      ...(/`hanh_dong` ENUM \(([^)]*)\)/.exec(create)?.[1] ?? '').matchAll(
        /'([^']+)'/g,
      ),
    ].map((match) => match[1] as string);
    expect(dbValues).toHaveLength(27);
    expect(dbValues.at(-1)).toBe('DoiLichHo');
    expect(dbValues).toEqual(officialValues);
    expect(dbValues).toEqual([...HANH_DONG_NHAY_CAM]);
    expect(dbValues.slice(0, 7)).toEqual([
      'DoiQuyen',
      'OverrideLichHen',
      'HoanTienDacBiet',
      'DoiChiNhanhBacSi',
      'ChinhNoShow',
      'AnDanhGia',
      'XuLyDoiLichNgoaiChinhSach',
    ]);
    expect(dbValues.slice(-3)).toEqual([
      'DuyetRutTien',
      'TuChoiRutTien',
      'DoiLichHo',
    ]);
  });

  it('MDL-03: ghi được nhật ký DoiLichHo (kèm chi tiết JSON) và các giá trị cũ ở hai đầu; giá trị lạ bị từ chối', async () => {
    const w = await world();
    const insertLog = (action: string) =>
      db.query(
        "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, chi_nhanh_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua, chi_tiet_thay_doi) VALUES (?, ?, ?, 'lich_hen', ?, NOW(), 'ThanhCong', ?)",
        [
          w.staffId,
          w.branch.chiNhanhId,
          action,
          w.appointment.lichHenId,
          JSON.stringify({
            truoc: { ma_lich_hen: 'A' },
            sau: { ma_lich_hen: 'B' },
            ly_do: 'MDL',
          }),
        ],
      );
    for (const action of ['DoiLichHo', 'DoiQuyen', 'TuChoiRutTien']) {
      await insertLog(action);
    }
    const stored = (await db.query(
      'SELECT hanh_dong AS action FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id',
    )) as { action: string }[];
    expect(stored.map((row) => row.action)).toEqual([
      'DoiLichHo',
      'DoiQuyen',
      'TuChoiRutTien',
    ]);
    await expect(insertLog('DoiLichHoKhongCo')).rejects.toThrow(
      /Data truncated for column 'hanh_dong'/,
    );
    expect(await countOf('nhat_ky_hanh_dong')).toBe(3);
  });
});

describe('entity khớp DB (không synchronize)', () => {
  const dbColumns = async (
    table: string,
  ): Promise<{ name: string; nullable: boolean; type: string }[]> =>
    (
      (await db.query(
        'SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable, DATA_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [table],
      )) as { name: string; nullable: string; type: string }[]
    ).map((row) => ({ ...row, nullable: row.nullable === 'YES' }));
  const entityColumns = (target: EntityTarget<unknown>) =>
    db.getMetadata(target).columns.map((column) => ({
      name: column.databaseName,
      nullable: column.isNullable,
      type: column.type === 'boolean' ? 'tinyint' : String(column.type),
    }));
  const byName = <T extends { name: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.name.localeCompare(b.name));

  it.each([
    { entity: LichHen, table: 'lich_hen' },
    { entity: ThongBao, table: 'thong_bao' },
    {
      entity: YeuCauDoiLichNgoaiChinhSach,
      table: 'yeu_cau_doi_lich_ngoai_chinh_sach',
    },
  ])(
    'MDL-05: entity của bảng $table có đúng các cột của DB (tên, NULL được, kiểu)',
    async ({ entity, table }) => {
      expect(byName(entityColumns(entity))).toEqual(
        byName(await dbColumns(table)),
      );
    },
  );

  it('MDL-05: chỉ mục và CHECK khai ở entity có thật trong DB với đúng cột và biểu thức (so sau khi chuẩn hóa cách viết)', async () => {
    const indexOf = async (table: string, name: string) =>
      (
        (await db.query(
          'SELECT NON_UNIQUE AS nonUnique, COLUMN_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX',
          [table, name],
        )) as { nonUnique: number; name: string }[]
      ).map((row) => [Number(row.nonUnique), row.name]);
    const entityIndex = (target: EntityTarget<unknown>, name: string) => {
      const index = db.getMetadata(target).indices.find((i) => i.name === name);
      expect(index, name).toBeDefined();
      return (index?.columns ?? []).map((column) => [
        index?.isUnique ? 0 : 1,
        column.databaseName,
      ]);
    };
    expect(entityIndex(ThongBao, 'thong_bao_index_yeu_cau_doi_lich')).toEqual(
      await indexOf('thong_bao', 'thong_bao_index_yeu_cau_doi_lich'),
    );
    expect(
      entityIndex(
        YeuCauDoiLichNgoaiChinhSach,
        'yeu_cau_doi_lich_ngoai_chinh_sach_index_12',
      ),
    ).toEqual(
      await indexOf(
        'yeu_cau_doi_lich_ngoai_chinh_sach',
        'yeu_cau_doi_lich_ngoai_chinh_sach_index_12',
      ),
    );

    const dbChecks = Object.fromEntries(
      (
        (await db.query(
          'SELECT CONSTRAINT_NAME AS name, CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()',
        )) as { name: string; clause: string }[]
      ).map((row) => [row.name, canon(row.clause)]),
    );
    const entityChecks = [LichHen, YeuCauDoiLichNgoaiChinhSach].flatMap(
      (target) => db.getMetadata(target).checks,
    );
    expect(entityChecks.map((check) => check.name).sort()).toEqual([
      'chk_doi_lich_nguoi_xu_ly',
      'chk_doi_lich_xu_ly',
      'chk_lich_hen_so_lan_tu_doi',
    ]);
    for (const check of entityChecks) {
      expect(canon(check.expression ?? ''), check.name).toBe(
        dbChecks[check.name ?? ''],
      );
    }
  });

  it('MDL-05: ghi rồi đọc lại qua repository: bigint ra chuỗi, ENUM trạng thái mặc định ChoDuyet, cột NULL ra null', async () => {
    const w = await world();
    const saved = await requestOf(w);
    const read = await db
      .getRepository(YeuCauDoiLichNgoaiChinhSach)
      .findOneByOrFail({
        yeuCauDoiLichNgoaiChinhSachId: saved.yeuCauDoiLichNgoaiChinhSachId,
      });
    expect(typeof read.yeuCauDoiLichNgoaiChinhSachId).toBe('string');
    expect(read.lichHenId).toBe(w.appointment.lichHenId);
    expect(read.khungGioMongMuonId).toBe(w.wantedSlotId);
    expect(read.trangThai).toBe('ChoDuyet');
    expect(TRANG_THAI_YEU_CAU_DOI_LICH).toContain(read.trangThai);
    expect(read.ghiChuXuLy).toBeNull();
    expect(read.nguoiXuLyId).toBeNull();
    expect(read.thoiDiemXuLy).toBeNull();
    expect(read.lyDoYeuCau).toBe('MDL-LY-DO');
  });
});

describe('hai CHECK sẵn có của yeu_cau_doi_lich_ngoai_chinh_sach qua entity', () => {
  it('MDL-07: ba trạng thái hợp lệ được ghi; ChoDuyet mà đã có người hoặc thời điểm xử lý bị chặn', async () => {
    const w = await world();
    const handled = {
      nguoiXuLyId: w.staffId,
      thoiDiemXuLy: new Date(),
      ghiChuXuLy: 'MDL-GHI-CHU',
    };
    await requestOf(w);
    await requestOf(w, { trangThai: 'DaDuyet', ...handled });
    await requestOf(w, { trangThai: 'TuChoi', ...handled });
    expect(await countOf('yeu_cau_doi_lich_ngoai_chinh_sach')).toBe(3);
    await expect(requestOf(w, { nguoiXuLyId: w.staffId })).rejects.toThrow(
      /chk_doi_lich_nguoi_xu_ly/,
    );
    await expect(requestOf(w, { thoiDiemXuLy: new Date() })).rejects.toThrow(
      /chk_doi_lich_nguoi_xu_ly/,
    );
    await expect(
      requestOf(w, {
        ghiChuXuLy: 'ghi chú khi chưa xử lý',
        nguoiXuLyId: w.staffId,
        thoiDiemXuLy: new Date(),
      }),
    ).rejects.toThrow(/chk_doi_lich_nguoi_xu_ly/);
    expect(await countOf('yeu_cau_doi_lich_ngoai_chinh_sach')).toBe(3);
  });

  it('MDL-07 (ca âm): DaDuyet và TuChoi thiếu ghi chú, thiếu người hay thiếu thời điểm xử lý đều bị chặn', async () => {
    const w = await world();
    for (const status of ['DaDuyet', 'TuChoi'] as const) {
      const complete = {
        trangThai: status,
        nguoiXuLyId: w.staffId,
        thoiDiemXuLy: new Date(),
        ghiChuXuLy: 'MDL-GHI-CHU',
      };
      await expect(
        requestOf(w, { ...complete, ghiChuXuLy: null }),
      ).rejects.toThrow(/chk_doi_lich_xu_ly/);
      await expect(
        requestOf(w, { ...complete, nguoiXuLyId: null }),
      ).rejects.toThrow(/chk_doi_lich_nguoi_xu_ly/);
      await expect(
        requestOf(w, { ...complete, thoiDiemXuLy: null }),
      ).rejects.toThrow(/chk_doi_lich_nguoi_xu_ly/);
    }
    expect(await countOf('yeu_cau_doi_lich_ngoai_chinh_sach')).toBe(0);
  });

  it('MDL-07 (UPDATE): xử lý một yêu cầu ChoDuyet thành DaDuyet được; đưa về ChoDuyet mà giữ người xử lý thì bị chặn', async () => {
    const w = await world();
    const request = await requestOf(w);
    const repo = db.getRepository(YeuCauDoiLichNgoaiChinhSach);
    const where = {
      yeuCauDoiLichNgoaiChinhSachId: request.yeuCauDoiLichNgoaiChinhSachId,
    };
    await repo.update(where, {
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.staffId,
      thoiDiemXuLy: new Date(),
      ghiChuXuLy: 'MDL-GHI-CHU',
    });
    await expect(repo.update(where, { trangThai: 'ChoDuyet' })).rejects.toThrow(
      /chk_doi_lich_nguoi_xu_ly/,
    );
    expect((await repo.findOneByOrFail(where)).trangThai).toBe('DaDuyet');
  });

  it('MDL-07 (Q4): DB KHÔNG chặn nhiều yêu cầu ChoDuyet cho cùng một lịch (việc của service khóa lich_hen rồi kiểm)', async () => {
    const w = await world();
    await requestOf(w);
    await requestOf(w);
    expect(await countOf('yeu_cau_doi_lich_ngoai_chinh_sach')).toBe(2);
  });
});
