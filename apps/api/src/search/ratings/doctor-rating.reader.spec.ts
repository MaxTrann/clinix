import { vi } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  AVERAGE_RATING_SQL,
  DoctorRatingReader,
  NO_RATING,
  type DoctorRating,
} from './doctor-rating.reader.js';

// doctor-exam B9 — phần ĐƠN VỊ (không DB, `DataSource.query` giả) của `DoctorRatingReader`: TBS-14 (đổi: chỉ còn quy tắc "danh sách rỗng"),
// DTB-04, DTB-11…DTB-15 `[đề xuất]`, HDK-08. Phần MySQL thật (DTB-01…05, DTB-12 (c), (d), DTB-13): doctor-rating.reader.int-spec.ts.
// Hàng giả mô phỏng ĐÚNG kiểu driver đã đo ở X1 M5: `bacSiId` và `soDanhGia` là CHUỖI, `diem` là chuỗi một chữ số thập phân.
function fakeReader(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue(rows);
  const reader = new DoctorRatingReader({ query } as unknown as DataSource);
  return { reader, query };
}

const row = (bacSiId: string, diem: string, soDanhGia: string) => ({
  bacSiId,
  diem,
  soDanhGia,
});

describe('B9 — DoctorRatingReader.readMany (DataSource giả)', () => {
  it('TBS-14, DTB-04 (b): danh sách rỗng ⇒ Map rỗng và KHÔNG chạy SQL', async () => {
    const { reader, query } = fakeReader();
    const result = await reader.readMany([]);
    expect(result.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('DTB-04 (a): đủ MỌI id đầu vào theo thứ tự đầu vào; id không có hàng là chính NO_RATING; đúng MỘT câu', async () => {
    const { reader, query } = fakeReader([row('1', '4.5', '2')]);
    const result = await reader.readMany(['3', '1', '2']);
    expect([...result.keys()]).toEqual(['3', '1', '2']);
    expect(result.get('1')).toEqual({ diemTrungBinh: '4.5', soDanhGia: 2 });
    expect(result.get('3')).toBe(NO_RATING);
    expect(result.get('2')).toBe(NO_RATING);
    expect(NO_RATING).toEqual({ diemTrungBinh: null, soDanhGia: 0 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('DTB-04 (c): id trùng thành MỘT khoá và chỉ MỘT lần trong tham số', async () => {
    const { reader, query } = fakeReader([row('7', '3.0', '1')]);
    const result = await reader.readMany(['5', '5', '7', '5']);
    expect([...result.keys()]).toEqual(['5', '7']);
    expect(result.get('7')).toEqual({ diemTrungBinh: '3.0', soDanhGia: 1 });
    expect(query).toHaveBeenCalledWith(AVERAGE_RATING_SQL, [['5', '7']]);
  });

  it('DTB-14, M5: soDanhGia chuỗi của driver ⇒ số; điểm giữ NGUYÊN chuỗi có ".0"; NO_RATING không bị sửa', async () => {
    const { reader } = fakeReader([
      row('7', '4.0', '3'),
      row('8', '5.0', '12'),
    ]);
    const result = await reader.readMany(['7', '8', '9']);
    const seven = result.get('7');
    expect(seven).toEqual({ diemTrungBinh: '4.0', soDanhGia: 3 });
    expect(typeof seven?.soDanhGia).toBe('number');
    expect(typeof seven?.diemTrungBinh).toBe('string');
    expect(result.get('8')).toEqual({ diemTrungBinh: '5.0', soDanhGia: 12 });
    expect(result.get('9')).toBe(NO_RATING);
    expect(NO_RATING).toEqual({ diemTrungBinh: null, soDanhGia: 0 });
  });

  it('DTB-12 (a): id lớn hơn 2^53 giữ nguyên làm khoá chuỗi, không qua Number', async () => {
    const big = '9007199254740993';
    const max = '9223372036854775807';
    const { reader, query } = fakeReader([row(big, '2.0', '1')]);
    const result = await reader.readMany([big, max]);
    expect([...result.keys()]).toEqual([big, max]);
    expect(result.get(big)).toEqual({ diemTrungBinh: '2.0', soDanhGia: 1 });
    expect(result.get(max)).toBe(NO_RATING);
    expect(query).toHaveBeenCalledWith(AVERAGE_RATING_SQL, [[big, max]]);
  });

  it('DTB-12 (b): id không phải số KHÔNG vào tham số của SQL nhưng vẫn có khoá NO_RATING, đúng vị trí', async () => {
    const strange = [
      '',
      'abc',
      '01',
      '-1',
      '1.5',
      ' 1',
      '1 OR 1=1',
      "1'; DROP TABLE tai_khoan;--",
      '١٢٣',
      '１２',
    ];
    const { reader, query } = fakeReader([row('5', '4.0', '1')]);
    const input = ['5', ...strange, '0'];
    const result = await reader.readMany(input);
    expect([...result.keys()]).toEqual(input);
    for (const id of input) {
      if (id !== '5') expect(result.get(id)).toBe(NO_RATING);
    }
    expect(result.get('5')).toEqual({ diemTrungBinh: '4.0', soDanhGia: 1 });
    expect(query).toHaveBeenCalledWith(AVERAGE_RATING_SQL, [['5', '0']]);
  });

  it('DTB-12 (b): chỉ toàn id không phải số ⇒ không chạy SQL', async () => {
    const { reader, query } = fakeReader();
    const result = await reader.readMany(['abc', '', '01', '1.5']);
    expect(result.size).toBe(4);
    for (const rating of result.values()) expect(rating).toBe(NO_RATING);
    expect(query).not.toHaveBeenCalled();
  });

  it('DTB-11: văn bản câu SQL: một SELECT chỉ đọc, loại đánh giá ẩn ở WHERE, làm tròn một chữ số, nhóm theo bác sĩ của lịch, MỘT tham số IN', () => {
    const sql = AVERAGE_RATING_SQL;
    expect(sql.match(/\bSELECT\b/gi)).toHaveLength(1);
    expect(sql).toContain('WHERE dg.bi_an = 0 AND lh.bac_si_id IN (?)');
    expect(sql).toContain('ROUND(AVG(dg.so_sao), 1) AS diem');
    expect(sql).toContain('COUNT(*) AS soDanhGia');
    expect(sql).toContain('CAST(lh.bac_si_id AS CHAR) AS bacSiId');
    expect(sql).toContain('GROUP BY lh.bac_si_id');
    expect(sql).toContain(
      'FROM danh_gia_bac_si dg JOIN lich_hen lh ON lh.lich_hen_id = dg.lich_hen_id',
    );
    expect(sql.match(/\?/g)).toHaveLength(1);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    expect(sql).not.toMatch(
      /\b(FOR\s+SHARE|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER)\b/i,
    );
    expect(sql).not.toMatch(/\b(NOW|CURDATE|CURRENT_TIMESTAMP)\b/i);
    // Chỉ hai bảng: không thêm bảng chứa nhận xét, tên người đánh giá hay lý do ẩn.
    expect(sql).not.toMatch(/nhan_xet|ly_do_an|ho_ten|tai_khoan/i);
  });

  it('DTB-11 (b): văn bản KHÔNG đổi theo số id (không nối chuỗi) và tham số là MỘT phần tử (mảng id)', async () => {
    const { reader, query } = fakeReader();
    const many = Array.from({ length: 1000 }, (_, i) => String(i + 1));
    await reader.readMany(['1']);
    await reader.readMany(many);
    const [first, second] = query.mock.calls as [string, unknown[]][];
    expect(first?.[0]).toBe(AVERAGE_RATING_SQL);
    expect(second?.[0]).toBe(AVERAGE_RATING_SQL);
    expect(first?.[1]).toEqual([['1']]);
    expect(second?.[1]).toEqual([many]);
  });

  it('DTB-13: không cache: hai lần gọi là hai lần query và lần hai thấy dữ liệu mới', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([row('1', '4.0', '1')])
      .mockResolvedValueOnce([row('1', '4.5', '2')]);
    const reader = new DoctorRatingReader({ query } as unknown as DataSource);
    const first = await reader.readMany(['1']);
    const second = await reader.readMany(['1']);
    expect(query).toHaveBeenCalledTimes(2);
    expect(first.get('1')).toEqual({ diemTrungBinh: '4.0', soDanhGia: 1 });
    expect(second.get('1')).toEqual({ diemTrungBinh: '4.5', soDanhGia: 2 });
  });

  it('DTB-15: lỗi DB lan ra (không bị nuốt thành "chưa có đánh giá")', async () => {
    const query = vi.fn().mockRejectedValue(new Error('mất kết nối DB'));
    const reader = new DoctorRatingReader({ query } as unknown as DataSource);
    await expect(reader.readMany(['1'])).rejects.toThrow('mất kết nối DB');
  });

  it('HDK-08: chữ ký readMany(ids): Promise<Map<string, DoctorRating>> không đổi', async () => {
    const { reader } = fakeReader();
    // Dòng này chỉ biên dịch khi chữ ký còn đúng như PublicDoctorService mong đợi.
    const readMany: (
      ids: readonly string[],
    ) => Promise<Map<string, DoctorRating>> = reader.readMany.bind(reader);
    expect(readMany).toHaveLength(1);
    expect((await readMany(['1'])).get('1')).toBe(NO_RATING);
  });
});
