import { resetTables } from '../../database/testing/test-database.js';
import { CONTEXT_CACHE_TTL_MS } from '../context/context.constants.js';
import { mapSpecialties } from './specialty-mapper.js';
import { openWorld, type World } from './testing/b2-world.js';

// chatbot B2 — ánh xạ chuyên khoa trên MySQL thật (2.4.77 b3, b4). Mã test: ANX-02 (id đã ngừng, không tồn tại, trùng, không phải số bị loại), ANX-03 (rỗng khi goiYDatLich).
// Id chuyên khoa đi qua bản chụp ngữ cảnh THẬT (đệm giữ nguyên), rồi DB đổi: chỉ lần đọc lại mới thấy.
let world: World;
beforeAll(async () => {
  world = await openWorld();
});
beforeEach(async () => {
  await resetTables(world.db);
  world.clock.advance(10 * CONTEXT_CACHE_TTL_MS);
});
afterAll(async () => {
  await world?.close();
});

async function specialties(count: number, first = 1): Promise<string[]> {
  const ids: string[] = [];
  for (let n = first; n < first + count; n += 1) {
    const { specialty } = await world.fixtures.admin.catalog();
    await world.db.query(
      'UPDATE chuyen_khoa SET ten = ? WHERE chuyen_khoa_id = ?',
      [`Khoa thứ ${n}`, specialty.chuyenKhoaId],
    );
    ids.push(specialty.chuyenKhoaId);
  }
  return ids;
}

const map = async (
  rawIds: string[],
  loai: 'goiYDatLich' | 'hoiDap' = 'goiYDatLich',
) => {
  const { index } = await world.builder.build({ question: 'xin chào' });
  return {
    index,
    run: () =>
      mapSpecialties({ loai, rawIds, index, source: world.repository }),
  };
};

describe('mapSpecialties trên MySQL thật', () => {
  it('ANX-02: loại id đã ngừng (sau khi dựng ngữ cảnh), không tồn tại, trùng, không phải số; tên lấy từ DB; giữ ba theo thứ tự mô hình', async () => {
    const [a, b, c, d, e] = await specialties(5);
    const { index } = await world.builder.build({ question: 'xin chào' });
    for (const id of [a, b, c, d, e]) {
      expect(index.activeSpecialties.has(id!)).toBe(true);
    }

    // sau khi ngữ cảnh đã dựng (đệm giữ bản cũ): b ngừng, c đổi tên
    await world.db.query(
      "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
      [b],
    );
    await world.db.query(
      'UPDATE chuyen_khoa SET ten = ? WHERE chuyen_khoa_id = ?',
      ['Tên mới của khoa ba', c],
    );

    const result = await mapSpecialties({
      loai: 'goiYDatLich',
      rawIds: [a!, b!, '999999999', c!, c!, 'abc', '', '-3', d!, e!],
      index,
      source: world.repository,
    });
    expect(result.khongCoChuyenKhoa).toBe(false);
    expect(result.chuyenKhoaGoiY).toEqual([
      { chuyenKhoaId: a, ten: 'Khoa thứ 1' },
      { chuyenKhoaId: c, ten: 'Tên mới của khoa ba' },
      { chuyenKhoaId: d, ten: 'Khoa thứ 4' },
    ]);
  });

  it('ANX-02: chuyên khoa tạo SAU bản chụp là id lạ (không có trong ngữ cảnh đã gửi) dù đang hoạt động trong DB', async () => {
    const [a] = await specialties(1);
    const { index } = await world.builder.build({ question: 'xin chào' });
    const [later] = await specialties(1, 100);
    const result = await mapSpecialties({
      loai: 'goiYDatLich',
      rawIds: [later!, a!],
      index,
      source: world.repository,
    });
    expect(result.chuyenKhoaGoiY.map((item) => item.chuyenKhoaId)).toEqual([a]);
  });

  it('ANX-03: mọi id bị loại khi goiYDatLich thì rỗng và báo A4', async () => {
    const [a, b] = await specialties(2);
    const { index } = await world.builder.build({ question: 'xin chào' });
    await world.db.query(
      "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong'",
    );
    const result = await mapSpecialties({
      loai: 'goiYDatLich',
      rawIds: [a!, b!, '999999'],
      index,
      source: world.repository,
    });
    expect(result).toEqual({ chuyenKhoaGoiY: [], khongCoChuyenKhoa: true });
  });

  it('B2-84: hoiDap bỏ qua danh sách dù id hợp lệ', async () => {
    const [a] = await specialties(1);
    const { run } = await map([a!], 'hoiDap');
    expect(await run()).toEqual({
      chuyenKhoaGoiY: [],
      khongCoChuyenKhoa: false,
    });
  });
});
