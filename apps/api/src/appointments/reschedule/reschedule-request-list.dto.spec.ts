import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  AdminRescheduleRequestsQueryDto,
  ReceptionRescheduleRequestsQueryDto,
  RESCHEDULE_REQUEST_CODE_FIELD_ERROR,
} from './reschedule-request-list.dto.js';

// reschedule B8 — XDL-31 (query chặt) và XDL-35 phần đơn vị (`q` là mã lịch hẹn đầy đủ, chuẩn hoá chữ hoa), qua ĐÚNG cấu hình ValidationPipe của configureApp (không DB). Mã lỗi `loi[].ma` của các
// decorator dùng chung (`StateListParam`, `IdFilterParam`) đã có test riêng ở list-query.decorators.spec.ts; ở đây chỉ kiểm NỐI DÂY và hai điểm riêng của B8 (`q`, Lễ tân không có `chiNhanhId`).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

type Metatype =
  | typeof ReceptionRescheduleRequestsQueryDto
  | typeof AdminRescheduleRequestsQueryDto;

const parseAs = <T extends Metatype>(metatype: T, query: unknown) =>
  pipe.transform(query, { type: 'query', metatype }) as Promise<
    InstanceType<T>
  >;
const parseReception = (query: unknown) =>
  parseAs(ReceptionRescheduleRequestsQueryDto, query);
const parseAdmin = (query: unknown) =>
  parseAs(AdminRescheduleRequestsQueryDto, query);

async function errorsOf(parse: Promise<unknown>) {
  try {
    await parse;
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    return (error.getResponse() as { loi: { truong: string; ma: string }[] })
      .loi;
  }
  throw new Error('query lẽ ra phải bị từ chối');
}

const CODE = 'CLX-20261110-ABCDE';

describe('XDL-31 phân trang và mặc định', () => {
  it('mặc định page 1, pageSize 20, offset 0; mọi bộ lọc để trống; pageSize 100 là tối đa', async () => {
    const empty = await parseReception({});
    expect(empty).toMatchObject({ page: 1, pageSize: 20, offset: 0 });
    expect(empty.trangThai).toBeUndefined();
    expect(empty.bacSiId).toBeUndefined();
    expect(empty.q).toBeUndefined();
    expect(await parseAdmin({ page: '3', pageSize: '100' })).toMatchObject({
      page: 3,
      pageSize: 100,
      offset: 200,
    });
  });

  it.each([
    ['page 0', { page: '0' }],
    ['page âm', { page: '-1' }],
    ['page chữ', { page: 'abc' }],
    ['page thập phân', { page: '1.5' }],
    ['pageSize 0', { pageSize: '0' }],
    ['pageSize 101', { pageSize: '101' }],
  ])('ca âm: %s ⇒ 400', async (_name, query) => {
    expect((await errorsOf(parseReception(query))).length).toBeGreaterThan(0);
  });
});

describe('XDL-31 trangThai', () => {
  it.each([
    ['DaDuyet', ['DaDuyet']],
    ['DaDuyet,TuChoi', ['DaDuyet', 'TuChoi']], // tab "Đã xử lý" (Q11)
    [
      ['DaDuyet', 'TuChoi'],
      ['DaDuyet', 'TuChoi'],
    ], // lặp khoá
    ['ChoDuyet,ChoDuyet', ['ChoDuyet']], // bỏ trùng
  ])('%j ⇒ %j', async (trangThai, expected) => {
    expect((await parseReception({ trangThai })).trangThai).toStrictEqual(
      expected,
    );
  });

  it.each([
    ['giá trị ngoài tập', 'DaHuy'],
    ['trạng thái của LỊCH hẹn', 'DaXacNhan'],
    ['thừa khoảng trắng', ' DaDuyet'],
    ['khác chữ hoa thường', 'daduyet'],
    ['dấu phẩy thừa', 'ChoDuyet,'],
    ['rỗng', ''],
  ])('ca âm: %s ⇒ 400 ở trường trangThai', async (_name, trangThai) => {
    const errors = await errorsOf(parseReception({ trangThai }));
    expect(errors.map((error) => error.truong)).toContain('trangThai');
  });
});

describe('XDL-31 bacSiId và chiNhanhId', () => {
  it.each(['5', '9007199254740993', '9223372036854775807'])(
    'id hợp lệ %s đi nguyên chuỗi',
    async (id) => {
      expect((await parseAdmin({ bacSiId: id, chiNhanhId: id })).bacSiId).toBe(
        id,
      );
      expect((await parseAdmin({ chiNhanhId: id })).chiNhanhId).toBe(id);
    },
  );

  it.each(['0', '01', '-1', '1.5', 'abc', '1e3', '9223372036854775808', ' 5'])(
    'ca âm: %j ⇒ 400 ở bacSiId và ở chiNhanhId',
    async (id) => {
      expect(
        (await errorsOf(parseAdmin({ bacSiId: id }))).map((e) => e.truong),
      ).toContain('bacSiId');
      expect(
        (await errorsOf(parseAdmin({ chiNhanhId: id }))).map((e) => e.truong),
      ).toContain('chiNhanhId');
    },
  );

  it('Lễ tân KHÔNG có chiNhanhId: gửi (dù đúng dạng) là khoá lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP; Quản trị viên được nhận', async () => {
    expect(await errorsOf(parseReception({ chiNhanhId: '3' }))).toStrictEqual([
      { truong: 'chiNhanhId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    expect((await parseAdmin({ chiNhanhId: '3' })).chiNhanhId).toBe('3');
  });
});

describe('XDL-35 q là mã lịch hẹn ĐẦY ĐỦ', () => {
  it.each([
    [CODE, CODE],
    ['clx-20261110-abcde', CODE], // chữ thường ASCII ⇒ chữ hoa
    ['  CLX-20261110-ABCDE  ', CODE], // cắt khoảng trắng hai đầu
    ['\tclx-20261110-7k3qd\n', 'CLX-20261110-7K3QD'],
  ])('%j ⇒ %j', async (raw, expected) => {
    expect((await parseReception({ q: raw })).q).toBe(expected);
    expect((await parseAdmin({ q: raw })).q).toBe(expected);
  });

  it.each([
    ['một phần của mã', 'CLX-20261110'],
    ['chỉ đuôi', 'ABCDE'],
    ['rỗng', ''],
    ['toàn khoảng trắng', '   '],
    ['ký tự I (không thuộc Crockford)', 'CLX-20261110-ABCDI'],
    ['dài hơn mẫu', 'CLX-20261110-ABCDEF'],
    ['ngày thiếu số', 'CLX-2026111-ABCDE'],
    ['chữ s dài U+017F (toUpperCase đổi thành S)', 'CLX-20261110-ſBCDE'],
    ['chữ i không chấm U+0131', 'CLX-20261110-ıBCDE'],
    ['cố ý chèn SQL', "CLX-20261110-AB'; DROP TABLE x"],
    ['quá dài', 'A'.repeat(1000)],
    ['ký tự % của LIKE', 'CLX-20261110-AB%DE'],
  ])('ca âm: %s ⇒ 400 {q, MA_LICH_HEN_KHONG_HOP_LE}', async (_name, q) => {
    expect(await errorsOf(parseReception({ q }))).toStrictEqual([
      { truong: 'q', ma: RESCHEDULE_REQUEST_CODE_FIELD_ERROR },
    ]);
  });

  it('q lặp khoá (mảng) ⇒ 400 cùng mã', async () => {
    expect(await errorsOf(parseReception({ q: [CODE, CODE] }))).toStrictEqual([
      { truong: 'q', ma: RESCHEDULE_REQUEST_CODE_FIELD_ERROR },
    ]);
  });

  it('thân lỗi KHÔNG lặp lại giá trị người dùng nhập (BDL-10)', async () => {
    const typed = 'CLX-20261110-ABCDI-GIA-TRI-NHAY-CAM';
    const errors = await errorsOf(parseReception({ q: typed }));
    expect(JSON.stringify(errors)).not.toContain('NHAY-CAM');
    expect(JSON.stringify(errors)).not.toContain(typed);
  });

  it('mã của lỗi là hằng ổn định để web chọn câu theo mã', () => {
    expect(RESCHEDULE_REQUEST_CODE_FIELD_ERROR).toBe(
      'MA_LICH_HEN_KHONG_HOP_LE',
    );
  });
});

describe('XDL-31 khoá lạ', () => {
  it.each([
    'benhNhanId',
    'lichHenId',
    'yeuCauId',
    'chuyenKhoaId',
    'tuNgay',
    'soDienThoai',
    'sort',
    'nguoiXuLyId',
  ])('%s ⇒ 400 TRUONG_KHONG_DUOC_PHEP (không âm thầm bỏ qua)', async (key) => {
    expect(await errorsOf(parseAdmin({ [key]: '1' }))).toStrictEqual([
      { truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });
});
