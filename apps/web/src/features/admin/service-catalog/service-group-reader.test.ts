import { UnexpectedResponseError } from '../../../shared/api/errors';
import { readServiceGroupPage } from './service-group-reader';

// PR3-W01: bộ đọc chặt của GET /admin/service-groups. Sai hình dạng ở BẤT KỲ chỗ nào thì cả phản hồi bị từ chối
// (ném UnexpectedResponseError), không bao giờ trả dòng dở để vẽ "NaN" hay "undefined" ra màn hình.
const item = (overrides: Record<string, unknown> = {}) => ({
  nhomDichVuId: '1',
  ten: 'Khám tổng quát',
  thuTuHienThi: 1,
  soDichVu: 3,
  ...overrides,
});
const page = (
  items: unknown[] = [item()],
  overrides: Record<string, unknown> = {},
) => ({ items, total: items.length, page: 1, pageSize: 20, ...overrides });

describe('readServiceGroupPage (PR3-W01)', () => {
  it('PR3-W01 đọc đủ bốn khoá của mỗi nhóm, kể cả nhóm 0 dịch vụ và id bigint dạng chuỗi', () => {
    const result = readServiceGroupPage(
      page(
        [
          item({ nhomDichVuId: '9007199254740993', soDichVu: 0 }),
          item({ nhomDichVuId: '2', ten: 'Xét nghiệm', thuTuHienThi: 0 }),
        ],
        { total: 42, page: 3, pageSize: 2 },
      ),
    );

    expect(result).toEqual({
      items: [
        {
          nhomDichVuId: '9007199254740993',
          ten: 'Khám tổng quát',
          thuTuHienThi: 1,
          soDichVu: 0,
        },
        {
          nhomDichVuId: '2',
          ten: 'Xét nghiệm',
          thuTuHienThi: 0,
          soDichVu: 3,
        },
      ],
      total: 42,
      page: 3,
      pageSize: 2,
    });
  });

  it('PR3-W01 danh sách rỗng là hợp lệ', () => {
    expect(readServiceGroupPage(page([]))).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it('PR3-W01 không chép khoá thừa của API (ở dòng lẫn ở trang)', () => {
    const result = readServiceGroupPage(
      page([item({ ghiChuNoiBo: 'x', soNguoi: 9 })], { thongKe: { a: 1 } }),
    );

    expect(Object.keys(result).sort()).toEqual([
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(Object.keys(result.items[0]!).sort()).toEqual([
      'nhomDichVuId',
      'soDichVu',
      'ten',
      'thuTuHienThi',
    ]);
  });

  it.each<[string, unknown]>([
    ['thân là null', null],
    ['thân là chuỗi', 'x'],
    ['thân là mảng', []],
    ['thiếu items', { total: 0, page: 1, pageSize: 20 }],
    ['items là object', page([], { items: {} })],
    ['items là null', page([], { items: null })],
    ['một dòng là null', page([null])],
    ['một dòng là chuỗi', page(['x'])],
    [
      'thiếu soDichVu',
      page([{ nhomDichVuId: '1', ten: 'A', thuTuHienThi: 1 }]),
    ],
    ['soDichVu là chuỗi "3"', page([item({ soDichVu: '3' })])],
    ['soDichVu âm', page([item({ soDichVu: -1 })])],
    ['soDichVu lẻ', page([item({ soDichVu: 1.5 })])],
    ['soDichVu null', page([item({ soDichVu: null })])],
    ['soDichVu NaN', page([item({ soDichVu: Number.NaN })])],
    ['soDichVu vô cực', page([item({ soDichVu: Number.POSITIVE_INFINITY })])],
    ['soDichVu vượt số nguyên an toàn', page([item({ soDichVu: 2 ** 53 })])],
    ['thuTuHienThi là chuỗi', page([item({ thuTuHienThi: '1' })])],
    ['thuTuHienThi âm', page([item({ thuTuHienThi: -1 })])],
    ['nhomDichVuId là số', page([item({ nhomDichVuId: 1 })])],
    ['nhomDichVuId rỗng', page([item({ nhomDichVuId: '' })])],
    ['nhomDichVuId không phải chữ số', page([item({ nhomDichVuId: '1a' })])],
    ['ten không phải chuỗi', page([item({ ten: 5 })])],
    ['thiếu total', { items: [], page: 1, pageSize: 20 }],
    ['total là chuỗi', page([], { total: '0' })],
    ['total âm', page([], { total: -1 })],
    ['page bằng 0', page([], { page: 0 })],
    ['pageSize bằng 0', page([], { pageSize: 0 })],
    ['pageSize lẻ', page([], { pageSize: 20.5 })],
  ])('PR3-W01 từ chối: %s', (_label, body) => {
    expect(() => readServiceGroupPage(body)).toThrow(UnexpectedResponseError);
  });

  it('PR3-W01 MỘT dòng cuối sai trong 20 dòng thì cả danh sách bị từ chối (không vẽ dở)', () => {
    const rows: unknown[] = Array.from({ length: 19 }, (_x, index) =>
      item({ nhomDichVuId: String(index + 1), ten: `Nhóm ${index + 1}` }),
    );
    rows.push(item({ nhomDichVuId: '20', soDichVu: 'hai' }));

    expect(() => readServiceGroupPage(page(rows))).toThrow(
      UnexpectedResponseError,
    );
    expect(readServiceGroupPage(page(rows.slice(0, 19))).items).toHaveLength(
      19,
    );
  });
});
