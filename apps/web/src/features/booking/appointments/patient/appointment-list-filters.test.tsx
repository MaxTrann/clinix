import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  apiErrorResponse,
  makeAppointments,
} from '../../testing/fake-appointment-list-api';
import {
  advanceClock,
  cleanUpListPage,
  field,
  lastListQuery,
  listQueries,
  loaded,
  renderListPage,
  rowCodes,
  searchBox,
  startFakeClock,
  typeSearch,
} from '../../testing/appointment-list-harness';
import { LIST_TEXT } from './list-messages';

// booking F1: ô tìm (LHL-06, LHL-07) và các bộ lọc người khám, bác sĩ, chuyên khoa, khoảng ngày (LHL-16, LHL-17, LHL-18). Mã LHL là [đề xuất] (PLAN booking
// mục 7.31 sau khi duyệt). API giả CHỈ lọc `q` và `trangThai`: các ca bộ lọc khẳng định truy vấn đã GỬI, không khẳng định kết quả lọc.
afterEach(cleanUpListPage);

const ENTER = { key: 'Enter' };
const requested = (api: Parameters<typeof listQueries>[0]) =>
  listQueries(api).length;

describe('ô tìm: luật từ khoá và hẹn giờ (đồng hồ giả)', () => {
  async function mount() {
    const view = renderListPage({
      before: (api) => {
        api.appointments = makeAppointments(3);
      },
    });
    await loaded();
    startFakeClock();
    return view;
  }

  it('LHL-06 một ký tự (hay rỗng, hay chỉ khoảng trắng) ⇒ KHÔNG gọi API dù đợi lâu; một ký tự thì hiện gợi ý, rỗng thì không', async () => {
    const { api } = await mount();

    typeSearch('a');
    await advanceClock(2_000);
    expect(requested(api)).toBe(1);
    expect(screen.getByText(LIST_TEXT.keywordTooShort)).toBeInTheDocument();

    typeSearch('   ');
    await advanceClock(2_000);
    expect(requested(api)).toBe(1);
    expect(screen.queryByText(LIST_TEXT.keywordTooShort)).toBeNull();

    typeSearch('');
    await advanceClock(2_000);
    expect(requested(api)).toBe(1);
  });

  it('LHL-06 hai ký tự ⇒ gọi đúng sau 300 ms (299 ms chưa gọi) và gửi `q`', async () => {
    const { api } = await mount();

    typeSearch('ab');
    await advanceClock(299);
    expect(requested(api)).toBe(1);
    await advanceClock(1);
    expect(requested(api)).toBe(2);
    expect(lastListQuery(api)).toEqual({ page: '1', q: 'ab' });
  });

  it('LHL-06 chuẩn hoá: cắt khoảng trắng ASCII hai đầu, đưa về NFC; giữ khoảng trắng ở giữa; KHÔNG cắt U+00A0 (API chỉ cắt khoảng trắng ASCII)', async () => {
    const { api } = await mount();

    // `e` + dấu mũ + dấu ngã (dạng NFD) ⇒ `ễ` (U+1EC5, NFC)
    typeSearch('  \tNguyễn  ');
    await advanceClock(300);
    expect(lastListQuery(api)?.q).toBe('Nguyễn');

    typeSearch(' a b ');
    await advanceClock(300);
    expect(lastListQuery(api)?.q).toBe('a b');

    typeSearch(' ab ');
    await advanceClock(300);
    expect(lastListQuery(api)?.q).toBe(' ab ');
  });

  it('LHL-06 biên 100: 100 điểm mã gọi, 101 không gọi và hiện câu; đếm theo ĐIỂM MÃ (100 điểm mã mà 199 đơn vị UTF-16 vẫn hợp lệ)', async () => {
    const { api } = await mount();

    typeSearch('a'.repeat(100));
    await advanceClock(300);
    expect(requested(api)).toBe(2);
    expect(lastListQuery(api)?.q).toBe('a'.repeat(100));

    typeSearch('b'.repeat(101));
    await advanceClock(2_000);
    // Quá dài ⇒ bỏ từ khoá đang áp dụng (yêu cầu thứ ba, không `q`) và hiện câu; không gửi chuỗi 101 ký tự
    expect(screen.getByText(LIST_TEXT.keywordTooLong)).toBeInTheDocument();
    expect(listQueries(api).some((query) => query.q === 'b'.repeat(101))).toBe(
      false,
    );
    expect(lastListQuery(api)).toEqual({ page: '1' });

    const emoji = `a${'\u{1f600}'.repeat(99)}`;
    expect(Array.from(emoji)).toHaveLength(100);
    expect(emoji.length).toBe(199);
    typeSearch(emoji);
    await advanceClock(300);
    expect(lastListQuery(api)?.q).toBe(emoji);
    expect(screen.queryByText(LIST_TEXT.keywordTooLong)).toBeNull();
  });

  it('LHL-06 gõ tiếp trong lúc đợi thì đếm lại 300 ms từ lần gõ cuối: chỉ MỘT yêu cầu, với chữ cuối', async () => {
    const { api } = await mount();

    typeSearch('ab');
    await advanceClock(200);
    typeSearch('abc');
    await advanceClock(299);
    expect(requested(api)).toBe(1);
    await advanceClock(1);
    expect(requested(api)).toBe(2);
    expect(lastListQuery(api)?.q).toBe('abc');
  });

  it('LHL-06 Enter bỏ qua phần đợi; Enter khi từ khoá chưa đổi ⇒ làm mới (gọi lại đúng truy vấn)', async () => {
    const { api } = await mount();

    typeSearch('ab');
    fireEvent.keyDown(searchBox(), ENTER);
    await advanceClock(0);
    expect(requested(api)).toBe(2);
    expect(lastListQuery(api)).toEqual({ page: '1', q: 'ab' });

    fireEvent.keyDown(searchBox(), ENTER);
    await advanceClock(0);
    expect(requested(api)).toBe(3);
    expect(lastListQuery(api)).toEqual({ page: '1', q: 'ab' });

    // Enter khi chưa tìm được (một ký tự) không làm gì
    typeSearch('a');
    await advanceClock(0);
    const afterClear = requested(api);
    fireEvent.keyDown(searchBox(), ENTER);
    await advanceClock(0);
    expect(requested(api)).toBe(afterClear);
  });

  it('LHL-06 thêm khoảng trắng ở đầu hay cuối không đổi từ khoá đã chuẩn hoá ⇒ không gọi lại', async () => {
    const { api } = await mount();

    typeSearch('ab');
    await advanceClock(300);
    expect(requested(api)).toBe(2);
    typeSearch('ab  ');
    await advanceClock(2_000);
    expect(requested(api)).toBe(2);
  });

  it('LHL-06 đang có từ khoá mà xoá còn một ký tự hay rỗng ⇒ bỏ từ khoá NGAY (không đợi 300 ms), danh sách về chưa tìm', async () => {
    const { api } = await mount();

    typeSearch('ab');
    await advanceClock(300);
    expect(lastListQuery(api)).toEqual({ page: '1', q: 'ab' });

    typeSearch('a');
    await advanceClock(0);
    expect(requested(api)).toBe(3);
    expect(lastListQuery(api)).toEqual({ page: '1' });

    typeSearch('xy');
    await advanceClock(300);
    typeSearch('');
    await advanceClock(0);
    expect(lastListQuery(api)).toEqual({ page: '1' });
  });

  it('LHL-06 bộ gõ đang ghép dấu ⇒ KHÔNG gọi dù đợi lâu; `compositionend` bắt đầu đếm 300 ms rồi gọi đúng chữ đã chốt', async () => {
    const { api } = await mount();

    fireEvent.compositionStart(searchBox());
    for (const text of ['ng', 'ngu', 'nguy', 'nguyễ']) {
      typeSearch(text);
      await advanceClock(500);
    }
    expect(requested(api)).toBe(1);

    typeSearch('nguyễn');
    fireEvent.compositionEnd(searchBox());
    await advanceClock(299);
    expect(requested(api)).toBe(1);
    await advanceClock(1);
    expect(requested(api)).toBe(2);
    expect(lastListQuery(api)?.q).toBe('nguyễn');
  });

  // Chrome KHÔNG bắn thêm `input` sau `compositionend` (patient F8 đã đo): chỉ riêng `compositionend` đã đủ để tìm
  it('LHL-06 sau `compositionend` không còn sự kiện nhập nào vẫn tìm được', async () => {
    const { api } = await mount();

    fireEvent.compositionStart(searchBox());
    typeSearch('ngu');
    await advanceClock(1_000);
    expect(requested(api)).toBe(1);
    fireEvent.compositionEnd(searchBox());
    await advanceClock(300);
    expect(lastListQuery(api)?.q).toBe('ngu');
  });

  // Hai chốt chặn độc lập, mỗi chốt có ca riêng (đột biến của F8 sống sót khi gộp chung: chốt này che chốt kia)
  it.each([
    ['isComposing là true', { key: 'Enter', isComposing: true }],
    ['keyCode 229 (IME của Windows)', { key: 'Enter', keyCode: 229 }],
  ])(
    'LHL-06 Enter đang chốt chữ của bộ gõ KHÔNG phải lệnh tìm dù chưa có compositionstart: %s',
    async (_name, init) => {
      const { api } = await mount();

      typeSearch('ngu');
      fireEvent.keyDown(searchBox(), init);
      await advanceClock(0);
      expect(requested(api)).toBe(1);
    },
  );

  it('LHL-06 Enter thường khi đang ghép dấu (đã có compositionstart) bị bỏ qua; Enter sau khi chốt thì tìm', async () => {
    const { api } = await mount();

    fireEvent.compositionStart(searchBox());
    typeSearch('ngu');
    fireEvent.keyDown(searchBox(), ENTER);
    await advanceClock(0);
    expect(requested(api)).toBe(1);

    fireEvent.compositionEnd(searchBox());
    fireEvent.keyDown(searchBox(), { key: 'Enter', isComposing: false });
    await advanceClock(0);
    expect(requested(api)).toBe(2);
  });
});

describe('ô tìm: API từ chối từ khoá', () => {
  it('LHL-07 400 `TU_KHOA_KHONG_HOP_LE` ⇒ câu dưới ô tìm, GIỮ danh sách, không `Thử lại`; từ khoá khác thì câu mất', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(3);
      },
    });
    await loaded();
    const before = rowCodes();

    api.failNext('list', () =>
      apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
      ]),
    );
    // Ký tự điều khiển: đủ độ dài ở client, API mới chặn
    typeSearch('a\u0001b');
    fireEvent.keyDown(searchBox(), ENTER);

    const message = await screen.findByText(LIST_TEXT.keywordRejected);
    expect(searchBox()).toHaveAttribute('aria-describedby', message.id);
    expect(rowCodes()).toEqual(before);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    typeSearch('abc');
    fireEvent.keyDown(searchBox(), ENTER);
    await waitFor(() =>
      expect(screen.queryByText(LIST_TEXT.keywordRejected)).toBeNull(),
    );
    expect(lastListQuery(api)).toEqual({ page: '1', q: 'abc' });
  });
});

describe('bộ lọc người khám', () => {
  const RELATIVES = {
    items: [
      {
        hoSoNguoiThanId: '9007199254740993',
        hoTen: 'Bùi Minh Khoa',
        trangThaiHieuLuc: false,
      },
      { hoSoNguoiThanId: '12', hoTen: 'Lê Minh D', trangThaiHieuLuc: true },
    ],
  };

  it('LHL-16 `Tất cả`, `Bản thân`, từng người thân (hồ sơ đang dùng đứng trước, hồ sơ ngừng có nhãn); gửi `BanThan` hay id CHUỖI, id lớn hơn 2^53 giữ nguyên chữ số', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.relatives = RELATIVES;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Lê Minh D' });

    const select = field('Người khám');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Tất cả',
      'Bản thân',
      'Lê Minh D',
      'Bùi Minh Khoa (ngừng sử dụng)',
    ]);

    fireEvent.change(select, { target: { value: 'BanThan' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        page: '1',
        hoSoNguoiThanId: 'BanThan',
      }),
    );
    fireEvent.change(select, { target: { value: '9007199254740993' } });
    await waitFor(() =>
      expect(lastListQuery(api)?.hoSoNguoiThanId).toBe('9007199254740993'),
    );
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(lastListQuery(api)).toEqual({ page: '1' }));
  });

  it('LHL-16 lỗi tải danh sách người thân ⇒ ô còn `Tất cả` và `Bản thân`, có câu nhỏ, bảng KHÔNG bị chặn; `Thử lại` tải lại đúng danh sách đó', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(3);
        fake.relatives = RELATIVES;
        fake.failNext('relatives', () => apiErrorResponse(500, 'LOI_HE_THONG'));
      },
    });
    await loaded();

    expect(
      await screen.findByText(/Không tải được danh sách người thân\./),
    ).toBeInTheDocument();
    expect(rowCodes()).toHaveLength(3);
    expect(
      within(field('Người khám'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Tất cả', 'Bản thân']);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('option', { name: 'Lê Minh D' });
    expect(api.callsTo('/patient/relatives')).toHaveLength(2);
    expect(
      screen.queryByText(/Không tải được danh sách người thân/),
    ).toBeNull();
    // Bảng không bị tải lại chỉ vì danh sách bộ lọc tải lại
    expect(listQueries(api)).toHaveLength(1);
  });
});

describe('bộ lọc bác sĩ và chuyên khoa (hai route công khai, pageSize=100)', () => {
  const BODY = (items: unknown[], total: number) => ({
    items,
    total,
    page: 1,
    pageSize: 100,
    soCoBacSi: 1,
  });
  const DOCTORS = BODY(
    [
      { bacSiId: '5', hoTen: 'Nguyễn Minh Anh' },
      { bacSiId: '8', hoTen: 'Lê Thảo Vy' },
    ],
    2,
  );
  const SPECIALTIES = BODY(
    [
      { chuyenKhoaId: '1', ten: 'Tim mạch' },
      { chuyenKhoaId: '2', ten: 'Nhi khoa' },
    ],
    2,
  );

  it('LHL-17 chọn bác sĩ, chuyên khoa ⇒ gửi đúng `bacSiId`, `chuyenKhoaId` (chuỗi); hai route công khai tải đúng một lần với pageSize=100', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.doctors = DOCTORS;
        fake.specialties = SPECIALTIES;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    await screen.findByRole('option', { name: 'Nhi khoa' });

    // Danh sách sắp theo tên tiếng Việt
    expect(
      within(field('Bác sĩ'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Tất cả', 'Lê Thảo Vy', 'Nguyễn Minh Anh']);

    fireEvent.change(field('Bác sĩ'), { target: { value: '8' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ page: '1', bacSiId: '8' }),
    );
    fireEvent.change(field('Chuyên khoa'), { target: { value: '2' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        page: '1',
        bacSiId: '8',
        chuyenKhoaId: '2',
      }),
    );
    for (const path of ['/public/doctors', '/public/specialties']) {
      expect(api.callsTo(path)).toHaveLength(1);
      expect(api.callsTo(path)[0].query).toEqual({ pageSize: '100' });
      expect(api.callsTo(path)[0].hasToken).toBe(false);
    }
  });

  // Đại duyệt 12/11/2026: còn mục chưa lấy được thì ghi chú "danh sách rút gọn" thay vì cắt âm thầm
  it('LHL-17 `total` lớn hơn số mục nhận được ⇒ ghi chú "danh sách rút gọn" dưới ĐÚNG ô đó; bằng thì không có ghi chú', async () => {
    renderListPage({
      before: (fake) => {
        fake.doctors = { ...DOCTORS, total: 130 };
        fake.specialties = SPECIALTIES;
      },
    });
    await loaded();

    expect(
      await screen.findByText(
        'Danh sách bác sĩ rút gọn: chỉ hiện 100 mục đầu.',
      ),
    ).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Nhi khoa' });
    expect(screen.queryByText(/Danh sách chuyên khoa rút gọn/)).toBeNull();
  });

  it('LHL-17 lỗi tải danh sách bác sĩ ⇒ câu nhỏ và `Thử lại` ở ô Bác sĩ; ô Chuyên khoa và bảng vẫn dùng được', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(3);
        fake.doctors = DOCTORS;
        fake.specialties = SPECIALTIES;
        fake.failNext('doctors', () => apiErrorResponse(500, 'LOI_HE_THONG'));
      },
    });
    await loaded();

    expect(
      await screen.findByText(/Không tải được danh sách bác sĩ\./),
    ).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Tim mạch' });
    expect(rowCodes()).toHaveLength(3);
    expect(within(field('Bác sĩ')).getAllByRole('option')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    expect(api.callsTo('/public/doctors')).toHaveLength(2);
    expect(api.callsTo('/public/specialties')).toHaveLength(1);
  });
});

describe('khoảng ngày', () => {
  it('LHL-18 gửi chuỗi YYYY-MM-DD nguyên vẹn (không qua Date, không đổi theo múi giờ); xoá ngày thì bỏ khoá', async () => {
    const { api } = renderListPage();
    await loaded();

    fireEvent.change(field('Từ ngày'), { target: { value: '2026-10-01' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ page: '1', tuNgay: '2026-10-01' }),
    );
    fireEvent.change(field('Đến ngày'), { target: { value: '2026-10-31' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        page: '1',
        tuNgay: '2026-10-01',
        denNgay: '2026-10-31',
      }),
    );
    fireEvent.change(field('Đến ngày'), { target: { value: '' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ page: '1', tuNgay: '2026-10-01' }),
    );
  });

  it('LHL-18 `Đến ngày` trước `Từ ngày` ⇒ KHÔNG gọi API, hiện câu; sửa lại cho hợp lệ thì gọi với cả hai ngày; hai ngày bằng nhau là hợp lệ', async () => {
    const { api } = renderListPage();
    await loaded();

    fireEvent.change(field('Từ ngày'), { target: { value: '2026-10-20' } });
    await waitFor(() => expect(listQueries(api)).toHaveLength(2));

    fireEvent.change(field('Đến ngày'), { target: { value: '2026-10-10' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      LIST_TEXT.dateOrder,
    );
    expect(field('Đến ngày')).toHaveAttribute('aria-invalid', 'true');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listQueries(api)).toHaveLength(2);
    expect(lastListQuery(api)).toEqual({ page: '1', tuNgay: '2026-10-20' });

    fireEvent.change(field('Đến ngày'), { target: { value: '2026-10-20' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        page: '1',
        tuNgay: '2026-10-20',
        denNgay: '2026-10-20',
      }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(field('Đến ngày')).toHaveAttribute('aria-invalid', 'false');
  });
});
