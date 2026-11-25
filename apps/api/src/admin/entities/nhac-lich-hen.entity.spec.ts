import { getMetadataArgsStorage } from 'typeorm';
import { TAO_BANG_NHAC_LICH_HEN_SQL } from '../../database/migrations/1794052800000-tao-bang-nhac-lich-hen.js';
import { TRANG_THAI_NHAC_LICH_HEN } from './enums.js';
import { NhacLichHen } from './nhac-lich-hen.entity.js';

// notification P1 (#656) — MTB-07: entity NhacLichHen khớp DDL của migration (khóa chính kép, kiểu, độ dài, enum, tên theo AGENTS mục 4).
const storage = getMetadataArgsStorage();
const columns = storage.columns.filter((c) => c.target === NhacLichHen);
const optionsOf = (property: string) =>
  columns.find((c) => c.propertyName === property)?.options;

/** `ho_ten` → `hoTen` (AGENTS mục 4: thuộc tính = camelCase của tên cột tiếng Việt không dấu). */
const camelOf = (column: string) =>
  column.replace(/_([a-z])/g, (_m, letter: string) => letter.toUpperCase());

const [createTable = ''] = TAO_BANG_NHAC_LICH_HEN_SQL;

describe('MTB-07 entity NhacLichHen', () => {
  it('bảng nhac_lich_hen, tên class là PascalCase của tên bảng', () => {
    const table = storage.tables.find((t) => t.target === NhacLichHen);
    expect(table?.name).toBe('nhac_lich_hen');
  });

  it('đủ tám cột của DDL, cùng thứ tự, thuộc tính là camelCase của tên cột', () => {
    const ddlColumns = [...createTable.matchAll(/^ {2}`(\w+)` /gm)].map(
      (m) => m[1] ?? '',
    );
    expect(ddlColumns).toHaveLength(8);
    expect(columns.map((c) => c.options.name)).toEqual(ddlColumns);
    for (const column of columns)
      expect(column.propertyName).toBe(camelOf(String(column.options.name)));
  });

  it('khóa chính kép (lichHenId, soGioTruoc); lichHenId kiểu bigint (đọc ra chuỗi), soGioTruoc kiểu int', () => {
    const primary = columns
      .filter((c) => c.mode === 'regular' && c.options.primary)
      .map((c) => c.propertyName);
    expect(primary).toEqual(['lichHenId', 'soGioTruoc']);
    expect(optionsOf('lichHenId')?.type).toBe('bigint');
    expect(optionsOf('soGioTruoc')?.type).toBe('int');
  });

  it('loi_cuoi varchar(500) cho phép NULL; ba cột thời gian thử/gửi cho phép NULL', () => {
    expect(optionsOf('loiCuoi')).toMatchObject({
      type: 'varchar',
      length: 500,
      nullable: true,
    });
    expect(optionsOf('lanThuCuoiLuc')?.nullable).toBe(true);
    expect(optionsOf('daGuiLuc')?.nullable).toBe(true);
    expect(optionsOf('soLanThu')).toMatchObject({ type: 'int', default: 0 });
  });

  it('enum trạng thái khớp ENUM của DDL (ca âm: không có BoQua như email_thong_bao), mặc định ChoGui', () => {
    const ddlEnum = /`trang_thai` ENUM \(([^)]*)\)/.exec(createTable)?.[1];
    const values = [...(ddlEnum ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...TRANG_THAI_NHAC_LICH_HEN]);
    expect(TRANG_THAI_NHAC_LICH_HEN).not.toContain('BoQua');
    expect(optionsOf('trangThai')).toMatchObject({
      type: 'enum',
      enum: TRANG_THAI_NHAC_LICH_HEN,
      default: 'ChoGui',
    });
  });

  it('khai hai CHECK và chỉ mục trạng thái cùng tên với DB', () => {
    expect(
      storage.checks
        .filter((c) => c.target === NhacLichHen)
        .map((c) => c.name ?? '')
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['chk_nhac_lich_hen_ket_qua', 'chk_nhac_lich_hen_moc']);
    const index = storage.indices.find((i) => i.target === NhacLichHen);
    expect(index?.name).toBe('nhac_lich_hen_index_trang_thai');
    expect(index?.columns).toEqual(['trangThai', 'lanThuCuoiLuc']);
  });
});
