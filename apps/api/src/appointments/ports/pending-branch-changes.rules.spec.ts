import type { PendingEffectiveChange } from '../../admin/branch-change-requests/pending-branch-changes.reader.js';
import type { CaLamViec } from '../../admin/entities/enums.js';
import {
  findBlockingChange,
  type SlotQuery,
} from './pending-branch-changes.rules.js';

// Task B16b (PLAN booking 5.10 B; admin Q6, Q48; TRACKING 3.50.3) — PBC-01…PBC-06: luật THUẦN "khung giờ rơi vào vùng bị loại". Không DB, không đồng hồ.
// Dữ liệu giả. Mốc chung: `hieuLucTu` = Thứ Ba 24/11/2026 07:30 (giờ VN); dòng mới Thứ Ba sáng 08:00 đến 11:00, chiều 13:30 đến 16:30; Thứ Tư đóng; dịch vụ bỏ '9'.
// Ngày: 17/11 và 24/11 là Thứ Ba, 25/11 Thứ Tư, 26/11 Thứ Năm, 29/11 Chủ Nhật, 30/11 Thứ Hai.

const HIEU_LUC = new Date('2026-11-24T07:30:00+07:00');
const CLOSED = {
  hoatDong: false,
  gioBatDauSang: null,
  gioKetThucSang: null,
  gioBatDauChieu: null,
  gioKetThucChieu: null,
};
const row = (
  thuTrongTuan: number,
  over: Partial<PendingEffectiveChange['lichHoatDong'][number]> = {},
): PendingEffectiveChange['lichHoatDong'][number] => ({
  thuTrongTuan,
  hoatDong: true,
  gioBatDauSang: '08:00:00',
  gioKetThucSang: '11:00:00',
  gioBatDauChieu: '13:30:00',
  gioKetThucChieu: '16:30:00',
  ...over,
});
const change = (
  over: Partial<PendingEffectiveChange> = {},
): PendingEffectiveChange => ({
  yeuCauThayDoiChiNhanhId: '7',
  hieuLucTu: HIEU_LUC,
  quaHan: false,
  lichHoatDong: [row(2), row(3, CLOSED)],
  dichVuBoIds: ['9'],
  ...over,
});
const slot = (
  iso: string,
  ca: CaLamViec,
  over: Partial<SlotQuery> = {},
): SlotQuery => ({
  ngayGio: new Date(iso),
  thoiLuongPhut: 30,
  dichVuKhamId: '1',
  ca,
  ...over,
});
const idOf = (changes: PendingEffectiveChange[], query: SlotQuery) =>
  findBlockingChange(changes, query)?.yeuCauThayDoiChiNhanhId ?? null;

describe('PBC-01 bảng ví dụ vùng bị loại (CG-06, DL-18; admin Q6, Q48)', () => {
  const cases: [string, SlotQuery, string | null][] = [
    [
      'Thứ Ba tuần trước hiệu lực (17/11 07:30, ngoài giờ mới nhưng chưa tới hieuLucTu)',
      slot('2026-11-17T07:30:00+07:00', 'CaSang'),
      null,
    ],
    [
      'trước hieuLucTu 30 phút (24/11 07:00) dù ngoài giờ mới',
      slot('2026-11-24T07:00:00+07:00', 'CaSang'),
      null,
    ],
    [
      'một GIÂY trước hieuLucTu (24/11 07:29:59)',
      slot('2026-11-24T07:29:59+07:00', 'CaSang'),
      null,
    ],
    [
      'ĐÚNG hieuLucTu (24/11 07:30, trước giờ mở mới 08:00) ⇒ chặn: `>=`',
      slot('2026-11-24T07:30:00+07:00', 'CaSang'),
      '7',
    ],
    [
      'biên đầu khoảng sáng mới (24/11 08:00 CaSang)',
      slot('2026-11-24T08:00:00+07:00', 'CaSang'),
      null,
    ],
    [
      'biên cuối khoảng sáng mới: 10:30 + 30 phút = 11:00 đúng giờ đóng mới',
      slot('2026-11-24T10:30:00+07:00', 'CaSang'),
      null,
    ],
    [
      'vượt giờ đóng mới: 10:30 + 45 phút = 11:15',
      slot('2026-11-24T10:30:00+07:00', 'CaSang', { thoiLuongPhut: 45 }),
      '7',
    ],
    [
      'biên đầu khoảng chiều mới (24/11 13:30 CaChieu)',
      slot('2026-11-24T13:30:00+07:00', 'CaChieu'),
      null,
    ],
    [
      'biên cuối khoảng chiều mới: 16:00 + 30 phút = 16:30',
      slot('2026-11-24T16:00:00+07:00', 'CaChieu'),
      null,
    ],
    [
      'quá giờ đóng chiều mới: 16:30 + 30 phút = 17:00',
      slot('2026-11-24T16:30:00+07:00', 'CaChieu'),
      '7',
    ],
    [
      'trước giờ mở chiều mới: 13:00 CaChieu',
      slot('2026-11-24T13:00:00+07:00', 'CaChieu'),
      '7',
    ],
    [
      'ngày đóng (Thứ Tư 25/11 08:00)',
      slot('2026-11-25T08:00:00+07:00', 'CaSang'),
      '7',
    ],
    [
      'thứ không đổi (Thứ Năm 26/11 08:00)',
      slot('2026-11-26T08:00:00+07:00', 'CaSang'),
      null,
    ],
  ];
  it.each(cases)('%s', (_name, query, expected) => {
    expect(idOf([change()], query)).toBe(expected);
  });

  it('danh sách yêu cầu rỗng ⇒ không chặn; yêu cầu không đổi thứ nào và không bỏ dịch vụ ⇒ không chặn', () => {
    const query = slot('2026-11-25T08:00:00+07:00', 'CaSang');
    expect(findBlockingChange([], query)).toBeNull();
    expect(
      findBlockingChange(
        [change({ lichHoatDong: [], dichVuBoIds: [] })],
        query,
      ),
    ).toBeNull();
  });
});

describe('PBC-02 đúng CA của khung giờ (parity với luật theo ca của admin B8)', () => {
  // sáng mới 08:00 đến 11:00, chiều mới 11:30 đến 17:00: khung 11:30 nằm trọn khoảng CHIỀU mới
  const shifted = change({
    lichHoatDong: [
      row(2, { gioBatDauChieu: '11:30:00', gioKetThucChieu: '17:00:00' }),
    ],
  });
  const at1130 = '2026-11-24T11:30:00+07:00';

  it('khung CaSang 11:30 không được mượn khoảng chiều mới ⇒ chặn; cùng giờ nhưng CaChieu thì nằm trọn khoảng chiều ⇒ không chặn', () => {
    expect(idOf([shifted], slot(at1130, 'CaSang'))).toBe('7');
    expect(idOf([shifted], slot(at1130, 'CaChieu'))).toBeNull();
  });

  it('khung CaSang 13:30 (nằm trong khoảng chiều mới) vẫn chặn vì CaSang phải nằm trong khoảng sáng', () => {
    expect(idOf([change()], slot('2026-11-24T13:30:00+07:00', 'CaSang'))).toBe(
      '7',
    );
  });

  it('ca CaToi không có khoảng nào ⇒ chặn khi thứ đó có dòng mới', () => {
    expect(idOf([change()], slot('2026-11-24T19:00:00+07:00', 'CaToi'))).toBe(
      '7',
    );
  });

  it('dòng mới chỉ còn khoảng sáng: khung CaChieu bị chặn, khung CaSang trong khoảng sáng không bị chặn', () => {
    const onlyMorning = change({
      lichHoatDong: [row(2, { gioBatDauChieu: null, gioKetThucChieu: null })],
    });
    expect(
      idOf([onlyMorning], slot('2026-11-24T13:30:00+07:00', 'CaChieu')),
    ).toBe('7');
    expect(
      idOf([onlyMorning], slot('2026-11-24T09:00:00+07:00', 'CaSang')),
    ).toBeNull();
  });
});

describe('PBC-03 dịch vụ bị bỏ khỏi chi nhánh (admin Q48)', () => {
  it('dịch vụ bị bỏ ⇒ chặn mọi thứ trong tuần từ hieuLucTu, kể cả thứ KHÔNG có dòng mới', () => {
    const removed = change({ dichVuBoIds: ['9'] });
    expect(
      idOf(
        [removed],
        slot('2026-11-26T08:00:00+07:00', 'CaSang', { dichVuKhamId: '9' }),
      ),
    ).toBe('7');
    expect(
      idOf(
        [removed],
        slot('2026-11-24T07:30:00+07:00', 'CaSang', { dichVuKhamId: '9' }),
      ),
    ).toBe('7');
  });

  it('dịch vụ bị bỏ mà khung giờ TRƯỚC hieuLucTu ⇒ không chặn', () => {
    expect(
      idOf(
        [change()],
        slot('2026-11-19T08:00:00+07:00', 'CaSang', { dichVuKhamId: '9' }),
      ),
    ).toBeNull();
  });

  it('dịch vụ KHÁC dịch vụ bị bỏ ⇒ không chặn (kể cả cùng thứ không đổi)', () => {
    expect(
      idOf(
        [change({ dichVuBoIds: ['9', '10'] })],
        slot('2026-11-26T08:00:00+07:00', 'CaSang', { dichVuKhamId: '1' }),
      ),
    ).toBeNull();
  });

  it('so sánh id dịch vụ theo chuỗi đúng nguyên văn: "19" không trùng "9"', () => {
    expect(
      idOf(
        [change({ dichVuBoIds: ['9'] })],
        slot('2026-11-26T08:00:00+07:00', 'CaSang', { dichVuKhamId: '19' }),
      ),
    ).toBeNull();
  });
});

describe('PBC-04 dữ liệu dòng xấu (JSON không được tin về cấu trúc)', () => {
  const tuesday = '2026-11-24T09:00:00+07:00';

  it('`hoatDong: null` tính là ĐÓNG ⇒ chặn (admin: active = hoatDong === true)', () => {
    expect(
      idOf(
        [change({ lichHoatDong: [row(2, { hoatDong: null })] })],
        slot(tuesday, 'CaSang'),
      ),
    ).toBe('7');
  });

  it('mở nhưng cả hai khoảng null ⇒ chặn', () => {
    expect(
      idOf(
        [
          change({
            lichHoatDong: [
              row(2, {
                gioBatDauSang: null,
                gioKetThucSang: null,
                gioBatDauChieu: null,
                gioKetThucChieu: null,
              }),
            ],
          }),
        ],
        slot(tuesday, 'CaSang'),
      ),
    ).toBe('7');
  });

  it('chỉ MỘT đầu của khoảng là null thì khoảng đó coi như không có ⇒ chặn', () => {
    expect(
      idOf(
        [change({ lichHoatDong: [row(2, { gioKetThucSang: null })] })],
        slot(tuesday, 'CaSang'),
      ),
    ).toBe('7');
  });

  it('giờ sai dạng coi như không có ⇒ chặn; giờ dạng HH:mm (không giây) vẫn đọc được', () => {
    expect(
      idOf(
        [change({ lichHoatDong: [row(2, { gioBatDauSang: 'abc' })] })],
        slot(tuesday, 'CaSang'),
      ),
    ).toBe('7');
    expect(
      idOf(
        [
          change({
            lichHoatDong: [
              row(2, { gioBatDauSang: '08:00', gioKetThucSang: '11:00' }),
            ],
          }),
        ],
        slot(tuesday, 'CaSang'),
      ),
    ).toBeNull();
  });
});

describe('PBC-05 giờ Việt Nam, thứ ISO (H8, +07:00)', () => {
  const early = change({
    hieuLucTu: new Date('2026-11-01T00:00:00+07:00'),
    lichHoatDong: [row(2, { gioBatDauSang: '07:00:00' })],
  });

  it('khung 06:30 Thứ Ba giờ VN (là 23:30 Thứ Hai theo UTC) dùng dòng của Thứ BA ⇒ chặn (trước giờ mở mới 07:00)', () => {
    const query = slot('2026-11-24T06:30:00+07:00', 'CaSang');
    expect(query.ngayGio.getUTCDay()).toBe(1); // UTC còn là Thứ Hai: đúng là ca bắt lỗi dùng ngày UTC
    expect(idOf([early], query)).toBe('7');
  });

  it('khung 00:30 Thứ Hai giờ VN (là Chủ Nhật theo UTC) KHÔNG dùng dòng của Chủ Nhật; khung 23:30 Chủ Nhật VN dùng dòng Chủ Nhật', () => {
    const sunday = change({
      hieuLucTu: new Date('2026-11-01T00:00:00+07:00'),
      lichHoatDong: [row(7, CLOSED)],
    });
    expect(
      idOf([sunday], slot('2026-11-30T00:30:00+07:00', 'CaSang')),
    ).toBeNull();
    expect(idOf([sunday], slot('2026-11-29T23:30:00+07:00', 'CaSang'))).toBe(
      '7',
    );
  });

  it('thứ ISO đúng cho cả bảy thứ: dòng của thứ N chỉ chặn đúng thứ N', () => {
    // 2026-11-23 là Thứ Hai; mỗi ngày kế tiếp cộng một thứ
    for (let thu = 1; thu <= 7; thu += 1) {
      const only = change({
        hieuLucTu: new Date('2026-11-01T00:00:00+07:00'),
        lichHoatDong: [row(thu, CLOSED)],
      });
      for (let day = 1; day <= 7; day += 1) {
        const iso = `2026-11-${String(22 + day).padStart(2, '0')}T09:00:00+07:00`;
        expect(
          idOf([only], slot(iso, 'CaSang')),
          `thu ${thu} ngày ${day}`,
        ).toBe(day === thu ? '7' : null);
      }
    }
  });
});

describe('PBC-06 nhiều yêu cầu (reader giả; DB thật chỉ cho một yêu cầu mở mỗi chi nhánh, PBC-17)', () => {
  const blockingQuery = slot('2026-11-25T08:00:00+07:00', 'CaSang');
  const notBlocking = change({
    yeuCauThayDoiChiNhanhId: '5',
    lichHoatDong: [row(2)],
    dichVuBoIds: [],
  });

  it('chỉ yêu cầu THỨ HAI chặn ⇒ trả id của yêu cầu thứ hai (không chỉ kiểm phần tử đầu)', () => {
    const second = change({ yeuCauThayDoiChiNhanhId: '8' });
    expect(idOf([notBlocking, second], blockingQuery)).toBe('8');
  });

  it('cả hai cùng chặn ⇒ trả yêu cầu ĐẦU theo thứ tự đã cho', () => {
    const first = change({ yeuCauThayDoiChiNhanhId: '6' });
    const second = change({ yeuCauThayDoiChiNhanhId: '8' });
    expect(idOf([first, second], blockingQuery)).toBe('6');
    expect(idOf([second, first], blockingQuery)).toBe('8');
  });

  it('không yêu cầu nào chặn ⇒ null', () => {
    expect(
      findBlockingChange([notBlocking, { ...notBlocking }], blockingQuery),
    ).toBeNull();
  });

  it('yêu cầu quá hạn (quaHan: true) VẪN chặn, kết quả y hệt yêu cầu chưa quá hạn (CN-108)', () => {
    expect(idOf([change({ quaHan: true })], blockingQuery)).toBe('7');
    expect(idOf([change({ quaHan: false })], blockingQuery)).toBe('7');
  });
});
