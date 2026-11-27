import { createContextIndex } from '../context/context-index.js';
import {
  mapSpecialties,
  type ActiveSpecialtySource,
} from './specialty-mapper.js';

// chatbot B2 — ánh xạ chuyên khoa (2.4.77). Mã test: ANX-01 (giữ ba theo thứ tự), ANX-02 (bản đơn vị với nguồn giả; bản MySQL thật ở
// specialty-mapper.int-spec.ts), ANX-03 (rỗng khi goiYDatLich). Id BIGINT luôn là chuỗi.

// Ngữ cảnh đã gửi cho mô hình có bảy chuyên khoa "1" đến "7"
const SENT = new Map(
  ['1', '2', '3', '4', '5', '6', '7'].map((id) => [id, `Khoa ${id}`]),
);
const index = createContextIndex([], SENT);

/** Nguồn giả: chỉ các id trong `active` còn hoạt động; ghi lại các lần gọi. */
function fakeSource(active: readonly string[]) {
  const calls: (readonly string[])[] = [];
  const source: ActiveSpecialtySource = {
    findActiveSpecialties: (ids) => {
      calls.push(ids);
      return Promise.resolve(
        new Map(
          ids
            .filter((id) => active.includes(id))
            .map((id) => [id, `Tên thật ${id}`] as const),
        ),
      );
    },
  };
  return { source, calls };
}

const map = (rawIds: string[], active: string[], loai = 'goiYDatLich') => {
  const { source, calls } = fakeSource(active);
  return mapSpecialties({
    loai: loai as 'goiYDatLich',
    rawIds,
    index,
    source,
  }).then((result) => ({ result, calls }));
};

const idsOf = (result: Awaited<ReturnType<typeof map>>['result']) =>
  result.chuyenKhoaGoiY.map((item) => item.chuyenKhoaId);

describe('chatbot B2 — mapSpecialties', () => {
  it('ANX-01: ba id hợp lệ và một id thứ tư thì giữ ba, theo thứ tự mô hình đưa', async () => {
    const { result } = await map(['5', '2', '7', '1'], ['1', '2', '5', '7']);
    expect(idsOf(result)).toEqual(['5', '2', '7']);
    expect(result.khongCoChuyenKhoa).toBe(false);
  });

  it('ANX-01: tên lấy từ lần đọc lại ở DB, không phải chữ của mô hình hay của bản chụp', async () => {
    const { result } = await map(['3'], ['3']);
    expect(result.chuyenKhoaGoiY).toEqual([
      { chuyenKhoaId: '3', ten: 'Tên thật 3' },
    ]);
  });

  it('ANX-01: ít hơn ba id thì giữ hết', async () => {
    const { result } = await map(['4', '6'], ['4', '6']);
    expect(idsOf(result)).toEqual(['4', '6']);
  });

  it('ANX-02: bỏ id đã ngừng (còn trong bản chụp nhưng DB không còn hoạt động)', async () => {
    const { result } = await map(['1', '2', '3'], ['1', '3']);
    expect(idsOf(result)).toEqual(['1', '3']);
  });

  it('ANX-02: bỏ id không tồn tại trong ngữ cảnh đã gửi (id lạ), kể cả khi DB có và đang hoạt động', async () => {
    const { result, calls } = await map(['99', '2'], ['99', '2']);
    expect(idsOf(result)).toEqual(['2']);
    // id lạ không bao giờ được đem đi hỏi DB
    expect(calls).toEqual([['2']]);
  });

  it('ANX-02: bỏ id trùng, giữ lần xuất hiện đầu', async () => {
    const { result } = await map(['2', '2', '5', '2'], ['2', '5']);
    expect(idsOf(result)).toEqual(['2', '5']);
  });

  it.each([
    ['chữ', 'abc'],
    ['rỗng', ''],
    ['âm', '-1'],
    ['thập phân', '1.5'],
    ['số 0 đầu', '01'],
    ['số không', '0'],
    ['khoảng trắng', ' 2'],
    ['quá BIGINT', '9223372036854775808'],
  ])(
    'ANX-02: id không phải số nguyên dương hợp lệ (%s) bị loại',
    async (_n, bad) => {
      const { result, calls } = await map([bad, '4'], ['4']);
      expect(idsOf(result)).toEqual(['4']);
      expect(calls).toEqual([['4']]);
    },
  );

  it('ANX-02: lọc TRƯỚC rồi mới cắt ba ([lạ, a, b, c, d] giữ a, b, c)', async () => {
    const { result } = await map(
      ['99', '1', '2', '3', '4'],
      ['99', '1', '2', '3', '4'],
    );
    expect(idsOf(result)).toEqual(['1', '2', '3']);
  });

  it('ANX-03: mọi id bị loại khi goiYDatLich thì rỗng và báo A4', async () => {
    const { result } = await map(['99', 'abc', '2'], []);
    expect(result).toEqual({ chuyenKhoaGoiY: [], khongCoChuyenKhoa: true });
  });

  it('ANX-03: mô hình không đưa id nào khi goiYDatLich cũng là A4, và không gọi DB', async () => {
    const { result, calls } = await map([], ['1']);
    expect(result).toEqual({ chuyenKhoaGoiY: [], khongCoChuyenKhoa: true });
    expect(calls).toEqual([]);
  });

  it.each(['hoiDap', 'ngoaiPhamVi', 'khanCap'])(
    'ANX-03: loai %s thì bỏ qua danh sách, không báo A4 và không gọi DB',
    async (loai) => {
      const { result, calls } = await map(['1', '2'], ['1', '2'], loai);
      expect(result).toEqual({ chuyenKhoaGoiY: [], khongCoChuyenKhoa: false });
      expect(calls).toEqual([]);
    },
  );
});
