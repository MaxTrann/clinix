import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppointmentsModule } from '../../appointments/appointments.module.js';
import {
  findIndexAndLockViolations,
  findInternalWriteViolations,
  findWriteViolations,
  type SourceFile,
} from '../../appointments/testing/architecture-rules.js';
import { AuditModule } from '../../audit/audit.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { DoctorModule } from '../doctor.module.js';
import {
  findForbiddenSql,
  listSourceFiles,
  readSource,
  walkModuleTree,
} from '../testing/architecture-scan.js';
import { ExaminationModule } from './examination.module.js';

// doctor-exam P3 (#393) — cây import của ExaminationModule (phần đơn vị của "nạp được trong AppModule"; phần biên dịch thật ở examination.module.int-spec.ts), HD-08 phủ thư mục
// mới, và HDK-07 = M13: luật của doctor (HD-08) và của booking (AR-01, AR-05, AR-06) KHÔNG bắt các câu SQL của phần khám bệnh ở doctor/examination/ (PLAN 5.3). Hai luật
// quét đúng đường dẫn đó là AR-01 và AR-05; AR-06 chỉ quét appointments/ nên "không bắt" ở đây là do cấu trúc. Chưa có SQL thật (B1, B2 trở đi), nên đo bằng SQL mẫu đúng PLAN 5.3
// cộng quét cây thật ở MỌI lần chạy: task B nào thêm câu SQL vi phạm thì test này đỏ.
const SRC_DIR = fileURLToPath(new URL('../..', import.meta.url));
const EXAM_DIR = fileURLToPath(new URL('.', import.meta.url));
const EXAM_PREFIX = 'doctor/examination/';
const file = (path: string, source: string): SourceFile => ({ path, source });
const names = (modules: Iterable<{ name: string }>) =>
  [...modules].map((m) => m.name);

/** Mã thật của doctor/examination/ (không phải test, không thư mục testing/), đường dẫn tính từ src/ như các luật của booking mong đợi. */
const examFiles = (): SourceFile[] =>
  listSourceFiles(EXAM_DIR).map((full) =>
    file(relative(SRC_DIR, full).split(sep).join('/'), readSource(full)),
  );

describe('cây import của ExaminationModule (E8, "nạp được trong AppModule")', () => {
  it('DoctorModule nhập ExaminationModule đúng một lần và cây không có chu trình', async () => {
    const tree = await walkModuleTree(DoctorModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.get(ExaminationModule)).toBe(1);
  });

  it('ExaminationModule import AppointmentsModule, AuditModule, RbacModule; cây không có chu trình và không đi ngược vào DoctorModule', async () => {
    const tree = await walkModuleTree(ExaminationModule);
    expect(tree.cycle).toBeNull();
    for (const module of [AppointmentsModule, AuditModule, RbacModule])
      expect(tree.references.has(module), module.name).toBe(true);
    expect(names(tree.references.keys())).not.toContain('DoctorModule');
  });

  it('chiều phụ thuộc một hướng: cây của AppointmentsModule không chứa ExaminationModule (doctor → appointments, không ngược lại)', async () => {
    const tree = await walkModuleTree(AppointmentsModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.has(ExaminationModule)).toBe(false);
    expect(tree.references.has(DoctorModule)).toBe(false);
  });
});

describe('HD-08 phủ thư mục doctor/examination/', () => {
  it('bộ quét của doctor thấy file mã của thư mục mới (nếu không thì HD-08 vô nghĩa với phần khám bệnh) và cố ý bỏ qua testing/', () => {
    const paths = examFiles().map((f) => f.path);
    expect(paths).toContain(`${EXAM_PREFIX}examination.module.ts`);
    expect(paths).toContain(`${EXAM_PREFIX}examination.constants.ts`);
    expect(paths.filter((path) => path.includes('/testing/'))).toEqual([]);
  });

  it('mã thật của thư mục: không UPDATE lich_hen, UPDATE khung_gio, NOW(), CURDATE()', () => {
    const found = examFiles().flatMap((f) =>
      findForbiddenSql(f.source).map((name) => `${f.path}: ${name}`),
    );
    expect(found).toEqual([]);
  });

  it('đột biến tổng hợp: UPDATE lich_hen hay NOW() trong một file của thư mục bị bắt', () => {
    expect(
      findForbiddenSql("q('UPDATE lich_hen SET trang_thai = ? WHERE a = ?')"),
    ).toEqual(['UPDATE lich_hen']);
    expect(findForbiddenSql("q('SELECT NOW()')")).toEqual(['NOW()']);
  });
});

// SQL mẫu đúng như PLAN 5.3 (bảng luồng HTK, HSK, DGB, KDD): khoá lich_hen theo khoá chính rồi ho_so_kham, danh_gia_bac_si; ghi hai bảng của task và thong_bao.
const EXAM_SQL: readonly [string, string][] = [
  [
    'khoá lich_hen theo lich_hen_id',
    'SELECT lich_hen_id, bac_si_id, trang_thai FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
  ],
  [
    'khoá lich_hen theo ma_lich_hen và bac_si_id',
    'SELECT lich_hen_id, trang_thai FROM lich_hen WHERE ma_lich_hen = ? AND bac_si_id = ? FOR UPDATE',
  ],
  [
    'đọc thường lịch theo mã và bác sĩ',
    'SELECT lich_hen_id, benh_nhan_id, chi_nhanh_id FROM lich_hen WHERE ma_lich_hen = ? AND bac_si_id = ?',
  ],
  [
    'khoá ho_so_kham theo lich_hen_id',
    'SELECT ho_so_kham_id, cap_nhat_lan_cuoi FROM ho_so_kham WHERE lich_hen_id = ? FOR UPDATE',
  ],
  [
    'khoá danh_gia_bac_si theo khoá chính',
    'SELECT danh_gia_bac_si_id, bi_an FROM danh_gia_bac_si WHERE danh_gia_bac_si_id = ? FOR UPDATE',
  ],
  [
    'nối lich_hen rồi khoá hồ sơ',
    'SELECT hs.ho_so_kham_id FROM ho_so_kham hs JOIN lich_hen lh ON lh.lich_hen_id = hs.lich_hen_id WHERE hs.lich_hen_id = ? FOR UPDATE',
  ],
  [
    'INSERT ho_so_kham',
    'INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, cap_nhat_lan_cuoi) VALUES (?, ?, ?)',
  ],
  [
    'UPDATE ho_so_kham',
    'UPDATE ho_so_kham SET trieu_chung = ?, cap_nhat_lan_cuoi = ? WHERE ho_so_kham_id = ?',
  ],
  [
    'INSERT danh_gia_bac_si',
    'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, thoi_diem_tao) VALUES (?, ?, ?)',
  ],
  [
    'UPDATE danh_gia_bac_si (ẩn)',
    'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE danh_gia_bac_si_id = ?',
  ],
  [
    'INSERT thong_bao',
    'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)',
  ],
];
const examSource = (sql: string) =>
  file(
    `${EXAM_PREFIX}exam-record/exam-record.repository.ts`,
    `const sql = ${JSON.stringify(sql)};`,
  );
// Câu nhiều dòng trong template literal, `FOR UPDATE` ngay trước dấu đóng: dạng hay gặp nhất của câu khoá
const MULTILINE = file(
  `${EXAM_PREFIX}completion/exam-completion.repository.ts`,
  'const sql = `\n  SELECT lich_hen_id\n    FROM lich_hen\n   WHERE lich_hen_id = ?\n     FOR UPDATE\n`;',
);

describe('HDK-07, M13: AR-01, AR-05 (booking) không bắt câu SQL của phần khám bệnh ở doctor/examination/', () => {
  it.each(EXAM_SQL)(
    'SQL mẫu "%s" không bị AR-01, AR-05, AR-06 bắt',
    (_ten, sql) => {
      const files = [examSource(sql)];
      expect(findWriteViolations(files)).toEqual([]);
      expect(findIndexAndLockViolations(files)).toEqual([]);
      expect(findInternalWriteViolations(files)).toEqual([]);
    },
  );

  it('câu khoá lich_hen nhiều dòng trong template literal cũng không bị bắt', () => {
    expect(findWriteViolations([MULTILINE])).toEqual([]);
    expect(findIndexAndLockViolations([MULTILINE])).toEqual([]);
  });

  it('cây thật của thư mục: AR-01 và AR-05 không báo gì (mỗi task B thêm câu SQL thì ca này tự chạy lại)', () => {
    const files = examFiles();
    expect(findWriteViolations(files)).toEqual([]);
    expect(findIndexAndLockViolations(files)).toEqual([]);
  });

  it('đối chứng dương: bộ quét ĐANG quét đường dẫn này (cùng chỗ, SQL vi phạm thì bị bắt)', () => {
    const update = examSource('UPDATE lich_hen SET trang_thai = ? WHERE a = ?');
    expect(findWriteViolations([update])).toHaveLength(1);
    const lockByHeld = examSource(
      'SELECT lich_hen_id FROM lich_hen WHERE khung_gio_id = ? FOR UPDATE',
    );
    expect(findIndexAndLockViolations([lockByHeld])).toHaveLength(1);
    const dateWrap = examSource(
      'SELECT 1 FROM lich_hen WHERE DATE(thoi_gian) = ?',
    );
    expect(findIndexAndLockViolations([dateWrap])).toHaveLength(1);
  });

  it('ghi nhận do cấu trúc: AR-06 chỉ quét appointments/ nên không thấy UPDATE lich_hen ở doctor/ (AR-01 và HD-08 mới là luật giữ chỗ này)', () => {
    expect(
      findInternalWriteViolations([
        examSource('UPDATE lich_hen SET trang_thai = ? WHERE a = ?'),
      ]),
    ).toEqual([]);
  });
});
