import {
  toRequestDetail,
  toRequestItem,
} from './reschedule-request-list.mapper.js';
import type {
  RescheduleRequestDetailRow,
  RescheduleRequestItemRow,
} from './reschedule-request-list.types.js';
import { collectKeys, collectStrings } from '../testing/response-keys.js';

// reschedule B8 — XDL-15 (danh sách trắng khoá ở danh sách và chi tiết), XDL-38 (trạng thái khung giờ mong muốn), XDL-39 (ba khoá xử lý), XDL-40 (id lớn hơn 2^53), không DB. Cùng các khoá được kiểm
// qua HTTP ở e2e `booking-reschedule-requests.e2e-spec.ts`.
const ITEM_KEYS = [
  'bacSi',
  'chiNhanh',
  'laNguoiThan',
  'hoTen',
  'id',
  'maLichHen',
  'nguoiKham',
  'soLanDaTuDoi',
  'ten',
  'thoiDiemTao',
  'thoiGianCu',
  'thoiGianMongMuon',
  'trangThai',
  'yeuCauId',
].sort();

const itemRow = (
  overrides: Partial<RescheduleRequestItemRow> = {},
): RescheduleRequestItemRow => ({
  yeuCauId: '9007199254740993',
  trangThai: 'ChoDuyet',
  thoiDiemTao: '2026-11-05 09:30:15',
  maLichHen: 'CLX-20261110-ABCDE',
  nguoiKhamHoTen: 'Nguyễn Văn An',
  laNguoiThan: 0,
  bacSiHoTen: 'Bác sĩ Một',
  chiNhanhId: '9007199254740995',
  chiNhanhTen: 'Chi nhánh 1',
  thoiGianCu: '2026-11-10 08:00:00',
  thoiGianMongMuon: '2026-11-12 09:00:00',
  soLanDaTuDoi: 2,
  ...overrides,
});

const detailRow = (
  overrides: Partial<RescheduleRequestDetailRow> = {},
): RescheduleRequestDetailRow => ({
  ...itemRow(),
  // Cột thừa của SQL: KHÔNG được ra JSON
  lichHenId: '777000777',
  khungGioMongMuonId: '9007199254740999',
  khungGioTrangThai: 'ConTrong',
  khungGioGiuChoDen: null,
  lyDoYeuCau: 'Tôi có việc đột xuất',
  trangThaiLichGoc: 'DaXacNhan',
  ghiChuXuLy: null,
  thoiDiemXuLy: null,
  nguoiXuLyHoTen: null,
  ...overrides,
});

// 02/11/2026 08:00 giờ Việt Nam
const NOW = new Date('2026-11-02T01:00:00.000Z');
const APPROVAL = { coTheDuyet: true, lyDoKhongDuyet: null };
const detailOf = (
  overrides: Partial<RescheduleRequestDetailRow> = {},
  extra: Partial<Parameters<typeof toRequestDetail>[1]> = {},
) =>
  toRequestDetail(detailRow(overrides), {
    soLanToiDa: 2,
    approval: APPROVAL,
    now: NOW,
    ...extra,
  });

describe('XDL-15 dòng danh sách: ĐÚNG mười khoá', () => {
  it('khoá cấp một và khoá lồng đúng danh sách trắng; không có cột thừa của SQL', () => {
    const item = toRequestItem({
      ...itemRow(),
      // Cột thừa cố ý lẫn vào hàng thô: mapper gán từng khoá nên không được lọt ra
      ...({
        lichHenId: '1',
        soDienThoai: '0911111111',
        email: 'a@b.c',
      } as object),
    } as RescheduleRequestItemRow);
    expect(Object.keys(item).sort()).toStrictEqual([
      'bacSi',
      'chiNhanh',
      'maLichHen',
      'nguoiKham',
      'soLanDaTuDoi',
      'thoiDiemTao',
      'thoiGianCu',
      'thoiGianMongMuon',
      'trangThai',
      'yeuCauId',
    ]);
    expect([...new Set(collectKeys(item))].sort()).toStrictEqual(ITEM_KEYS);
    expect(Object.keys(item.nguoiKham).sort()).toStrictEqual([
      'hoTen',
      'laNguoiThan',
    ]);
    expect(Object.keys(item.bacSi)).toStrictEqual(['hoTen']);
    expect(Object.keys(item.chiNhanh).sort()).toStrictEqual(['id', 'ten']);
    expect(collectStrings(item)).not.toContain('0911111111');
    expect(collectStrings(item)).not.toContain('a@b.c');
    expect(JSON.stringify(item)).not.toContain('777');
  });

  it('kiểu từng khoá: id là chuỗi, giờ là ISO 8601 UTC giữ mili giây (08:00 giờ VN là 01:00Z), số lần là số', () => {
    const item = toRequestItem(itemRow());
    expect(item).toStrictEqual({
      yeuCauId: '9007199254740993',
      trangThai: 'ChoDuyet',
      thoiDiemTao: '2026-11-05T02:30:15.000Z',
      maLichHen: 'CLX-20261110-ABCDE',
      nguoiKham: { hoTen: 'Nguyễn Văn An', laNguoiThan: false },
      bacSi: { hoTen: 'Bác sĩ Một' },
      chiNhanh: { id: '9007199254740995', ten: 'Chi nhánh 1' },
      thoiGianCu: '2026-11-10T01:00:00.000Z',
      thoiGianMongMuon: '2026-11-12T02:00:00.000Z',
      soLanDaTuDoi: 2,
    });
  });

  it.each([
    [0, false],
    ['0', false],
    [1, true],
    ['1', true],
  ])('laNguoiThan từ %j của MySQL ⇒ boolean %s', (raw, expected) => {
    expect(
      toRequestItem(itemRow({ laNguoiThan: raw })).nguoiKham.laNguoiThan,
    ).toBe(expected);
  });

  it('XDL-40 id lớn hơn 2^53 giữ NGUYÊN chuỗi ở yeuCauId và chiNhanh.id (không qua Number)', () => {
    const item = toRequestItem(
      itemRow({
        yeuCauId: '9223372036854775807',
        chiNhanhId: '9007199254740993',
      }),
    );
    expect(item.yeuCauId).toBe('9223372036854775807');
    expect(item.chiNhanh.id).toBe('9007199254740993');
  });

  it('soLanDaTuDoi đọc từ chuỗi cũng ra số', () => {
    expect(toRequestItem(itemRow({ soLanDaTuDoi: '3' })).soLanDaTuDoi).toBe(3);
  });
});

describe('XDL-15 chi tiết: ĐÚNG mười chín khoá', () => {
  it('mười khoá của dòng cộng chín khoá; không lichHenId, khungGioMongMuonId hay khungGioTrangThai ở cấp ngoài', () => {
    const detail = detailOf();
    expect(Object.keys(detail).sort()).toStrictEqual(
      [
        'bacSi',
        'chiNhanh',
        'coTheDuyet',
        'ghiChuXuLy',
        'khungGioMongMuon',
        'lyDoKhongDuyet',
        'lyDoYeuCau',
        'maLichHen',
        'nguoiKham',
        'nguoiXuLy',
        'soLanDaTuDoi',
        'soLanToiDa',
        'thoiDiemTao',
        'thoiDiemXuLy',
        'thoiGianCu',
        'thoiGianMongMuon',
        'trangThai',
        'trangThaiLichGoc',
        'yeuCauId',
      ].sort(),
    );
    expect(Object.keys(detail)).toHaveLength(19);
    expect(Object.keys(detail.khungGioMongMuon).sort()).toStrictEqual([
      'khungGioId',
      'trangThai',
    ]);
    const json = JSON.stringify(detail);
    expect(json).not.toContain('lichHenId');
    expect(json).not.toContain('777000777');
    expect(json).not.toContain('khungGioGiuChoDen');
  });

  it('còn ChoDuyet: ba khoá xử lý đều null; lyDoYeuCau và trangThaiLichGoc đi nguyên văn', () => {
    const detail = detailOf();
    expect(detail.ghiChuXuLy).toBeNull();
    expect(detail.thoiDiemXuLy).toBeNull();
    expect(detail.nguoiXuLy).toBeNull();
    expect(detail.lyDoYeuCau).toBe('Tôi có việc đột xuất');
    expect(detail.trangThaiLichGoc).toBe('DaXacNhan');
    expect(detail.khungGioMongMuon.khungGioId).toBe('9007199254740999');
  });

  it('XDL-39 đã xử lý: ghi chú, giờ xử lý (ISO UTC) và tên người xử lý', () => {
    const detail = detailOf({
      trangThai: 'DaDuyet',
      ghiChuXuLy: 'Đã sắp xếp lại',
      thoiDiemXuLy: '2026-11-06 14:00:00',
      nguoiXuLyHoTen: 'Lễ Tân Một',
    });
    expect(detail.ghiChuXuLy).toBe('Đã sắp xếp lại');
    expect(detail.thoiDiemXuLy).toBe('2026-11-06T07:00:00.000Z');
    expect(detail.nguoiXuLy).toStrictEqual({ hoTen: 'Lễ Tân Một' });
  });

  it('coTheDuyet, lyDoKhongDuyet và soLanToiDa lấy từ tham số (soLanToiDa null khi thiếu cấu hình)', () => {
    const blocked = detailOf(
      {},
      {
        approval: { coTheDuyet: false, lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO' },
        soLanToiDa: null,
      },
    );
    expect(blocked.coTheDuyet).toBe(false);
    expect(blocked.lyDoKhongDuyet).toBe('LICH_HEN_DA_QUA_GIO');
    expect(blocked.soLanToiDa).toBeNull();
    expect(detailOf().soLanToiDa).toBe(2);
  });
});

describe('XDL-38 khungGioMongMuon.trangThai (deriveSlotStatus)', () => {
  // Khung giờ mong muốn 12/11/2026 09:00 giờ VN, sau NOW (02/11/2026 08:00)
  it.each([
    ['ConTrong', null, 'ConTrong'],
    ['DaDat', null, 'DaDat'],
    ['HetHan', null, 'HetHan'],
    ['DangGiuCho', '2026-11-02 08:10:00', 'DangGiuCho'], // còn hạn giữ chỗ
    ['DangGiuCho', '2026-11-02 07:59:59', 'ConTrong'], // hết hạn: coi như trống
    ['DangGiuCho', '2026-11-02 08:00:00', 'ConTrong'], // đúng mốc là ĐÃ hết hạn
    ['DangGiuCho', null, 'ConTrong'], // thiếu giu_cho_den coi như trống
  ] as const)(
    'DB %s giu_cho_den %s ⇒ %s',
    (khungGioTrangThai, khungGioGiuChoDen, expected) => {
      expect(
        detailOf({ khungGioTrangThai, khungGioGiuChoDen }).khungGioMongMuon
          .trangThai,
      ).toBe(expected);
    },
  );

  it('khung giờ đã qua giờ ⇒ HetHan dù DB ghi ConTrong', () => {
    expect(
      detailOf({ thoiGianMongMuon: '2026-11-01 09:00:00' }).khungGioMongMuon
        .trangThai,
    ).toBe('HetHan');
    expect(
      detailOf({ thoiGianMongMuon: '2026-11-02 08:00:00' }).khungGioMongMuon
        .trangThai,
    ).toBe('HetHan');
  });
});
