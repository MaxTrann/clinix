import type { DoctorRow } from '../context/context.types.js';
import type { PlaceholderRef } from '../context/placeholder.js';
import type {
  EntityNeeds,
  ResolvedEntities,
} from '../context/public-context.repository.js';
import { RESOLVE_MAX_ENTITIES } from './answer.constants.js';
import { EntityResolver } from './entity-resolver.js';

// chatbot B2 — đọc lại thực thể (DCR-11 bản đơn vị; bản MySQL thật ở answer-renderer.int-spec.ts). Mã `B2-nn`: khử trùng và trần số thực thể.

const DOCTOR: DoctorRow = {
  bacSiId: '12',
  hoTen: 'Nguyễn Minh Anh',
  chucDanh: 'ThS_BS',
  chuyenKhoaId: '3',
  chuyenKhoaTen: 'Tim mạch',
  chiNhanhId: '1',
  chiNhanhTen: 'Chi nhánh Một',
  dichVuKhamId: '5',
  dichVuTen: 'Khám tổng quát',
  giaKham: '350000.00',
};

function entities(over: Partial<ResolvedEntities> = {}): ResolvedEntities {
  return {
    specialties: new Map([['3', 'Tim mạch']]),
    branches: new Map([
      [
        '1',
        {
          ten: 'Chi nhánh Một',
          diaChi: '12 Đường A',
          schedule: [
            {
              thuTrongTuan: 1,
              hoatDong: true,
              gioBatDauSang: '08:00:00',
              gioKetThucSang: '12:00:00',
              gioBatDauChieu: null,
              gioKetThucChieu: null,
            },
          ],
        },
      ],
    ]),
    services: new Map([
      [
        '5',
        {
          ten: 'Khám tổng quát',
          giaMacDinh: '200000.00',
          mucDatCoc: '100000.00',
          thoiLuong: 30,
          refund: [{ soGioTruocToiThieu: 24, tyLeHoan: 100 }],
        },
      ],
    ]),
    clinic: {
      ten: 'Phòng khám',
      hotline: '1900 0000',
      email: 'a@example.test',
    },
    ...over,
  };
}

function setup(
  options: {
    doctors?: Record<string, DoctorRow | null>;
    entities?: ResolvedEntities;
    config?: { thoiGianGiuCho: number; soLanTuDoiLichToiDa: number } | null;
  } = {},
) {
  const doctorCalls: string[] = [];
  const readCalls: EntityNeeds[] = [];
  let configCalls = 0;
  const doctors = options.doctors ?? { '12': DOCTOR };
  const resolver = new EntityResolver({
    reader: {
      readEntities: (needs) => {
        readCalls.push(needs);
        return Promise.resolve(options.entities ?? entities());
      },
    },
    doctors: {
      findById: (id) => {
        doctorCalls.push(id);
        return Promise.resolve(doctors[id] ?? null);
      },
    },
    config: {
      get: () => {
        configCalls += 1;
        return Promise.resolve(
          options.config === undefined
            ? { thoiGianGiuCho: 15, soLanTuDoiLichToiDa: 2 }
            : options.config,
        );
      },
    },
  });
  return { resolver, doctorCalls, readCalls, configCalls: () => configCalls };
}

const ref = (kind: PlaceholderRef['kind'], id: string): PlaceholderRef => ({
  kind,
  id,
});

describe('chatbot B2 — EntityResolver', () => {
  it('DCR-01: dựng đúng chữ cho mọi loại chỗ giữ từ dữ liệu đọc lại', async () => {
    const { resolver } = setup();
    const result = await resolver.resolve([
      ref('CK', '3'),
      ref('BS', '12'),
      ref('GIA', '12'),
      ref('CN', '1'),
      ref('DC', '1'),
      ref('GIO', '1'),
      ref('DV', '5'),
      ref('GIADV', '5'),
      ref('COC', '5'),
      ref('TL', '5'),
      ref('HOAN', '5'),
      ref('PK', 'hotline'),
      ref('PK', 'email'),
      ref('CS', 'giuCho'),
      ref('CS', 'doiLich'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const chu = (key: string) => result.values.get(key)?.chu;
    expect(chu('CK:3')).toBe('Tim mạch');
    expect(chu('BS:12')).toBe('ThS.BS. Nguyễn Minh Anh');
    expect(chu('GIA:12')).toBe('350.000 đồng');
    expect(chu('CN:1')).toBe('Chi nhánh Một');
    expect(chu('DC:1')).toBe('12 Đường A');
    expect(chu('GIO:1')).toBe(
      'Thứ Hai: 08:00 đến 12:00; Thứ Ba đến Chủ Nhật: nghỉ',
    );
    expect(chu('DV:5')).toBe('Khám tổng quát');
    expect(chu('GIADV:5')).toBe('từ 200.000 đồng');
    expect(chu('COC:5')).toBe('100.000 đồng');
    expect(chu('TL:5')).toBe('30 phút');
    expect(chu('HOAN:5')).toContain(
      'hủy trước giờ hẹn ít nhất 24 giờ hoàn 100%',
    );
    expect(chu('PK:hotline')).toBe('1900 0000');
    expect(chu('PK:email')).toBe('a@example.test');
    expect(chu('CS:giuCho')).toBe('15 phút');
    expect(chu('CS:doiLich')).toBe('2 lần');
    expect(result.values.get('BS:12')?.entity).toEqual({
      doiTuong: 'BacSi',
      id: '12',
    });
    expect(result.values.get('GIA:12')?.entity).toBeUndefined();
  });

  it('DCR-11: bác sĩ không còn công khai thì không dựng (gone) và không đọc thêm gì', async () => {
    const { resolver, readCalls } = setup({ doctors: { '12': null } });
    expect(await resolver.resolve([ref('BS', '12'), ref('CK', '3')])).toEqual({
      ok: false,
      reason: 'gone',
    });
    expect(readCalls).toEqual([]);
  });

  it.each([
    [
      'chuyên khoa đã ngừng',
      ref('CK', '3'),
      { specialties: new Map<string, string>() },
    ],
    ['chi nhánh mất', ref('CN', '1'), { branches: new Map() }],
    ['địa chỉ của chi nhánh mất', ref('DC', '1'), { branches: new Map() }],
    ['giờ của chi nhánh mất', ref('GIO', '1'), { branches: new Map() }],
    ['dịch vụ bị gỡ', ref('DV', '5'), { services: new Map() }],
    [
      'giá dịch vụ của dịch vụ bị gỡ',
      ref('GIADV', '5'),
      { services: new Map() },
    ],
    [
      'hotline bị xoá',
      ref('PK', 'hotline'),
      { clinic: { ten: null, hotline: null, email: 'a@b.test' } },
    ],
    [
      'email bị xoá',
      ref('PK', 'email'),
      { clinic: { ten: null, hotline: '1', email: null } },
    ],
  ] as const)('DCR-11: %s thì gone', async (_name, target, override) => {
    const { resolver } = setup({ entities: entities(override) });
    expect(await resolver.resolve([target])).toEqual({
      ok: false,
      reason: 'gone',
    });
  });

  it('DCR-11: chưa cấu hình hệ thống thì chỗ giữ CS là gone', async () => {
    const { resolver } = setup({ config: null });
    expect(await resolver.resolve([ref('CS', 'giuCho')])).toEqual({
      ok: false,
      reason: 'gone',
    });
  });

  it('B2-51: chỉ cần bác sĩ thì không mở giao dịch đọc; chỉ cần CS thì không đọc bác sĩ lẫn DB', async () => {
    const onlyDoctor = setup();
    await onlyDoctor.resolver.resolve([ref('BS', '12'), ref('GIA', '12')]);
    expect(onlyDoctor.readCalls).toEqual([]);
    expect(onlyDoctor.configCalls()).toBe(0);

    const onlyConfig = setup();
    await onlyConfig.resolver.resolve([ref('CS', 'doiLich')]);
    expect(onlyConfig.readCalls).toEqual([]);
    expect(onlyConfig.doctorCalls).toEqual([]);
    expect(onlyConfig.configCalls()).toBe(1);
  });

  it('B2-52: truyền đúng danh sách cần đọc, mỗi id một lần, mốc hoàn chỉ cho dịch vụ có HOAN', async () => {
    const { resolver, readCalls } = setup();
    await resolver.resolve([
      ref('CK', '3'),
      ref('CN', '1'),
      ref('DC', '1'),
      ref('GIO', '1'),
      ref('DV', '5'),
      ref('GIADV', '5'),
      ref('DV', '6'),
      ref('HOAN', '6'),
      ref('PK', 'email'),
    ]);
    expect(readCalls).toEqual([
      {
        specialtyIds: ['3'],
        branchIds: ['1'],
        serviceIds: ['5', '6'],
        refundServiceIds: ['6'],
        clinic: true,
      },
    ]);
  });

  it('B2-53: 100 chỗ giữ trùng nhau chỉ gây MỘT lần đọc bác sĩ và MỘT giao dịch đọc', async () => {
    const { resolver, doctorCalls, readCalls } = setup();
    const refs = Array.from({ length: 100 }, () => [
      ref('BS', '12'),
      ref('CK', '3'),
    ]).flat();
    const result = await resolver.resolve(refs);
    expect(result.ok).toBe(true);
    expect(doctorCalls).toEqual(['12']);
    expect(readCalls).toHaveLength(1);
  });

  it('B2-54: `BS:12` và `GIA:12` là hai thực thể nhưng chung một lần đọc bác sĩ', async () => {
    const { resolver, doctorCalls } = setup();
    const result = await resolver.resolve([ref('BS', '12'), ref('GIA', '12')]);
    expect(result.ok).toBe(true);
    expect(doctorCalls).toEqual(['12']);
  });

  it(`B2-55: đúng ${RESOLVE_MAX_ENTITIES} thực thể khác nhau qua, ${RESOLVE_MAX_ENTITIES + 1} thì tooMany và CHƯA đọc gì`, async () => {
    const make = (count: number) =>
      Array.from({ length: count }, (_, i) => ref('CK', String(i + 1)));
    const specialties = new Map(
      make(RESOLVE_MAX_ENTITIES + 1).map((r) => [r.id, `Khoa ${r.id}`]),
    );

    const ok = setup({ entities: entities({ specialties }) });
    expect((await ok.resolver.resolve(make(RESOLVE_MAX_ENTITIES))).ok).toBe(
      true,
    );

    const over = setup({ entities: entities({ specialties }) });
    expect(await over.resolver.resolve(make(RESOLVE_MAX_ENTITIES + 1))).toEqual(
      {
        ok: false,
        reason: 'tooMany',
      },
    );
    expect(over.doctorCalls).toEqual([]);
    expect(over.readCalls).toEqual([]);
    expect(over.configCalls()).toBe(0);
  });

  it('B2-56: trần đếm thực thể KHÁC NHAU: chỗ giữ lặp lại không tính thêm', async () => {
    const ids = Array.from({ length: RESOLVE_MAX_ENTITIES }, (_, i) =>
      String(i + 1),
    );
    const { resolver, readCalls } = setup({
      entities: entities({
        specialties: new Map(ids.map((id) => [id, `Khoa ${id}`])),
      }),
    });
    const refs = [
      ...ids.map((id) => ref('CK', id)),
      // lặp lại 50 lần cũng không làm vượt trần
      ...Array.from({ length: 50 }, () => ref('CK', '1')),
    ];
    const result = await resolver.resolve(refs);
    expect(result.ok).toBe(true);
    expect(readCalls).toHaveLength(1);
    expect(readCalls[0]?.specialtyIds).toHaveLength(RESOLVE_MAX_ENTITIES);
  });

  it('B2-57: danh sách rỗng thì thành công và không đọc gì', async () => {
    const { resolver, doctorCalls, readCalls } = setup();
    const result = await resolver.resolve([]);
    expect(result).toEqual({ ok: true, values: new Map() });
    expect(doctorCalls).toEqual([]);
    expect(readCalls).toEqual([]);
  });
});
