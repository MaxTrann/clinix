import { act, fireEvent, screen } from '@testing-library/react';
import { hang } from '../testing/fake-lookup-api';
import {
  advance,
  nextTick,
  clearButton,
  renderLookupPage,
  resultRows,
  searchBox,
  searchFor,
  settleSearch,
  typeSearch,
  startFakeClock,
} from '../testing/lookup-harness';

// patient F8 (TRACKING F8-E, F8-I): hành vi tìm của ô tìm: đợi 300 ms, Enter, bộ gõ, luật từ khoá, xoá, huỷ và thứ tự. Mã ca LK-nn là [đề xuất];
// mỗi ca ghi mã TC-18 (hoặc TC-17) và Q19. Dùng đồng hồ giả (chỉ `setTimeout`) bật SAU khi trang dựng xong.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const enter = () => fireEvent.keyDown(searchBox(), { key: 'Enter' });

async function mount() {
  const api = await renderLookupPage();
  startFakeClock();
  return api;
}

describe('đợi 300 ms và dưới 2 ký tự (TC-18, Q19)', () => {
  it('LK-08 TC-18 một ký tự KHÔNG gọi API (dù đợi lâu), hiện gợi ý "Nhập ít nhất 2 ký tự để tìm kiếm." và giữ trạng thái đầu', async () => {
    const { lookup } = await mount();
    typeSearch('a');
    await advance(5_000);

    expect(lookup.searches).toHaveLength(0);
    expect(
      screen.getByText('Nhập ít nhất 2 ký tự để tìm kiếm.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nhập tên, số điện thoại hoặc email để tra cứu'),
    ).toBeInTheDocument();
  });

  it('LK-09 TC-18 hai ký tự: sau 299 ms chưa gọi; đúng 300 ms mới gọi MỘT lần, có Authorization, chỉ q, page, pageSize', async () => {
    const { lookup } = await mount();
    typeSearch('ng');
    await advance(299);
    expect(lookup.searches).toHaveLength(0);

    await advance(1);
    expect(lookup.searches).toHaveLength(1);
    const call = lookup.searches[0];
    expect(call.path).toBe('/api/reception/patients');
    expect(call.headers.get('Authorization')).toMatch(/^Bearer tok-/);
    expect(Array.from(call.query.keys()).sort()).toEqual([
      'page',
      'pageSize',
      'q',
    ]);
    expect(call.query.get('q')).toBe('ng');
    expect(call.query.get('page')).toBe('1');
    expect(call.query.get('pageSize')).toBe('20');
  });

  it('LK-10 TC-18 gõ nhanh nhiều ký tự (mỗi 100 ms) ⇒ MỘT yêu cầu với giá trị cuối, 300 ms sau lần gõ cuối', async () => {
    const { lookup } = await mount();
    for (const text of ['ex', 'exa', 'exam', 'examp', 'exampl']) {
      typeSearch(text);
      await advance(100);
    }
    expect(lookup.searches).toHaveLength(0);

    typeSearch('example');
    await advance(299);
    expect(lookup.searches).toHaveLength(0);
    await advance(1);
    expect(lookup.searches).toHaveLength(1);
    expect(lookup.searches[0].query.get('q')).toBe('example');
  });

  it('LK-11 TC-18 từ khoá được cắt khoảng trắng hai đầu trước khi gửi; chỉ toàn khoảng trắng thì không gọi', async () => {
    const { lookup } = await mount();
    await searchFor('  ex  ');
    expect(lookup.searches).toHaveLength(1);
    expect(lookup.searches[0].query.get('q')).toBe('ex');

    typeSearch('     ');
    await advance(2_000);
    expect(lookup.searches).toHaveLength(1);
    // toàn khoảng trắng không phải "một ký tự": không có gợi ý
    expect(screen.queryByText('Nhập ít nhất 2 ký tự để tìm kiếm.')).toBeNull();
  });

  it('LK-12 TC-18 chỉ cắt khoảng trắng ASCII: U+00A0 ở đầu là ký tự thật, được gửi nguyên', async () => {
    const { lookup } = await mount();
    await searchFor(' ex');

    expect(lookup.searches).toHaveLength(1);
    expect(lookup.searches[0].query.get('q')).toBe(' ex');
  });

  it('LK-13 TC-18 từ khoá hợp lệ ở biên 100 điểm mã ⇒ gọi; 101 ⇒ KHÔNG gọi và hiện "Từ khoá tối đa 100 ký tự."', async () => {
    const { lookup } = await mount();
    await searchFor('a'.repeat(100));
    expect(lookup.searches).toHaveLength(1);

    typeSearch('a'.repeat(101));
    await advance(2_000);
    expect(lookup.searches).toHaveLength(1);
    expect(screen.getByText('Từ khoá tối đa 100 ký tự.')).toBeInTheDocument();
  });

  it('LK-14 TC-18 100 emoji (200 đơn vị UTF-16) vẫn gọi được: đếm theo điểm mã', async () => {
    const { lookup } = await mount();
    await searchFor('😀'.repeat(100));

    expect(lookup.searches).toHaveLength(1);
    expect(screen.queryByText('Từ khoá tối đa 100 ký tự.')).toBeNull();
  });

  it.each([
    ['tab ở giữa', 'ng\tuyen'],
    ['ký tự vô hình U+200B', 'ng​uyen'],
  ])(
    'LK-15 TC-18 H5 ký tự cấm (%s) ⇒ KHÔNG gọi API, hiện "Từ khoá có ký tự không hợp lệ."',
    async (_name, text) => {
      const { lookup } = await mount();
      typeSearch(text);
      await advance(2_000);

      expect(lookup.searches).toHaveLength(0);
      expect(
        screen.getByText('Từ khoá có ký tự không hợp lệ.'),
      ).toBeInTheDocument();
    },
  );
});

describe('Enter (TC-18)', () => {
  it('LK-16 TC-18 Enter bỏ qua phần đợi: gọi NGAY, và hết 300 ms vẫn chỉ MỘT yêu cầu', async () => {
    const { lookup } = await mount();
    typeSearch('ex');
    enter();
    await advance(0);
    expect(lookup.searches).toHaveLength(1);

    await advance(1_000);
    expect(lookup.searches).toHaveLength(1);
  });

  it('LK-17 TC-18 Enter khi từ khoá chưa đổi và đã tìm xong ⇒ tìm lại (làm mới), vẫn đúng trang đang xem', async () => {
    const { lookup } = await mount();
    await searchFor('ex');
    expect(lookup.searches).toHaveLength(1);

    enter();
    await advance(0);
    expect(lookup.searches).toHaveLength(2);
    expect(lookup.searches[1].query.get('q')).toBe('ex');
    expect(lookup.searches[1].query.get('page')).toBe('1');
  });

  it('LK-18 TC-18 Enter khi dưới 2 ký tự không gọi API', async () => {
    const { lookup } = await mount();
    typeSearch('e');
    enter();
    await advance(1_000);

    expect(lookup.searches).toHaveLength(0);
  });

  it('LK-19 TC-18 phím khác Enter không tìm sớm', async () => {
    const { lookup } = await mount();
    typeSearch('ex');
    fireEvent.keyDown(searchBox(), { key: 'a' });
    fireEvent.keyDown(searchBox(), { key: 'Tab' });
    await advance(100);

    expect(lookup.searches).toHaveLength(0);
  });
});

describe('bộ gõ tiếng Việt: isComposing (TC-18, đã đo ở Chrome)', () => {
  it('LK-20 TC-18 đang ghép dấu ⇒ KHÔNG tìm dù đợi lâu; `compositionend` bắt đầu đếm 300 ms rồi tìm đúng chữ đã chốt', async () => {
    const { lookup } = await mount();
    fireEvent.compositionStart(searchBox());
    for (const text of ['ng', 'ngu', 'nguy', 'nguyê', 'nguyễ']) {
      typeSearch(text);
      await advance(500);
    }
    expect(lookup.searches).toHaveLength(0);

    typeSearch('nguyễn');
    fireEvent.compositionEnd(searchBox());
    await advance(299);
    expect(lookup.searches).toHaveLength(0);
    await advance(1);
    expect(lookup.searches).toHaveLength(1);
    expect(lookup.searches[0].query.get('q')).toBe('nguyễn');
  });

  it('LK-21 TC-18 Chrome KHÔNG bắn thêm `input` sau `compositionend`: chỉ riêng `compositionend` đã đủ để tìm', async () => {
    const { lookup } = await mount();
    fireEvent.compositionStart(searchBox());
    typeSearch('ngu');
    await advance(1_000);
    expect(lookup.searches).toHaveLength(0);

    // KHÔNG đổi giá trị nào nữa
    fireEvent.compositionEnd(searchBox());
    await settleSearch();
    expect(lookup.searches).toHaveLength(1);
    expect(lookup.searches[0].query.get('q')).toBe('ngu');
  });

  // Hai chốt chặn độc lập, mỗi chốt có ca riêng (đột biến M16, M17 của F8 sống sót khi gộp chung: chốt này che chốt kia)
  it.each([
    ['isComposing là true', { key: 'Enter', isComposing: true }],
    [
      'keyCode 229 (IME của Windows; Safari báo 229 sau compositionend)',
      { key: 'Enter', keyCode: 229 },
    ],
  ])(
    'LK-22 TC-18 ô tìm bỏ qua Enter đang chốt chữ của bộ gõ dù chưa có compositionstart: %s',
    async (_name, init) => {
      const { lookup } = await mount();
      typeSearch('ngu');
      fireEvent.keyDown(searchBox(), init);
      await advance(0);

      expect(lookup.searches).toHaveLength(0);
    },
  );

  it('LK-22b TC-18 hook bỏ qua Enter thường khi đang ghép dấu (đã có compositionstart, keydown không mang cờ nào)', async () => {
    const { lookup } = await mount();
    fireEvent.compositionStart(searchBox());
    typeSearch('ngu');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await advance(0);

    expect(lookup.searches).toHaveLength(0);
  });

  it('LK-23 TC-18 Enter sau khi chốt (isComposing = false) tìm bình thường', async () => {
    const { lookup } = await mount();
    fireEvent.compositionStart(searchBox());
    typeSearch('nguyễn');
    fireEvent.compositionEnd(searchBox());
    fireEvent.keyDown(searchBox(), { key: 'Enter', isComposing: false });
    await advance(0);

    expect(lookup.searches).toHaveLength(1);
  });

  it('LK-24 TC-18 ghép dấu xong mà ô còn dưới 2 ký tự ⇒ không gọi', async () => {
    const { lookup } = await mount();
    fireEvent.compositionStart(searchBox());
    typeSearch('đ');
    fireEvent.compositionEnd(searchBox());
    await advance(2_000);

    expect(lookup.searches).toHaveLength(0);
  });
});

describe('về trạng thái đầu và nút "Xóa tìm kiếm" (TC-17, TC-18)', () => {
  it('LK-25 TC-18 xuống dưới 2 ký tự ⇒ về trạng thái đầu NGAY (không đợi 300 ms) và yêu cầu đang bay bị huỷ', async () => {
    const { lookup } = await renderLookupPage({
      before: ({ lookup: fake }) => {
        fake.failNext('search', (init) => hang(init));
      },
    });
    startFakeClock();
    await searchFor('ex');
    expect(lookup.searches).toHaveLength(1);
    expect(lookup.searches[0].signal?.aborted).toBe(false);

    typeSearch('e');
    await advance(0);
    expect(lookup.searches[0].signal?.aborted).toBe(true);
    expect(
      screen.getByText('Nhập tên, số điện thoại hoặc email để tra cứu'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Đang tìm...')).toBeNull();
  });

  it('LK-26 TC-18 sau khi về trạng thái đầu, gõ lại cùng từ khoá phải đợi đủ 300 ms (không dùng lại truy vấn cũ ngay)', async () => {
    const { lookup } = await mount();
    await searchFor('ex');
    expect(lookup.searches).toHaveLength(1);

    typeSearch('e');
    typeSearch('ex');
    await advance(299);
    expect(lookup.searches).toHaveLength(1);
    await advance(1);
    expect(lookup.searches).toHaveLength(2);
  });

  it('LK-27 TC-17 nút "Xóa tìm kiếm": có khi ô có chữ; bấm ⇒ ô trống, kết quả và hồ sơ đang chọn biến mất, focus về ô, không gọi thêm', async () => {
    const { lookup } = await mount();
    await searchFor('example');
    fireEvent.click(resultRows()[0]);
    await advance(0);
    expect(lookup.details).toHaveLength(1);

    fireEvent.click(clearButton());
    await advance(1_000);

    expect(searchBox()).toHaveValue('');
    expect(document.activeElement).toBe(searchBox());
    expect(screen.queryByRole('button', { name: 'Xóa tìm kiếm' })).toBeNull();
    expect(
      screen.getByText('Nhập tên, số điện thoại hoặc email để tra cứu'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chọn một bệnh nhân để xem hồ sơ'),
    ).toBeInTheDocument();
    expect(lookup.searches).toHaveLength(1);
    expect(lookup.details).toHaveLength(1);
  });

  it('LK-28 TC-18 nút "Xóa tìm kiếm" có vùng bấm tối thiểu 24 × 24 px (WCAG 2.2 mục 2.5.8): lớp kích thước 1,6rem ở gốc 15 px', async () => {
    await mount();
    typeSearch('ex');

    expect(clearButton().className).toContain('size-[1.6rem]');
  });
});

describe('huỷ và thứ tự phản hồi (TC-18)', () => {
  it('LK-29 TC-18 đổi từ khoá: yêu cầu cũ bị huỷ (signal.aborted) và kết quả của từ khoá mới hiện', async () => {
    const { lookup } = await renderLookupPage({
      before: ({ lookup: fake }) => {
        fake.failNext('search', (init) => hang(init));
      },
    });
    startFakeClock();
    await searchFor('zz');
    expect(lookup.searches[0].signal?.aborted).toBe(false);

    await searchFor('example');
    expect(lookup.searches[0].signal?.aborted).toBe(true);
    expect(resultRows()).toHaveLength(3);
  });

  it('LK-30 TC-18 hai yêu cầu về ĐẢO thứ tự ⇒ kết quả cũ về sau KHÔNG đè kết quả mới (kể cả khi huỷ không kịp)', async () => {
    const { lookup } = await mount();
    // `hold` không nghe `signal`: giống phản hồi cũ đã về sát lúc huỷ
    const releaseOld = lookup.hold('search');
    await searchFor('mai');
    const releaseNew = lookup.hold('search');
    await searchFor('hung');
    expect(lookup.searches).toHaveLength(2);

    await act(async () => {
      releaseNew(200, lookup.searchBody('hung'));
      await nextTick();
    });
    expect(screen.getByText('Đặng Văn Hùng')).toBeInTheDocument();

    await act(async () => {
      releaseOld(200, lookup.searchBody('mai'));
      await nextTick();
    });
    expect(screen.getByText('Đặng Văn Hùng')).toBeInTheDocument();
    expect(screen.queryByText('Lê Thị Mai')).toBeNull();
    expect(resultRows()).toHaveLength(1);
  });

  it('LK-31 TC-18 kết quả cũ về sau khi ô đã bị xoá ⇒ vẫn ở trạng thái đầu', async () => {
    const { lookup } = await mount();
    const releaseOld = lookup.hold('search');
    await searchFor('mai');
    typeSearch('');
    await advance(0);

    await act(async () => {
      releaseOld(200, lookup.searchBody('mai'));
      await nextTick();
    });
    expect(screen.queryByText('Lê Thị Mai')).toBeNull();
    expect(
      screen.getByText('Nhập tên, số điện thoại hoặc email để tra cứu'),
    ).toBeInTheDocument();
  });

  it('LK-31b TC-18 phản hồi cũ về sau khi ô bị xoá KHÔNG hiện lại như kết quả mới khi gõ lại đúng từ khoá đó: phải "Đang tìm..." tới khi yêu cầu mới xong', async () => {
    const { lookup } = await mount();
    const releaseOld = lookup.hold('search');
    await searchFor('mai');
    typeSearch('');
    await advance(0);
    await act(async () => {
      releaseOld(200, lookup.searchBody('mai'));
      await nextTick();
    });

    const releaseNew = lookup.hold('search');
    await searchFor('mai');
    expect(lookup.searches).toHaveLength(2);
    expect(screen.getByText('Đang tìm...')).toBeInTheDocument();
    expect(screen.queryByText('Lê Thị Mai')).toBeNull();

    await act(async () => {
      releaseNew(200, lookup.searchBody('mai'));
      await nextTick();
    });
    expect(screen.getByText('Lê Thị Mai')).toBeInTheDocument();
  });

  it('LK-32 TC-18 gỡ trang giữa lúc tìm ⇒ yêu cầu bị huỷ, không lỗi ra console', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { lookup, unmount } = await renderLookupPage({
      before: ({ lookup: fake }) => {
        fake.failNext('search', (init) => hang(init));
      },
    });
    startFakeClock();
    await searchFor('ex');
    expect(lookup.searches[0].signal?.aborted).toBe(false);

    unmount();
    await advance(0);
    expect(lookup.searches[0].signal?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it('LK-33 TC-18 đang tìm: danh sách cũ được GIỮ trong 300 ms chờ, rồi "Đang tìm..." thay danh sách khi từ khoá mới có hiệu lực', async () => {
    const { lookup } = await mount();
    await searchFor('example');
    expect(resultRows()).toHaveLength(3);

    const release = lookup.hold('search');
    typeSearch('mai');
    await advance(299);
    expect(resultRows()).toHaveLength(3);
    expect(screen.queryByText('Đang tìm...')).toBeNull();

    await advance(1);
    expect(screen.getByText('Đang tìm...')).toBeInTheDocument();
    expect(
      screen.getByText('Đang tìm...').closest('[role="status"]'),
    ).not.toBeNull();
    expect(screen.queryByText('Đặng Văn Hùng')).toBeNull();

    await act(async () => {
      release(200, lookup.searchBody('mai'));
      await nextTick();
    });
    expect(screen.queryByText('Đang tìm...')).toBeNull();
    expect(screen.getByText('Lê Thị Mai')).toBeInTheDocument();
  });
});
