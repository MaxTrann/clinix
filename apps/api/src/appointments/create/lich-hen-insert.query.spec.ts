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
  it('đúng 15 cột và 15 dấu hỏi, chỉ INSERT một bảng lich_hen', async () => {
    const { query, em } = build({ insertId: 1 });

    await insertLichHen(em, ROW);

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/^INSERT INTO lich_hen\b/);
    expect(sql.match(/\?/g)).toHaveLength(15);
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
    ]);
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

  it('TAO-02 1062 trên khoá khác ⇒ ném nguyên (không nuốt, không đoán)', async () => {
    const error = dupError(
      "Duplicate entry '1' for key 'lich_hen.lich_hen_truoc_id'",
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
