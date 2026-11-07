import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  SAMPLE_RELATIVES,
  json,
  type FakeRelative,
} from '../testing/fake-profile-api';
import {
  createRelative,
  getRelatives,
  parseRelative,
  parseRelatives,
  updateRelative,
} from './relatives-service';
import type { RelativePayload } from './relatives-types';

// patient F6 (TRACKING F6-C, F6-H). Mã ca RW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN mục 7.2 mà nó phủ.
const ONE: FakeRelative = SAMPLE_RELATIVES[0];
const PAYLOAD: RelativePayload = {
  hoTen: 'Trần Thị Cúc',
  moiQuanHe: 'Vo',
  gioiTinh: 'Nu',
  ngaySinh: '1992-04-12',
  soDienThoai: null,
};

describe('parseRelative, parseRelatives', () => {
  it('RW-37 NT-20 nhận đủ bảy khoá, bỏ khoá khác (benhNhanId, diaChi)', () => {
    expect(
      parseRelative({ ...ONE, benhNhanId: '9', diaChi: 'không có' }),
    ).toEqual(ONE);
  });

  it('RW-38 NT-20 SĐT null hợp lệ; mã quan hệ và giới tính lạ KHÔNG làm vỡ (vẫn là chuỗi)', () => {
    expect(parseRelative({ ...ONE, soDienThoai: null }).soDienThoai).toBeNull();
    const odd = parseRelative({ ...ONE, moiQuanHe: 'Mẹ', gioiTinh: 'Male' });
    expect(odd.moiQuanHe).toBe('Mẹ');
    expect(odd.gioiTinh).toBe('Male');
  });

  it('RW-39 NT-20 id vượt 2^53 giữ nguyên chuỗi, không làm tròn', () => {
    expect(
      parseRelative({ ...ONE, hoSoNguoiThanId: '9007199254740993' })
        .hoSoNguoiThanId,
    ).toBe('9007199254740993');
  });

  it.each([
    ['null', null],
    ['chuỗi', 'hồ sơ'],
    ['{ ok: true } của fake auth', { ok: true }],
    ['thiếu id', { ...ONE, hoSoNguoiThanId: undefined }],
    ['id là số', { ...ONE, hoSoNguoiThanId: 1 }],
    ['id có chữ', { ...ONE, hoSoNguoiThanId: '1a' }],
    ['id rỗng', { ...ONE, hoSoNguoiThanId: '' }],
    ['id có số 0 đứng đầu', { ...ONE, hoSoNguoiThanId: '01' }],
    ['id là 0', { ...ONE, hoSoNguoiThanId: '0' }],
    ['id có dấu / (đường dẫn)', { ...ONE, hoSoNguoiThanId: '1/../2' }],
    ['thiếu hoTen', { ...ONE, hoTen: undefined }],
    ['hoTen là số', { ...ONE, hoTen: 5 }],
    ['thiếu moiQuanHe', { ...ONE, moiQuanHe: undefined }],
    ['moiQuanHe là null', { ...ONE, moiQuanHe: null }],
    ['thiếu gioiTinh', { ...ONE, gioiTinh: undefined }],
    ['gioiTinh là null', { ...ONE, gioiTinh: null }],
    ['thiếu ngaySinh', { ...ONE, ngaySinh: undefined }],
    ['ngaySinh là null', { ...ONE, ngaySinh: null }],
    ['ngaySinh dd/mm/yyyy', { ...ONE, ngaySinh: '08/03/1960' }],
    ['ngaySinh một chữ số tháng', { ...ONE, ngaySinh: '1960-3-08' }],
    ['thiếu soDienThoai', { ...ONE, soDienThoai: undefined }],
    ['soDienThoai là số', { ...ONE, soDienThoai: 909123456 }],
    ['thiếu trangThaiHieuLuc', { ...ONE, trangThaiHieuLuc: undefined }],
    ['trangThaiHieuLuc là chuỗi', { ...ONE, trangThaiHieuLuc: 'true' }],
    ['trangThaiHieuLuc là số', { ...ONE, trangThaiHieuLuc: 1 }],
  ])(
    'RW-40 NT-20 sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_label, raw) => {
      expect(() => parseRelative(raw)).toThrow(UnexpectedResponseError);
    },
  );

  it('RW-41 NT-20 parseRelatives: { items: [...] } ⇒ mảng; items rỗng hợp lệ', () => {
    expect(parseRelatives({ items: SAMPLE_RELATIVES })).toEqual(
      SAMPLE_RELATIVES,
    );
    expect(parseRelatives({ items: [] })).toEqual([]);
  });

  it.each([
    ['null', null],
    ['mảng ở gốc', []],
    ['thiếu items', {}],
    ['items là null', { items: null }],
    ['items là đối tượng', { items: {} }],
    ['một phần tử sai', { items: [ONE, { ...ONE, trangThaiHieuLuc: 'x' }] }],
  ])(
    'RW-42 NT-20 phản hồi sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_label, raw) => {
      expect(() => parseRelatives(raw)).toThrow(UnexpectedResponseError);
    },
  );
});

describe('gọi API qua lớp client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stub(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => json(status, body));
    vi.stubGlobal('fetch', fetchMock);
    return () => fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  }

  it('RW-43 NT-20 getRelatives: một GET /api/patient/relatives, đã sắp (đang dùng trước, id so bằng chuỗi)', async () => {
    const call = stub(200, {
      items: [
        { ...ONE, hoSoNguoiThanId: '10' },
        { ...ONE, hoSoNguoiThanId: '3', trangThaiHieuLuc: false },
        { ...ONE, hoSoNguoiThanId: '9' },
      ],
    });
    const items = await getRelatives(new AbortController().signal);

    expect(items.map((item) => item.hoSoNguoiThanId)).toEqual(['9', '10', '3']);
    const [url, init] = call();
    expect(url).toBe('/api/patient/relatives');
    expect(init.method).toBe('GET');
  });

  it('RW-44 NT-20 getRelatives không truyền signal vẫn chạy (tải nền); sai hình dạng ⇒ UnexpectedResponseError', async () => {
    stub(200, { ok: true });
    await expect(getRelatives()).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it('RW-45 NT-21 createRelative: POST /api/patient/relatives, thân đúng NĂM khoá, trả hồ sơ đã parse', async () => {
    const call = stub(201, { ...ONE, hoSoNguoiThanId: '7' });
    const created = await createRelative(PAYLOAD);

    expect(created.hoSoNguoiThanId).toBe('7');
    const [url, init] = call();
    expect(url).toBe('/api/patient/relatives');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(PAYLOAD);
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual(
      ['gioiTinh', 'hoTen', 'moiQuanHe', 'ngaySinh', 'soDienThoai'].sort(),
    );
  });

  it('RW-46 NT-21 createRelative: 201 sai hình dạng ⇒ UnexpectedResponseError (không rõ đã ghi chưa)', async () => {
    stub(201, { ok: true });
    await expect(createRelative(PAYLOAD)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it('RW-47 NT-22 updateRelative: PUT với id chuỗi vượt 2^53 đi nguyên vẹn trong đường dẫn', async () => {
    const call = stub(200, { ...ONE, hoSoNguoiThanId: '9007199254740993' });
    const updated = await updateRelative('9007199254740993', PAYLOAD);

    expect(updated.hoSoNguoiThanId).toBe('9007199254740993');
    const [url, init] = call();
    expect(url).toBe('/api/patient/relatives/9007199254740993');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(PAYLOAD);
  });

  it('RW-48 NT-22 updateRelative: 200 sai hình dạng ⇒ UnexpectedResponseError', async () => {
    stub(200, { items: [] });
    await expect(updateRelative('1', PAYLOAD)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
