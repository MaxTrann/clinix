import { ScheduleModule } from '@nestjs/schedule';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DoctorModule } from '../doctor/doctor.module.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
  walkModuleTree,
} from '../doctor/testing/architecture-scan.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { AppointmentsModule } from './appointments.module.js';
import {
  ALLOWED_WRITES,
  findClockViolations,
  findIndexAndLockViolations,
  findWriteViolations,
  type SourceFile,
} from './testing/architecture-rules.js';

// Task P1 — AR-01, AR-04, AR-05 (quét mã nguồn) và phần không cần AppModule của AR-03 (PLAN booking 7.11; TRACKING 3.3 P1-I). Phần cây AppModule của AR-03: architecture.int-spec.ts.
// Bộ quét dùng lại hàm của doctor (TECH_DEBT dòng 88); luật riêng ở testing/architecture-rules.ts, nhận `{ path, source }[]` nên test bằng dữ liệu tổng hợp.
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

function loadSrc(): SourceFile[] {
  return listSourceFiles(SRC_DIR).map((file) => ({
    path: relative(SRC_DIR, file).split(sep).join('/'),
    source: readSource(file),
  }));
}
const files = loadSrc();
const file = (path: string, source: string): SourceFile => ({ path, source });

describe('AR-01 chỉ appointments/ ghi lich_hen và khung_gio (H7)', () => {
  it('cây src/ thật: không file nào ngoài appointments/ có câu ghi lich_hen hay khung_gio ngoài ngoại lệ', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(findWriteViolations(files)).toEqual([]);
  });

  it('bộ quét THẤY câu ghi thật: bỏ ngoại lệ thì lộ đúng chỗ INSERT khung_gio của bộ sinh khung giờ (doctor D1) và DELETE khung_gio của gỡ ca (doctor B4, D7)', () => {
    const withoutExceptions = findWriteViolations(files, []);
    expect(withoutExceptions.length).toBeGreaterThan(0);
    // Doctor chỉ có đúng hai kiểu ghi khung_gio được phép (D7): chèn ô ConTrong khi sinh và xoá ô ConTrong khi gỡ ca; không UPDATE.
    for (const line of withoutExceptions)
      expect(line).toMatch(/(?:INSERT INTO|DELETE FROM) khung_gio/);
    expect(
      withoutExceptions.some((line) =>
        line.startsWith('scheduling/slots/slot-generator.ts:'),
      ),
    ).toBe(true);
    expect(
      withoutExceptions.some((line) =>
        line.startsWith('doctor/shifts/shift-removal.repository.ts:'),
      ),
    ).toBe(true);
  });

  it.each([
    ['UPDATE lich_hen', "db.query('UPDATE lich_hen SET trang_thai = 1')"],
    ['UPDATE lich_hen', 'await q(`update `lich_hen` set a = 1`)'],
    ['UPDATE khung_gio', "x('UPDATE   khung_gio SET trang_thai = ?')"],
    ['UPDATE khung_gio', 'x("UPDATE IGNORE khung_gio SET a = 1")'],
    ['INSERT INTO lich_hen', "x('INSERT INTO lich_hen (a) VALUES (1)')"],
    ['INSERT INTO lich_hen', "x('REPLACE INTO lich_hen (a) VALUES (1)')"],
    ['DELETE FROM lich_hen', "x('DELETE FROM lich_hen WHERE a = 1')"],
    ['INSERT INTO khung_gio', "x('INSERT INTO khung_gio (a) VALUES (1)')"],
    ['DELETE FROM khung_gio', "x('DELETE FROM `khung_gio` WHERE a = 1')"],
    ['TRUNCATE lich_hen hoặc khung_gio', "x('TRUNCATE TABLE khung_gio')"],
    [
      'ghi thực thể LichHen hoặc KhungGio',
      'await manager.update(LichHen, { a: 1 }, {})',
    ],
    ['ghi thực thể LichHen hoặc KhungGio', 'await manager.save(KhungGio, row)'],
    [
      'ghi thực thể LichHen hoặc KhungGio',
      'await db.getRepository(LichHen).update(1, {})',
    ],
  ])('đột biến: mẫu "%s" ở module lạ bị bắt', (rule, source) => {
    const found = findWriteViolations([file('patient/x.service.ts', source)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('patient/x.service.ts');
    expect(found[0]).toContain(rule);
    expect(found[0]).toContain('ALLOWED_WRITES');
  });

  it('không bắt nhầm: comment, đọc (SELECT, JOIN, FOR SHARE), bảng có tiền tố giống tên, và chính appointments/', () => {
    const clean = [
      file(
        'x/a.ts',
        '// UPDATE lich_hen SET a = 1\n/* DELETE FROM khung_gio */',
      ),
      file(
        'x/b.ts',
        "q('SELECT * FROM lich_hen lh JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id FOR SHARE')",
      ),
      file('x/c.ts', "q('UPDATE lich_hen_cho SET a = 1')"),
      file('x/d.ts', "q('UPDATE khung_gio_dang_moi SET a = 1')"),
      file('x/e.ts', "q('DELETE FROM lich_hen_index WHERE a = 1')"),
      file('x/f.ts', 'repo.find(LichHen); manager.findOne(KhungGio, {})'),
      file(
        'appointments/state/transition.ts',
        "q('UPDATE lich_hen SET trang_thai = ?')",
      ),
    ];
    expect(findWriteViolations(clean)).toEqual([]);
  });

  it('ngoại lệ có chủ đích hoạt động đúng THƯ MỤC và đúng MẪU', () => {
    const insertKhungGio = "q('INSERT INTO khung_gio (a) VALUES (1)')";
    const deleteKhungGio = "q('DELETE FROM khung_gio WHERE a = 1')";
    // scheduling/ và doctor/: được INSERT và DELETE khung_gio
    expect(
      findWriteViolations([
        file('scheduling/slots/x.ts', insertKhungGio),
        file('doctor/shifts/y.ts', deleteKhungGio),
      ]),
    ).toEqual([]);
    // …nhưng KHÔNG UPDATE khung_gio, không ghi lich_hen, và thư mục khác không được thừa hưởng
    expect(
      findWriteViolations([
        file('scheduling/slots/x.ts', "q('UPDATE khung_gio SET a = 1')"),
        file('doctor/shifts/y.ts', "q('UPDATE lich_hen SET a = 1')"),
        file('doctor/shifts/z.ts', "q('INSERT INTO lich_hen (a) VALUES (1)')"),
        file('patient/w.ts', insertKhungGio),
        file('doctor-demo/w.ts', insertKhungGio),
      ]),
    ).toHaveLength(5);
    // migration: mọi mẫu; seeds: chỉ INSERT
    expect(
      findWriteViolations([
        file('database/migrations/1-x.ts', "q('UPDATE lich_hen SET a = 1')"),
        file('database/seeds/s.ts', "q('INSERT INTO lich_hen (a) VALUES (1)')"),
      ]),
    ).toEqual([]);
    expect(
      findWriteViolations([
        file('database/seeds/s.ts', "q('UPDATE lich_hen SET a = 1')"),
      ]),
    ).toHaveLength(1);
  });

  it('danh sách ngoại lệ mỗi dòng đều có thư mục kết thúc bằng "/" và lý do', () => {
    for (const entry of ALLOWED_WRITES) {
      expect(entry.dir.endsWith('/')).toBe(true);
      expect(entry.lyDo.length).toBeGreaterThan(10);
      if (entry.rules !== 'ALL') expect(entry.rules.length).toBeGreaterThan(0);
    }
  });
});

describe('AR-04 không dùng giờ của DB trong appointments/ (H8)', () => {
  it('appointments/ thật: không NOW(), CURDATE() và các hàm giờ khác', () => {
    expect(files.some((f) => f.path.startsWith('appointments/'))).toBe(true);
    expect(findClockViolations(files)).toEqual([]);
  });

  it.each([
    'NOW()',
    'now ( )',
    'CURDATE()',
    'CURTIME()',
    'SYSDATE()',
    'UTC_TIMESTAMP()',
    'CURRENT_DATE',
    'CURRENT_TIMESTAMP',
  ])('đột biến: "%s" trong appointments/ bị bắt', (call) => {
    const found = findClockViolations([
      file('appointments/slots/x.ts', `q('SELECT ${call} AS t')`),
    ]);
    expect(found).toHaveLength(1);
  });

  it('không bắt nhầm: comment, :now, nơi khác ngoài appointments/ (entity có default CURRENT_TIMESTAMP)', () => {
    expect(
      findClockViolations([
        file('appointments/a.ts', '// không dùng NOW() hay CURDATE()'),
        file('appointments/b.ts', "q('WHERE han_thanh_toan <= :now')"),
        file('admin/entities/c.ts', "default: () => 'CURRENT_TIMESTAMP'"),
      ]),
    ).toEqual([]);
  });
});

describe('AR-05 không bọc cột chỉ mục, không khoá lich_hen qua khung_gio_id (doctor M10, M12)', () => {
  it('toàn src/ thật: không có DATE(thoi_gian) và không khoá lich_hen theo khung_gio_id hay khung_gio_dang_giu', () => {
    expect(findIndexAndLockViolations(files)).toEqual([]);
  });

  it.each([
    'WHERE DATE(thoi_gian) = ?',
    'WHERE DATE(lh.thoi_gian) = ?',
    'WHERE date( `thoi_gian` ) >= ?',
    'WHERE DATE(`lh`.`thoi_gian`) = ?',
  ])('đột biến: "%s" bị bắt', (clause) => {
    const found = findIndexAndLockViolations([
      file('appointments/x.ts', `q('SELECT 1 FROM lich_hen lh ${clause}')`),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('DATE(thoi_gian)');
  });

  it.each([
    [
      'khung_gio_id',
      'SELECT lich_hen_id FROM lich_hen WHERE khung_gio_id = ? FOR UPDATE',
    ],
    [
      'khung_gio_id',
      'SELECT lich_hen_id FROM lich_hen lh WHERE lh.khung_gio_id IN (?, ?) FOR SHARE',
    ],
    [
      'khung_gio_dang_giu',
      'SELECT lich_hen_id FROM lich_hen WHERE khung_gio_dang_giu = ? FOR UPDATE',
    ],
    [
      'khung_gio_id',
      'SELECT kg.khung_gio_id FROM khung_gio kg JOIN lich_hen lh ON lh.khung_gio_id = kg.khung_gio_id WHERE kg.khung_gio_id = ? FOR UPDATE',
    ],
  ])('đột biến: khoá lich_hen theo %s bị bắt (%s)', (column, sql) => {
    for (const quote of ["'", '"', '`']) {
      const found = findIndexAndLockViolations([
        file('doctor/shifts/x.ts', `q(${quote}${sql}${quote})`),
      ]);
      expect(found, quote).toHaveLength(1);
      expect(found[0]).toContain(column);
      expect(found[0]).toContain('quy tắc 7');
    }
  });

  it('không bắt nhầm: khoá khung_gio theo khoá chính, khoá lich_hen theo khoá chính hoặc ma_lich_hen, đọc thường theo khung_gio_dang_giu, DATE_FORMAT, DATE của cột khác', () => {
    const clean = [
      "q('SELECT trang_thai FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE')",
      "q('SELECT trang_thai FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE')",
      "q('SELECT trang_thai FROM lich_hen WHERE ma_lich_hen = ? FOR UPDATE')",
      "q('SELECT lich_hen_id FROM lich_hen WHERE khung_gio_dang_giu = ?')",
      "q('SELECT lh.lich_hen_id FROM lich_hen lh JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id WHERE lh.lich_hen_id = ? FOR UPDATE')",
      'q("SELECT DATE_FORMAT(thoi_gian, \'%Y-%m-%d\') AS ngay FROM lich_hen WHERE bac_si_id = ?")',
      "q('SELECT 1 FROM lich_lam_viec WHERE DATE(ngay) = ?')",
      "q('SELECT 1 FROM lich_hen WHERE thoi_gian >= ? AND thoi_gian < ?')",
      '// SELECT lich_hen_id FROM lich_hen WHERE khung_gio_id = ? FOR UPDATE',
    ];
    expect(
      findIndexAndLockViolations(
        clean.map((s, i) => file(`x/${String(i)}.ts`, s)),
      ),
    ).toEqual([]);
  });
});

describe('AR-03 hướng phụ thuộc module (doctor H20), không cần AppModule', () => {
  it('cây của AppointmentsModule không có chu trình, không chứa DoctorModule hay ScheduleModule', async () => {
    const tree = await walkModuleTree(AppointmentsModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.has(DoctorModule)).toBe(false);
    expect(tree.references.has(ScheduleModule)).toBe(false);
  });

  it('cây của SchedulingModule không chứa AppointmentsModule (doctor → appointments → scheduling, một chiều)', async () => {
    const tree = await walkModuleTree(SchedulingModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.has(AppointmentsModule)).toBe(false);
  });

  it('mã appointments/ không gọi ScheduleModule.forRoot( và không import doctor/ (chỉ app.module.ts được gọi forRoot)', () => {
    const own = files.filter((f) => f.path.startsWith('appointments/'));
    expect(own.length).toBeGreaterThan(3);
    for (const f of own) {
      const code = stripComments(f.source);
      expect(code, f.path).not.toMatch(/ScheduleModule\s*\.\s*forRoot\s*\(/);
      const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map(
        (match) => match[1] ?? '',
      );
      expect(
        imports.filter((path) => /(^|\/)doctor\//.test(path)),
        f.path,
      ).toEqual([]);
    }
  });

  it('bộ quét thật sự bắt được lỗi (đột biến): ScheduleModule.forRoot( trong mã appointments/ bị phát hiện bằng chính mẫu trên', () => {
    const sample = stripComments('imports: [ScheduleModule.forRoot()]');
    expect(sample).toMatch(/ScheduleModule\s*\.\s*forRoot\s*\(/);
    const commented = stripComments(
      '// ScheduleModule.forRoot() ở app.module.ts',
    );
    expect(commented).not.toMatch(/ScheduleModule\s*\.\s*forRoot\s*\(/);
  });
});
