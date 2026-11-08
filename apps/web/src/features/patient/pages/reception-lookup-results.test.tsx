import { fireEvent, screen, within } from '@testing-library/react';
import {
  PATIENT_MAI,
  SAMPLE_PATIENTS,
  json,
  makePatients,
} from '../testing/fake-lookup-api';
import {
  advance,
  renderLookupPage,
  resultRows,
  searchBox,
  searchFor,
  typeSearch,
  startFakeClock,
} from '../testing/lookup-harness';

// patient F8 (TRACKING F8-F, F8-I): danh sách kết quả (Figma `484:2`, `505:2`) và phân trang. Mã ca LK-nn là [đề xuất]; mỗi ca ghi mã TC-17,
// Q18, Q19 và H4 (chỉ hiện trường được phép). Dữ liệu giả đuôi `.invalid`.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(patients = SAMPLE_PATIENTS) {
  const api = await renderLookupPage({ patients });
  startFakeClock();
  return api;
}

const pagination = () =>
  screen.getByRole('navigation', { name: 'Phân trang kết quả' });
const next = () =>
  within(pagination()).getByRole('button', { name: 'Trang sau' });
const previous = () =>
  within(pagination()).getByRole('button', { name: 'Trang trước' });

describe('danh sách kết quả (TC-17, 484:2)', () => {
  it('LK-43 TC-17 Q18 kết quả: mỗi hàng là một nút có họ tên, SĐT, email; KHÔNG hiện mã tài khoản; sắp theo họ tên', async () => {
    await mount();
    await searchFor('example');

    const rows = resultRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Đặng Văn Hùng');
    expect(rows[0]).toHaveTextContent('0901234567');
    expect(rows[0]).toHaveTextContent('hung@example.invalid');
    expect(rows[1]).toHaveTextContent('Lê Thị Mai');
    expect(rows[2]).toHaveTextContent('Nguyễn Văn A');
    expect(document.body.textContent).not.toContain('9007199254740993');
    for (const row of rows) expect(row).toHaveAttribute('type', 'button');
  });

  it('LK-44 TC-17 H4 hàng KHÔNG mang mã tài khoản trong thuộc tính nào (data-*, id, aria-*, title)', async () => {
    await mount();
    await searchFor('example');

    const html = document.body.innerHTML;
    expect(html).not.toContain('9007199254740993');
    expect(html).not.toMatch(/taiKhoanId|data-id|data-patient/);
  });

  it('LK-45 Q18 chỉ tài khoản ngừng hoạt động có nhãn "Ngừng hoạt động" ở hàng', async () => {
    await mount();
    await searchFor('example');

    const rows = resultRows();
    expect(within(rows[0]).queryByText('Ngừng hoạt động')).toBeNull();
    expect(within(rows[1]).getByText('Ngừng hoạt động')).toBeInTheDocument();
    expect(within(rows[2]).queryByText('Ngừng hoạt động')).toBeNull();
  });

  it('LK-46 Q18 `trangThai` lạ ⇒ không nhãn, danh sách không vỡ', async () => {
    await mount([
      {
        ...PATIENT_MAI,
        detail: { ...PATIENT_MAI.detail, trangThai: 'MaLa' },
      },
    ]);
    await searchFor('mai');

    expect(resultRows()).toHaveLength(1);
    expect(screen.queryByText('Ngừng hoạt động')).toBeNull();
  });

  it('LK-47 TC-17 "N kết quả" lấy `total` (không phải số hàng đang hiện), trong phần tử aria-live', async () => {
    await mount(makePatients(45));
    await searchFor('mẫu');

    expect(resultRows()).toHaveLength(20);
    const count = screen.getByText('45 kết quả');
    expect(count).toHaveAttribute('aria-live', 'polite');
    expect(count).toHaveAttribute('aria-atomic', 'true');
  });

  it('LK-48 TC-17 họ tên và email rất dài hiện ĐỦ chữ (không cắt bằng JS), nằm trong phần tử có min-w-0 để xuống dòng', async () => {
    const longName = 'Nguyễn '.repeat(14).trim();
    const longEmail = `${'a'.repeat(110)}@example.invalid`;
    await mount([
      {
        ...PATIENT_MAI,
        detail: { ...PATIENT_MAI.detail, hoTen: longName, email: longEmail },
      },
    ]);
    await searchFor('nguyen');

    const row = resultRows()[0];
    expect(row).toHaveTextContent(longName);
    expect(row).toHaveTextContent(longEmail);
    expect(within(row).getByText(longEmail).parentElement?.className).toContain(
      'min-w-0',
    );
  });

  it('LK-49 TC-17 505:2 không có kết quả ⇒ đúng câu Figma "Không tìm thấy bệnh nhân" / "Thử tìm với từ khoá khác", không "N kết quả", vùng status', async () => {
    await mount();
    await searchFor('zzzz');

    expect(screen.getByText('Không tìm thấy bệnh nhân')).toBeInTheDocument();
    expect(screen.getByText('Thử tìm với từ khoá khác')).toBeInTheDocument();
    expect(
      screen.getByText('Không tìm thấy bệnh nhân').closest('[role="status"]'),
    ).not.toBeNull();
    expect(screen.queryByText(/kết quả$/)).toBeNull();
    expect(resultRows()).toHaveLength(0);
    expect(
      screen.getByText('Chọn một bệnh nhân để xem hồ sơ'),
    ).toBeInTheDocument();
    // không phải lỗi: không có alert, không có "Thử lại"
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('LK-50 TC-17 đổi từ khoá ⇒ tìm lại và danh sách đổi theo (từ có kết quả sang không, rồi ngược lại)', async () => {
    const { lookup } = await mount();
    await searchFor('mai');
    expect(resultRows()).toHaveLength(1);

    await searchFor('zzzz');
    expect(resultRows()).toHaveLength(0);
    expect(screen.getByText('Không tìm thấy bệnh nhân')).toBeInTheDocument();

    await searchFor('hung');
    expect(resultRows()).toHaveLength(1);
    expect(screen.queryByText('Không tìm thấy bệnh nhân')).toBeNull();
    expect(lookup.searches.map((call) => call.query.get('q'))).toEqual([
      'mai',
      'zzzz',
      'hung',
    ]);
  });

  it('LK-51 TC-17 hàng đang chọn có aria-current="true", hàng khác không có; chọn hàng khác thì chuyển', async () => {
    await mount();
    await searchFor('example');
    const [first, second] = resultRows();
    expect(first).not.toHaveAttribute('aria-current');

    fireEvent.click(first);
    await advance(0);
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(second).not.toHaveAttribute('aria-current');

    fireEvent.click(second);
    await advance(0);
    expect(first).not.toHaveAttribute('aria-current');
    expect(second).toHaveAttribute('aria-current', 'true');
  });
});

describe('phân trang (Q19)', () => {
  it('LK-52 Q19 từ 21 kết quả mới có phân trang; đúng 20 thì không', async () => {
    await mount(makePatients(20));
    await searchFor('mẫu');
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang kết quả' }),
    ).toBeNull();
    expect(screen.getByText('20 kết quả')).toBeInTheDocument();

    typeSearch('');
    await advance(0);
  });

  it('LK-53 Q19 21 kết quả ⇒ có phân trang "Trang 1 / 2"; "Trước" vô hiệu ở trang đầu', async () => {
    await mount(makePatients(21));
    await searchFor('mẫu');

    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
    expect(previous()).toBeDisabled();
    expect(next()).toBeEnabled();
  });

  it('LK-54 Q19 "Sau", "Trước": gửi đúng page, hiện đúng hàng, vô hiệu ở biên; luôn gửi pageSize=20', async () => {
    const { lookup } = await mount(makePatients(45));
    await searchFor('mẫu');

    fireEvent.click(next());
    await advance(0);
    expect(lookup.searches[1].query.get('page')).toBe('2');
    expect(lookup.searches[1].query.get('pageSize')).toBe('20');
    expect(resultRows()[0]).toHaveTextContent('Mẫu 021');
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();

    fireEvent.click(next());
    await advance(0);
    expect(lookup.searches[2].query.get('page')).toBe('3');
    expect(resultRows()).toHaveLength(5);
    expect(screen.getByText('Trang 3 / 3')).toBeInTheDocument();
    expect(next()).toBeDisabled();
    expect(previous()).toBeEnabled();

    fireEvent.click(previous());
    await advance(0);
    expect(lookup.searches[3].query.get('page')).toBe('2');
    expect(screen.getByText('45 kết quả')).toBeInTheDocument();
  });

  it('LK-55 Q19 đổi từ khoá khi đang ở trang 2 ⇒ gửi page=1', async () => {
    const { lookup } = await mount(makePatients(45));
    await searchFor('mẫu');
    fireEvent.click(next());
    await advance(0);
    expect(lookup.searches[1].query.get('page')).toBe('2');

    await searchFor('mẫu 0');
    expect(lookup.searches.at(-1)?.query.get('page')).toBe('1');
  });

  it('LK-56 Q19 đổi trang xong focus vào vùng danh sách (nút "Sau" có thể vừa bị vô hiệu)', async () => {
    await mount(makePatients(25));
    await searchFor('mẫu');
    fireEvent.click(next());
    await advance(0);

    expect(next()).toBeDisabled();
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'Kết quả tìm kiếm' }),
    );
  });

  it('LK-57 Q19 trang vượt cuối (dữ liệu bị xoá lúc đang xem): `items: []` mà `total` > 0 ⇒ tự về trang cuối còn dữ liệu, không lặp', async () => {
    const { lookup } = await mount(makePatients(45));
    await searchFor('mẫu');
    fireEvent.click(next());
    await advance(0);
    lookup.patients.length = 25; // người khác xoá 20 hồ sơ
    fireEvent.click(next()); // xin trang 3 của 25 bản ghi: trống, total = 25
    await advance(0);

    expect(lookup.searches.map((call) => call.query.get('page'))).toEqual([
      '1',
      '2',
      '3',
      '2',
    ]);
    expect(screen.getByText('Trang 2 / 2')).toBeInTheDocument();
    expect(resultRows()).toHaveLength(5);
    expect(screen.getByText('25 kết quả')).toBeInTheDocument();

    await advance(5_000);
    expect(lookup.searches).toHaveLength(4);
  });

  it('LK-58 Q19 phản hồi mâu thuẫn ở trang 1 (`items: []`, `total` > 0) ⇒ không lặp vô hạn, hiện "Không tìm thấy bệnh nhân"', async () => {
    const { lookup } = await renderLookupPage({
      before: ({ lookup: fake }) =>
        fake.failNext('search', () =>
          json(200, { items: [], total: 5, page: 1, pageSize: 20 }),
        ),
    });
    startFakeClock();
    await searchFor('mẫu');
    await advance(5_000);

    expect(lookup.searches).toHaveLength(1);
    expect(screen.getByText('Không tìm thấy bệnh nhân')).toBeInTheDocument();
  });

  it('LK-59 Q19 hai nút phân trang có vùng bấm cao tối thiểu 36 px (lớp min-h-[2.4rem] ở gốc 15 px)', async () => {
    await mount(makePatients(25));
    await searchFor('mẫu');

    expect(next().className).toContain('min-h-[2.4rem]');
    expect(previous().className).toContain('min-h-[2.4rem]');
  });

  it('LK-60 Q19 đang ở trang 2 mà ô tìm được xoá rồi gõ lại ⇒ về trạng thái đầu rồi trang 1', async () => {
    const { lookup } = await mount(makePatients(45));
    await searchFor('mẫu');
    fireEvent.click(next());
    await advance(0);
    typeSearch('');
    await advance(0);
    expect(searchBox()).toHaveValue('');
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang kết quả' }),
    ).toBeNull();

    await searchFor('mẫu');
    expect(lookup.searches.at(-1)?.query.get('page')).toBe('1');
  });
});
