import {
  HANH_DONG_NHAY_CAM,
  LOAI_DOI_TUONG_NHAT_KY,
} from '../../admin/entities/enums.js';
import {
  generateAppointmentCode,
  randomCodeSuffix,
} from '../../appointments/appointment-code.js';
import type { AuditEntry } from '../audit-entry.js';
import { AuditError } from '../audit-error.js';
import {
  AUDIT_RESCHEDULE_LIMITS,
  validateAuditEntry,
} from '../audit-validation.js';
import {
  proxyRescheduleEntry,
  requestApprovedEntry,
  requestRejectedEntry,
  rescheduleAuditEntries,
} from '../testing/reschedule-audit-entries.js';

// reschedule P2 — NDL-04 (phần luật), NDL-08 (phần đơn vị), NDL-12…NDL-16: danh sách trắng của nhật ký có thêm DoiLichHo và XuLyDoiLichNgoaiChinhSach
// (PLAN reschedule 5.11; Q6, Q9). Hình payload, giới hạn 1–255 và `result` chỉ ThanhCong là `[đề xuất]`, Đại duyệt kế hoạch 25/11/2026 (TRACKING 1.9).

type Json = Record<string, unknown>;
type Build = () => AuditEntry;

const VARIANTS: [string, Build][] = [
  ['DoiLichHo', proxyRescheduleEntry],
  ['XuLyDoiLichNgoaiChinhSach duyệt', requestApprovedEntry],
  ['XuLyDoiLichNgoaiChinhSach từ chối', requestRejectedEntry],
];
// Ba trường văn bản của nhân sự: tên khoá nằm trong `changes`.
const TEXT_FIELDS: [string, Build, string][] = [
  ['DoiLichHo.ly_do', proxyRescheduleEntry, 'ly_do'],
  ['duyệt.ghi_chu', requestApprovedEntry, 'ghi_chu'],
  ['từ chối.ghi_chu', requestRejectedEntry, 'ghi_chu'],
];
const CODE_OLD = 'CLX-20261201-7K3QD';

const invalid = (input: unknown, label?: string) =>
  expect(() => validateAuditEntry(input), label).toThrow('AUDIT_ENTRY_INVALID');
const withChanges = (entry: AuditEntry, changes: unknown) => ({
  ...entry,
  changes,
});
const changesOf = (entry: AuditEntry): Json =>
  structuredClone(entry.changes) as unknown as Json;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Mọi đường dẫn khoá của `changes`, kể cả khoá của đối tượng con (`truoc`, `sau`). */
function keyPaths(node: Json, prefix: string[] = []): string[][] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = [...prefix, key];
    return isObject(value) ? [path, ...keyPaths(value, path)] : [path];
  });
}
/** Đường dẫn của chính `changes` (rỗng) và của từng đối tượng con: nơi có thể chèn khoá lạ. */
function containerPaths(node: Json, prefix: string[] = []): string[][] {
  const nested = Object.entries(node).flatMap(([key, value]) =>
    isObject(value) ? containerPaths(value, [...prefix, key]) : [],
  );
  return [prefix, ...nested];
}
function nodeAt(root: Json, path: string[]): Json {
  let node = root;
  for (const key of path) node = node[key] as Json;
  return node;
}
function replaceAt(root: Json, path: string[], value: unknown): Json {
  const copy = structuredClone(root);
  nodeAt(copy, path.slice(0, -1))[path.at(-1)!] = value;
  return copy;
}
function removeAt(root: Json, path: string[]): Json {
  const copy = structuredClone(root);
  delete nodeAt(copy, path.slice(0, -1))[path.at(-1)!];
  return copy;
}
const withText = (build: Build, key: string, value: unknown) => {
  const entry = build();
  return withChanges(entry, { ...changesOf(entry), [key]: value });
};

describe('NDL-04 — nhận đúng ba biến thể và trả bản sao', () => {
  it.each(VARIANTS)('%s hợp lệ', (_name, build) => {
    const entry = build();
    const before = structuredClone(entry);
    expect(validateAuditEntry(entry)).toEqual(entry);
    expect(validateAuditEntry(entry)).not.toBe(entry);
    expect(entry).toEqual(before);
  });

  it('bộ dựng có đúng ba entry, hai hành động', () => {
    expect(rescheduleAuditEntries().map((entry) => entry.action)).toEqual([
      'DoiLichHo',
      'XuLyDoiLichNgoaiChinhSach',
      'XuLyDoiLichNgoaiChinhSach',
    ]);
  });
});

describe('NDL-04 — đối tượng, chi nhánh và kết quả', () => {
  it.each(VARIANTS)(
    '%s: đối tượng khác bảng đã chốt ⇒ INVALID',
    (_n, build) => {
      for (const targetType of [
        'tai_khoan',
        'benh_nhan',
        'yeu_cau_nghi_phep',
        'giao_dich_thanh_toan',
      ])
        invalid({ ...build(), targetType }, targetType);
    },
  );

  it('đổi chéo hai hành động: DoiLichHo trỏ yêu cầu, XuLy… trỏ lịch ⇒ INVALID', () => {
    invalid({
      ...proxyRescheduleEntry(),
      targetType: 'yeu_cau_doi_lich_ngoai_chinh_sach',
    });
    for (const build of [requestApprovedEntry, requestRejectedEntry])
      invalid({ ...build(), targetType: 'lich_hen' });
  });

  it.each(VARIANTS)(
    '%s: chi nhánh của lịch BẮT BUỘC (null, rỗng, sai dạng, số ⇒ INVALID)',
    (_name, build) => {
      for (const branchId of [null, '', 'abc', '0', '01', 2])
        invalid({ ...build(), branchId }, String(branchId));
    },
  );

  it.each(VARIANTS)(
    '%s: result chỉ ThanhCong (2.4.70: thất bại thì không có bản ghi) ⇒ ThatBai và giá trị lạ INVALID',
    (_name, build) => {
      for (const result of ['ThatBai', 'DaXong', '', null, true])
        invalid({ ...build(), result }, String(result));
    },
  );
});

describe('NDL-04 — khoá: thiếu, lạ, dữ liệu cá nhân, kiểu sai', () => {
  it.each(VARIANTS)(
    '%s: thiếu BẤT KỲ khoá nào, ở mọi cấp ⇒ INVALID',
    (_name, build) => {
      const entry = build();
      const paths = keyPaths(changesOf(entry));
      expect(paths.length).toBeGreaterThanOrEqual(6);
      for (const path of paths)
        invalid(
          withChanges(entry, removeAt(changesOf(entry), path)),
          path.join('.'),
        );
    },
  );

  it.each(VARIANTS)(
    '%s: khoá lạ (kể cả tên, SĐT, email) ở changes, truoc hay sau ⇒ INVALID',
    (_name, build) => {
      const entry = build();
      for (const container of containerPaths(changesOf(entry)))
        for (const key of [
          'extra',
          'ho_ten',
          'so_dien_thoai',
          'email',
          'ten_benh_nhan',
        ]) {
          const changes = changesOf(entry);
          nodeAt(changes, container)[key] = 'giá trị bất kỳ';
          invalid(withChanges(entry, changes), `${container.join('.')}.${key}`);
        }
    },
  );

  it.each(VARIANTS)(
    '%s: thông điệp lỗi của khoá lạ không chứa giá trị của khoá',
    (_name, build) => {
      const marker = 'NGUYEN-VAN-A-0912345678';
      const entry = build();
      let caught: unknown;
      try {
        validateAuditEntry(
          withChanges(entry, { ...changesOf(entry), ho_ten: marker }),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: 'AUDIT_ENTRY_INVALID' });
      expect(JSON.stringify(caught).includes(marker)).toBe(false);
      expect(String((caught as Error).message).includes(marker)).toBe(false);
    },
  );

  it.each(VARIANTS)(
    '%s: kiểu sai ở MỌI khoá (số, boolean, null, mảng, đối tượng) và ở changes, truoc, sau (cả chuỗi) ⇒ INVALID',
    (_name, build) => {
      const entry = build();
      // Chuỗi chỉ là kiểu sai ở nơi phải là đối tượng (ở `ly_do`, `ghi_chu` chuỗi là kiểu đúng)
      const objectOnlyWrong = 'chuỗi';
      const wrongKinds = [5, true, null, [], {}];
      for (const path of keyPaths(changesOf(entry))) {
        const isContainer = isObject(
          nodeAt(changesOf(entry), path.slice(0, -1))[path.at(-1)!],
        );
        for (const wrong of isContainer
          ? [...wrongKinds, objectOnlyWrong]
          : wrongKinds)
          invalid(
            withChanges(entry, replaceAt(changesOf(entry), path, wrong)),
            `${path.join('.')} = ${JSON.stringify(wrong)}`,
          );
      }
      for (const wrong of [null, [], objectOnlyWrong, 5])
        invalid(
          withChanges(entry, wrong),
          `changes = ${JSON.stringify(wrong)}`,
        );
    },
  );
});

describe('NDL-04 — văn bản của nhân sự (ly_do, ghi_chu): 1–255, cận dưới sau trim, cận trên nguyên chuỗi', () => {
  const NBSP = String.fromCodePoint(0x00a0);
  const CJK_SPACE = String.fromCodePoint(0x3000);
  it.each(TEXT_FIELDS)('%s', (_name, build, key) => {
    const cases: [string, unknown, boolean][] = [
      ['1 ký tự', 'x', true],
      ['255 ký tự', 'x'.repeat(255), true],
      ['256 ký tự', 'x'.repeat(256), false],
      ['khoảng trắng hai đầu nhưng có chữ', ' x ', true],
      [
        '255 ký tự cộng một khoảng trắng đầu (256 đơn vị, cận trên tính nguyên chuỗi)',
        ' ' + 'x'.repeat(255),
        false,
      ],
      ['chuỗi rỗng', '', false],
      ['toàn khoảng trắng', '   ', false],
      ['toàn xuống dòng và tab', '\n\t \r\n', false],
      ['toàn khoảng trắng không ngắt (U+00A0)', NBSP.repeat(2), false],
      ['toàn khoảng trắng CJK (U+3000)', CJK_SPACE.repeat(2), false],
      ['null', null, false],
      ['số', 5, false],
      ['boolean', true, false],
      ['mảng', ['x'], false],
      ['đối tượng', { a: 'x' }, false],
    ];
    for (const [label, value, ok] of cases) {
      const input = withText(build, key, value);
      if (ok) expect(validateAuditEntry(input), label).toEqual(input);
      else invalid(input, label);
    }
  });
});

describe('NDL-12 — mã lịch và giờ hẹn', () => {
  const codeFromGenerator = () =>
    generateAppointmentCode(new Date('2026-11-25T03:00:00Z'), randomCodeSuffix);

  it('mã do bộ sinh THẬT của appointments tạo ra luôn qua luật (mẫu và bộ sinh không lệch nhau)', () => {
    let accepted = 0;
    while (accepted < 300) {
      const code = codeFromGenerator();
      if (code === CODE_OLD) continue;
      const proxy = proxyRescheduleEntry();
      const proxyInput = withChanges(
        proxy,
        replaceAt(changesOf(proxy), ['sau', 'ma_lich_hen'], code),
      );
      expect(validateAuditEntry(proxyInput)).toEqual(proxyInput);
      const approved = requestApprovedEntry();
      const approvedInput = withChanges(
        approved,
        replaceAt(changesOf(approved), ['ma_lich_hen_moi'], code),
      );
      expect(validateAuditEntry(approvedInput)).toEqual(approvedInput);
      accepted += 1;
    }
  });

  const BAD_CODES: [string, unknown][] = [
    ['chữ thường', 'clx-20261201-7k3qd'],
    ['tên người', 'Nguyễn Văn A'],
    ['phần đuôi 6 ký tự', 'CLX-20261201-7K3QDX'],
    ['phần đuôi 4 ký tự', 'CLX-20261201-7K3Q'],
    ['ngày 7 chữ số', 'CLX-2026121-7K3QD'],
    ['ký tự cấm I', 'CLX-20261201-7K3QI'],
    ['ký tự cấm U', 'CLX-20261201-7K3QU'],
    ['khoảng trắng đầu', ' CLX-20261201-7K3QD'],
    ['khoảng trắng cuối', 'CLX-20261201-7K3QD '],
    ['xuống dòng cuối', 'CLX-20261201-7K3QD\n'],
    ['SĐT', '0912345678'],
    ['rỗng', ''],
    ['số', 20261201],
    ['null', null],
  ];

  it.each(BAD_CODES)(
    'mã sai mẫu (%s) ở truoc.ma_lich_hen, sau.ma_lich_hen, ma_lich_hen_cu, ma_lich_hen_moi ⇒ INVALID',
    (_label, bad) => {
      const proxy = proxyRescheduleEntry();
      for (const side of ['truoc', 'sau'])
        invalid(
          withChanges(
            proxy,
            replaceAt(changesOf(proxy), [side, 'ma_lich_hen'], bad),
          ),
          side,
        );
      for (const [build, key] of [
        [requestApprovedEntry, 'ma_lich_hen_cu'],
        [requestApprovedEntry, 'ma_lich_hen_moi'],
        [requestRejectedEntry, 'ma_lich_hen_cu'],
      ] as const) {
        const entry = build();
        invalid(
          withChanges(entry, replaceAt(changesOf(entry), [key], bad)),
          key,
        );
      }
    },
  );

  it('lịch mới phải KHÁC lịch cũ: truoc/sau cùng mã ⇒ INVALID; duyệt mà ma_lich_hen_moi = ma_lich_hen_cu ⇒ INVALID', () => {
    const proxy = proxyRescheduleEntry();
    invalid(
      withChanges(
        proxy,
        replaceAt(changesOf(proxy), ['sau', 'ma_lich_hen'], CODE_OLD),
      ),
    );
    const approved = requestApprovedEntry();
    invalid(
      withChanges(
        approved,
        replaceAt(changesOf(approved), ['ma_lich_hen_moi'], CODE_OLD),
      ),
    );
  });

  it.each([
    '2026-12-01T02:00:00.000Z',
    '2026-12-01T02:00:00Z',
    '2026-12-01T09:00:00+07:00',
    '2026-12-01T09:00:00.5+07:00',
    '2026-12-01T09:00:00-05:30',
  ])(
    'thoi_gian %s (ISO-8601 có múi giờ) ⇒ hợp lệ ở cả truoc và sau',
    (time) => {
      const proxy = proxyRescheduleEntry();
      for (const side of ['truoc', 'sau']) {
        const input = withChanges(
          proxy,
          replaceAt(changesOf(proxy), [side, 'thoi_gian'], time),
        );
        expect(validateAuditEntry(input)).toEqual(input);
      }
    },
  );

  it.each([
    ['thiếu múi giờ', '2026-12-01T09:00:00'],
    ['chỉ ngày', '2026-12-01'],
    ['ngày không có thật', '2026-02-30T09:00:00+07:00'],
    ['giờ không có thật', '2026-12-01T25:00:00Z'],
    ['dấu cách thay chữ T', '2026-12-01 09:00:00+07:00'],
    ['khoảng trắng đầu', ' 2026-12-01T09:00:00Z'],
    ['chuỗi tuỳ ý', 'ngày mai'],
    ['rỗng', ''],
    ['epoch dạng số', 1764554400000],
    ['null', null],
  ])('thoi_gian sai (%s) ⇒ INVALID', (_label, time) => {
    const proxy = proxyRescheduleEntry();
    for (const side of ['truoc', 'sau'])
      invalid(
        withChanges(
          proxy,
          replaceAt(changesOf(proxy), [side, 'thoi_gian'], time),
        ),
        side,
      );
  });

  it('hai thoi_gian BẰNG nhau vẫn hợp lệ (luật không so giờ: hai khung giờ của hai lịch làm việc có thể trùng giờ)', () => {
    const proxy = proxyRescheduleEntry();
    const input = withChanges(
      proxy,
      replaceAt(
        changesOf(proxy),
        ['sau', 'thoi_gian'],
        (changesOf(proxy).truoc as { thoi_gian: string }).thoi_gian,
      ),
    );
    expect(validateAuditEntry(input)).toEqual(input);
  });
});

describe('NDL-04 — trạng thái của yêu cầu và ma_lich_hen_moi', () => {
  it.each([
    'ChoDuyet',
    'DaHuy',
    'daduyet',
    'DADUYET',
    '',
    null,
    5,
    ['DaDuyet'],
  ])(
    'sau.trang_thai %j ngoài {DaDuyet, TuChoi} ⇒ INVALID (cả hai nhánh)',
    (value) => {
      for (const build of [requestApprovedEntry, requestRejectedEntry]) {
        const entry = build();
        invalid(
          withChanges(
            entry,
            replaceAt(changesOf(entry), ['sau', 'trang_thai'], value),
          ),
        );
      }
    },
  );

  it.each(['DaDuyet', 'TuChoi', 'ChoXuLy', '', null])(
    'truoc.trang_thai %j khác ChoDuyet ⇒ INVALID (cả hai nhánh)',
    (value) => {
      for (const build of [requestApprovedEntry, requestRejectedEntry]) {
        const entry = build();
        invalid(
          withChanges(
            entry,
            replaceAt(changesOf(entry), ['truoc', 'trang_thai'], value),
          ),
        );
      }
    },
  );

  it('từ chối mà CÓ ma_lich_hen_moi (kể cả null hay chuỗi rỗng) ⇒ INVALID', () => {
    const rejected = requestRejectedEntry();
    for (const value of ['CLX-20261125-A4B9C', null, ''])
      invalid(
        withChanges(rejected, {
          ...changesOf(rejected),
          ma_lich_hen_moi: value,
        }),
        String(value),
      );
  });

  it('duyệt mà THIẾU ma_lich_hen_moi ⇒ INVALID', () => {
    const approved = requestApprovedEntry();
    invalid(
      withChanges(approved, removeAt(changesOf(approved), ['ma_lich_hen_moi'])),
    );
  });

  it('duyệt và từ chối khác nhau ĐÚNG ở trạng thái sau và khoá ma_lich_hen_moi: đổi một vế mà giữ vế kia ⇒ INVALID', () => {
    // duyệt mang trạng thái từ chối (còn ma_lich_hen_moi) và ngược lại
    const approved = requestApprovedEntry();
    invalid(
      withChanges(
        approved,
        replaceAt(changesOf(approved), ['sau', 'trang_thai'], 'TuChoi'),
      ),
    );
    const rejected = requestRejectedEntry();
    invalid(
      withChanges(
        rejected,
        replaceAt(changesOf(rejected), ['sau', 'trang_thai'], 'DaDuyet'),
      ),
    );
  });
});

describe('NDL-13 — độ dài tính theo đơn vị UTF-16 (String.length)', () => {
  it.each(TEXT_FIELDS)(
    '%s: tiếng Việt có dấu, emoji, xuống dòng và dấu nháy',
    (_name, build, key) => {
      const vietnamese = 'Đổi lịch vì bận việc đột xuất ạ. '
        .repeat(10)
        .slice(0, 255);
      expect(vietnamese.length).toBe(255);
      const emoji127 = '🙂'.repeat(127) + 'a';
      expect(emoji127.length).toBe(255);
      const emoji128 = '🙂'.repeat(128);
      expect(emoji128.length).toBe(256);
      const quoted = 'Dòng một\nDòng hai "trích dẫn" \'đơn\' \\ và tab\t.';
      for (const ok of [vietnamese, emoji127, quoted]) {
        const input = withText(build, key, ok);
        expect(validateAuditEntry(input)).toEqual(input);
      }
      invalid(withText(build, key, emoji128), '128 emoji = 256 đơn vị');
      invalid(withText(build, key, vietnamese + 'x'), '256 ký tự có dấu');
    },
  );
});

describe('NDL-14 — hằng giới hạn xuất ra cho DTO của B7 và B9', () => {
  it('AUDIT_RESCHEDULE_LIMITS đúng 1 / 255 [đề xuất]', () => {
    expect({ ...AUDIT_RESCHEDULE_LIMITS }).toEqual({
      textMin: 1,
      textMax: 255,
    });
  });

  it.each(TEXT_FIELDS)(
    '%s: ranh giới bám đúng hằng (trần DTO ≤ trần audit)',
    (_name, build, key) => {
      const { textMin, textMax } = AUDIT_RESCHEDULE_LIMITS;
      for (const ok of ['x'.repeat(textMin), 'x'.repeat(textMax)]) {
        const input = withText(build, key, ok);
        expect(validateAuditEntry(input)).toEqual(input);
      }
      invalid(withText(build, key, 'x'.repeat(textMax + 1)));
      invalid(withText(build, key, ' '.repeat(textMin)));
    },
  );
});

describe('NDL-15 — dữ liệu nhạy cảm lọt vào văn bản hay khoá bị chặn TRƯỚC luật', () => {
  const secrets = [
    'password: hunter2',
    'matkhau=abc123',
    'token=abc123',
    'otp: 123456',
    'Bearer abcdefghijklmnopqrstuvwxyz',
    'secret: giatri',
  ];

  it.each(TEXT_FIELDS)(
    '%s chứa chuỗi giống bí mật ⇒ AUDIT_SENSITIVE_DATA (không phải INVALID)',
    (_name, build, key) => {
      for (const text of secrets) {
        let caught: unknown;
        try {
          validateAuditEntry(withText(build, key, `Ghi chú ${text} hết`));
        } catch (error) {
          caught = error;
        }
        expect(caught, text).toBeInstanceOf(AuditError);
        expect((caught as AuditError).code, text).toBe('AUDIT_SENSITIVE_DATA');
        expect(JSON.stringify(caught).includes('hunter2')).toBe(false);
      }
    },
  );

  it.each(VARIANTS)(
    '%s: khoá nhạy cảm (password, refresh_token) ⇒ AUDIT_SENSITIVE_DATA',
    (_name, build) => {
      const entry = build();
      for (const key of ['password', 'refresh_token', 'mat_khau'])
        expect(() =>
          validateAuditEntry(
            withChanges(entry, { ...changesOf(entry), [key]: 'gia-tri' }),
          ),
        ).toThrow('AUDIT_SENSITIVE_DATA');
    },
  );
});

describe('NDL-16 — hành động gần giống bị từ chối rõ; hai hành động không lẫn payload của nhau', () => {
  it.each([
    'DoiLich',
    'DoiLichHoo',
    'doilichho',
    'DOILICHHO',
    'DoiLichHo ',
    'XuLyDoiLich',
    'XuLyYeuCauDoiLich',
    'xulydoilichngoaichinhsach',
  ])('action %j ⇒ AUDIT_ACTION_UNSUPPORTED', (action) => {
    expect(() =>
      validateAuditEntry({ ...proxyRescheduleEntry(), action }),
    ).toThrow('AUDIT_ACTION_UNSUPPORTED');
  });

  it('payload của hành động này đặt vào hành động kia ⇒ INVALID (cả hai chiều)', () => {
    invalid({
      ...proxyRescheduleEntry(),
      changes: requestApprovedEntry().changes,
    });
    invalid({
      ...requestApprovedEntry(),
      changes: proxyRescheduleEntry().changes,
    });
    invalid({
      ...requestRejectedEntry(),
      changes: proxyRescheduleEntry().changes,
    });
  });

  // Kiểu: hai khẳng định dưới chỉ BIÊN DỊCH được khi `audit-entry.ts` buộc "từ chối không có ma_lich_hen_moi, duyệt bắt buộc có"; vitest không kiểm kiểu nên `tsc` (lint, build) mới là bên bắt.
  // Dùng conditional type thay cho `@ts-expect-error` vì vị trí dòng báo lỗi của tsc không ổn định giữa các phiên bản (kiểu lỗi ở `changes` hay ở `sau.trang_thai`).
  it('kiểu TypeScript buộc ma_lich_hen_moi: không có khi từ chối, bắt buộc khi duyệt (khẳng định lúc biên dịch)', () => {
    type Handling = Extract<
      AuditEntry,
      { action: 'XuLyDoiLichNgoaiChinhSach' }
    >['changes'];
    type Rejected = Extract<Handling, { sau: { trang_thai: 'TuChoi' } }>;
    type Approved = Extract<Handling, { sau: { trang_thai: 'DaDuyet' } }>;
    type RejectedHasNoNewCode = Rejected['ma_lich_hen_moi'] extends undefined
      ? true
      : false;
    type ApprovedMustHaveNewCode = undefined extends Approved['ma_lich_hen_moi']
      ? false
      : true;
    const checks: [RejectedHasNoNewCode, ApprovedMustHaveNewCode] = [
      true,
      true,
    ];
    expect(checks).toEqual([true, true]);
  });
});

describe('NDL-08 — mọi giá trị ENUM hành động đều có luật, trừ danh sách tường minh', () => {
  // Ba hành động có trong ENUM nhưng CHƯA có luật (TD-06; không thuộc reschedule P2). Hành động nào sau này có luật thì phải rút khỏi danh sách này.
  const WITHOUT_RULE = ['DoiQuyen', 'ChinhNoShow', 'BacSiHuyDotXuat'];

  // Thăm dò bằng entry rỗng: có luật thì ném mã khác (INVALID), chưa có luật thì ném UNSUPPORTED.
  function hasRule(action: string): boolean {
    try {
      validateAuditEntry({
        actorId: '1',
        branchId: null,
        action,
        targetType: 'tai_khoan',
        targetId: '1',
        result: 'ThanhCong',
        changes: {},
      });
      return true;
    } catch (error) {
      return !(
        error instanceof AuditError && error.code === 'AUDIT_ACTION_UNSUPPORTED'
      );
    }
  }

  it('giá trị ENUM thiếu luật = đúng ba giá trị trong danh sách (thêm giá trị ENUM mà quên luật, hoặc có luật mà quên rút khỏi danh sách, đều đỏ)', () => {
    const missing = HANH_DONG_NHAY_CAM.filter((action) => !hasRule(action));
    expect([...missing].sort()).toEqual([...WITHOUT_RULE].sort());
  });

  it('thăm dò nhận ra hành động có luật và hành động không có luật (đối chứng của lưới)', () => {
    expect(hasRule('DoiLichHo')).toBe(true);
    expect(hasRule('XuLyDoiLichNgoaiChinhSach')).toBe(true);
    expect(hasRule('OverrideLichHen')).toBe(true);
    expect(hasRule('DoiQuyen')).toBe(false);
    expect(hasRule('KhongCoHanhDongNay')).toBe(false);
  });

  it('DoiLichHo và XuLyDoiLichNgoaiChinhSach có trong HANH_DONG_NHAY_CAM, cùng loại đối tượng của chúng trong LOAI_DOI_TUONG_NHAT_KY', () => {
    expect(HANH_DONG_NHAY_CAM).toContain('DoiLichHo');
    expect(HANH_DONG_NHAY_CAM).toContain('XuLyDoiLichNgoaiChinhSach');
    for (const entry of rescheduleAuditEntries())
      expect(LOAI_DOI_TUONG_NHAT_KY).toContain(entry.targetType);
  });
});
