import { act, fireEvent, screen, within } from '@testing-library/react';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import { apiError } from '../../../test/fake-auth-api';
import {
  BIG_ID,
  PATIENT_BIG,
  PATIENT_HUNG,
  PATIENT_MAI,
  RELATIVE_CON,
  SAMPLE_PATIENTS,
  hang,
  json,
  makePatients,
  type FakePatient,
} from '../testing/fake-lookup-api';
import {
  advance,
  nextTick,
  renderLookupPage,
  resultRow,
  resultRows,
  searchBox,
  searchFor,
  typeSearch,
  startFakeClock,
} from '../testing/lookup-harness';

// patient F8 (TRACKING F8-G, F8-I): bảng hồ sơ một bệnh nhân (Figma `485:2`) và tải chi tiết. Mã ca LK-nn là [đề xuất]; mỗi ca ghi mã TC-17,
// Q18 (trường trả về, không "Lịch sử lịch hẹn", không mã nội bộ) và Q22. Dữ liệu giả đuôi `.invalid`.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(patients: FakePatient[] = SAMPLE_PATIENTS) {
  const api = await renderLookupPage({ patients });
  startFakeClock();
  await searchFor('example');
  return api;
}

async function open(name: string | RegExp) {
  fireEvent.click(resultRow(name));
  await advance(0);
}

const detailRegion = () =>
  screen.getByRole('region', { name: 'Hồ sơ bệnh nhân' });
// Giá trị của một ô (`dd` ngay sau `dt`), tìm theo nhãn
const cell = (label: string) =>
  within(detailRegion()).getByText(label, { selector: 'dt' }).nextElementSibling
    ?.textContent;

describe('chọn một bệnh nhân (TC-17, 485:2)', () => {
  it('LK-61 TC-17 chưa chọn ⇒ KHÔNG gọi chi tiết; chọn ⇒ đúng MỘT GET /api/reception/patients/3 có Authorization, không query', async () => {
    const { lookup } = await mount();
    expect(lookup.details).toHaveLength(0);

    await open(/Đặng Văn Hùng/);
    expect(lookup.details).toHaveLength(1);
    const call = lookup.details[0];
    expect(call.path).toBe('/api/reception/patients/3');
    expect(call.headers.get('Authorization')).toMatch(/^Bearer tok-/);
    expect(Array.from(call.query.keys())).toEqual([]);

    // chọn lại đúng hàng đó: không gọi thêm
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);
    expect(lookup.details).toHaveLength(1);
  });

  it('LK-62 Q18 id lớn hơn 2^53 đi NGUYÊN VẸN trong đường dẫn (không qua Number)', async () => {
    const { lookup } = await mount();
    await open(/Nguyễn Văn A/);

    expect(lookup.details[0].path).toBe(`/api/reception/patients/${BIG_ID}`);
    expect(String(Number(BIG_ID))).not.toBe(BIG_ID);
    expect(
      within(detailRegion()).getByRole('heading', {
        level: 2,
        name: 'Nguyễn Văn A',
      }),
    ).toBeInTheDocument();
  });

  it('LK-63 TC-17 Q18 hồ sơ đủ trường: h2 họ tên, bảy nhãn đúng thứ tự Figma, giá trị đúng định dạng', async () => {
    await mount();
    await open(/Đặng Văn Hùng/);

    expect(
      within(detailRegion()).getByRole('heading', {
        level: 2,
        name: 'Đặng Văn Hùng',
      }),
    ).toBeInTheDocument();
    const labels = Array.from(
      detailRegion().querySelectorAll('dt'),
      (term) => term.textContent,
    );
    expect(labels).toEqual([
      'Số điện thoại',
      'Email',
      'Giới tính',
      'Ngày sinh',
      'Địa chỉ',
      'Ngày tạo tài khoản',
      'Số lần vắng khám',
    ]);
    expect(cell('Số điện thoại')).toBe('0901234567');
    expect(cell('Email')).toBe('hung@example.invalid');
    expect(cell('Giới tính')).toBe('Nam');
    expect(cell('Ngày sinh')).toBe('20/02/1985');
    expect(cell('Địa chỉ')).toBe('12 Đường Giả, Quận Giả');
    expect(cell('Số lần vắng khám')).toBe('2 lần');
  });

  it('LK-64 Q18 H4 Ngày tạo tài khoản theo NGÀY giờ Việt Nam: 2026-11-07T17:30:00.000Z ⇒ 08/11/2026 (không cắt chuỗi ra 07/11); biên 16:59:59.999Z ⇒ 07/11/2026', async () => {
    await mount([
      PATIENT_HUNG,
      {
        ...PATIENT_BIG,
        detail: {
          ...PATIENT_BIG.detail,
          thoiDiemTao: '2026-11-07T16:59:59.999Z',
        },
      },
    ]);
    await open(/Đặng Văn Hùng/);
    expect(cell('Ngày tạo tài khoản')).toBe('08/11/2026');

    await open(/Nguyễn Văn A/);
    expect(cell('Ngày tạo tài khoản')).toBe('07/11/2026');
  });

  it('LK-65 Q18 KHÔNG có "Lịch sử lịch hẹn", mã nội bộ "u1" hay mã tài khoản ở bảng hồ sơ', async () => {
    await mount();
    await open(/Nguyễn Văn A/);

    const text = detailRegion().textContent ?? '';
    expect(text).not.toMatch(/Lịch sử lịch hẹn|Tổng lịch|Sắp khám|Hoàn thành/);
    expect(text).not.toContain('u1');
    expect(text).not.toContain(BIG_ID);
    expect(detailRegion().innerHTML).not.toContain(BIG_ID);
  });

  it('LK-66 Q18 trường trống (`null`) ⇒ "Chưa cập nhật" cho giới tính, ngày sinh, địa chỉ; "0 lần"', async () => {
    await mount();
    await open(/Lê Thị Mai/);

    expect(cell('Giới tính')).toBe('Chưa cập nhật');
    expect(cell('Ngày sinh')).toBe('Chưa cập nhật');
    expect(cell('Địa chỉ')).toBe('Chưa cập nhật');
    expect(cell('Số lần vắng khám')).toBe('0 lần');
    expect(cell('Số điện thoại')).toBe('0912345678');
  });

  it('LK-67 Q18 tài khoản ngừng ⇒ nhãn "Ngừng hoạt động" ở thẻ hồ sơ; tài khoản đang hoạt động không có nhãn', async () => {
    await mount();
    await open(/Lê Thị Mai/);
    expect(
      within(detailRegion()).getByText('Ngừng hoạt động'),
    ).toBeInTheDocument();

    await open(/Đặng Văn Hùng/);
    expect(within(detailRegion()).queryByText('Ngừng hoạt động')).toBeNull();
  });

  it('LK-68 Q18 mã lạ (`trangThai`, `gioiTinh`, `moiQuanHe`) không làm vỡ trang: "Chưa cập nhật", không nhãn', async () => {
    await mount([
      {
        ...PATIENT_HUNG,
        detail: {
          ...PATIENT_HUNG.detail,
          trangThai: 'MaLa',
          gioiTinh: 'MaLa',
          nguoiThan: [{ ...RELATIVE_CON, moiQuanHe: 'MaLa', gioiTinh: 'MaLa' }],
        },
      },
    ]);
    await open(/Đặng Văn Hùng/);

    expect(cell('Giới tính')).toBe('Chưa cập nhật');
    expect(within(detailRegion()).queryByText('Ngừng hoạt động')).toBeNull();
    const relative = within(detailRegion())
      .getByText('Nguyễn Thị Con')
      .closest('li');
    expect(relative).toHaveTextContent('Chưa cập nhật');
    expect(relative).not.toHaveTextContent('Nữ');
    expect(relative).toHaveTextContent('NS: 04/03/2018');
  });
});

describe('người thân liên kết (TC-17, Q18)', () => {
  it('LK-69 Q18 hai người thân (đang dùng rồi đã ngừng): "2 người", họ tên, quan hệ, giới tính, "NS: dd/mm/yyyy", SĐT; chỉ hồ sơ đã ngừng có "Ngừng sử dụng"', async () => {
    await mount();
    await open(/Đặng Văn Hùng/);

    const card = within(detailRegion()).getByRole('region', {
      name: 'Người thân liên kết',
    });
    expect(within(card).getByText('2 người')).toBeInTheDocument();
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(items[0]).toHaveTextContent('Nguyễn Thị Con');
    expect(items[0]).toHaveTextContent('Con');
    expect(items[0]).toHaveTextContent('Nữ');
    expect(items[0]).toHaveTextContent('NS: 04/03/2018');
    expect(items[0]).toHaveTextContent('0911222333');
    expect(items[0]).not.toHaveTextContent('Ngừng sử dụng');

    expect(items[1]).toHaveTextContent('Trần Văn Cha');
    expect(items[1]).toHaveTextContent('Cha');
    expect(items[1]).toHaveTextContent('Nam');
    expect(items[1]).toHaveTextContent('NS: 31/12/1960');
    expect(items[1]).toHaveTextContent('Ngừng sử dụng');
    // SĐT null ⇒ mảnh bị bỏ, không chèn "Chưa cập nhật" vào dòng phụ
    expect(items[1]).not.toHaveTextContent('Chưa cập nhật');
  });

  it('LK-70 Q18 không có người thân ⇒ "0 người" và "Chưa có hồ sơ người thân."', async () => {
    await mount();
    await open(/Lê Thị Mai/);

    expect(within(detailRegion()).getByText('0 người')).toBeInTheDocument();
    expect(
      within(detailRegion()).getByText('Chưa có hồ sơ người thân.'),
    ).toBeInTheDocument();
    expect(within(detailRegion()).queryByRole('list')).toBeNull();
  });

  it('LK-71 Q18 `key` là chỉ số mảng: hai người thân TRÙNG họ tên và quan hệ vẫn hiện đủ, không cảnh báo React về `key`', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount([
      {
        ...PATIENT_HUNG,
        detail: {
          ...PATIENT_HUNG.detail,
          nguoiThan: [RELATIVE_CON, { ...RELATIVE_CON, soDienThoai: null }],
        },
      },
    ]);
    await open(/Đặng Văn Hùng/);

    const card = within(detailRegion()).getByRole('region', {
      name: 'Người thân liên kết',
    });
    expect(within(card).getAllByRole('listitem')).toHaveLength(2);
    const keyWarnings = errors.mock.calls.filter((call) =>
      String(call[0]).includes('key'),
    );
    expect(keyWarnings).toHaveLength(0);
  });
});

describe('đang tải, chọn nhanh, lỗi (Q22)', () => {
  it('LK-72 Q22 đang tải hồ sơ ⇒ "Đang tải hồ sơ..." trong vùng status và vùng hồ sơ aria-busy; xong thì hết', async () => {
    const { lookup } = await mount();
    const release = lookup.hold('detail');
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);

    expect(
      screen.getByText('Đang tải hồ sơ...').closest('[role="status"]'),
    ).not.toBeNull();
    expect(detailRegion()).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      release(200, PATIENT_HUNG.detail);
      await nextTick();
    });
    expect(screen.queryByText('Đang tải hồ sơ...')).toBeNull();
    expect(detailRegion()).toHaveAttribute('aria-busy', 'false');
    expect(cell('Email')).toBe('hung@example.invalid');
  });

  it('LK-73 TC-18 chọn nhanh hai người ⇒ yêu cầu cũ bị huỷ và hồ sơ cũ về SAU không đè hồ sơ mới (chỉ hồ sơ sau còn lại)', async () => {
    const { lookup } = await mount();
    const releaseFirst = lookup.hold('detail');
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);
    fireEvent.click(resultRow(/Lê Thị Mai/));
    await advance(0);

    expect(lookup.details).toHaveLength(2);
    expect(lookup.details[0].signal?.aborted).toBe(true);
    expect(
      within(detailRegion()).getByRole('heading', {
        level: 2,
        name: 'Lê Thị Mai',
      }),
    ).toBeInTheDocument();

    // hồ sơ của người trước về muộn (promise treo không nghe huỷ)
    await act(async () => {
      releaseFirst(200, PATIENT_HUNG.detail);
      await nextTick();
    });
    expect(
      within(detailRegion()).getByRole('heading', {
        level: 2,
        name: 'Lê Thị Mai',
      }),
    ).toBeInTheDocument();
    expect(within(detailRegion()).queryByText('Đặng Văn Hùng')).toBeNull();
  });

  it('LK-74 Q22 404 KHONG_TIM_THAY ⇒ "Không tìm thấy bệnh nhân." KHÔNG có "Thử lại"; danh sách bên trái giữ nguyên', async () => {
    const { lookup } = await mount();
    lookup.failNext('detail', () => apiError(404, 'KHONG_TIM_THAY'));
    await open(/Đặng Văn Hùng/);

    expect(within(detailRegion()).getByRole('alert')).toHaveTextContent(
      'Không tìm thấy bệnh nhân.',
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(resultRows()).toHaveLength(3);
    expect(lookup.details).toHaveLength(1);

    // chọn người khác thay thế câu lỗi
    await open(/Lê Thị Mai/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(cell('Số điện thoại')).toBe('0912345678');
  });

  it('LK-75 Q22 lỗi 500 ở chi tiết ⇒ câu chung + "Thử lại"; bấm chạy lại ĐÚNG yêu cầu chi tiết (không tìm lại danh sách) và hiện hồ sơ', async () => {
    const { lookup } = await mount();
    lookup.failNext('detail', () =>
      json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    );
    await open(/Đặng Văn Hùng/);
    expect(within(detailRegion()).getByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    await advance(10_000);
    expect(lookup.details).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await advance(0);
    expect(lookup.details).toHaveLength(2);
    expect(lookup.details[1].path).toBe('/api/reception/patients/3');
    expect(lookup.searches).toHaveLength(1);
    expect(cell('Email')).toBe('hung@example.invalid');
  });

  it('LK-76 Q22 mất mạng và quá giờ ở chi tiết ⇒ câu tương ứng + "Thử lại"', async () => {
    const { lookup } = await mount();
    lookup.failNext('detail', () => {
      throw new TypeError('Failed to fetch');
    });
    await open(/Đặng Văn Hùng/);
    expect(within(detailRegion()).getByRole('alert')).toHaveTextContent(
      NETWORK_ERROR_MESSAGE,
    );

    lookup.failNext('detail', (init) => hang(init));
    await open(/Lê Thị Mai/);
    await advance(15_000);
    expect(within(detailRegion()).getByRole('alert')).toHaveTextContent(
      TIMEOUT_ERROR_MESSAGE,
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });
});

describe('từ khoá đổi trong lúc đang xem hồ sơ (Q18, F8-G)', () => {
  it('LK-77 TC-17 từ khoá mới BẮT ĐẦU TÌM ⇒ bỏ chọn: bảng giữ trong lúc gõ và trong 300 ms chờ, rồi về "Chọn một bệnh nhân để xem hồ sơ"', async () => {
    const { lookup } = await mount();
    await open(/Đặng Văn Hùng/);
    expect(lookup.details).toHaveLength(1);

    typeSearch('mai');
    await advance(299);
    expect(cell('Email')).toBe('hung@example.invalid');

    await advance(1);
    expect(
      screen.getByText('Chọn một bệnh nhân để xem hồ sơ'),
    ).toBeInTheDocument();
    expect(within(detailRegion()).queryByText('Đặng Văn Hùng')).toBeNull();
    expect(lookup.details).toHaveLength(1);
    expect(resultRows().some((row) => row.hasAttribute('aria-current'))).toBe(
      false,
    );
  });

  it('LK-78 TC-17 ô xuống dưới 2 ký tự ⇒ bỏ chọn NGAY', async () => {
    await mount();
    await open(/Đặng Văn Hùng/);

    typeSearch('m');
    await advance(0);
    expect(
      screen.getByText('Chọn một bệnh nhân để xem hồ sơ'),
    ).toBeInTheDocument();
    expect(screen.queryByText('hung@example.invalid')).toBeNull();
  });

  it('LK-79 TC-17 đổi TRANG của cùng từ khoá giữ hồ sơ đang chọn; về trang có hàng đó thì hàng lại được đánh dấu', async () => {
    const { lookup } = await renderLookupPage({ patients: makePatients(45) });
    startFakeClock();
    await searchFor('mẫu');
    await open(/Mẫu 001/);
    expect(lookup.details).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await advance(0);
    expect(cell('Email')).toBe('mau001@example.invalid');
    expect(resultRows().some((row) => row.hasAttribute('aria-current'))).toBe(
      false,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    await advance(0);
    expect(resultRow(/Mẫu 001/)).toHaveAttribute('aria-current', 'true');
    expect(lookup.details).toHaveLength(1);
  });

  it('LK-80 TC-17 Enter làm mới (từ khoá chưa đổi) giữ hồ sơ đang chọn và không tải lại chi tiết', async () => {
    const { lookup } = await mount();
    await open(/Đặng Văn Hùng/);

    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await advance(0);
    expect(lookup.searches).toHaveLength(2);
    expect(lookup.details).toHaveLength(1);
    expect(cell('Email')).toBe('hung@example.invalid');
    expect(resultRow(/Đặng Văn Hùng/)).toHaveAttribute('aria-current', 'true');
  });
});

describe('dùng lại danh sách bệnh nhân mẫu', () => {
  it('LK-81 TC-17 mẫu có Mai là tài khoản ngừng: hàng cũng có nhãn "Ngừng hoạt động" (nhất quán với bảng hồ sơ)', async () => {
    await mount([PATIENT_MAI]);
    expect(resultRows()[0]).toHaveTextContent('Ngừng hoạt động');
    await open(/Lê Thị Mai/);
    expect(
      within(detailRegion()).getByText('Ngừng hoạt động'),
    ).toBeInTheDocument();
  });
});
