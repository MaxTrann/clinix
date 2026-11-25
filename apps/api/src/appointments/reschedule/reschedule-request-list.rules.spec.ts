import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import {
  rescheduleSource,
  reschedulabilityFacts,
} from '../testing/reschedulability-facts.js';
import { evaluateRescheduleAvailability } from './reschedulability.rules.js';
import {
  approvalOf,
  approverActor,
  CONFIG_MISSING_CODE,
  listOrderOf,
  parseRescheduleRequestId,
  REQUEST_HANDLED_CODE,
  statesOf,
} from './reschedule-request-list.rules.js';

// reschedule B8 — hàm THUẦN của danh sách và chi tiết yêu cầu (không DB): XDL-40 (id BIGINT), XDL-37 phần đơn vị (`coTheDuyet` từng nguyên nhân qua LUẬT THẬT của B2, không mock), HDL-32 (`approverActor`,
// `parseRescheduleRequestId` cho B9), XDL-03 (chiều sắp xếp và tập trạng thái mặc định). Chạy thật trên MySQL: reschedule-request-list.int-spec.ts.
describe('XDL-40 parseRescheduleRequestId', () => {
  it.each([
    '1',
    '42',
    '9007199254740993', // lớn hơn 2^53: ép Number sẽ trỏ nhầm 9007199254740992
    '9223372036854775807', // BIGINT lớn nhất
  ])('%s ⇒ giữ NGUYÊN chuỗi', (id) => {
    expect(parseRescheduleRequestId(id)).toBe(id);
  });

  it.each([
    '',
    '0',
    '01',
    '-1',
    '+1',
    '1.5',
    '1e3',
    ' 1',
    '1 ',
    '１２', // chữ số toàn góc
    'abc',
    'CLX-20261110-ABCDE',
    '9223372036854775808', // vượt BIGINT lớn nhất
    '12345678901234567890', // 20 chữ số
    '1; DROP TABLE x',
  ])('ca âm: %j ⇒ null (cùng 404 với "không có")', (raw) => {
    expect(parseRescheduleRequestId(raw)).toBeNull();
  });

  it.each([[123], [null], [undefined], [['1']], [{ id: '1' }]])(
    'ca âm: không phải chuỗi %j ⇒ null',
    (raw) => {
      expect(parseRescheduleRequestId(raw)).toBeNull();
    },
  );
});

describe('XDL-03 statesOf và listOrderOf', () => {
  it('không có hoặc rỗng ⇒ mặc định ChoDuyet', () => {
    expect(statesOf(undefined)).toStrictEqual(['ChoDuyet']);
    expect(statesOf([])).toStrictEqual(['ChoDuyet']);
  });

  it('theo THỨ TỰ CHUẨN của ENUM, bỏ trùng (câu SQL không phụ thuộc thứ tự khách gửi)', () => {
    expect(statesOf(['TuChoi', 'DaDuyet'])).toStrictEqual([
      'DaDuyet',
      'TuChoi',
    ]);
    expect(statesOf(['DaDuyet', 'DaDuyet'])).toStrictEqual(['DaDuyet']);
    expect(statesOf(['TuChoi', 'DaDuyet', 'ChoDuyet'])).toStrictEqual([
      'ChoDuyet',
      'DaDuyet',
      'TuChoi',
    ]);
  });

  it.each([
    [['ChoDuyet'] as const, 'ASC'],
    [['DaDuyet', 'TuChoi'] as const, 'DESC'],
    [['DaDuyet'] as const, 'DESC'],
    [['TuChoi'] as const, 'DESC'],
    [['ChoDuyet', 'DaDuyet'] as const, 'DESC'],
    [['ChoDuyet', 'DaDuyet', 'TuChoi'] as const, 'DESC'],
  ])('tập %j ⇒ %s (tăng CHỈ khi đúng {ChoDuyet})', (states, order) => {
    expect(listOrderOf(states)).toBe(order);
  });
});

describe('HDL-32 approverActor', () => {
  it('Toàn hệ thống ⇒ chiNhanhId null (mọi chi nhánh); Chi nhánh ⇒ chi nhánh được gán, giữ nguyên chuỗi', () => {
    const all: AdminScope = { kind: 'ToanHeThong' };
    expect(approverActor(all)).toStrictEqual({
      via: 'DuyetYeuCau',
      chiNhanhId: null,
    });
    const branch: AdminScope = {
      kind: 'ChiNhanh',
      chiNhanhId: '9007199254740993',
    };
    expect(approverActor(branch)).toStrictEqual({
      via: 'DuyetYeuCau',
      chiNhanhId: '9007199254740993',
    });
  });
});

// Dữ kiện THẬT cho luật `evaluateRescheduleAvailability` với vai `DuyetYeuCau` (Toàn hệ thống): lịch gốc 08:00 thứ Hai 09/11/2026 giờ VN; `check_in_sau_phut` 15
const APPOINTMENT_AT = new Date('2026-11-09T08:00:00+07:00');
const MIN = 60_000;
const approvalFor = (
  input: {
    trangThai?: 'ChoDuyet' | 'DaDuyet' | 'TuChoi';
    configured?: boolean;
    lich?: TrangThaiLichHen;
    nowAt?: Date;
    profileActive?: boolean;
    chainLength?: number;
    source?: 'none';
  } = {},
) => {
  const facts = reschedulabilityFacts({
    actor: { via: 'DuyetYeuCau', chiNhanhId: null },
    now: input.nowAt ?? new Date(APPOINTMENT_AT.getTime() - 60 * MIN),
    source:
      input.source === 'none'
        ? null
        : rescheduleSource({ trangThai: input.lich ?? 'DaXacNhan' }),
    profileActive: input.profileActive ?? true,
    chainLength: input.chainLength ?? 1,
  });
  return approvalOf({
    trangThai: input.trangThai ?? 'ChoDuyet',
    configured: input.configured ?? true,
    availability: evaluateRescheduleAvailability(facts),
  });
};

describe('XDL-37 approvalOf với luật THẬT của B2', () => {
  it('ca dương: lịch gốc còn DaXacNhan, trước hạn ⇒ coTheDuyet true, không có lý do', () => {
    expect(approvalFor()).toStrictEqual({
      coTheDuyet: true,
      lyDoKhongDuyet: null,
    });
  });

  it.each<[TrangThaiLichHen]>([
    ['DaHuy'],
    ['DaTiepDon'],
    ['VangMat'],
    ['DaDoiLich'], // đã đổi hộ
    ['HoanThanh'],
    ['ChoThanhToan'],
  ])('lịch gốc %s ⇒ không duyệt được, LICH_HEN_KHONG_CHO_DOI (R6)', (lich) => {
    expect(approvalFor({ lich })).toStrictEqual({
      coTheDuyet: false,
      lyDoKhongDuyet: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
    });
  });

  it('hạn của nhân sự là thoi_gian + check_in_sau_phut, nửa mở: còn 1 giây thì được, đúng mốc là ĐÃ qua (Q3)', () => {
    const deadline = APPOINTMENT_AT.getTime() + 15 * MIN;
    expect(approvalFor({ nowAt: new Date(deadline - 1000) }).coTheDuyet).toBe(
      true,
    );
    expect(approvalFor({ nowAt: new Date(deadline) })).toStrictEqual({
      coTheDuyet: false,
      lyDoKhongDuyet: BOOKING_ERROR_CODES.RESCHEDULE_TOO_LATE,
    });
    expect(approvalFor({ nowAt: new Date(deadline + 1000) }).coTheDuyet).toBe(
      false,
    );
  });

  it('QUA giờ hẹn nhưng còn trong cửa sổ tiếp đón vẫn duyệt được (khác Bệnh nhân tự đổi)', () => {
    expect(
      approvalFor({ nowAt: new Date(APPOINTMENT_AT.getTime() + 10 * MIN) })
        .coTheDuyet,
    ).toBe(true);
  });

  it('hồ sơ người thân đã ngừng ⇒ HO_SO_NGUOI_THAN_DA_NGUNG', () => {
    expect(approvalFor({ profileActive: false })).toStrictEqual({
      coTheDuyet: false,
      lyDoKhongDuyet: 'HO_SO_NGUOI_THAN_DA_NGUNG',
    });
  });

  it('chuỗi đổi lịch đã dài tới trần ⇒ CHUOI_DOI_LICH_QUA_DAI (duyệt sẽ bị lõi từ chối)', () => {
    expect(approvalFor({ chainLength: 100 })).toStrictEqual({
      coTheDuyet: false,
      lyDoKhongDuyet: BOOKING_ERROR_CODES.RESCHEDULE_CHAIN_TOO_LONG,
    });
  });

  it('DuyetYeuCau KHÔNG bị hạn mức tự đổi: soLanTuDoiLich vượt tối đa vẫn duyệt được', () => {
    const facts = reschedulabilityFacts({
      actor: { via: 'DuyetYeuCau', chiNhanhId: null },
      source: rescheduleSource({ soLanTuDoiLich: 99 }),
      now: new Date(APPOINTMENT_AT.getTime() - 60 * MIN),
    });
    expect(
      approvalOf({
        trangThai: 'ChoDuyet',
        configured: true,
        availability: evaluateRescheduleAvailability(facts),
      }).coTheDuyet,
    ).toBe(true);
  });

  it.each(['DaDuyet', 'TuChoi'] as const)(
    'yêu cầu %s ⇒ YEU_CAU_DA_XU_LY dù lịch gốc đổi được (trạng thái yêu cầu đứng TRƯỚC)',
    (trangThai) => {
      expect(approvalFor({ trangThai })).toStrictEqual({
        coTheDuyet: false,
        lyDoKhongDuyet: REQUEST_HANDLED_CODE,
      });
    },
  );

  it('thiếu cấu hình ⇒ HE_THONG_CHUA_CAU_HINH (sau trạng thái yêu cầu, trước luật)', () => {
    expect(approvalFor({ configured: false })).toStrictEqual({
      coTheDuyet: false,
      lyDoKhongDuyet: CONFIG_MISSING_CODE,
    });
    expect(
      approvalFor({ configured: false, trangThai: 'TuChoi' }).lyDoKhongDuyet,
    ).toBe(REQUEST_HANDLED_CODE);
  });

  it('không đọc được lịch (NotFound của luật, hay chưa đọc) ⇒ KHONG_TIM_THAY, không duyệt được', () => {
    expect(approvalFor({ source: 'none' })).toStrictEqual({
      coTheDuyet: false,
      lyDoKhongDuyet: 'KHONG_TIM_THAY',
    });
    expect(
      approvalOf({
        trangThai: 'ChoDuyet',
        configured: true,
        availability: null,
      }),
    ).toStrictEqual({ coTheDuyet: false, lyDoKhongDuyet: 'KHONG_TIM_THAY' });
  });

  it('hằng mã khớp chữ PLAN 5.13', () => {
    expect(REQUEST_HANDLED_CODE).toBe('YEU_CAU_DA_XU_LY');
    expect(CONFIG_MISSING_CODE).toBe('HE_THONG_CHUA_CAU_HINH');
  });
});
