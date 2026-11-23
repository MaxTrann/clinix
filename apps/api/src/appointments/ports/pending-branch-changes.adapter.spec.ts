import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type {
  PendingBranchChangesReader,
  PendingEffectiveChange,
} from '../../admin/branch-change-requests/pending-branch-changes.reader.js';
import { PendingBranchChangesAdapter } from './pending-branch-changes.adapter.js';
import type { PendingBranchChangesPort } from './pending-branch-changes.port.js';

// Task B16b (TRACKING 3.50.3) — PBC-07: adapter bọc `getPendingEffectiveChanges` của admin. Reader giả (không DB, không câu SQL do adapter tự chạy). Dữ liệu giả.

const CLOSED_TUESDAY: PendingEffectiveChange = {
  yeuCauThayDoiChiNhanhId: '41',
  hieuLucTu: new Date('2026-11-09T07:00:00+07:00'),
  quaHan: false,
  lichHoatDong: [
    {
      thuTrongTuan: 2,
      hoatDong: false,
      gioBatDauSang: null,
      gioKetThucSang: null,
      gioBatDauChieu: null,
      gioKetThucChieu: null,
    },
  ],
  dichVuBoIds: [],
};
const INPUT: Parameters<PendingBranchChangesPort['findBlocking']>[1] = {
  chiNhanhId: '3',
  ngayGio: new Date('2026-11-10T08:00:00+07:00'),
  thoiLuongPhut: 30,
  dichVuKhamId: '1',
  ca: 'CaSang',
};
// `connection.manager` là một đối tượng KHÁC `em`: để ca "đọc ngoài giao dịch" (em.connection.manager) bị bắt bằng `toBe(em)` chứ không chết vì TypeError của mock
const manager = () =>
  ({
    marker: 'em-cua-nguoi-goi',
    connection: { manager: { marker: 'manager-ngoai-giao-dich' } },
  }) as unknown as EntityManager;

function build(
  answer: () => Promise<PendingEffectiveChange[]> = () =>
    Promise.resolve([CLOSED_TUESDAY]),
) {
  const read = vi.fn((_em: EntityManager, _chiNhanhId: string) => answer());
  const reader = {
    getPendingEffectiveChanges: read,
  } as unknown as PendingBranchChangesReader;
  return { read, adapter: new PendingBranchChangesAdapter(reader) };
}

describe('PBC-07 PendingBranchChangesAdapter (CG-06)', () => {
  it('gọi hàm đọc của admin đúng MỘT lần, với CHÍNH em của người gọi (toBe) và đúng chiNhanhId; không gọi gì khác', async () => {
    const { read, adapter } = build();
    const em = manager();

    await adapter.findBlocking(em, INPUT);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toBe(em);
    expect(read.mock.calls[0]?.[1]).toBe('3');
  });

  it('chặn ⇒ kết quả có đúng MỘT khoá yeuCauThayDoiChiNhanhId kiểu chuỗi, không lộ nội dung yêu cầu', async () => {
    const { adapter } = build();

    const found = await adapter.findBlocking(manager(), INPUT);

    expect(found).toStrictEqual({ yeuCauThayDoiChiNhanhId: '41' });
  });

  it('nhiều yêu cầu (reader giả): trả id của yêu cầu ĐÃ chặn, không phải của phần tử đầu danh sách', async () => {
    const notBlocking: PendingEffectiveChange = {
      ...CLOSED_TUESDAY,
      yeuCauThayDoiChiNhanhId: '5',
      lichHoatDong: [{ ...CLOSED_TUESDAY.lichHoatDong[0]!, thuTrongTuan: 4 }],
    };
    const { adapter } = build(() =>
      Promise.resolve([notBlocking, CLOSED_TUESDAY]),
    );

    await expect(adapter.findBlocking(manager(), INPUT)).resolves.toStrictEqual(
      { yeuCauThayDoiChiNhanhId: '41' },
    );
  });

  it('không yêu cầu nào chặn (khác thứ) hoặc danh sách rỗng ⇒ null', async () => {
    const wednesday = {
      ...INPUT,
      ngayGio: new Date('2026-11-11T08:00:00+07:00'),
    };
    await expect(
      build().adapter.findBlocking(manager(), wednesday),
    ).resolves.toBeNull();
    await expect(
      build(() => Promise.resolve([])).adapter.findBlocking(manager(), INPUT),
    ).resolves.toBeNull();
  });

  it('truyền `ca` của người gọi vào luật: cùng thứ, cùng giờ nhưng yêu cầu chỉ còn khoảng sáng ⇒ CaChieu bị chặn, CaSang không', async () => {
    const onlyMorning: PendingEffectiveChange = {
      ...CLOSED_TUESDAY,
      lichHoatDong: [
        {
          thuTrongTuan: 2,
          hoatDong: true,
          gioBatDauSang: '08:00:00',
          gioKetThucSang: '12:00:00',
          gioBatDauChieu: null,
          gioKetThucChieu: null,
        },
      ],
    };
    const { adapter } = build(() => Promise.resolve([onlyMorning]));
    const afternoon = {
      ...INPUT,
      ca: 'CaChieu' as const,
      ngayGio: new Date('2026-11-10T13:00:00+07:00'),
    };

    await expect(adapter.findBlocking(manager(), afternoon)).resolves.toEqual({
      yeuCauThayDoiChiNhanhId: '41',
    });
    await expect(adapter.findBlocking(manager(), INPUT)).resolves.toBeNull();
  });

  it('hàm đọc ném lỗi ⇒ adapter ném lại CHÍNH lỗi đó (không nuốt, đóng cửa an toàn)', async () => {
    const failure = new Error('lỗi giả của hàm đọc');
    const { adapter } = build(() => Promise.reject(failure));

    await expect(adapter.findBlocking(manager(), INPUT)).rejects.toBe(failure);
  });
});
