import { QueryFailedError, type DataSource } from 'typeorm';
import { NhacLichHen } from '../admin/entities/nhac-lich-hen.entity.js';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { isDuplicateKeyError, isForeignKeyError } from './mysql-errors.js';

// notification P1 (#656) — bảng nhac_lich_hen trên MySQL 8.4 THẬT: MTB-03 (khóa chính kép), MTB-04 và MTB-05 (hai CHECK), MTB-06 (khóa ngoại), MTB-08 (chỉ mục),
// cộng ca ghi và đọc qua entity (phần DB của MTB-07). MTB-01 ở migration-source.spec.ts và schema-parity.int-spec.ts, MTB-02 và MTB-09 ở migrations.int-spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

/** Một lịch hẹn thật (khóa ngoại của nhắc lịch trỏ vào đây). */
async function appointmentId(): Promise<string> {
  const branch = await fx.branch();
  const doctor = await fx.doctor(branch);
  const patient = await fx.patient();
  const slot = await fx.slot(await fx.shift(doctor.profile));
  const appointment = await fx.appointment(
    doctor.profile,
    slot,
    patient.account.taiKhoanId,
  );
  return appointment.lichHenId;
}

interface ReminderRow {
  lichHenId: string;
  soGioTruoc: number;
  trangThai?: string;
  soLanThu?: number;
  daGuiLuc?: string | null;
  loiCuoi?: string | null;
}

const insertReminder = (row: ReminderRow) =>
  db.query(
    'INSERT INTO nhac_lich_hen (lich_hen_id, so_gio_truoc, trang_thai, so_lan_thu, da_gui_luc, loi_cuoi) VALUES (?, ?, ?, ?, ?, ?)',
    [
      row.lichHenId,
      row.soGioTruoc,
      row.trangThai ?? 'ChoGui',
      row.soLanThu ?? 0,
      row.daGuiLuc ?? null,
      row.loiCuoi ?? null,
    ],
  );

async function countReminders(): Promise<number> {
  const rows = (await db.query(
    'SELECT COUNT(*) AS total FROM nhac_lich_hen',
  )) as { total: string | number }[];
  return Number(rows[0]?.total);
}

/** Lỗi MySQL mà câu lệnh ném ra; câu lệnh chạy thành công thì làm test đỏ. */
async function rejected(work: Promise<unknown>): Promise<QueryFailedError> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'câu lệnh phải bị MySQL từ chối').toBeInstanceOf(
    QueryFailedError,
  );
  return error as QueryFailedError;
}

const SENT_AT = '2026-12-02 12:30:00';

describe('nhac_lich_hen trên MySQL thật', () => {
  it('MTB-03: chèn trùng (lich_hen_id, so_gio_truoc) bị khóa chính từ chối (1062); khác mốc hay khác lịch thì được', async () => {
    const lichHenId = await appointmentId();
    await insertReminder({ lichHenId, soGioTruoc: 24 });

    const duplicate = await rejected(
      insertReminder({ lichHenId, soGioTruoc: 24 }),
    );
    expect(isDuplicateKeyError(duplicate)).toBe(true);
    expect(duplicate.message).toContain('PRIMARY');
    expect(await countReminders()).toBe(1);

    await insertReminder({ lichHenId, soGioTruoc: 2 });
    await insertReminder({ lichHenId: await appointmentId(), soGioTruoc: 24 });
    expect(await countReminders()).toBe(3);
  });

  it('MTB-04: chk_nhac_lich_hen_moc: so_gio_truoc 0 và âm bị từ chối; 1 (biên dưới) hợp lệ', async () => {
    const lichHenId = await appointmentId();
    for (const soGioTruoc of [0, -1, -72]) {
      const error = await rejected(insertReminder({ lichHenId, soGioTruoc }));
      expect(error.message, `so_gio_truoc = ${soGioTruoc}`).toContain(
        'chk_nhac_lich_hen_moc',
      );
    }
    expect(await countReminders()).toBe(0);

    await insertReminder({ lichHenId, soGioTruoc: 1 });
    expect(await countReminders()).toBe(1);
  });

  it('MTB-05: chk_nhac_lich_hen_ket_qua từ chối các tổ hợp sai của ba trạng thái và nhận các tổ hợp đúng', async () => {
    const lichHenId = await appointmentId();
    const invalid: [string, Omit<ReminderRow, 'lichHenId' | 'soGioTruoc'>][] = [
      ['DaGui thiếu da_gui_luc', { trangThai: 'DaGui', soLanThu: 1 }],
      [
        'DaGui với so_lan_thu = 0',
        { trangThai: 'DaGui', soLanThu: 0, daGuiLuc: SENT_AT },
      ],
      ['ThatBai thiếu loi_cuoi', { trangThai: 'ThatBai', soLanThu: 1 }],
      [
        'ThatBai có da_gui_luc',
        {
          trangThai: 'ThatBai',
          soLanThu: 1,
          loiCuoi: 'SMTP_TIMEOUT',
          daGuiLuc: SENT_AT,
        },
      ],
      [
        'ThatBai với so_lan_thu = 0',
        { trangThai: 'ThatBai', soLanThu: 0, loiCuoi: 'SMTP_TIMEOUT' },
      ],
      ['ChoGui có da_gui_luc', { trangThai: 'ChoGui', daGuiLuc: SENT_AT }],
    ];
    for (const [label, row] of invalid) {
      const error = await rejected(
        insertReminder({ lichHenId, soGioTruoc: 24, ...row }),
      );
      expect(error.message, label).toContain('chk_nhac_lich_hen_ket_qua');
    }
    expect(await countReminders()).toBe(0);

    // Ba trạng thái hợp lệ (mỗi dòng một mốc khác nhau vì khóa chính)
    await insertReminder({ lichHenId, soGioTruoc: 72 });
    await insertReminder({
      lichHenId,
      soGioTruoc: 24,
      trangThai: 'DaGui',
      soLanThu: 1,
      daGuiLuc: SENT_AT,
    });
    await insertReminder({
      lichHenId,
      soGioTruoc: 2,
      trangThai: 'ThatBai',
      soLanThu: 3,
      loiCuoi: 'SMTP_TIMEOUT',
    });
    // ChoGui sau một lần thử lỗi (đang chờ thử lại) vẫn hợp lệ
    await insertReminder({
      lichHenId,
      soGioTruoc: 1,
      trangThai: 'ChoGui',
      soLanThu: 1,
      loiCuoi: 'SMTP_TIMEOUT',
    });
    expect(await countReminders()).toBe(4);
  });

  it('MTB-06: lịch hẹn không tồn tại bị khóa ngoại từ chối (1452); xoá lịch hẹn còn dòng nhắc bị chặn (1451)', async () => {
    const missing = await rejected(
      insertReminder({ lichHenId: '999999999', soGioTruoc: 24 }),
    );
    expect(isForeignKeyError(missing)).toBe(true);
    expect((missing.driverError as { errno?: number }).errno).toBe(1452);
    expect(await countReminders()).toBe(0);

    const lichHenId = await appointmentId();
    await insertReminder({ lichHenId, soGioTruoc: 24 });
    const blocked = await rejected(
      db.query('DELETE FROM lich_hen WHERE lich_hen_id = ?', [lichHenId]),
    );
    expect(isForeignKeyError(blocked)).toBe(true);
    expect((blocked.driverError as { errno?: number }).errno).toBe(1451);
    expect(await countReminders()).toBe(1);
  });

  it('MTB-08: đúng hai chỉ mục: khóa chính (lich_hen_id, so_gio_truoc) và nhac_lich_hen_index_trang_thai (trang_thai, lan_thu_cuoi_luc), không chỉ mục ngầm của khóa ngoại', async () => {
    const rows = (await db.query(
      `SELECT INDEX_NAME AS name, COLUMN_NAME AS col
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nhac_lich_hen'
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    )) as { name: string; col: string }[];
    const byIndex: Record<string, string[]> = {};
    for (const { name, col } of rows) (byIndex[name] ??= []).push(col);
    expect(byIndex).toEqual({
      PRIMARY: ['lich_hen_id', 'so_gio_truoc'],
      nhac_lich_hen_index_trang_thai: ['trang_thai', 'lan_thu_cuoi_luc'],
    });
  });

  it('MTB-07 (phần DB): entity NhacLichHen ghi được với giá trị mặc định và đọc lại đúng kiểu (lichHenId là chuỗi, soGioTruoc là số)', async () => {
    const lichHenId = await appointmentId();
    const repo = db.getRepository(NhacLichHen);
    await repo.insert({ lichHenId, soGioTruoc: 72 });

    const saved = await repo.findOneByOrFail({ lichHenId, soGioTruoc: 72 });
    expect(saved).toMatchObject({
      lichHenId,
      soGioTruoc: 72,
      trangThai: 'ChoGui',
      soLanThu: 0,
      lanThuCuoiLuc: null,
      daGuiLuc: null,
      loiCuoi: null,
    });
    expect(typeof saved.lichHenId).toBe('string');
    expect(typeof saved.soGioTruoc).toBe('number');
    expect(saved.thoiDiemTao).toBeInstanceOf(Date);
  });
});
