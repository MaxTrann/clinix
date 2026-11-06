import { DoctorRatingReader } from './doctor-rating.reader.js';

// B4 — TBS-14: chưa có bảng đánh giá ⇒ mọi bác sĩ { null, 0 } (Q16).
describe('B4 — DoctorRatingReader', () => {
  it('TBS-14: mọi bác sĩ trả { diemTrungBinh: null, soDanhGia: 0 }', async () => {
    const result = await new DoctorRatingReader().readMany(['1', '22', '333']);
    expect([...result.keys()]).toEqual(['1', '22', '333']);
    for (const rating of result.values()) {
      expect(rating).toEqual({ diemTrungBinh: null, soDanhGia: 0 });
    }
  });

  it('TBS-14 (biên): danh sách rỗng ⇒ Map rỗng', async () => {
    expect((await new DoctorRatingReader().readMany([])).size).toBe(0);
  });
});
