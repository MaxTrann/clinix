import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  doctor,
  emptySuggestion,
  suggestion,
} from '../testing/suggestion-fixtures';
import { parseSpecialties, parseSuggestion } from './parse-suggestion';

// Chatbot F2, kiểm hình dạng thân 200 của `GET /chatbot/suggestions` và `GET /public/specialties` (hợp đồng chatbot B4). Ca F2-nn là ca bổ sung ngoài PLAN.
const clone = <T>(value: T): T => structuredClone(value);

describe('parseSuggestion', () => {
  it('F2-01 thân đúng hợp đồng B4 được nhận nguyên vẹn', () => {
    const raw = suggestion();
    expect(parseSuggestion(clone(raw))).toEqual(raw);
  });

  it('F2-01 DANH SÁCH TRẮNG: trường lạ (học vị, điểm xếp hạng, kinh nghiệm, email, SĐT) bị bỏ ở mọi cấp, không lọt vào kết quả', () => {
    const raw = clone(suggestion()) as unknown as Record<string, unknown>;
    raw.diemXepHang = 8400;
    (raw.chuyenKhoa as Record<string, unknown>).soBacSi = 4;
    const first = (raw.bacSi as Record<string, unknown>[])[0]!;
    Object.assign(first, {
      hocVi: 'TS',
      diemXepHang: 8400,
      soNamKinhNghiem: 10,
      email: 'bacsi@example.test',
      soDienThoai: '0900000000',
    });
    (first.chiNhanh as Record<string, unknown>).toaDo = [1, 2];
    (first.danhGia as Record<string, unknown>).phanBo = [1, 2, 3];
    (
      (first.khungGio as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
    ).trangThai = 'ConTrong';

    const parsed = parseSuggestion(raw);

    expect(Object.keys(parsed).sort()).toEqual(['bacSi', 'chuyenKhoa', 'ngay']);
    expect(Object.keys(parsed.chuyenKhoa).sort()).toEqual([
      'chuyenKhoaId',
      'ten',
    ]);
    expect(Object.keys(parsed.bacSi[0]!).sort()).toEqual([
      'bacSiId',
      'chiNhanh',
      'chucDanh',
      'danhGia',
      'giaKham',
      'hoTen',
      'khungGio',
    ]);
    expect(Object.keys(parsed.bacSi[0]!.chiNhanh).sort()).toEqual([
      'chiNhanhId',
      'diaChi',
      'ten',
    ]);
    expect(Object.keys(parsed.bacSi[0]!.danhGia).sort()).toEqual([
      'diemTrungBinh',
      'soDanhGia',
    ]);
    expect(Object.keys(parsed.bacSi[0]!.khungGio[0]!).sort()).toEqual([
      'batDau',
      'ca',
      'khungGioId',
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(
      /TS"|8400|example\.test|0900000000/,
    );
  });

  it('F2-01 mã chức danh lạ vẫn được giữ nguyên (khung không vỡ khi API thêm chức danh)', () => {
    const raw = suggestion({ bacSi: [doctor({ chucDanh: 'CHUC_DANH_MOI' })] });
    expect(parseSuggestion(clone(raw)).bacSi[0]!.chucDanh).toBe(
      'CHUC_DANH_MOI',
    );
  });

  it('F2-02 ngày là null khi không ai còn giờ trống; bacSi rỗng kèm đúng lý do', () => {
    for (const reason of ['KhongCoKhungGio', 'KhongCoBacSi'] as const) {
      const parsed = parseSuggestion(clone(emptySuggestion(reason)));
      expect(parsed.ngay).toBeNull();
      expect(parsed.bacSi).toEqual([]);
      expect(parsed.lyDoRong).toBe(reason);
    }
  });

  it('F2-02 bacSi rỗng mà thiếu lý do hay lý do lạ thì coi là chưa có khung giờ trống (A5), không vỡ', () => {
    const missing = clone(emptySuggestion()) as unknown as Record<
      string,
      unknown
    >;
    delete missing.lyDoRong;
    expect(parseSuggestion(missing).lyDoRong).toBe('KhongCoKhungGio');
    const unknown = { ...clone(emptySuggestion()), lyDoRong: 'LyDoMoi' };
    expect(parseSuggestion(unknown).lyDoRong).toBe('KhongCoKhungGio');
  });

  it('F2-02 có bác sĩ thì không mang lý do rỗng dù máy chủ gửi thừa', () => {
    const raw = { ...clone(suggestion()), lyDoRong: 'KhongCoBacSi' };
    expect(parseSuggestion(raw).lyDoRong).toBeUndefined();
  });

  it('F2-02 điểm trung bình null và 0 lượt đánh giá được nhận (bác sĩ chưa có đánh giá)', () => {
    const raw = suggestion({
      bacSi: [doctor({ danhGia: { diemTrungBinh: null, soDanhGia: 0 } })],
    });
    expect(parseSuggestion(clone(raw)).bacSi[0]!.danhGia).toEqual({
      diemTrungBinh: null,
      soDanhGia: 0,
    });
  });

  describe('F2-03 sai hình dạng là phản hồi không dùng được (ném UnexpectedResponseError)', () => {
    // Sửa MỘT chỗ của thân đúng (theo đường dẫn khoá); REMOVE là xoá trường
    const REMOVE = Symbol('xoá trường');
    function edit(path: Array<string | number>, value: unknown): unknown {
      const raw: unknown = clone(suggestion());
      let node = raw as Record<string | number, unknown>;
      for (const key of path.slice(0, -1)) {
        node = node[key] as Record<string | number, unknown>;
      }
      const last = path[path.length - 1]!;
      if (value === REMOVE) delete node[last];
      else node[last] = value;
      return raw;
    }
    const cases: Array<[string, unknown]> = [
      ['null', null],
      ['chuỗi', 'khong phai doi tuong'],
      ['mảng', []],
      ['thiếu chuyenKhoa', edit(['chuyenKhoa'], REMOVE)],
      [
        'chuyenKhoaId không phải chuỗi',
        edit(['chuyenKhoa', 'chuyenKhoaId'], 3),
      ],
      [
        'chuyenKhoaId không phải số nguyên dương',
        edit(['chuyenKhoa', 'chuyenKhoaId'], '0'),
      ],
      ['thiếu ngay', edit(['ngay'], REMOVE)],
      ['ngày sai dạng', edit(['ngay'], '28/11/2026')],
      ['ngày là số', edit(['ngay'], 20261128)],
      ['có bác sĩ mà ngày null', edit(['ngay'], null)],
      ['bacSi không phải mảng', edit(['bacSi'], {})],
      ['bacSiId là số', edit(['bacSi', 0, 'bacSiId'], 11)],
      ['thiếu hoTen', edit(['bacSi', 0, 'hoTen'], REMOVE)],
      ['thiếu chucDanh', edit(['bacSi', 0, 'chucDanh'], REMOVE)],
      ['giaKham là số', edit(['bacSi', 0, 'giaKham'], 350000)],
      ['giaKham sai dạng tiền', edit(['bacSi', 0, 'giaKham'], '350.000đ')],
      ['thiếu chiNhanh', edit(['bacSi', 0, 'chiNhanh'], REMOVE)],
      ['chiNhanhId rỗng', edit(['bacSi', 0, 'chiNhanh', 'chiNhanhId'], '')],
      ['thiếu danhGia', edit(['bacSi', 0, 'danhGia'], REMOVE)],
      [
        'điểm trung bình là số',
        edit(['bacSi', 0, 'danhGia', 'diemTrungBinh'], 4.5),
      ],
      [
        'điểm trung bình không phải số',
        edit(['bacSi', 0, 'danhGia', 'diemTrungBinh'], 'tốt'),
      ],
      ['soDanhGia âm', edit(['bacSi', 0, 'danhGia', 'soDanhGia'], -1)],
      ['soDanhGia thập phân', edit(['bacSi', 0, 'danhGia', 'soDanhGia'], 1.5)],
      ['khungGio không phải mảng', edit(['bacSi', 0, 'khungGio'], null)],
      [
        'khungGioId là số',
        edit(['bacSi', 0, 'khungGio', 0, 'khungGioId'], 101),
      ],
      [
        'batDau không phải ngày',
        edit(['bacSi', 0, 'khungGio', 0, 'batDau'], 'sáng mai'),
      ],
      ['ca lạ', edit(['bacSi', 0, 'khungGio', 0, 'ca'], 'CaDem')],
    ];
    it.each(cases)('%s', (_name, raw) => {
      expect(() => parseSuggestion(raw)).toThrow(UnexpectedResponseError);
    });
  });
});

describe('parseSpecialties', () => {
  it('F2-04 chỉ giữ id và tên, bỏ mọi trường khác', () => {
    const parsed = parseSpecialties({
      items: [
        {
          chuyenKhoaId: '1',
          ten: 'Tim mạch',
          moTa: 'mô tả dài',
          anhDaiDien: '/a.png',
          soBacSi: 4,
        },
        { chuyenKhoaId: '3', ten: 'Nội tổng quát', moTa: null },
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    expect(parsed).toEqual([
      { chuyenKhoaId: '1', ten: 'Tim mạch' },
      { chuyenKhoaId: '3', ten: 'Nội tổng quát' },
    ]);
  });

  it('F2-04 phần tử sai hình dạng bị bỏ (id không phải số, tên rỗng hay thiếu), phần còn lại giữ nguyên thứ tự', () => {
    const parsed = parseSpecialties({
      items: [
        { chuyenKhoaId: '1', ten: 'Tim mạch' },
        { chuyenKhoaId: 2, ten: 'Id là số' },
        { chuyenKhoaId: 'abc', ten: 'Id sai dạng' },
        { chuyenKhoaId: '4', ten: '   ' },
        { chuyenKhoaId: '5' },
        null,
        'chuỗi',
        { chuyenKhoaId: '6', ten: 'Da liễu' },
      ],
    });
    expect(parsed).toEqual([
      { chuyenKhoaId: '1', ten: 'Tim mạch' },
      { chuyenKhoaId: '6', ten: 'Da liễu' },
    ]);
  });

  it('F2-04 danh sách rỗng là hợp lệ; thân không có `items` là phản hồi không dùng được', () => {
    expect(parseSpecialties({ items: [] })).toEqual([]);
    for (const bad of [null, [], 'x', {}, { items: 'x' }, { items: null }]) {
      expect(() => parseSpecialties(bad)).toThrow(UnexpectedResponseError);
    }
  });
});
