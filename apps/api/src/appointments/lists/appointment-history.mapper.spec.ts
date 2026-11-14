import type {
  HistoryAuditRow,
  HistoryMilestones,
} from './appointment-history.mapper.js';
import { buildStatusHistory } from './appointment-history.mapper.js';

// Task B4 — panel "Lịch sử trạng thái" của Quản trị viên: hàm THUẦN dựng, khử trùng, sắp xếp mục và đọc `changes` an toàn (PLAN booking Q28, L26; TRACKING 3.33 B4-E, 3.33.3). Mã LSD-nn là PLAN 7.39 `[đề xuất]`.
// Nhật ký thật trên MySQL: appointment-history.reader.int-spec.ts. Dữ liệu giả (tên, SĐT, mã tài khoản minh hoạ).
const CREATED_AT = '2026-11-01T01:00:00.000Z';
const at = (iso: string) => new Date(iso);

const milestones = (
  overrides: Partial<HistoryMilestones> = {},
): HistoryMilestones => ({
  thoiDiemTao: at(CREATED_AT),
  thoiDiemHuy: null,
  lyDoHuy: null,
  ...overrides,
});

const auditRow = (
  id: string,
  when: string,
  from: string,
  to: string,
  lyDo = 'Bệnh nhân gọi điện xin đổi',
): HistoryAuditRow => ({
  id,
  thoiDiem: at(when),
  changes: {
    truoc: { trang_thai: from },
    sau: { trang_thai: to },
    ly_do: lyDo,
  },
});

const TAO = { thoiDiem: CREATED_AT, loai: 'TaoLich' };

describe('LSD-01, LSD-02 mốc của chính lịch hẹn', () => {
  it('LSD-01 lịch chưa huỷ, chưa override ⇒ ĐÚNG một mục TaoLich (hai khoá, không nói trạng thái đầu)', () => {
    expect(buildStatusHistory(milestones(), [])).toStrictEqual([TAO]);
  });

  it('LSD-02 lịch huỷ không qua override ⇒ TaoLich rồi HuyLich: `denTrangThai` là DaHuy và `lyDo` là `ly_do_huy`', () => {
    const history = buildStatusHistory(
      milestones({
        thoiDiemHuy: at('2026-11-02T03:00:00.000Z'),
        lyDoHuy: 'Bệnh nhân hủy lịch hẹn',
      }),
      [],
    );
    expect(history).toStrictEqual([
      TAO,
      {
        thoiDiem: '2026-11-02T03:00:00.000Z',
        loai: 'HuyLich',
        denTrangThai: 'DaHuy',
        lyDo: 'Bệnh nhân hủy lịch hẹn',
      },
    ]);
  });

  it('LSD-02 lịch huỷ không có `ly_do_huy` ⇒ HuyLich vẫn có khoá `lyDo` và bằng `null` (không bỏ khoá)', () => {
    const history = buildStatusHistory(
      milestones({ thoiDiemHuy: at('2026-11-02T03:00:00.000Z') }),
      [],
    );
    expect(history[1]).toStrictEqual({
      thoiDiem: '2026-11-02T03:00:00.000Z',
      loai: 'HuyLich',
      denTrangThai: 'DaHuy',
      lyDo: null,
    });
  });
});

describe('LSD-03, LSD-04 thứ tự và khử trùng', () => {
  it('LSD-03 nhiều lần override cộng huỷ không qua override: TaoLich đầu, mục theo thời điểm tăng; SQL trả mới nhất trước nhưng kết quả cũ nhất trước', () => {
    // Đúng như SQL trả về (thoi_diem DESC): lần cuối trước
    const rows = [
      auditRow('30', '2026-11-05T01:00:00.000Z', 'VangMat', 'DaXacNhan'),
      auditRow('20', '2026-11-03T01:00:00.000Z', 'DaXacNhan', 'VangMat'),
    ];
    const history = buildStatusHistory(
      milestones({
        thoiDiemHuy: at('2026-11-06T01:00:00.000Z'),
        lyDoHuy: 'Bệnh nhân hủy',
      }),
      rows,
    );
    expect(history.map((entry) => entry.loai)).toStrictEqual([
      'TaoLich',
      'OverrideLichHen',
      'OverrideLichHen',
      'HuyLich',
    ]);
    expect(history.map((entry) => entry.thoiDiem)).toStrictEqual([
      CREATED_AT,
      '2026-11-03T01:00:00.000Z',
      '2026-11-05T01:00:00.000Z',
      '2026-11-06T01:00:00.000Z',
    ]);
    expect(history[1]).toMatchObject({
      tuTrangThai: 'DaXacNhan',
      denTrangThai: 'VangMat',
    });
  });

  it('LSD-03 cùng một giây: so id nhật ký như SỐ (9 trước 10, không phải "10" trước "9") và mục nhật ký đứng TRƯỚC HuyLich', () => {
    const same = '2026-11-03T01:00:00.000Z';
    const history = buildStatusHistory(
      milestones({ thoiDiemHuy: at(same), lyDoHuy: 'Hủy' }),
      [
        auditRow('10', same, 'VangMat', 'DaTiepDon', 'hai'),
        auditRow('9', same, 'DaXacNhan', 'VangMat', 'một'),
      ],
    );
    expect(
      history.map((entry) => ('lyDo' in entry ? entry.lyDo : '')),
    ).toStrictEqual(['', 'một', 'hai', 'Hủy']);
  });

  it('LSD-03 id vượt 2^53 vẫn so đúng (BigInt, không mất chữ số)', () => {
    const same = '2026-11-03T01:00:00.000Z';
    const history = buildStatusHistory(milestones(), [
      auditRow('9007199254740993', same, 'DaXacNhan', 'VangMat', 'sau'),
      auditRow('9007199254740992', same, 'VangMat', 'DaXacNhan', 'trước'),
    ]);
    expect(
      history.slice(1).map((entry) => ('lyDo' in entry ? entry.lyDo : '')),
    ).toStrictEqual(['trước', 'sau']);
  });

  it('LSD-03 TaoLich luôn đứng đầu kể cả khi một mục nhật ký có thời điểm sớm hơn (đồng hồ DB và ứng dụng lệch)', () => {
    const history = buildStatusHistory(milestones(), [
      auditRow('1', '2026-10-31T23:59:59.000Z', 'DaXacNhan', 'VangMat'),
    ]);
    expect(history[0]).toStrictEqual(TAO);
    expect(history).toHaveLength(2);
  });

  it('LSD-04 huỷ qua override ⇒ CHỈ MỘT mục cho lần huỷ (mục override mang tuTrangThai và lyDo), không thêm HuyLich trùng dù `thoi_diem_huy` có', () => {
    const history = buildStatusHistory(
      milestones({
        thoiDiemHuy: at('2026-11-03T01:00:01.000Z'),
        lyDoHuy: 'Quản trị viên huỷ vì trùng lịch',
      }),
      [
        auditRow(
          '7',
          '2026-11-03T01:00:00.000Z',
          'DaXacNhan',
          'DaHuy',
          'Quản trị viên huỷ vì trùng lịch',
        ),
      ],
    );
    expect(history).toStrictEqual([
      TAO,
      {
        thoiDiem: '2026-11-03T01:00:00.000Z',
        loai: 'OverrideLichHen',
        tuTrangThai: 'DaXacNhan',
        denTrangThai: 'DaHuy',
        lyDo: 'Quản trị viên huỷ vì trùng lịch',
      },
    ]);
  });

  it('LSD-04 override KHÔNG sang DaHuy (ví dụ DaXacNhan sang VangMat) thì HuyLich của lần huỷ khác vẫn còn', () => {
    const history = buildStatusHistory(
      milestones({
        thoiDiemHuy: at('2026-11-04T01:00:00.000Z'),
        lyDoHuy: 'Bệnh nhân hủy',
      }),
      [auditRow('7', '2026-11-03T01:00:00.000Z', 'DaXacNhan', 'VangMat')],
    );
    expect(history.map((entry) => entry.loai)).toStrictEqual([
      'TaoLich',
      'OverrideLichHen',
      'HuyLich',
    ]);
  });
});

describe('LSD-06 `changes` sai hình dạng: bỏ mục, không làm hỏng cả panel', () => {
  const VALID = auditRow(
    '9',
    '2026-11-03T01:00:00.000Z',
    'DaXacNhan',
    'VangMat',
  );
  const broken = (changes: unknown): HistoryAuditRow => ({
    id: '5',
    thoiDiem: at('2026-11-02T01:00:00.000Z'),
    changes,
  });

  it.each([
    ['NULL', null],
    ['chuỗi', 'không phải đối tượng'],
    ['số', 123],
    ['mảng', []],
    ['đối tượng rỗng', {}],
    [
      'thiếu ly_do',
      { truoc: { trang_thai: 'DaXacNhan' }, sau: { trang_thai: 'VangMat' } },
    ],
    ['thiếu truoc', { sau: { trang_thai: 'VangMat' }, ly_do: 'lý do' }],
    ['thiếu sau', { truoc: { trang_thai: 'DaXacNhan' }, ly_do: 'lý do' }],
    [
      'truoc là chuỗi',
      { truoc: 'DaXacNhan', sau: { trang_thai: 'VangMat' }, ly_do: 'lý do' },
    ],
    [
      'truoc là mảng',
      { truoc: ['DaXacNhan'], sau: { trang_thai: 'VangMat' }, ly_do: 'lý do' },
    ],
    [
      'trạng thái ngoài enum',
      {
        truoc: { trang_thai: 'KhongCo' },
        sau: { trang_thai: 'VangMat' },
        ly_do: 'lý do',
      },
    ],
    [
      'sau thiếu trang_thai',
      { truoc: { trang_thai: 'DaXacNhan' }, sau: {}, ly_do: 'lý do' },
    ],
    [
      'ly_do là số',
      {
        truoc: { trang_thai: 'DaXacNhan' },
        sau: { trang_thai: 'VangMat' },
        ly_do: 5,
      },
    ],
    [
      'ly_do là NULL',
      {
        truoc: { trang_thai: 'DaXacNhan' },
        sau: { trang_thai: 'VangMat' },
        ly_do: null,
      },
    ],
  ])('LSD-06 %s ⇒ bỏ mục đó, mục hợp lệ cạnh nó vẫn đủ', (_name, changes) => {
    const history = buildStatusHistory(milestones(), [VALID, broken(changes)]);
    expect(history).toHaveLength(2);
    expect(history[0]).toStrictEqual(TAO);
    expect(history[1]).toMatchObject({
      loai: 'OverrideLichHen',
      lyDo: 'Bệnh nhân gọi điện xin đổi',
    });
  });

  it('LSD-06 một lịch toàn mục hỏng ⇒ vẫn còn TaoLich (panel không rỗng, không ném lỗi)', () => {
    expect(
      buildStatusHistory(milestones(), [broken(null), broken('x')]),
    ).toStrictEqual([TAO]);
  });
});

describe('LSD-07, LSD-09 nội dung và quyền riêng tư', () => {
  it('LSD-07 `lyDo` có ký tự đặc biệt (nháy, gạch chéo ngược, thẻ HTML, tiếng Việt, emoji, xuống dòng, %, _, !) giữ nguyên từng ký tự và không lọt sang khoá khác', () => {
    const special =
      'Nói "đã gọi" \\ <script>alert(1)</script> Đặng Văn Cường 😀\nDòng hai 100% a_b !';
    const [, entry] = buildStatusHistory(milestones(), [
      auditRow(
        '1',
        '2026-11-03T01:00:00.000Z',
        'DaXacNhan',
        'VangMat',
        special,
      ),
    ]);
    expect(entry).toMatchObject({ lyDo: special });
    const others = Object.entries(entry ?? {})
      .filter(([key]) => key !== 'lyDo')
      .map(([, value]) => String(value));
    expect(others.some((value) => value.includes('script'))).toBe(false);
    expect(others.some((value) => value.includes('Đặng'))).toBe(false);
  });

  it('LSD-09 mỗi loại mục đúng khoá đã nêu; khoá thừa của dòng nhật ký (người thực hiện, chi nhánh, tên, SĐT) không bao giờ ra ngoài', () => {
    const noisy = {
      id: '1',
      thoiDiem: at('2026-11-03T01:00:00.000Z'),
      taiKhoanId: '77',
      chiNhanhId: '5',
      hoTen: 'Trần Thị Nhân Sự',
      changes: {
        truoc: { trang_thai: 'DaXacNhan', ho_ten: 'Nguyễn Văn An' },
        sau: { trang_thai: 'VangMat', so_dien_thoai: '0911111111' },
        ly_do: 'lý do',
        nguoi_thuc_hien: 'Trần Thị Nhân Sự',
      },
    } as unknown as HistoryAuditRow;
    const history = buildStatusHistory(
      milestones({
        thoiDiemHuy: at('2026-11-04T01:00:00.000Z'),
        lyDoHuy: 'hủy',
      }),
      [noisy],
    );
    expect(history.map((entry) => Object.keys(entry).sort())).toStrictEqual([
      ['loai', 'thoiDiem'],
      ['denTrangThai', 'loai', 'lyDo', 'thoiDiem', 'tuTrangThai'],
      ['denTrangThai', 'loai', 'lyDo', 'thoiDiem'],
    ]);
    const json = JSON.stringify(history);
    for (const secret of [
      '77',
      'Nhân Sự',
      'Nguyễn Văn An',
      '0911111111',
      'nguoi_thuc_hien',
    ])
      expect(json).not.toContain(secret);
  });
});
