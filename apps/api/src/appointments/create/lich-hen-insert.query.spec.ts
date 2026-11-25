import type { EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { vi } from 'vitest';
import {
  insertLichHen,
  type LichHenInsertRow,
} from './lich-hen-insert.query.js';

// Task B8 — câu `INSERT lich_hen` với `EntityManager` giả (không DB): thứ tự và kiểu tham số, snapshot ghi bằng `JSON.stringify` và cọc 0đ ghi SQL `NULL` (DL-21 phần đơn vị, X1 M7), và ánh xạ 1062 theo TÊN
// KHOÁ (TAO-02, X1 M2). Hành vi thật trên MySQL: create-appointment.service.int-spec.ts. Mã TAO-nn là [đề xuất].
const THOI_GIAN = new Date('2026-11-10T01:00:00.000Z');
const HAN = new Date('2026-11-02T01:15:00.000Z');
const TAO = new Date('2026-11-02T01:00:00.000Z');

const ROW: LichHenInsertRow = {
  maLichHen: 'CLX-20261102-ABCDE',
  khungGioId: '10',
  benhNhanId: '77',
  hoSoNguoiThanId: null,
  bacSiId: '5',
  chiNhanhId: '1',
  dichVuKhamId: '7',
  thoiGian: THOI_GIAN,
  giaSnapshot: '200000.00',
  tienCocSnapshot: '50000.00',
  chinhSachHoanSnapshot: [
    { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
    { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
  ],
  trangThai: 'ChoThanhToan',
  hanThanhToan: HAN,
  lyDoKham: 'Đau đầu',
  thoiDiemTao: TAO,
};

function build(result: unknown) {
  const query = vi.fn((_sql: string, _params?: unknown[]) => {
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  });
  return { query, em: { query } as unknown as EntityManager };
}

const dupError = (message: string) =>
  new QueryFailedError('q', [], {
    errno: 1062,
    code: 'ER_DUP_ENTRY',
    sqlMessage: message,
  } as never);

describe('insertLichHen: tham số của câu INSERT (DL-21, DL-25)', () => {
  // reschedule B1 (HDL-08): 16 thành 18 cột (thêm `lich_hen_truoc_id`, `so_lan_tu_doi_lich` Ở CUỐI nên vị trí 16 tham số cũ không đổi)
  it('đúng 18 cột và 18 dấu hỏi (MOC-18: thêm thoi_diem_xac_nhan, booking B19; reschedule B1: thêm lich_hen_truoc_id và so_lan_tu_doi_lich), chỉ INSERT một bảng lich_hen', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, ROW);

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/^INSERT INTO lich_hen\b/);
    expect(sql.match(/\?/g)).toHaveLength(18);
    const columns = /\(([^)]*)\)\s*VALUES/s.exec(sql)?.[1] ?? '';
    expect(columns.split(',').map((c) => c.trim())).toStrictEqual([
      'ma_lich_hen',
      'khung_gio_id',
      'benh_nhan_id',
      'ho_so_nguoi_than_id',
      'bac_si_id',
      'chi_nhanh_id',
      'dich_vu_kham_id',
      'thoi_gian',
      'gia_snapshot',
      'tien_coc_snapshot',
      'chinh_sach_hoan_snapshot',
      'trang_thai',
      'han_thanh_toan',
      'ly_do_kham',
      'thoi_diem_tao',
      'thoi_diem_xac_nhan',
      'lich_hen_truoc_id',
      'so_lan_tu_doi_lich',
    ]);
  });

  it('tham số theo đúng thứ tự cột; id là CHUỖI nguyên văn; tiền là chuỗi decimal; Date giữ nguyên đối tượng', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, ROW);

    const params = query.mock.calls[0]?.[1];
    expect(params).toStrictEqual([
      'CLX-20261102-ABCDE',
      '10',
      '77',
      null,
      '5',
      '1',
      '7',
      THOI_GIAN,
      '200000.00',
      '50000.00',
      JSON.stringify(ROW.chinhSachHoanSnapshot),
      'ChoThanhToan',
      HAN,
      'Đau đầu',
      TAO,
      // Lịch ChoThanhToan chưa được xác nhận: thoi_diem_xac_nhan NULL (MOC-06)
      null,
      // `create` không truyền hai trường đổi lịch: NULL và 0, đúng giá trị mặc định của cột (HDL-08, HDL-15)
      null,
      0,
    ]);
  });

  it('MOC-06: lịch có cọc (ChoThanhToan) ghi thoi_diem_xac_nhan NULL, kể cả khi truyền hạn thanh toán', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, { ...ROW, trangThai: 'ChoThanhToan' });

    const params = query.mock.calls[0]?.[1] ?? [];
    expect(params).toHaveLength(18);
    expect(params[15]).toBeNull();
    expect(params[14]).toBe(TAO);
  });

  it('MOC-05: lịch cọc 0đ (INSERT thẳng DaXacNhan) ghi thoi_diem_xac_nhan = CHÍNH mốc thoi_diem_tao (cùng đối tượng Date, một mốc now của lượt)', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, {
      ...ROW,
      trangThai: 'DaXacNhan',
      hanThanhToan: null,
      tienCocSnapshot: '0.00',
      chinhSachHoanSnapshot: null,
    });

    const params = query.mock.calls[0]?.[1] ?? [];
    expect(params).toHaveLength(18);
    expect(params[11]).toBe('DaXacNhan');
    expect(params[14]).toBe(TAO);
    expect(params[15]).toBe(TAO);
  });

  it('DL-21 snapshot là CHUỖI JSON (mảng truyền thẳng bị MySQL từ chối 1136, X1 M7), giữ thứ tự giảm dần', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, ROW);

    const snapshot = query.mock.calls[0]?.[1]?.[10];
    expect(typeof snapshot).toBe('string');
    expect(JSON.parse(snapshot as string)).toStrictEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
    ]);
  });

  it('DL-21 cọc > 0 chưa có mốc ⇒ chuỗi "[]" (không hoàn gì), KHÁC với cọc 0đ', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, { ...ROW, chinhSachHoanSnapshot: [] });

    expect(query.mock.calls[0]?.[1]?.[10]).toBe('[]');
  });

  it('DL-21 cọc 0đ ⇒ SQL NULL (tham số null), KHÔNG phải chuỗi "null" (JSON null khác SQL NULL, X1 M7)', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, {
      ...ROW,
      chinhSachHoanSnapshot: null,
      tienCocSnapshot: '0.00',
      trangThai: 'DaXacNhan',
      hanThanhToan: null,
    });

    const params = query.mock.calls[0]?.[1];
    expect(params?.[10]).toBeNull();
    expect(params?.[11]).toBe('DaXacNhan');
    // DL-01: cọc 0đ xác nhận ngay không có hạn thanh toán
    expect(params?.[12]).toBeNull();
  });

  it('lyDoKham null ⇒ SQL NULL; hồ sơ người thân giữ id chuỗi', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, {
      ...ROW,
      lyDoKham: null,
      hoSoNguoiThanId: '9223372036854775807',
    });

    const params = query.mock.calls[0]?.[1];
    expect(params?.[3]).toBe('9223372036854775807');
    expect(params?.[13]).toBeNull();
  });
});

describe('insertLichHen: kết quả có kiểu', () => {
  it.each([
    [42, '42'],
    ['9007199254740993', '9007199254740993'],
  ])(
    'thành công trả lichHenId dạng chuỗi (insertId %s)',
    async (insertId, id) => {
      const { em } = build({ insertId });

      expect(await insertLichHen(em, ROW)).toStrictEqual({
        kind: 'Inserted',
        lichHenId: id,
      });
    },
  );

  it('TAO-02 1062 trên ma_lich_hen ⇒ DuplicateCode (người gọi sinh mã khác)', async () => {
    const { em } = build(
      dupError("Duplicate entry 'CLX-1' for key 'lich_hen.ma_lich_hen'"),
    );

    expect(await insertLichHen(em, ROW)).toStrictEqual({
      kind: 'DuplicateCode',
    });
  });

  it('TAO-02 1062 trên khung_gio_dang_giu ⇒ DuplicateSlot (lưới an toàn cuối của H1)', async () => {
    const { em } = build(
      dupError("Duplicate entry '10' for key 'lich_hen.khung_gio_dang_giu'"),
    );

    expect(await insertLichHen(em, ROW)).toStrictEqual({
      kind: 'DuplicateSlot',
    });
  });

  // reschedule B1: khoá `lich_hen_truoc_id` từng là ví dụ "khoá khác" ở đây; nay nó có kết quả riêng (HDL-08), nên ví dụ chuyển sang một khoá của bảng khác
  it('TAO-02 1062 trên khoá khác ⇒ ném nguyên (không nuốt, không đoán)', async () => {
    const error = dupError(
      "Duplicate entry '1' for key 'thong_bao.thong_bao_index_lich_hen'",
    );
    const { em } = build(error);

    await expect(insertLichHen(em, ROW)).rejects.toBe(error);
  });

  it('lỗi khác (khoá ngoại 1452, lỗi thường) ⇒ ném nguyên để giao dịch hoàn tác', async () => {
    const fk = new QueryFailedError('q', [], {
      errno: 1452,
      code: 'ER_NO_REFERENCED_ROW_2',
    } as never);
    const { em } = build(fk);

    await expect(insertLichHen(em, ROW)).rejects.toBe(fk);
    const plain = new Error('mất kết nối');
    await expect(insertLichHen(build(plain).em, ROW)).rejects.toBe(plain);
  });
});

// reschedule B1 — HDL-08 (phần hàm chèn; PLAN reschedule 5.5 bước 5, 7.9): lịch mới của đổi lịch nối chuỗi bằng `lich_hen_truoc_id` và mang `so_lan_tu_doi_lich`; 1062 trên khoá `lich_hen_truoc_id` là
// kết quả có kiểu `DuplicateChain` (đổi lịch hai lần cùng lúc), KHÔNG 500. Phần "không tự trỏ chính nó" là của dịch vụ (B4, quy tắc DB 27). Hành vi thật trên MySQL: lich-hen-insert.int-spec.ts.
describe('insertLichHen: nối chuỗi đổi lịch (HDL-08)', () => {
  it('hai tham số đổi lịch ở CUỐI danh sách (vị trí 17 và 18), id là CHUỖI nguyên văn, bộ đếm là số', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, {
      ...ROW,
      trangThai: 'DaXacNhan',
      hanThanhToan: null,
      lichHenTruocId: '9223372036854775806',
      soLanTuDoiLich: 2,
    });

    const params = query.mock.calls[0]?.[1] ?? [];
    expect(params).toHaveLength(18);
    expect(params[16]).toBe('9223372036854775806');
    expect(params[17]).toBe(2);
    // thoi_diem_xac_nhan vẫn bằng thoi_diem_tao khi DaXacNhan (không thêm tham số: lịch mới của đổi lịch được xác nhận ngay, Q7 (d))
    expect(params[14]).toBe(TAO);
    expect(params[15]).toBe(TAO);
  });

  it.each([
    ['vắng cả hai (create)', {}],
    ['lichHenTruocId null tường minh', { lichHenTruocId: null }],
  ])(
    '%s ⇒ lich_hen_truoc_id NULL và so_lan_tu_doi_lich 0',
    async (_name, extra) => {
      const { query, em } = build({ insertId: 1 });

      await insertLichHen(em, { ...ROW, ...extra });

      const params = query.mock.calls[0]?.[1] ?? [];
      expect(params[16]).toBeNull();
      expect(params[17]).toBe(0);
    },
  );

  it('soLanTuDoiLich 0 tường minh được giữ (không bị coi là vắng)', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, { ...ROW, lichHenTruocId: '5', soLanTuDoiLich: 0 });

    expect(query.mock.calls[0]?.[1]?.[17]).toBe(0);
  });

  it('1062 trên lich_hen.lich_hen_truoc_id ⇒ DuplicateChain (không ném, không 500)', async () => {
    const { em } = build(
      dupError("Duplicate entry '5' for key 'lich_hen.lich_hen_truoc_id'"),
    );

    expect(
      await insertLichHen(em, { ...ROW, lichHenTruocId: '5' }),
    ).toStrictEqual({ kind: 'DuplicateChain' });
  });

  it('DuplicateChain không bị nhầm với DuplicateCode hay DuplicateSlot (ba khoá ba kết quả)', async () => {
    const keys = [
      ['lich_hen.ma_lich_hen', 'DuplicateCode'],
      ['lich_hen.khung_gio_dang_giu', 'DuplicateSlot'],
      ['lich_hen.lich_hen_truoc_id', 'DuplicateChain'],
    ] as const;
    for (const [key, kind] of keys) {
      const { em } = build(dupError(`Duplicate entry '1' for key '${key}'`));
      expect(await insertLichHen(em, ROW), key).toStrictEqual({ kind });
    }
  });
});
