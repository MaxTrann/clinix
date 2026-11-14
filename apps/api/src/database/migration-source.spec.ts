import { TAO_BANG_ANH_SQL } from './migrations/1793188800000-tao-bang-anh.js';
import { TAO_BANG_DANH_MUC_SQL } from './migrations/1793024340000-tao-bang-danh-muc.js';
import {
  TAO_BANG_HO_SO_KHAM_SQL,
  TaoBangHoSoKham1793620800000,
} from './migrations/1793620800000-tao-bang-ho-so-kham.js';
import { MIGRATIONS } from './migrations/index.js';
import { TAO_BANG_MOC_HOAN_TIEN_SQL } from './migrations/1793534400000-tao-bang-moc-hoan-tien.js';
import { TAO_BANG_NHAN_SU_SQL } from './migrations/1793080000000-tao-bang-nhan-su.js';
import { TAO_BANG_VAN_HANH_SQL } from './migrations/1793090000000-tao-bang-van-hanh.js';
import { THONG_BAO_LICH_HEN_UP_SQL } from './migrations/1793448000000-thong-bao-lich-hen.js';
import {
  normalizeStatement,
  officialStatementsFor,
  targetTable,
  maskAuditEnums,
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
    expect(TAO_BANG_NHAN_SU_SQL.map(normalizeStatement)).toEqual(official);
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
    // booking P7 (đều sau migration này); phần P7 được che, xem TBLH-01 đến TBLH-03 ở dưới.
    expect(
      TAO_BANG_VAN_HANH_SQL.map(normalizeStatement).map(maskAuditEnums),
    ).toEqual(maskThongBaoLichHen(official).map(maskAuditEnums));
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
