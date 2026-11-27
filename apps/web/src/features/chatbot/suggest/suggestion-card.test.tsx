import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  SELECTED_BRANCH_STORAGE_KEY,
  resetSelectedBranchForTest,
} from '../../../shared/branch-selection';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { resetWidgetTest } from '../testing/render-widget';
import {
  emptySuggestion,
  specialty,
  suggestion,
} from '../testing/suggestion-fixtures';
import {
  ONE_SPECIALTY,
  THREE_SPECIALTIES,
  chooseSpecialty,
  dayButtons,
  shiftButton,
  showCard,
} from '../testing/suggest-harness';

// Chatbot F2, WTL-11 (chọn chuyên khoa), WTL-12 (ngày, ca, rỗng, lỗi) và nửa đầu WTL-13 (thẻ bác sĩ, ô giờ). Đi qua `ChatbotWidget` thật với lớp API giả.
// Đồng hồ giả CHỈ cho `Date` (để `waitFor` của Testing Library vẫn chạy): 03:00Z ngày 27/11/2026 là 10:00 giờ Việt Nam, nên dải ngày bắt đầu 27/11.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T03:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  resetWidgetTest();
});

function setBranch(chiNhanhId: string | null) {
  window.localStorage.setItem(
    SELECTED_BRANCH_STORAGE_KEY,
    JSON.stringify({ chiNhanhId, nguon: 'NguoiDung' }),
  );
  resetSelectedBranchForTest();
}

const apiError = (status: number, maLoi: string) =>
  new ApiError(status, { maLoi, thongBao: 'x' });

describe('thẻ chuyên khoa (WTL-11)', () => {
  it('WTL-11 phản hồi `GoiY` có thẻ: tên chuyên khoa là liên kết, nút "Chọn chuyên khoa này" và "Chọn chuyên khoa khác"; chưa bấm thì KHÔNG gọi mạng và chưa có ngày, ca', async () => {
    const { fake, card } = await showCard();

    expect(
      within(card).getByRole('link', { name: 'Nội tổng quát' }),
    ).toHaveAttribute('href', '/chuyen-khoa/3');
    expect(
      within(card).getByRole('button', { name: 'Chọn chuyên khoa này' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(card).getByRole('button', { name: 'Chọn chuyên khoa khác' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Ca khám' })).toBeNull();
    expect(fake.suggestCalls).toHaveLength(0);
    expect(fake.specialtyCalls).toHaveLength(0);
  });

  it('WTL-11 chỉ có MỘT chuyên khoa cũng KHÔNG tự chọn: phải bấm (2.4.7 b8, b9)', async () => {
    const { fake } = await showCard({ suggestions: ONE_SPECIALTY });
    await Promise.resolve();
    expect(fake.suggestCalls).toHaveLength(0);
  });

  it('WTL-11 hiện tối đa 3 chuyên khoa dù máy chủ gửi nhiều hơn', async () => {
    await showCard({
      suggestions: [
        ...THREE_SPECIALTIES,
        { chuyenKhoaId: '9', ten: 'Chuyên khoa thứ tư' },
      ],
    });
    expect(
      screen.getAllByRole('button', { name: 'Chọn chuyên khoa này' }),
    ).toHaveLength(3);
    expect(screen.queryByText('Chuyên khoa thứ tư')).toBeNull();
  });

  it('F2-17 `GoiY` mà không có chuyên khoa nào vẫn có thẻ với riêng nút "Chọn chuyên khoa khác"', async () => {
    await showCard({ suggestions: [] });
    expect(
      screen.queryByRole('button', { name: 'Chọn chuyên khoa này' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Chọn chuyên khoa khác' }),
    ).toBeInTheDocument();
  });

  it('WTL-11 bấm "Chọn chuyên khoa này": ĐÚNG một lời gọi với `chuyenKhoaId`, không gửi ngày, ca, chi nhánh khi chưa chọn; nút thành "Đã chọn"; hiện dải ngày và ca', async () => {
    const { fake } = await showCard({ suggestions: THREE_SPECIALTIES });

    chooseSpecialty(1);
    await screen.findByText(/Ngày sớm nhất còn giờ trống/);

    expect(fake.suggestCalls).toHaveLength(1);
    expect(fake.suggestCalls[0]!.params).toEqual({ chuyenKhoaId: '1' });
    const chosen = screen.getByRole('button', { name: 'Đã chọn' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('group', { name: 'Ngày khám' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ca khám' })).toBeInTheDocument();
  });

  it('WTL-11 chi nhánh đang chọn đọc LÚC GỌI: đổi chi nhánh giữa hai lần chọn thì lời gọi sau mang chi nhánh mới; "Toàn quốc" thì bỏ tham số', async () => {
    setBranch('3');
    const { fake } = await showCard({ suggestions: THREE_SPECIALTIES });

    chooseSpecialty(0);
    await screen.findByText(/Có 2 bác sĩ/);
    setBranch('7');
    chooseSpecialty(0);
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(2));
    await screen.findByText(/Có 2 bác sĩ/);
    setBranch(null);
    chooseSpecialty(0);
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(3));

    expect(fake.suggestCalls[0]!.params.chiNhanhId).toBe('3');
    expect(fake.suggestCalls[1]!.params.chiNhanhId).toBe('7');
    expect('chiNhanhId' in fake.suggestCalls[2]!.params).toBe(false);
  });

  it('WTL-11 "Chọn chuyên khoa khác": một lời gọi lấy danh sách công khai, chọn thì gọi API gợi ý đúng chuyên khoa; mở lại không tải lại', async () => {
    const { fake } = await showCard({
      specialtyAnswers: [
        [
          specialty('1', 'Tim mạch'),
          specialty('3', 'Nội tổng quát'),
          specialty('5', 'Da liễu'),
        ],
      ],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Chọn chuyên khoa khác' }),
    );
    const select = await screen.findByRole('combobox', { name: 'Chuyên khoa' });
    expect(fake.specialtyCalls).toHaveLength(1);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Chọn chuyên khoa…', 'Tim mạch', 'Nội tổng quát', 'Da liễu']);

    fireEvent.change(select, { target: { value: '5' } });
    await screen.findByText(/Ngày sớm nhất còn giờ trống/);
    expect(fake.suggestCalls).toHaveLength(1);
    expect(fake.suggestCalls[0]!.params).toEqual({ chuyenKhoaId: '5' });
    // Chọn xong thì danh sách đóng
    expect(screen.queryByRole('combobox', { name: 'Chuyên khoa' })).toBeNull();

    // Mở lại: dùng danh sách đã tải, không gọi lần hai
    fireEvent.click(
      screen.getByRole('button', { name: 'Chọn chuyên khoa khác' }),
    );
    expect(
      await screen.findByRole('combobox', { name: 'Chuyên khoa' }),
    ).toHaveValue('5');
    expect(fake.specialtyCalls).toHaveLength(1);
  });

  it('WTL-11 danh sách chuyên khoa lỗi: chữ lỗi chung và "Thử lại" gọi lại; danh sách rỗng có chữ riêng', async () => {
    const { fake } = await showCard({
      specialtyAnswers: [new NetworkError(), []],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Chọn chuyên khoa khác' }),
    );
    await screen.findByText(
      'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await screen.findByText('Chưa có chuyên khoa nào để chọn.');
    expect(fake.specialtyCalls).toHaveLength(2);
  });

  it('WTL-11 danh sách đang tải hiện chữ chờ', async () => {
    await showCard({ specialtyAnswers: [new Promise(() => undefined)] });
    fireEvent.click(
      screen.getByRole('button', { name: 'Chọn chuyên khoa khác' }),
    );
    expect(
      await screen.findByText('Đang tải danh sách chuyên khoa…'),
    ).toBeInTheDocument();
  });
});

describe('ngày và ca (WTL-12)', () => {
  it('WTL-12 dải bảy ngày bắt đầu từ HÔM NAY theo giờ Việt Nam; ba nút ca "Sáng", "Chiều", "Tối" (kể cả "Tối") và không ô nào đang chọn', async () => {
    await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    expect(dayButtons().map((button) => button.textContent)).toEqual([
      'Hôm nay 27/11',
      'Ngày mai 28/11',
      'CN 29/11',
      'Thứ 2 30/11',
      'Thứ 3 01/12',
      'Thứ 4 02/12',
      'Thứ 5 03/12',
    ]);
    for (const button of [
      ...dayButtons(),
      shiftButton('Sáng'),
      shiftButton('Chiều'),
      shiftButton('Tối'),
    ]) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('WTL-12 "hôm nay" theo giờ Việt Nam kể cả khi trình duyệt ở múi giờ khác và đã qua nửa đêm ở Việt Nam', async () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    // 17:00Z ngày 27/11 là 00:00 ngày 28/11 ở Việt Nam, còn ở Los Angeles vẫn là 09:00 ngày 27/11
    vi.setSystemTime(new Date('2026-11-27T17:00:00.000Z'));
    try {
      await showCard();
      chooseSpecialty();
      await screen.findByText(/Có 2 bác sĩ/);
      expect(dayButtons()[0]).toHaveTextContent('Hôm nay 28/11');
      expect(dayButtons()[6]).toHaveTextContent('04/12');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('WTL-12 mỗi thay đổi là ĐÚNG một lời gọi: chọn ngày, chọn ca, bỏ ngày, bỏ ca', async () => {
    const { fake } = await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);
    expect(fake.suggestCalls).toHaveLength(1);

    fireEvent.click(dayButtons()[1]!);
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(2));
    await screen.findByText(/có 2 bác sĩ còn giờ trống/);
    fireEvent.click(shiftButton('Chiều'));
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(3));
    await screen.findByText(/có 2 bác sĩ còn giờ trống/);
    fireEvent.click(dayButtons()[1]!);
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(4));
    await screen.findByText(/Ngày sớm nhất còn giờ trống/);
    fireEvent.click(shiftButton('Chiều'));
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(5));

    expect(fake.suggestCalls.map((call) => call.params)).toEqual([
      { chuyenKhoaId: '3' },
      { chuyenKhoaId: '3', ngay: '2026-11-28' },
      { chuyenKhoaId: '3', ngay: '2026-11-28', ca: 'CaChieu' },
      { chuyenKhoaId: '3', ca: 'CaChieu' },
      { chuyenKhoaId: '3' },
    ]);
  });

  it('WTL-12 ô đang chọn được đánh dấu (`aria-pressed`), bấm lại thì bỏ chọn (cả ngày lẫn ca)', async () => {
    await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    fireEvent.click(shiftButton('Tối'));
    await screen.findByText(/Có 2 bác sĩ|có 2 bác sĩ/);
    expect(shiftButton('Tối')).toHaveAttribute('aria-pressed', 'true');
    expect(shiftButton('Sáng')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(shiftButton('Tối'));
    await waitFor(() =>
      expect(shiftButton('Tối')).toHaveAttribute('aria-pressed', 'false'),
    );
  });

  it('WTL-12 đổi sang chuyên khoa khác thì đặt lại ngày và ca (một lần tìm mới)', async () => {
    const { fake } = await showCard({ suggestions: THREE_SPECIALTIES });
    chooseSpecialty(0);
    await screen.findByText(/Có 2 bác sĩ/);
    fireEvent.click(dayButtons()[2]!);
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(2));
    fireEvent.click(shiftButton('Sáng'));
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(3));

    chooseSpecialty(0);
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(4));

    expect(fake.suggestCalls[3]!.params).toEqual({ chuyenKhoaId: '1' });
    await screen.findByText(/Ngày sớm nhất còn giờ trống/);
    for (const button of [...dayButtons(), shiftButton('Sáng')]) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('WTL-12 dòng tóm tắt: chưa chọn ngày thì là ngày SỚM NHẤT máy chủ trả; đã chọn ngày thì chỉ nêu ngày đó', async () => {
    await showCard({
      suggestAnswers: [
        suggestion({ ngay: '2026-11-28' }),
        suggestion({ ngay: '2026-11-30' }),
      ],
    });
    chooseSpecialty();
    expect(
      await screen.findByText(
        'Ngày sớm nhất còn giờ trống: Thứ 7 28/11. Có 2 bác sĩ.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(dayButtons()[3]!);
    expect(
      await screen.findByText('Thứ 2 30/11: có 2 bác sĩ còn giờ trống.'),
    ).toBeInTheDocument();
  });

  it('WTL-12 trong lúc chờ hiện "Đang tìm bác sĩ và giờ trống…" và vẫn giữ dải ngày, ca', async () => {
    await showCard({ suggestAnswers: [new Promise(() => undefined)] });
    chooseSpecialty();
    expect(
      await screen.findByText('Đang tìm bác sĩ và giờ trống…'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Ngày khám' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /Giờ trống/ })).toBeNull();
  });

  it('WTL-12 A5 không có khung giờ: chữ đúng PLAN, ngày null không có dòng "sớm nhất", vẫn đổi được ngày và ca, có liên kết tra cứu', async () => {
    const { fake } = await showCard({
      suggestAnswers: [emptySuggestion('KhongCoKhungGio')],
    });
    chooseSpecialty();

    expect(
      await screen.findByText(
        'Hiện chưa có khung giờ trống phù hợp. Thử ngày hoặc ca khác, hoặc chọn chuyên khoa khác.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ngày sớm nhất/)).toBeNull();
    expect(screen.queryByRole('list', { name: /Giờ trống/ })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Tra cứu bác sĩ và lịch khám' }),
    ).toHaveAttribute('href', '/bac-si');

    fireEvent.click(shiftButton('Tối'));
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(2));
    expect(fake.suggestCalls[1]!.params.ca).toBe('CaToi');
  });

  it('WTL-12 A5 chuyên khoa không có bác sĩ: chữ riêng, không bảo thử ngày hay ca khác', async () => {
    await showCard({ suggestAnswers: [emptySuggestion('KhongCoBacSi')] });
    chooseSpecialty();
    expect(
      await screen.findByText(
        'Chuyên khoa này hiện chưa có bác sĩ phù hợp. Hãy chọn chuyên khoa khác hoặc tra cứu bác sĩ và lịch khám.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Thử ngày hoặc ca khác/)).toBeNull();
  });

  it.each([
    [400, 'BO_LOC_KHONG_HOP_LE', 'Bộ lọc không hợp lệ.'],
    [404, 'KHONG_TIM_THAY', 'Không tìm thấy chuyên khoa.'],
    [
      409,
      'HE_THONG_CHUA_CAU_HINH',
      'Chưa gợi ý được lúc này. Bạn có thể tra cứu bác sĩ và lịch khám.',
    ],
  ])(
    'WTL-12 %i %s: chữ đúng PLAN 5.16, thẻ lỗi dẫn sang Tra cứu bác sĩ, không có "Thử lại", lựa chọn còn nguyên',
    async (status, maLoi, text) => {
      await showCard({ suggestAnswers: [apiError(status, maLoi)] });
      chooseSpecialty();

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Tra cứu bác sĩ và lịch khám' }),
      ).toHaveAttribute('href', '/bac-si');
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Đã chọn' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(
        screen.getByRole('group', { name: 'Ngày khám' }),
      ).toBeInTheDocument();
    },
  );

  it('WTL-12 mất mạng: chữ lỗi chung của F1, GIỮ lựa chọn (ngày, ca) và "Thử lại" gọi lại đúng tham số đó', async () => {
    const { fake } = await showCard({
      suggestAnswers: [suggestion(), new NetworkError(), suggestion()],
    });
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);
    fireEvent.click(dayButtons()[1]!);
    await screen.findByText(
      'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
    );

    expect(dayButtons()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('list', { name: /Giờ trống/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText(/có 2 bác sĩ còn giờ trống/);

    expect(fake.suggestCalls).toHaveLength(3);
    expect(fake.suggestCalls[2]!.params).toEqual(fake.suggestCalls[1]!.params);
    expect(fake.suggestCalls[2]!.params.ngay).toBe('2026-11-28');
  });

  it('WTL-12 quá giờ cũng là chữ lỗi chung và cho thử lại', async () => {
    await showCard({ suggestAnswers: [new TimeoutError()] });
    chooseSpecialty();
    expect(
      await screen.findByText(
        'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('thẻ bác sĩ và ô giờ (WTL-13)', () => {
  it('WTL-13 thẻ bác sĩ: chức danh và tên là liên kết hồ sơ, chi nhánh là liên kết, giá bằng đồng, điểm đánh giá; bác sĩ chưa có đánh giá thì ẩn điểm', async () => {
    await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    const first = screen.getByRole('link', { name: 'TS.BS. Nguyễn Minh Anh' });
    expect(first).toHaveAttribute('href', '/bac-si/11');
    const firstCard = first.closest('li')!;
    expect(
      within(firstCard).getByRole('link', { name: 'CLINIX Quận 1' }),
    ).toHaveAttribute('href', '/chi-nhanh/2');
    expect(
      within(firstCard).getByText('Giá khám 350.000đ'),
    ).toBeInTheDocument();
    expect(
      within(firstCard).getByText('4.5 · 12 đánh giá'),
    ).toBeInTheDocument();

    const second = screen.getByRole('link', { name: 'BS.CKII Trần Quốc Huy' });
    expect(second).toHaveAttribute('href', '/bac-si/12');
    const secondCard = second.closest('li')!;
    expect(
      within(secondCard).getByText('Giá khám 420.000đ'),
    ).toBeInTheDocument();
    expect(within(secondCard).queryByText(/đánh giá/)).toBeNull();
  });

  it('WTL-13 ô giờ là LIÊN KẾT sang bước 4 của Đặt lịch với đúng `khungGioId`; giờ hiển thị theo giờ Việt Nam', async () => {
    await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    const slot = screen.getByRole('link', {
      name: '09:30 ngày 28/11, TS.BS. Nguyễn Minh Anh',
    });
    expect(slot).toHaveAttribute('href', '/dat-lich/thong-tin?khungGioId=101');
    expect(slot).toHaveTextContent('09:30');
    expect(
      screen.getByRole('link', { name: /^10:00 ngày 28\/11/ }),
    ).toHaveAttribute('href', '/dat-lich/thong-tin?khungGioId=102');
    // 07:00Z là 14:00 giờ Việt Nam
    expect(
      screen.getByRole('link', {
        name: '14:00 ngày 28/11, BS.CKII Trần Quốc Huy',
      }),
    ).toHaveAttribute('href', '/dat-lich/thong-tin?khungGioId=201');
  });

  it('WTL-13 mỗi thẻ có "Xem lịch đầy đủ" dẫn tới hồ sơ bác sĩ (máy chủ chỉ trả các ô sớm nhất)', async () => {
    await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);
    const links = screen.getAllByRole('link', { name: 'Xem lịch đầy đủ' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/bac-si/11',
      '/bac-si/12',
    ]);
  });

  it('WTL-13 khách chưa đăng nhập thấy một dòng "Đăng nhập để đặt lịch"; Bệnh nhân thì không', async () => {
    await showCard({ role: 'guest' });
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);
    expect(screen.getAllByText('Đăng nhập để đặt lịch')).toHaveLength(1);
  });

  it('WTL-13 Bệnh nhân không có dòng "Đăng nhập để đặt lịch"', async () => {
    await showCard({ role: 'BenhNhan' });
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);
    expect(screen.queryByText('Đăng nhập để đặt lịch')).toBeNull();
  });

  it('WTL-13 chatbot chỉ ĐỌC: không có nút giữ chỗ hay đặt lịch trong thẻ, ô giờ chỉ là liên kết', async () => {
    const { card } = await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);
    expect(
      within(card).queryByRole('button', { name: /đặt|giữ chỗ|xác nhận/i }),
    ).toBeNull();
    for (const slot of within(card).getAllByRole('link', {
      name: /^\d\d:\d\d/,
    })) {
      expect(slot.getAttribute('href')).toMatch(
        /^\/dat-lich\/thong-tin\?khungGioId=\d+$/,
      );
    }
  });
});
