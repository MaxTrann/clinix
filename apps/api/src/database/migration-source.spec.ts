import { TAO_BANG_ANH_SQL } from './migrations/1793188800000-tao-bang-anh.js';
import { TAO_BANG_DANH_MUC_SQL } from './migrations/1793024340000-tao-bang-danh-muc.js';
import {
  TAO_BANG_HO_SO_KHAM_SQL,
  TaoBangHoSoKham1793620800000,
} from './migrations/1793620800000-tao-bang-ho-so-kham.js';
import { MIGRATIONS } from './migrations/index.js';
import {
  MOC_THOI_GIAN_LICH_HEN_COLUMNS,
  MOC_THOI_GIAN_LICH_HEN_UP_SQL,
  MocThoiGianLichHen1793793600000,
} from './migrations/1793793600000-moc-thoi-gian-lich-hen.js';
import { TAO_BANG_MOC_HOAN_TIEN_SQL } from './migrations/1793534400000-tao-bang-moc-hoan-tien.js';
import { TAO_BANG_NGHI_PHEP_SQL } from './migrations/1793275200000-tao-bang-nghi-phep.js';
import {
  NGHI_THEO_CA_NHIEU_NGAY_UP_SQL,
  NghiTheoCaNhieuNgay1793880000000,
  nghiTheoCaNhieuNgayDownSql,
} from './migrations/1793880000000-nghi-theo-ca-nhieu-ngay.js';
import {
  NHAT_KY_RUT_TIEN_DOWN_SQL,
  NHAT_KY_RUT_TIEN_UP_SQL,
  TAO_BANG_THANH_TOAN_VI_SQL,
  TaoBangThanhToanVi1793707200000,
} from './migrations/1793707200000-tao-bang-thanh-toan-vi.js';
import { TAO_BANG_NHAN_SU_SQL } from './migrations/1793080000000-tao-bang-nhan-su.js';
import { TAO_BANG_VAN_HANH_SQL } from './migrations/1793090000000-tao-bang-van-hanh.js';
import { THONG_BAO_LICH_HEN_UP_SQL } from './migrations/1793448000000-thong-bao-lich-hen.js';
import {
  DOI_LICH_DOWN_SQL,
  DOI_LICH_LICH_HEN_SQL,
  DOI_LICH_NHAT_KY_DOWN_SQL,
  DOI_LICH_NHAT_KY_UP_SQL,
  DOI_LICH_TAO_BANG_YEU_CAU_SQL,
  DOI_LICH_THONG_BAO_SQL,
  DOI_LICH_UP_SQL,
  DoiLich1793966400000,
  HANH_DONG_DOI_LICH,
  HANH_DONG_TRUOC_DOI_LICH,
} from './migrations/1793966400000-doi-lich.js';
import {
  normalizeStatement,
  officialStatementsFor,
  targetTable,
  maskAuditEnums,
  maskLichHenDoiLich,
  maskLichHenMoc,
  maskNghiTheoCaNhieuNgay,
  maskThongBaoDoiLich,
  maskThongBaoLichHen,
} from './testing/official-schema.js';

const CATALOG_TABLES = [
  'chi_nhanh',
  'chi_nhanh_lich_hoat_dong',
  'chuyen_khoa',
  'nhom_dich_vu',
  'dich_vu_kham',
  'chi_nhanh_dich_vu_kham',
];
const STAFF_TABLES = [
  'bac_si',
  'le_tan',
  'quan_tri_vien',
  'phu_phi_bac_si',
  'ho_so_nguoi_than',
  'lich_lam_viec',
  'khung_gio',
  'lich_hen',
];
const OPERATIONS_TABLES = [
  'yeu_cau_thay_doi_chi_nhanh',
  'yeu_cau_thay_doi_chi_nhanh_lich_hen',
  'thong_tin_phong_kham',
  'cau_hinh_he_thong',
  'nhat_ky_hanh_dong',
  'thong_bao',
  'email_thong_bao',
];

describe('migration P1 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
    const official =
      officialStatementsFor(CATALOG_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    expect(
      [
        ...TAO_BANG_DANH_MUC_SQL,
        ...TAO_BANG_ANH_SQL.filter((sql) => targetTable(sql) === 'chuyen_khoa'),
      ].map(normalizeStatement),
    ).toEqual(official);
  });

  it('mọi câu migration chỉ tác động các bảng catalog P1', () => {
    for (const statement of TAO_BANG_DANH_MUC_SQL) {
      expect(CATALOG_TABLES).toContain(targetTable(statement));
    }
  });
});

describe('migration P2 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
    const official =
      officialStatementsFor(STAFF_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    // Ba cột mốc của lich_hen được thêm ở migration booking B19 và bộ đếm so_lan_tu_doi_lich (cùng CHECK) ở migration reschedule P1 (đều sau migration này): hai phần được che,
    // xem MOC-01, MOC-02 và MDL-04, MDL-08 ở dưới.
    expect(TAO_BANG_NHAN_SU_SQL.map(normalizeStatement)).toEqual(
      maskLichHenDoiLich(maskLichHenMoc(official)),
    );
  });

  it('mọi câu migration chỉ tác động tám bảng nhân sự và bảng nền P2', () => {
    for (const statement of TAO_BANG_NHAN_SU_SQL) {
      expect(STAFF_TABLES).toContain(targetTable(statement));
    }
  });
});

describe('migration P3 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
    const official =
      officialStatementsFor(OPERATIONS_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    // Hai enum của nhat_ky_hanh_dong được mở rộng ở migration P4 và thong_bao.lich_hen_id được thêm ở migration
    // booking P7 (đều sau migration này); phần P7 được che, xem TBLH-01 đến TBLH-03 ở dưới. Cột thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id (cùng chỉ mục, khóa ngoại)
    // được thêm ở migration reschedule P1: cũng được che, xem MDL-04 và MDL-08.
    expect(
      TAO_BANG_VAN_HANH_SQL.map(normalizeStatement).map(maskAuditEnums),
    ).toEqual(
      maskThongBaoDoiLich(maskThongBaoLichHen(official)).map(maskAuditEnums),
    );
  });

  it('mọi câu migration chỉ tác động bảy bảng vận hành P3', () => {
    for (const statement of TAO_BANG_VAN_HANH_SQL) {
      expect(OPERATIONS_TABLES).toContain(targetTable(statement));
    }
  });
});

describe('P7 — canonical SQL ảnh Cloudinary', () => {
  it('CK-11/SE-A7: migration ảnh khớp canonical SQL và ALTER chuyên khoa bổ sung', () => {
    const expected = officialStatementsFor([
      'anh_tai_len',
      'chuyen_khoa',
    ]).filter(
      (sql) =>
        targetTable(sql) === 'anh_tai_len' || sql.includes('`anh_tai_len_id`'),
    );
    expect(TAO_BANG_ANH_SQL.map(normalizeStatement)).toEqual(
      expected.map(normalizeStatement),
    );
  });
});

describe('migration booking P7 (thong_bao.lich_hen_id) khớp schema SQL chính thức', () => {
  const thongBao = officialStatementsFor(['thong_bao']).map(normalizeStatement);
  const isThongBaoTable = (sql: string): boolean =>
    sql.startsWith('CREATE TABLE `thong_bao` (');
  const createTable = thongBao.find(isThongBaoTable) ?? '';
  const lines = createTable.split('\n');
  const columnAt = lines.findIndex((line) =>
    line.startsWith('  `lich_hen_id` '),
  );
  // Dòng cột (bỏ dấu phẩy cuối) và tên cột đứng ngay trước nó, trích từ CREATE TABLE chính thức
  const columnLine = (lines[columnAt] ?? '').trim().replace(/,$/, '');
  const previousColumn = /^ {2}`(\w+)`/.exec(lines[columnAt - 1] ?? '')?.[1];
  const [addColumn = '', createIndex = '', addForeignKey = ''] =
    THONG_BAO_LICH_HEN_UP_SQL;
  const buildAddColumn = (line: string): string =>
    `ALTER TABLE \`thong_bao\` ADD COLUMN ${line} AFTER \`${previousColumn}\``;

  it('TBLH-01: ADD COLUMN trùng từng ký tự dòng cột ở CREATE TABLE chính thức; chỉ mục và khóa ngoại trùng nguyên văn', () => {
    expect(columnAt).toBeGreaterThan(0);
    expect(previousColumn).toBe('yeu_cau_thay_doi_chi_nhanh_id');
    expect(addColumn).toBe(buildAddColumn(columnLine));
    expect(
      thongBao.filter((sql) =>
        sql.startsWith('CREATE UNIQUE INDEX `thong_bao_index_lich_hen` '),
      ),
    ).toEqual([createIndex]);
    expect(
      thongBao.filter((sql) =>
        sql.startsWith(
          'ALTER TABLE `thong_bao` ADD FOREIGN KEY (`lich_hen_id`) ',
        ),
      ),
    ).toEqual([addForeignKey]);
    // Ca âm: chỉ khác cách gõ dấu tiếng Việt (hủy / huỷ) ở COMMENT cũng không còn trùng
    expect(columnLine).toContain('hủy');
    expect(buildAddColumn(columnLine.replace('hủy', 'huỷ'))).not.toBe(
      addColumn,
    );
  });

  it('TBLH-02: đúng 3 câu theo thứ tự cột, chỉ mục, khóa ngoại; mọi câu chỉ tác động bảng thong_bao', () => {
    expect(THONG_BAO_LICH_HEN_UP_SQL).toHaveLength(3);
    expect(addColumn).toMatch(/^ALTER TABLE `thong_bao` ADD COLUMN /);
    expect(createIndex).toMatch(/^CREATE UNIQUE INDEX /);
    expect(addForeignKey).toMatch(/^ALTER TABLE `thong_bao` ADD FOREIGN KEY /);
    for (const statement of THONG_BAO_LICH_HEN_UP_SQL) {
      expect(targetTable(statement)).toBe('thong_bao');
    }
  });

  it('TBLH-03: mặt nạ bỏ đúng một dòng cột và hai câu của P7, không bỏ nhầm câu giống chữ ở bảng khác', () => {
    const operations =
      officialStatementsFor(OPERATIONS_TABLES).map(normalizeStatement);
    const masked = maskThongBaoLichHen(operations);
    const isP7Statement = (sql: string): boolean =>
      sql.startsWith('CREATE UNIQUE INDEX `thong_bao_index_lich_hen` ') ||
      sql.startsWith(
        'ALTER TABLE `thong_bao` ADD FOREIGN KEY (`lich_hen_id`) ',
      );

    expect(operations.filter(isP7Statement)).toHaveLength(2);
    expect(masked).toHaveLength(operations.length - 2);
    // CREATE TABLE thong_bao mất đúng một dòng (dòng cột lich_hen_id), các dòng còn lại nguyên
    const before = operations.find(isThongBaoTable) ?? '';
    const after = masked.find(isThongBaoTable) ?? '';
    expect(before).toContain('`lich_hen_id`');
    expect(after).not.toContain('lich_hen_id');
    expect(after.split('\n')).toEqual(
      before.split('\n').filter((line) => !line.startsWith('  `lich_hen_id` ')),
    );
    // Mọi câu khác giữ nguyên chữ và thứ tự
    expect(masked.filter((sql) => !isThongBaoTable(sql))).toEqual(
      operations.filter((sql) => !isThongBaoTable(sql) && !isP7Statement(sql)),
    );
    // Ca âm: khóa ngoại lich_hen_id của bảng KHÁC (cùng chữ cột) và CREATE TABLE khác có cột lich_hen_id không bị che
    const otherForeignKey =
      'ALTER TABLE `yeu_cau_thay_doi_chi_nhanh_lich_hen` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)';
    expect(maskThongBaoLichHen([otherForeignKey])).toEqual([otherForeignKey]);
    expect(
      officialStatementsFor(['yeu_cau_thay_doi_chi_nhanh_lich_hen']).map(
        normalizeStatement,
      ),
    ).toContain(otherForeignKey);
    const otherTable =
      "CREATE TABLE `khac` (\n  `lich_hen_id` bigint COMMENT 'x',\n  `a` int\n)";
    expect(maskThongBaoLichHen([otherTable])).toEqual([otherTable]);
  });
});

// Booking B19 (issue #551) — ba cột mốc của lich_hen. MOC-01, MOC-02 là phần chữ DDL (không cần DB). MOC-03 (SHOW CREATE TABLE) ở schema-parity.int-spec.ts,
// MOC-04 (up, down) ở migrations.int-spec.ts.
describe('migration booking B19 (lich_hen: ba cột mốc thời gian) khớp schema SQL chính thức', () => {
  const MOC_COLUMNS = [
    'thoi_diem_xac_nhan',
    'thoi_diem_tiep_don',
    'thoi_diem_hoan_thanh',
  ] as const;
  const lichHen = officialStatementsFor(['lich_hen']).map(normalizeStatement);
  const isLichHenTable = (sql: string): boolean =>
    sql.startsWith('CREATE TABLE `lich_hen` (');
  const createTable = lichHen.find(isLichHenTable) ?? '';
  const lines = createTable.split('\n');
  const indexOfColumn = (name: string): number =>
    lines.findIndex((line) => line.startsWith(`  \`${name}\` `));
  const columnLine = (name: string): string =>
    (lines[indexOfColumn(name)] ?? '').trim().replace(/,$/, '');
  const previousColumn = (name: string): string | undefined =>
    /^ {2}`(\w+)`/.exec(lines[indexOfColumn(name) - 1] ?? '')?.[1];
  const buildAddColumn = (name: string, line: string): string =>
    `ALTER TABLE \`lich_hen\` ADD COLUMN ${line} AFTER \`${previousColumn(name)}\``;

  it('MOC-01: mỗi câu ADD COLUMN trùng TỪNG KÝ TỰ dòng cột ở CREATE TABLE lich_hen chính thức và đúng cột đứng trước; ba cột liền nhau, ngay trước cap_nhat_lan_cuoi', () => {
    expect(MOC_THOI_GIAN_LICH_HEN_UP_SQL).toHaveLength(3);
    MOC_COLUMNS.forEach((name, position) => {
      expect(indexOfColumn(name), name).toBeGreaterThan(0);
      expect(MOC_THOI_GIAN_LICH_HEN_UP_SQL[position], name).toBe(
        buildAddColumn(name, columnLine(name)),
      );
    });
    // Thứ tự cột: thoi_diem_tao, rồi ba cột mốc, rồi cap_nhat_lan_cuoi (không chèn cột nào giữa chừng)
    expect(MOC_COLUMNS.map(previousColumn)).toEqual([
      'thoi_diem_tao',
      'thoi_diem_xac_nhan',
      'thoi_diem_tiep_don',
    ]);
    expect(
      /^ {2}`(\w+)`/.exec(
        lines[indexOfColumn('thoi_diem_hoan_thanh') + 1] ?? '',
      )?.[1],
    ).toBe('cap_nhat_lan_cuoi');
    // Ca âm: chỉ khác cách gõ dấu tiếng Việt (hủy / huỷ) ở COMMENT cũng không còn trùng
    const first = columnLine('thoi_diem_xac_nhan');
    expect(first).toContain('hủy');
    expect(
      buildAddColumn('thoi_diem_xac_nhan', first.replace('hủy', 'huỷ')),
    ).not.toBe(MOC_THOI_GIAN_LICH_HEN_UP_SQL[0]);
  });

  it('MOC-02: danh sách cột mà `down` gỡ đúng là ba cột mà `up` thêm, cùng thứ tự (thiếu một cột thì down để sót cột)', () => {
    expect([...MOC_THOI_GIAN_LICH_HEN_COLUMNS]).toEqual([...MOC_COLUMNS]);
    MOC_THOI_GIAN_LICH_HEN_UP_SQL.forEach((statement, position) => {
      expect(statement).toContain(
        `ADD COLUMN \`${MOC_THOI_GIAN_LICH_HEN_COLUMNS[position]}\` datetime`,
      );
    });
  });

  it('MOC-02: đúng 3 câu ADD COLUMN chỉ tác động lich_hen (không chỉ mục, khóa ngoại, CHECK); name trùng tên lớp, có timestamp 13 chữ số và lớn hơn mọi migration đứng trước', () => {
    for (const statement of MOC_THOI_GIAN_LICH_HEN_UP_SQL) {
      expect(statement).toMatch(/^ALTER TABLE `lich_hen` ADD COLUMN /);
      expect(statement).toMatch(/ datetime COMMENT '/);
      expect(targetTable(statement)).toBe('lich_hen');
    }
    const timestampOf = (name: string): number =>
      Number(/(\d{13})$/.exec(name)?.[1]);
    const migration = new MocThoiGianLichHen1793793600000();
    expect(migration.name).toBe(MocThoiGianLichHen1793793600000.name);
    const index = MIGRATIONS.findIndex((item) => item.name === migration.name);
    expect(index, 'đã đăng ký ở MIGRATIONS').toBeGreaterThan(0);
    for (const earlier of MIGRATIONS.slice(0, index)) {
      expect(timestampOf(earlier.name), earlier.name).toBeLessThan(
        timestampOf(migration.name),
      );
    }
  });

  it('MOC-02: mặt nạ bỏ đúng ba dòng cột khỏi CREATE TABLE lich_hen, giữ nguyên mọi câu và mọi dòng khác; không che nhầm bảng khác', () => {
    const masked = maskLichHenMoc(lichHen);
    expect(masked).toHaveLength(lichHen.length);
    const after = masked.find(isLichHenTable) ?? '';
    for (const name of MOC_COLUMNS) {
      expect(createTable).toContain(`\`${name}\``);
      expect(after).not.toContain(name);
    }
    expect(after.split('\n')).toEqual(
      lines.filter(
        (line) =>
          !MOC_COLUMNS.some((name) => line.startsWith(`  \`${name}\` `)),
      ),
    );
    // Mọi câu không phải CREATE TABLE lich_hen giữ nguyên chữ và thứ tự
    expect(masked.filter((sql) => !isLichHenTable(sql))).toEqual(
      lichHen.filter((sql) => !isLichHenTable(sql)),
    );
    // Ca âm: bảng KHÁC có dòng cột cùng chữ không bị che; câu không phải CREATE TABLE không bị đổi
    const otherTable =
      "CREATE TABLE `khac` (\n  `thoi_diem_tiep_don` datetime COMMENT 'x',\n  `a` int\n)";
    expect(maskLichHenMoc([otherTable])).toEqual([otherTable]);
    const alter = MOC_THOI_GIAN_LICH_HEN_UP_SQL[0] ?? '';
    expect(maskLichHenMoc([alter])).toEqual([alter]);
  });
});

describe('migration booking P6 (moc_hoan_tien) khớp schema SQL chính thức', () => {
  const official = officialStatementsFor(['moc_hoan_tien']).map(
    normalizeStatement,
  );
  const [
    createTable = '',
    createIndex = '',
    addForeignKey = '',
    addCheck = '',
  ] = TAO_BANG_MOC_HOAN_TIEN_SQL;

  it('MHT-01: 4 câu DDL trùng từng câu, cùng thứ tự, với clinix_mysql.sql; ca âm: đổi dấu tiếng Việt (Hủy/Huỷ) thì không còn trùng', () => {
    expect(official).toHaveLength(4);
    expect(TAO_BANG_MOC_HOAN_TIEN_SQL.map(normalizeStatement)).toEqual(
      official,
    );
    // Ca âm: chỉ khác cách gõ dấu ở COMMENT cũng làm lệch văn bản
    expect(createTable).toContain('Hủy');
    const changed = [
      createTable.replace('Hủy', 'Huỷ'),
      ...TAO_BANG_MOC_HOAN_TIEN_SQL.slice(1),
    ];
    expect(changed.map(normalizeStatement)).not.toEqual(official);
  });

  it('MHT-02: đúng 4 câu theo thứ tự bảng, UNIQUE, khóa ngoại, CHECK; UNIQUE đứng trước khóa ngoại; mọi câu chỉ tác động moc_hoan_tien', () => {
    expect(TAO_BANG_MOC_HOAN_TIEN_SQL).toHaveLength(4);
    expect(createTable).toMatch(/^CREATE TABLE `moc_hoan_tien` /);
    expect(createIndex).toMatch(
      /^CREATE UNIQUE INDEX `moc_hoan_tien_index_1` /,
    );
    expect(addForeignKey).toMatch(
      /^ALTER TABLE `moc_hoan_tien` ADD FOREIGN KEY \(`dich_vu_kham_id`\) REFERENCES `dich_vu_kham` /,
    );
    expect(addCheck).toMatch(
      /^ALTER TABLE `moc_hoan_tien` ADD CONSTRAINT `chk_moc_hoan_ty_le` CHECK /,
    );
    expect(addCheck).toContain('`ty_le_hoan` BETWEEN 0 AND 100');
    for (const statement of TAO_BANG_MOC_HOAN_TIEN_SQL) {
      expect(targetTable(statement)).toBe('moc_hoan_tien');
    }
  });
});

// doctor-exam P1 (#391): MGK-01 và MGK-02 phần chữ DDL (không cần DB). Phần cột/chỉ mục/CHECK thật ở
// doctor/entities/exam-tables.int-spec.ts, MGK-05 (SHOW CREATE TABLE) ở schema-parity.int-spec.ts.
describe('migration doctor-exam P1 (ho_so_kham, danh_gia_bac_si) khớp schema SQL chính thức', () => {
  const EXAM_TABLES = ['ho_so_kham', 'danh_gia_bac_si'];
  const officialOf = (tables: string[]): string[] =>
    officialStatementsFor(tables).map(normalizeStatement);
  const migrationOf = (table: string): string[] =>
    TAO_BANG_HO_SO_KHAM_SQL.filter((sql) => targetTable(sql) === table).map(
      normalizeStatement,
    );

  it('MGK-01: ho_so_kham có 3 câu (bảng, COMMENT bảng, khóa ngoại) trùng từng câu, cùng thứ tự, với clinix_mysql.sql', () => {
    const official = officialOf(['ho_so_kham']);
    expect(official).toHaveLength(3);
    expect(migrationOf('ho_so_kham')).toEqual(official);
    const [createTable = '', comment = '', foreignKey = ''] = official;
    expect(createTable).toContain('`lich_hen_id` bigint UNIQUE NOT NULL');
    expect(createTable).toContain('`cap_nhat_lan_cuoi` datetime NOT NULL');
    expect(foreignKey).toBe(
      'ALTER TABLE `ho_so_kham` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)',
    );
    // Ca âm: chỉ khác cách gõ chữ ở COMMENT bảng cũng làm lệch văn bản
    expect(comment).toContain('xác nhận');
    expect(
      [createTable, comment.replace('xác nhận', 'xac nhận'), foreignKey].map(
        normalizeStatement,
      ),
    ).not.toEqual(migrationOf('ho_so_kham'));
  });

  it('MGK-02: danh_gia_bac_si có 5 câu (bảng, COMMENT bảng, khóa ngoại, hai CHECK) trùng từng câu, cùng thứ tự, với clinix_mysql.sql', () => {
    const official = officialOf(['danh_gia_bac_si']);
    expect(official).toHaveLength(5);
    expect(migrationOf('danh_gia_bac_si')).toEqual(official);
    const [createTable = '', , , checkStars = '', checkHidden = ''] = official;
    expect(createTable).toContain('`lich_hen_id` bigint UNIQUE NOT NULL');
    expect(createTable).toContain('`bi_an` boolean NOT NULL DEFAULT false');
    expect(checkStars).toContain('`so_sao` BETWEEN 1 AND 5');
    expect(checkHidden).toContain(
      '(`bi_an` = 0 AND `ly_do_an` IS NULL) OR (`bi_an` = 1 AND `ly_do_an` IS NOT NULL)',
    );
    // Ca âm: COMMENT cột (ghi chú dài) lệch một dấu tiếng Việt thì không còn trùng
    expect(createTable).toContain('Ràng buộc: 1 đến 5');
    expect(
      [createTable.replace('Ràng buộc', 'Rang buộc'), ...official.slice(1)].map(
        normalizeStatement,
      ),
    ).not.toEqual(migrationOf('danh_gia_bac_si'));
  });

  it('MGK-01, MGK-02: đúng 8 câu, cùng thứ tự file chính thức (xen kẽ hai bảng), chỉ tác động hai bảng này', () => {
    expect(TAO_BANG_HO_SO_KHAM_SQL).toHaveLength(8);
    expect(TAO_BANG_HO_SO_KHAM_SQL.map(normalizeStatement)).toEqual(
      officialOf(EXAM_TABLES),
    );
    for (const statement of TAO_BANG_HO_SO_KHAM_SQL) {
      expect(EXAM_TABLES).toContain(targetTable(statement));
    }
  });

  // registry.spec.ts đọc tên LỚP (Function.name); TypeORM lại đọc thuộc tính `name` của migration để xếp thứ tự chạy và ghi vào
  // bảng migrations. Hai tên này phải trùng nhau, nếu không thứ tự áp dụng khác sổ đăng ký mà registry.spec vẫn xanh (M7 đã đo).
  it('MGK-07: thuộc tính name của migration trùng tên lớp, kết thúc bằng timestamp 13 chữ số và lớn hơn mọi migration đứng trước nó trong sổ đăng ký', () => {
    const timestampOf = (name: string): number =>
      Number(/(\d{13})$/.exec(name)?.[1]);
    const migration = new TaoBangHoSoKham1793620800000();
    expect(migration.name).toBe(TaoBangHoSoKham1793620800000.name);
    expect(Number.isFinite(timestampOf(migration.name))).toBe(true);
    const index = MIGRATIONS.findIndex((item) => item.name === migration.name);
    expect(index, 'đã đăng ký ở MIGRATIONS').toBeGreaterThan(0);
    for (const earlier of MIGRATIONS.slice(0, index)) {
      expect(timestampOf(earlier.name), earlier.name).toBeLessThan(
        timestampOf(migration.name),
      );
    }
  });
});

// payment P1 (MGT-02, MGT-11): phần chữ DDL (không cần DB). Phần SHOW CREATE TABLE ở schema-parity.int-spec.ts, up/down ở migrations.int-spec.ts,
// CHECK/UNIQUE thật ở wallet/entities/money-tables.int-spec.ts.
describe('migration payment P1 (năm bảng tiền) khớp schema SQL chính thức', () => {
  const PAYMENT_TABLES = [
    'giao_dich_thanh_toan',
    'lich_su_hoan_tien',
    'yeu_cau_rut_tien',
    'giao_dich_vi',
    'lan_doi_soat_nap_vi',
  ];
  const official =
    officialStatementsFor(PAYMENT_TABLES).map(normalizeStatement);
  const migrated = TAO_BANG_THANH_TOAN_VI_SQL.map(normalizeStatement);
  const countFor = (sqls: string[], table: string): number =>
    sqls.filter((sql) => targetTable(sql) === table).length;

  it('MGT-02: đúng 35 câu, trùng từng câu và cùng thứ tự với clinix_mysql.sql (kể cả cột loai và bảng lan_doi_soat_nap_vi)', () => {
    expect(official).toHaveLength(35);
    expect(migrated).toEqual(official);
    // Số câu từng bảng: bảng, chỉ mục, COMMENT bảng, khóa ngoại, CHECK
    expect(countFor(migrated, 'giao_dich_thanh_toan')).toBe(11);
    expect(countFor(migrated, 'lich_su_hoan_tien')).toBe(4);
    expect(countFor(migrated, 'yeu_cau_rut_tien')).toBe(6);
    expect(countFor(migrated, 'giao_dich_vi')).toBe(9);
    expect(countFor(migrated, 'lan_doi_soat_nap_vi')).toBe(5);
  });

  it('MGT-02: mọi câu chỉ tác động năm bảng của task; hai thay đổi DDL đã chốt có mặt trong chữ DDL', () => {
    for (const statement of TAO_BANG_THANH_TOAN_VI_SQL) {
      expect(PAYMENT_TABLES).toContain(targetTable(statement));
    }
    const refund = migrated.find((sql) =>
      sql.startsWith('CREATE TABLE `lich_su_hoan_tien` ('),
    );
    expect(refund).toContain(
      "`loai` ENUM ('TuDong', 'DacBiet') NOT NULL DEFAULT 'TuDong'",
    );
    const reconcile = migrated.find((sql) =>
      sql.startsWith('CREATE TABLE `lan_doi_soat_nap_vi` ('),
    );
    expect(reconcile).toContain(
      "`ket_qua` ENUM ('ThanhCong', 'ThatBai', 'KhongTheXuLy') NOT NULL",
    );
    expect(migrated).toContain(
      'CREATE UNIQUE INDEX `lan_doi_soat_nap_vi_index_lan_thu` ON `lan_doi_soat_nap_vi` (`giao_dich_thanh_toan_id`, `so_lan_thu`)',
    );
    // Ca âm: sửa một chữ ở bất kỳ câu nào làm lệch văn bản
    const changed = [...migrated];
    changed[0] = (changed[0] ?? '').replace('ENGINE=InnoDB', 'ENGINE=MyISAM');
    expect(changed).not.toEqual(official);
  });

  it('MGT-02: CREATE TABLE của nhat_ky_hanh_dong ở file chính thức có giá trị ENUM mới ở CUỐI danh sách; ALTER của migration khớp', () => {
    const create =
      officialStatementsFor(['nhat_ky_hanh_dong'])
        .map(normalizeStatement)
        .find((sql) => sql.startsWith('CREATE TABLE')) ?? '';
    // Hai giá trị của payment P1 không còn ở cuối từ khi reschedule P1 thêm DoiLichHo (MDL-04): chúng vẫn liền nhau và đứng ngay trước giá trị mới.
    expect(create).toContain(
      "'DuyetNghiPhep', 'TuChoiNghiPhep', 'DuyetRutTien', 'TuChoiRutTien', 'DoiLichHo') NOT NULL",
    );
    expect(create).toContain(
      "'yeu_cau_nghi_phep', 'yeu_cau_rut_tien') NOT NULL COMMENT",
    );
    expect(NHAT_KY_RUT_TIEN_UP_SQL).toContain(
      "'TuChoiNghiPhep', 'DuyetRutTien', 'TuChoiRutTien') NOT NULL",
    );
    expect(NHAT_KY_RUT_TIEN_UP_SQL).toContain(
      "'yeu_cau_nghi_phep', 'yeu_cau_rut_tien') NOT NULL COMMENT 'Bảng bị tác động'",
    );
    // down trả về danh sách trước P1: không còn ba giá trị mới, vẫn đủ các giá trị cũ
    for (const value of ['DuyetRutTien', 'TuChoiRutTien', 'yeu_cau_rut_tien']) {
      expect(NHAT_KY_RUT_TIEN_DOWN_SQL).not.toContain(value);
    }
    expect(NHAT_KY_RUT_TIEN_DOWN_SQL).toContain("'TuChoiNghiPhep') NOT NULL");
    expect(targetTable(NHAT_KY_RUT_TIEN_UP_SQL)).toBe('nhat_ky_hanh_dong');
  });

  it('MGT-11: name trùng tên lớp, kết thúc bằng timestamp 13 chữ số và lớn hơn mọi migration đứng trước trong sổ đăng ký', () => {
    const timestampOf = (name: string): number =>
      Number(/(\d{13})$/.exec(name)?.[1]);
    const migration = new TaoBangThanhToanVi1793707200000();
    expect(migration.name).toBe(TaoBangThanhToanVi1793707200000.name);
    const index = MIGRATIONS.findIndex((item) => item.name === migration.name);
    expect(index, 'đã đăng ký ở MIGRATIONS').toBeGreaterThan(0);
    for (const earlier of MIGRATIONS.slice(0, index)) {
      expect(timestampOf(earlier.name), earlier.name).toBeLessThan(
        timestampOf(migration.name),
      );
    }
  });
});

// Doctor UX7 (issue #582) — CHECK `chk_nghi_phep_hinh_thuc` cho `TheoCa` nhiều ngày. NTC-01 đến NTC-05 là phần chữ DDL (không cần DB). Phần chạy thật (lên, lùi, lùi bị chặn, lên lại,
// SHOW CREATE TABLE bằng DB dựng thẳng từ SQL chính thức) ở migrations.int-spec.ts (NTC-06 đến NTC-09) và schema-parity.int-spec.ts (MG-01 có mặt nạ, SHOW CREATE TABLE).
describe('migration doctor UX7 (nghỉ theo ca nhiều ngày) khớp schema SQL chính thức', () => {
  const ADD = 'ALTER TABLE `yeu_cau_nghi_phep` ';
  const official = officialStatementsFor(['yeu_cau_nghi_phep']).map(
    normalizeStatement,
  );
  const checkStatement =
    official.find((sql) =>
      sql.includes('ADD CONSTRAINT `chk_nghi_phep_hinh_thuc`'),
    ) ?? '';
  const commentStatement =
    official.find((sql) => sql.startsWith(`${ADD}COMMENT = `)) ?? '';
  const [upCheck = '', upComment = ''] = NGHI_THEO_CA_NHIEU_NGAY_UP_SQL;
  const buildUpCheck = (addStatement: string): string =>
    `${ADD}DROP CHECK \`chk_nghi_phep_hinh_thuc\`, ${addStatement.slice(ADD.length)}`;
  const THEO_CA_BRANCH =
    "'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`";

  it('NTC-01: câu CHECK = DROP CHECK + đúng câu ADD CONSTRAINT chính thức (từng ký tự); câu COMMENT trùng nguyên văn; ca âm đổi <= thành < không còn trùng', () => {
    expect(checkStatement.startsWith(`${ADD}ADD CONSTRAINT `)).toBe(true);
    expect(upCheck).toBe(buildUpCheck(checkStatement));
    expect(upComment).toBe(commentStatement);
    // nhánh TheoCa chính thức dùng <=, không còn = (đó là chữ cũ)
    expect(checkStatement).toContain(THEO_CA_BRANCH);
    expect(checkStatement).not.toContain(
      "'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` = `ngay_ket_thuc`",
    );
    expect(
      buildUpCheck(
        checkStatement.replace(
          '`ca` IS NOT NULL AND `ngay_bat_dau` <=',
          '`ca` IS NOT NULL AND `ngay_bat_dau` <',
        ),
      ),
    ).not.toBe(upCheck);
    // nhánh CaNgay và điều kiện ca không đổi so với migration gốc
    expect(upCheck).toContain(
      "(`hinh_thuc_nghi` = 'CaNgay' AND `ca` IS NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`)",
    );
  });

  it('NTC-02: đúng 2 câu theo thứ tự CHECK rồi COMMENT, chỉ tác động bảng yeu_cau_nghi_phep và không câu nào đổi hay xoá dữ liệu', () => {
    expect(NGHI_THEO_CA_NHIEU_NGAY_UP_SQL).toHaveLength(2);
    expect(upCheck).toMatch(/^ALTER TABLE `yeu_cau_nghi_phep` DROP CHECK /);
    expect(upComment).toMatch(/^ALTER TABLE `yeu_cau_nghi_phep` COMMENT = /);
    for (const statement of [
      ...NGHI_THEO_CA_NHIEU_NGAY_UP_SQL,
      ...nghiTheoCaNhieuNgayDownSql(),
    ]) {
      expect(targetTable(statement)).toBe('yeu_cau_nghi_phep');
      expect(statement).not.toMatch(/\b(DELETE|UPDATE|TRUNCATE|DROP TABLE)\b/i);
    }
  });

  it('NTC-03: down là chữ CŨ của migration nghỉ phép gốc (CHECK TheoCa dùng =, COMMENT "chỉ nghỉ 1 ngày"), không nhân bản chữ', () => {
    const down = nghiTheoCaNhieuNgayDownSql();
    const oldCheck = TAO_BANG_NGHI_PHEP_SQL.find((sql) =>
      sql.includes('ADD CONSTRAINT `chk_nghi_phep_hinh_thuc`'),
    );
    const oldComment = TAO_BANG_NGHI_PHEP_SQL.find((sql) =>
      sql.startsWith(`${ADD}COMMENT = `),
    );
    expect(down).toHaveLength(2);
    expect(down[0]).toBe(buildUpCheck(oldCheck ?? ''));
    expect(down[0]).toContain(
      "'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` = `ngay_ket_thuc`",
    );
    expect(down[1]).toBe(oldComment);
    expect(down[1]).toContain('chỉ nghỉ 1 ngày');
    // chữ cũ và chữ mới khác nhau ở đúng hai câu
    expect(down[0]).not.toBe(upCheck);
    expect(down[1]).not.toBe(upComment);
  });

  it('NTC-04: mặt nạ đưa các câu CHÍNH THỨC về chữ cũ ở đúng hai câu, để migration nghỉ phép gốc vẫn trùng từng câu; không đụng bảng khác', () => {
    const masked = maskNghiTheoCaNhieuNgay(official);
    expect(masked).toEqual(TAO_BANG_NGHI_PHEP_SQL.map(normalizeStatement));
    // đúng hai câu bị đổi (không che nhầm câu khác như CREATE TABLE, CHECK chk_nghi_phep_xu_ly)
    expect(
      masked.filter((statement, index) => statement !== official[index]),
    ).toHaveLength(2);
    // ca âm: cùng tên ràng buộc và cùng chữ nhưng ở bảng KHÁC thì không bị che
    const otherCheck =
      "ALTER TABLE `khac` ADD CONSTRAINT `chk_nghi_phep_hinh_thuc` CHECK (\n    (`hinh_thuc_nghi` = 'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`)\n)";
    const otherComment =
      "ALTER TABLE `khac` COMMENT = 'TheoCa: bắt buộc có ca, ngày bắt đầu <= ngày kết thúc (được nghỉ nhiều ngày, một ca).'";
    expect(maskNghiTheoCaNhieuNgay([otherCheck, otherComment])).toEqual([
      otherCheck,
      otherComment,
    ]);
    // ca âm: mặt nạ không "đúng cho mọi chữ": chữ chính thức bị sửa lệch thì masked không còn trùng migration gốc
    expect(
      maskNghiTheoCaNhieuNgay(
        official.map((sql) => sql.replace('Ràng buộc theo', 'Ràng buoc theo')),
      ),
    ).not.toEqual(TAO_BANG_NGHI_PHEP_SQL.map(normalizeStatement));
  });

  // "Nằm CUỐI sổ" chỉ đúng tới khi có migration sau nó (reschedule P1 thêm DoiLich1793966400000): từ đó chỉ còn khẳng định đã đăng ký và đứng sau mọi migration cũ; MDL-09 giữ ca "cuối sổ" cho migration mới nhất.
  it('NTC-05: name trùng tên lớp, timestamp 13 chữ số lớn hơn mọi migration đứng trước trong sổ đăng ký', () => {
    const timestampOf = (name: string): number =>
      Number(/(\d{13})$/.exec(name)?.[1]);
    const migration = new NghiTheoCaNhieuNgay1793880000000();
    expect(migration.name).toBe(NghiTheoCaNhieuNgay1793880000000.name);
    const index = MIGRATIONS.findIndex((item) => item.name === migration.name);
    expect(index, 'đã đăng ký ở MIGRATIONS').toBeGreaterThan(0);
    for (const earlier of MIGRATIONS.slice(0, index)) {
      expect(timestampOf(earlier.name), earlier.name).toBeLessThan(
        timestampOf(migration.name),
      );
    }
  });
});

// Reschedule P1 (issue #634) — MDL-04, MDL-06 (phần chữ down), MDL-08, MDL-09 là phần chữ DDL (không cần DB). Phần chạy thật ở doi-lich-schema.int-spec.ts (MDL-01, 02, 03, 05, 07),
// migrations.int-spec.ts (MDL-01 up/down, MDL-06) và schema-parity.int-spec.ts (MDL-04, SHOW CREATE TABLE).
describe('migration reschedule P1 (bảng yêu cầu, bộ đếm, cột thông báo, DoiLichHo) khớp schema SQL chính thức', () => {
  const REQUEST_TABLE = 'yeu_cau_doi_lich_ngoai_chinh_sach';
  const officialRequest = officialStatementsFor([REQUEST_TABLE]).map(
    normalizeStatement,
  );
  const lichHen = officialStatementsFor(['lich_hen']).map(normalizeStatement);
  const thongBao = officialStatementsFor(['thong_bao']).map(normalizeStatement);
  const isCreateOf =
    (table: string) =>
    (sql: string): boolean =>
      sql.startsWith(`CREATE TABLE \`${table}\` (`);
  /** Dòng cột (bỏ dấu phẩy cuối) và tên cột đứng ngay trước nó, trích từ CREATE TABLE chính thức. */
  const columnOf = (
    create: string,
    name: string,
  ): { index: number; line: string; previous: string } => {
    const lines = create.split('\n');
    const index = lines.findIndex((line) => line.startsWith(`  \`${name}\` `));
    return {
      index,
      line: (lines[index] ?? '').trim().replace(/,$/, ''),
      previous: /^ {2}`(\w+)`/.exec(lines[index - 1] ?? '')?.[1] ?? '',
    };
  };
  const enumValues = (sql: string, pattern: RegExp): string[] =>
    [...(pattern.exec(sql)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (match) => match[1] as string,
    );

  it('MDL-04: tám câu tạo bảng yêu cầu trùng TỪNG CÂU, cùng thứ tự, với file SQL chính thức; ca âm đổi một chữ thì lệch', () => {
    expect(officialRequest).toHaveLength(8);
    expect(DOI_LICH_TAO_BANG_YEU_CAU_SQL.map(normalizeStatement)).toEqual(
      officialRequest,
    );
    for (const statement of DOI_LICH_TAO_BANG_YEU_CAU_SQL) {
      expect(targetTable(statement)).toBe(REQUEST_TABLE);
    }
    const [createTable = ''] = DOI_LICH_TAO_BANG_YEU_CAU_SQL;
    expect(createTable).toContain('Lý do bệnh nhân cần đổi lịch');
    expect(
      [
        createTable.replace('Lý do', 'Ly do'),
        ...DOI_LICH_TAO_BANG_YEU_CAU_SQL.slice(1),
      ].map(normalizeStatement),
    ).not.toEqual(officialRequest);
  });

  it('MDL-04: ADD COLUMN của lich_hen trùng TỪNG KÝ TỰ dòng cột ở CREATE TABLE chính thức và đúng cột đứng trước; CHECK trùng nguyên văn', () => {
    const create = lichHen.find(isCreateOf('lich_hen')) ?? '';
    const column = columnOf(create, 'so_lan_tu_doi_lich');
    expect(column.index).toBeGreaterThan(0);
    expect(column.line).toMatch(
      /^`so_lan_tu_doi_lich` int NOT NULL DEFAULT 0 COMMENT '/,
    );
    expect(column.previous).toBe('lich_hen_truoc_id');
    const [addColumn = '', addCheck = ''] = DOI_LICH_LICH_HEN_SQL;
    expect(DOI_LICH_LICH_HEN_SQL).toHaveLength(2);
    expect(addColumn).toBe(
      `ALTER TABLE \`lich_hen\` ADD COLUMN ${column.line} AFTER \`${column.previous}\``,
    );
    expect(
      lichHen.filter((sql) =>
        sql.startsWith(
          'ALTER TABLE `lich_hen` ADD CONSTRAINT `chk_lich_hen_so_lan_tu_doi` ',
        ),
      ),
    ).toEqual([addCheck]);
    expect(addCheck).toContain('`so_lan_tu_doi_lich` >= 0');
    // Ca âm: đổi chữ trong COMMENT hay đổi >= thành > thì không còn trùng
    expect(column.line).toContain('TỰ');
    expect(
      `ALTER TABLE \`lich_hen\` ADD COLUMN ${column.line.replace('TỰ', 'TU')} AFTER \`${column.previous}\``,
    ).not.toBe(addColumn);
    expect(addCheck.replace('>= 0', '> 0')).not.toBe(
      lichHen.find((sql) => sql.includes('chk_lich_hen_so_lan_tu_doi')),
    );
  });

  it('MDL-04: ADD COLUMN của thong_bao trùng dòng cột chính thức; chỉ mục và khóa ngoại trùng nguyên văn, chỉ mục đứng TRƯỚC khóa ngoại (cùng thứ tự file chính thức)', () => {
    const create = thongBao.find(isCreateOf('thong_bao')) ?? '';
    const column = columnOf(create, 'yeu_cau_doi_lich_ngoai_chinh_sach_id');
    expect(column.index).toBeGreaterThan(0);
    expect(column.previous).toBe('lich_hen_id');
    const [addColumn = '', createIndex = '', addForeignKey = ''] =
      DOI_LICH_THONG_BAO_SQL;
    expect(DOI_LICH_THONG_BAO_SQL).toHaveLength(3);
    expect(addColumn).toBe(
      `ALTER TABLE \`thong_bao\` ADD COLUMN ${column.line} AFTER \`${column.previous}\``,
    );
    expect(
      thongBao.filter((sql) =>
        sql.startsWith(
          'CREATE UNIQUE INDEX `thong_bao_index_yeu_cau_doi_lich` ',
        ),
      ),
    ).toEqual([createIndex]);
    expect(
      thongBao.filter((sql) =>
        sql.startsWith(
          'ALTER TABLE `thong_bao` ADD FOREIGN KEY (`yeu_cau_doi_lich_ngoai_chinh_sach_id`) ',
        ),
      ),
    ).toEqual([addForeignKey]);
    expect(createIndex).toContain(
      '(`yeu_cau_doi_lich_ngoai_chinh_sach_id`, `tai_khoan_id`, `loai_su_kien`)',
    );
    expect(thongBao.indexOf(createIndex)).toBeLessThan(
      thongBao.indexOf(addForeignKey),
    );
    // Ca âm: chỉ khác thứ tự cột UNIQUE thì không còn trùng
    expect(
      createIndex.replace(
        '(`yeu_cau_doi_lich_ngoai_chinh_sach_id`, `tai_khoan_id`,',
        '(`tai_khoan_id`, `yeu_cau_doi_lich_ngoai_chinh_sach_id`,',
      ),
    ).not.toBe(createIndex);
  });

  it('MDL-04: ENUM hanh_dong: 26 giá trị cũ giữ nguyên thứ tự, DoiLichHo ở CUỐI; câu MODIFY của up khớp file chính thức, của down khớp danh sách cũ; loai_doi_tuong không đổi', () => {
    const create =
      officialStatementsFor(['nhat_ky_hanh_dong'])
        .map(normalizeStatement)
        .find((sql) => sql.startsWith('CREATE TABLE')) ?? '';
    const officialValues = enumValues(create, /`hanh_dong` ENUM \(([^)]*)\)/);
    const modify = /MODIFY `hanh_dong` ENUM \(([^)]*)\)/;
    const upValues = enumValues(DOI_LICH_NHAT_KY_UP_SQL, modify);
    const downValues = enumValues(DOI_LICH_NHAT_KY_DOWN_SQL, modify);
    expect(officialValues).toHaveLength(27);
    expect(upValues).toEqual(officialValues);
    expect(officialValues.at(-1)).toBe(HANH_DONG_DOI_LICH);
    expect(downValues).toHaveLength(26);
    expect(downValues).toEqual(officialValues.slice(0, -1));
    expect([...HANH_DONG_TRUOC_DOI_LICH]).toEqual(downValues);
    // Cột chính thức không có COMMENT, nên câu MODIFY chỉ kết thúc bằng NOT NULL; không đụng cột loai_doi_tuong
    expect(create).toMatch(/`hanh_dong` ENUM \([^)]*\) NOT NULL,\n/);
    expect(DOI_LICH_NHAT_KY_UP_SQL).toMatch(/\) NOT NULL$/);
    expect(DOI_LICH_NHAT_KY_UP_SQL).not.toContain('loai_doi_tuong');
    expect(targetTable(DOI_LICH_NHAT_KY_UP_SQL)).toBe('nhat_ky_hanh_dong');
  });

  it('MDL-04: đúng 14 câu theo thứ tự (bảng yêu cầu trước khóa ngoại tới nó), mỗi câu chỉ tác động bảng của nó', () => {
    expect(DOI_LICH_UP_SQL).toHaveLength(14);
    expect(DOI_LICH_UP_SQL.map(targetTable)).toEqual([
      ...Array<string>(8).fill(REQUEST_TABLE),
      'lich_hen',
      'lich_hen',
      'thong_bao',
      'thong_bao',
      'thong_bao',
      'nhat_ky_hanh_dong',
    ]);
  });

  it('MDL-06: câu của down gỡ đủ và đúng thứ tự (chỉ mục trước cột thong_bao, CHECK trước cột lich_hen, ENUM về 26 giá trị, bỏ bảng cuối cùng); không câu nào xoá hay sửa dữ liệu', () => {
    const at = (needle: string): number =>
      DOI_LICH_DOWN_SQL.findIndex((sql) => sql.includes(needle));
    expect(DOI_LICH_DOWN_SQL).toHaveLength(6);
    expect(at('DROP INDEX `thong_bao_index_yeu_cau_doi_lich`')).toBe(0);
    expect(
      at('`thong_bao` DROP COLUMN `yeu_cau_doi_lich_ngoai_chinh_sach_id`'),
    ).toBe(1);
    expect(at('DROP CHECK `chk_lich_hen_so_lan_tu_doi`')).toBe(2);
    expect(at('`lich_hen` DROP COLUMN `so_lan_tu_doi_lich`')).toBe(3);
    expect(DOI_LICH_DOWN_SQL[4]).toBe(DOI_LICH_NHAT_KY_DOWN_SQL);
    expect(DOI_LICH_DOWN_SQL.at(-1)).toBe(
      'DROP TABLE `yeu_cau_doi_lich_ngoai_chinh_sach`',
    );
    for (const statement of DOI_LICH_DOWN_SQL) {
      expect(statement).not.toMatch(/\b(DELETE|UPDATE|TRUNCATE)\b/i);
    }
  });

  it('MDL-08: mặt nạ lich_hen bỏ đúng một dòng cột và một câu CHECK, giữ nguyên mọi câu và mọi dòng khác; không che nhầm bảng khác', () => {
    const masked = maskLichHenDoiLich(lichHen);
    expect(masked).toHaveLength(lichHen.length - 1);
    const before = lichHen.find(isCreateOf('lich_hen')) ?? '';
    const after = masked.find(isCreateOf('lich_hen')) ?? '';
    expect(before).toContain('`so_lan_tu_doi_lich`');
    expect(after).not.toContain('so_lan_tu_doi_lich');
    expect(after.split('\n')).toEqual(
      before
        .split('\n')
        .filter((line) => !line.startsWith('  `so_lan_tu_doi_lich` ')),
    );
    expect(masked.filter((sql) => !isCreateOf('lich_hen')(sql))).toEqual(
      lichHen.filter(
        (sql) =>
          !isCreateOf('lich_hen')(sql) &&
          !sql.includes('chk_lich_hen_so_lan_tu_doi'),
      ),
    );
    // Ca âm: bảng KHÁC có dòng cột hay CHECK cùng chữ không bị che
    const otherTable =
      "CREATE TABLE `khac` (\n  `so_lan_tu_doi_lich` int NOT NULL DEFAULT 0 COMMENT 'x',\n  `a` int\n)";
    const otherCheck =
      'ALTER TABLE `khac` ADD CONSTRAINT `chk_lich_hen_so_lan_tu_doi` CHECK (\n    `a` >= 0\n)';
    expect(maskLichHenDoiLich([otherTable, otherCheck])).toEqual([
      otherTable,
      otherCheck,
    ]);
  });

  it('MDL-08: mặt nạ thong_bao bỏ đúng một dòng cột, một chỉ mục và một khóa ngoại của reschedule P1, giữ nguyên mọi thứ khác; không che nhầm khóa ngoại lich_hen_id của P7 hay bảng khác', () => {
    const masked = maskThongBaoDoiLich(thongBao);
    expect(masked).toHaveLength(thongBao.length - 2);
    const before = thongBao.find(isCreateOf('thong_bao')) ?? '';
    const after = masked.find(isCreateOf('thong_bao')) ?? '';
    expect(before).toContain('`yeu_cau_doi_lich_ngoai_chinh_sach_id`');
    expect(after).not.toContain('yeu_cau_doi_lich_ngoai_chinh_sach_id');
    expect(after.split('\n')).toEqual(
      before
        .split('\n')
        .filter(
          (line) =>
            !line.startsWith('  `yeu_cau_doi_lich_ngoai_chinh_sach_id` '),
        ),
    );
    const isRescheduleStatement = (sql: string): boolean =>
      sql.startsWith(
        'CREATE UNIQUE INDEX `thong_bao_index_yeu_cau_doi_lich` ',
      ) ||
      sql.startsWith(
        'ALTER TABLE `thong_bao` ADD FOREIGN KEY (`yeu_cau_doi_lich_ngoai_chinh_sach_id`) ',
      );
    expect(thongBao.filter(isRescheduleStatement)).toHaveLength(2);
    expect(masked.filter((sql) => !isCreateOf('thong_bao')(sql))).toEqual(
      thongBao.filter(
        (sql) => !isCreateOf('thong_bao')(sql) && !isRescheduleStatement(sql),
      ),
    );
    // Ca âm: khóa ngoại lich_hen_id của thong_bao (P7) và cột cùng chữ ở bảng KHÁC không bị che
    const p7ForeignKey =
      'ALTER TABLE `thong_bao` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)';
    const otherTable =
      "CREATE TABLE `khac` (\n  `yeu_cau_doi_lich_ngoai_chinh_sach_id` bigint COMMENT 'x',\n  `a` int\n)";
    expect(thongBao).toContain(p7ForeignKey);
    expect(maskThongBaoDoiLich([p7ForeignKey, otherTable])).toEqual([
      p7ForeignKey,
      otherTable,
    ]);
  });

  it('MDL-09: name trùng tên lớp, timestamp 13 chữ số lớn hơn mọi migration đứng trước trong sổ đăng ký', () => {
    const timestampOf = (name: string): number =>
      Number(/(\d{13})$/.exec(name)?.[1]);
    const migration = new DoiLich1793966400000();
    expect(migration.name).toBe(DoiLich1793966400000.name);
    const index = MIGRATIONS.findIndex((item) => item.name === migration.name);
    expect(index, 'đã đăng ký ở MIGRATIONS').toBeGreaterThan(0);
    for (const earlier of MIGRATIONS.slice(0, index)) {
      expect(timestampOf(earlier.name), earlier.name).toBeLessThan(
        timestampOf(migration.name),
      );
    }
  });
});
