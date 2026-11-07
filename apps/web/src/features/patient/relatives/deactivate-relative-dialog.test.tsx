import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StrictMode, useRef, useState } from 'react';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import { apiError } from '../../../test/fake-auth-api';
import { logout } from '../../auth';
import { getAuthState } from '../../auth/auth-store';
import { SYSTEM_MESSAGE } from '../profile/profile-errors';
import {
  SAMPLE_RELATIVES,
  hang,
  json,
  type FakeAppointment,
} from '../testing/fake-profile-api';
import { setUpApi } from '../testing/profile-page-harness';
import { DeactivateRelativeDialog } from './deactivate-relative-dialog';
import {
  BLOCKED_MESSAGE,
  DEACTIVATE_NETWORK_MESSAGE,
  DEACTIVATE_TIMEOUT_MESSAGE,
  DEACTIVATE_UNEXPECTED_MESSAGE,
  MISSING_MESSAGE,
} from './relative-errors';
import type { Relative } from './relatives-types';

// patient F7 (TRACKING F7-D, F7-E, F7-H): hộp xác nhận ngừng sử dụng, đứng riêng (nơi gọi là `Host` dưới đây), tích hợp với `useModalDialog`
// (không chép bài test của hook: chỉ kiểm hộp thoại dùng nó đúng). Mã ca DW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN 7.2 mà nó phủ.
const BICH = SAMPLE_RELATIVES[0] as Relative;
const TITLE = `Ngừng sử dụng hồ sơ ${BICH.hoTen}?`;
const SECRETS = /Nguyễn Thị Bích|Bác sĩ Mẫu|LH-0001|Chi nhánh Mẫu/;
const noop = () => undefined;
const sleep = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const LICH_1: FakeAppointment = {
  maLichHen: 'LH-0001',
  thoiGian: '2026-11-02T17:30:00.000Z',
  trangThai: 'DaXacNhan',
  bacSi: 'Bác sĩ Mẫu Một',
  chiNhanh: 'Chi nhánh Mẫu',
};
const LICH_2: FakeAppointment = {
  maLichHen: 'LH-0002',
  thoiGian: '2026-11-05T08:30:00.000Z',
  trangThai: 'ChoThanhToan',
  bacSi: 'Bác sĩ Mẫu Hai',
  chiNhanh: 'Chi nhánh Mẫu Hai',
};
const LICH_3: FakeAppointment = {
  maLichHen: 'LH-0003',
  thoiGian: '2026-11-06T01:00:00.000Z',
  trangThai: 'DaTiepDon',
  bacSi: 'Bác sĩ Mẫu Ba',
  chiNhanh: 'Chi nhánh Mẫu',
};

interface HostProps {
  onClose?: () => void;
  onDeactivated?: () => void;
  onReload?: (notice: string) => void;
}

// Nơi gọi giả: một nút mở (nhận lại focus), một vùng "nền" có nút, hộp thoại chỉ dựng khi mở như RelativeCard
function Host({
  onClose = noop,
  onDeactivated = noop,
  onReload = noop,
}: HostProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div>
        <button ref={trigger} type="button" onClick={() => setOpen(true)}>
          Mở hộp thoại
        </button>
        <button type="button">Nút ở nền</button>
      </div>
      {open && (
        <DeactivateRelativeDialog
          relative={BICH}
          returnFocusRef={trigger}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          onDeactivated={() => {
            setOpen(false);
            onDeactivated();
          }}
          onReload={(notice) => {
            setOpen(false);
            onReload(notice);
          }}
        />
      )}
    </>
  );
}

async function openDialog(props: HostProps = {}, strict = false) {
  const api = await setUpApi({}, SAMPLE_RELATIVES);
  const host = <Host {...props} />;
  const view = render(strict ? <StrictMode>{host}</StrictMode> : host);
  const trigger = screen.getByRole('button', { name: 'Mở hộp thoại' });
  fireEvent.click(trigger);
  const dialog = screen.getByRole('alertdialog');
  return { ...api, ...view, trigger, dialog };
}

const confirmIn = (dialog: HTMLElement) =>
  within(dialog).getByRole<HTMLButtonElement>('button', {
    name: /Ngừng sử dụng|Đang ngừng/,
  });
const cancelIn = (dialog: HTMLElement) =>
  within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Hủy' });
const requests = (profile: Awaited<ReturnType<typeof setUpApi>>['profile']) =>
  profile.relatives.requests.filter((r) => r.method === 'DEACTIVATE');
const inertChildren = () =>
  Array.from(document.body.children).filter((el) => el.hasAttribute('inert'));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const extra of document.body.querySelectorAll('[data-extra]')) {
    extra.remove();
  }
});

describe('mở hộp thoại (NT-23; Q10)', () => {
  it('DW-33 NT-23 role alertdialog có tên (tiêu đề với họ tên) và mô tả (hệ quả); focus đầu ở "Hủy"; chưa gọi API', async () => {
    const { dialog, profile } = await openDialog();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBe(dialog);
    expect(dialog).toHaveAccessibleDescription(
      /không còn dùng để đặt lịch hẹn mới.*Không thể sử dụng lại.*hồ sơ người thân mới.*không được lưu/,
    );
    expect(within(dialog).getAllByRole('button')).toHaveLength(2);
    expect(cancelIn(dialog)).toHaveFocus();
    expect(confirmIn(dialog)).toHaveTextContent('Ngừng sử dụng');
    expect(requests(profile)).toHaveLength(0);
  });

  const closers: [string, (dialog: HTMLElement) => void][] = [
    ['nút "Hủy"', (dialog) => fireEvent.click(cancelIn(dialog))],
    ['phím Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
    [
      'bấm vào nền mờ',
      (dialog) => fireEvent.click(dialog.parentElement as HTMLElement),
    ],
  ];

  it.each(closers)(
    'DW-34 NT-23 đóng bằng %s: chỉ ĐÓNG, KHÔNG gọi API, không onDeactivated, focus về nút mở',
    async (_label, close) => {
      const onClose = vi.fn();
      const onDeactivated = vi.fn();
      const { dialog, trigger, profile } = await openDialog({
        onClose,
        onDeactivated,
      });
      close(dialog);

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onDeactivated).not.toHaveBeenCalled();
      expect(trigger).toHaveFocus();
      await sleep(30);
      expect(requests(profile)).toHaveLength(0);
    },
  );

  it('DW-35 NT-23 bấm vào bên trong khung (không phải nền) KHÔNG đóng', async () => {
    const { dialog } = await openDialog();
    fireEvent.click(within(dialog).getByRole('heading', { name: TITLE }));
    fireEvent.click(dialog);
    expect(screen.getByRole('alertdialog')).toBe(dialog);
  });

  it('DW-36 NT-23 Tab bị bẫy trong hộp thoại: từ nút cuối đi về nút đầu, Shift+Tab từ nút đầu đi về nút cuối', async () => {
    const { dialog } = await openDialog();
    confirmIn(dialog).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancelIn(dialog)).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirmIn(dialog)).toHaveFocus();
  });
});

describe('nền inert và cuộn (NT-23; điều kiện duyệt F7)', () => {
  it('DW-37 NT-23 mở ⇒ mọi phần tử anh em ở body đều inert (hộp thoại thì không) và body không cuộn; đóng ⇒ gỡ hết, cuộn lại được', async () => {
    document.body.style.overflow = 'auto';
    const { dialog, container } = await openDialog();
    const overlay = dialog.parentElement as HTMLElement;

    expect(overlay.parentElement).toBe(document.body);
    expect(overlay).not.toHaveAttribute('inert');
    expect(container).toHaveAttribute('inert');
    expect(
      Array.from(document.body.children)
        .filter((el) => el !== overlay)
        .every((el) => el.hasAttribute('inert')),
    ).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(cancelIn(dialog));
    expect(inertChildren()).toHaveLength(0);
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('DW-38 NT-23 phần tử anh em đã inert SẴN từ trước phải còn inert sau khi đóng; phần tử bình thường thì được gỡ đúng', async () => {
    const before = document.createElement('div');
    before.setAttribute('data-extra', 'trước');
    before.setAttribute('inert', '');
    const plain = document.createElement('div');
    plain.setAttribute('data-extra', 'thường');
    document.body.append(before, plain);

    const { dialog, container } = await openDialog();
    expect(before).toHaveAttribute('inert');
    expect(plain).toHaveAttribute('inert');
    expect(container).toHaveAttribute('inert');

    fireEvent.click(cancelIn(dialog));
    expect(before).toHaveAttribute('inert');
    expect(plain).not.toHaveAttribute('inert');
    expect(container).not.toHaveAttribute('inert');
  });

  it('DW-39 NT-23 React StrictMode (gắn, gỡ, gắn lại): mở thì inert đủ, đóng thì không sót; mở lại lần hai vẫn đúng', async () => {
    const { dialog, container, trigger } = await openDialog({}, true);
    expect(container).toHaveAttribute('inert');
    fireEvent.click(cancelIn(dialog));
    expect(inertChildren()).toHaveLength(0);
    expect(document.body.style.overflow).not.toBe('hidden');

    fireEvent.click(trigger);
    const again = screen.getByRole('alertdialog');
    expect(container).toHaveAttribute('inert');
    fireEvent.click(cancelIn(again));
    expect(inertChildren()).toHaveLength(0);
    expect(trigger).toHaveFocus();
  });

  it('DW-40 NT-23 hộp thoại bị GỠ giữa chừng (thẻ biến mất vì tải lại): body không còn inert hay overflow hidden; không onDeactivated', async () => {
    const onDeactivated = vi.fn();
    const { rerender, container } = await openDialog({ onDeactivated });
    expect(container).toHaveAttribute('inert');

    // Nơi gọi biến mất (thẻ bị gỡ vì tải lại) trong lúc hộp thoại còn mở: không qua nút nào của hộp thoại
    rerender(<div />);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(inertChildren()).toHaveLength(0);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(onDeactivated).not.toHaveBeenCalled();
  });

  it.each([
    ['200', 200, { trangThaiHieuLuc: false }],
    ['502 (phản hồi lạ)', 502, {}],
    ['404 KHONG_TIM_THAY', 404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }],
    [
      '409 có lịch hẹn',
      409,
      {
        maLoi: 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
        thongBao: 'x',
        chiTiet: [LICH_1],
      },
    ],
  ])(
    'DW-41 NT-23 hộp thoại bị gỡ khi ĐANG gửi, rồi phản hồi %s về: không onDeactivated, không onReload, không lỗi chưa bắt, không inert sót',
    async (_label, status, body) => {
      const errorSpy = vi.spyOn(console, 'error');
      const onDeactivated = vi.fn();
      const onReload = vi.fn();
      const { profile, dialog, rerender } = await openDialog({
        onDeactivated,
        onReload,
      });
      const release = profile.relatives.hold('DEACTIVATE');
      fireEvent.click(confirmIn(dialog));
      await waitFor(() => expect(requests(profile)).toHaveLength(1));

      rerender(<div />);
      expect(inertChildren()).toHaveLength(0);
      expect(document.body.style.overflow).not.toBe('hidden');
      release(status, body);
      await sleep(30);

      expect(onDeactivated).not.toHaveBeenCalled();
      expect(onReload).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );
});

describe('xác nhận (NT-23)', () => {
  it('DW-42 NT-23 "Ngừng sử dụng" ⇒ đúng MỘT POST …/deactivate, KHÔNG thân, có Authorization; 200 ⇒ onDeactivated một lần, hồ sơ đã ngừng ở máy chủ giả', async () => {
    const onDeactivated = vi.fn();
    const { dialog, profile } = await openDialog({ onDeactivated });
    fireEvent.click(confirmIn(dialog));
    await waitFor(() => expect(onDeactivated).toHaveBeenCalledTimes(1));

    const [request] = requests(profile);
    expect(requests(profile)).toHaveLength(1);
    expect(request.httpMethod).toBe('POST');
    expect(request.path).toBe('/api/patient/relatives/1/deactivate');
    expect(request.rawBody).toBeUndefined();
    expect(request.headers.get('Authorization')).toMatch(/^Bearer .+/);
    expect(request.headers.has('Content-Type')).toBe(false);
    expect(profile.relatives.items[0].trangThaiHieuLuc).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(inertChildren()).toHaveLength(0);
  });

  it('DW-43 NT-23 bấm đúp ⇒ đúng MỘT POST (chống gửi đúp bằng ref)', async () => {
    const { dialog, profile } = await openDialog();
    const release = profile.relatives.hold('DEACTIVATE');
    const confirm = confirmIn(dialog);
    // Ba lần bấm TRONG MỘT act: React chưa kịp render lại nên nút chưa bị vô hiệu, chỉ cờ ref chặn được lần hai và ba
    // (bấm lần lượt từng act thì nút đã vô hiệu che mất ref; đột biến M17 của F7 từng sống sót vì vậy)
    act(() => {
      confirm.click();
      confirm.click();
      confirm.click();
    });
    await waitFor(() => expect(requests(profile)).toHaveLength(1));
    release(200, { trangThaiHieuLuc: false });
    await sleep(30);
    expect(requests(profile)).toHaveLength(1);
  });

  it('DW-44 NT-23 ĐANG gửi: hai nút vô hiệu, chữ "Đang ngừng…", aria-busy; Esc và bấm nền KHÔNG đóng; xong rồi mới đóng được', async () => {
    const onClose = vi.fn();
    const { dialog, profile } = await openDialog({ onClose });
    const release = profile.relatives.hold('DEACTIVATE');
    fireEvent.click(confirmIn(dialog));

    await waitFor(() => expect(cancelIn(dialog)).toBeDisabled());
    expect(confirmIn(dialog)).toBeDisabled();
    expect(confirmIn(dialog)).toHaveTextContent('Đang ngừng…');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    fireEvent.click(cancelIn(dialog));
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    expect(onClose).not.toHaveBeenCalled();

    release(200, { trangThaiHieuLuc: false });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('DW-45 NT-23 sau khi lỗi (mạng) thì hai nút bật lại và Esc đóng lại được', async () => {
    const onClose = vi.fn();
    const { dialog, profile } = await openDialog({ onClose });
    profile.relatives.failNext('DEACTIVATE', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(confirmIn(dialog));
    await within(dialog).findByRole('alert');

    expect(confirmIn(dialog)).toBeEnabled();
    expect(cancelIn(dialog)).toBeEnabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('409: lý do và danh sách lịch hẹn đang chặn (NT-23; Q11)', () => {
  async function openBlocked(
    list: FakeAppointment[] = [LICH_1, LICH_2, LICH_3],
  ) {
    const opened = await openDialog();
    opened.profile.relatives.blocking['1'] = list;
    fireEvent.click(confirmIn(opened.dialog));
    await within(opened.dialog).findByRole('list', {
      name: 'Lịch hẹn đang chặn',
    });
    return opened;
  }

  it('DW-46 NT-23 409 ⇒ KHÔNG đóng; đổi tiêu đề, lý do là câu 5.9, danh sách có tên; chỉ còn nút "Đóng"; focus vào tiêu đề; không onDeactivated', async () => {
    const onDeactivated = vi.fn();
    const onReload = vi.fn();
    const opened = await openDialog({ onDeactivated, onReload });
    opened.profile.relatives.blocking['1'] = [LICH_1, LICH_2, LICH_3];
    fireEvent.click(confirmIn(opened.dialog));
    const list = await within(opened.dialog).findByRole('list', {
      name: 'Lịch hẹn đang chặn',
    });

    expect(
      screen.getByRole('alertdialog', {
        name: `Chưa thể ngừng sử dụng hồ sơ ${BICH.hoTen}`,
      }),
    ).toBe(opened.dialog);
    expect(opened.dialog).toHaveAccessibleDescription(BLOCKED_MESSAGE);
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const buttons = within(opened.dialog).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Đóng']);
    expect(
      within(opened.dialog).getByRole('heading', { name: /Chưa thể ngừng/ }),
    ).toHaveFocus();
    expect(onDeactivated).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    expect(requests(opened.profile)).toHaveLength(1);
    expect(opened.profile.relatives.items[0].trangThaiHieuLuc).toBe(true);
  });

  it('DW-47 NT-23 từng lịch hiện đủ năm trường, đúng thứ tự máy chủ trả (không sắp lại), giờ Việt Nam dd/mm/yyyy HH:mm, nhãn trạng thái', async () => {
    // Máy chủ trả sẵn theo thời gian tăng dần; web giữ nguyên thứ tự, nên đặt một thứ tự lộn xộn để bắt bản tự sắp
    const { dialog } = await openBlocked([LICH_3, LICH_1, LICH_2]);
    const items = within(dialog).getAllByRole('listitem');
    const read = (item: HTMLElement) =>
      Object.fromEntries(
        Array.from(item.querySelectorAll('dt')).map((term) => [
          term.textContent,
          term.nextElementSibling?.textContent,
        ]),
      );

    expect(items.map((item) => read(item)['Mã lịch hẹn'])).toEqual([
      'LH-0003',
      'LH-0001',
      'LH-0002',
    ]);
    expect(read(items[1])).toEqual({
      'Mã lịch hẹn': 'LH-0001',
      'Thời gian': '03/11/2026 00:30',
      'Trạng thái': 'Đã xác nhận',
      'Bác sĩ': 'Bác sĩ Mẫu Một',
      'Chi nhánh': 'Chi nhánh Mẫu',
    });
    expect(read(items[2])['Trạng thái']).toBe('Chờ thanh toán');
    expect(read(items[2])['Thời gian']).toBe('05/11/2026 15:30');
    expect(read(items[0])['Trạng thái']).toBe('Đã tiếp đón');
  });

  it.each([
    'Asia/Ho_Chi_Minh',
    'UTC',
    'America/New_York',
    'Pacific/Kiritimati',
  ])(
    'DW-48 NT-23 giờ Việt Nam đúng dưới TZ=%s (lịch qua nửa đêm giờ Việt Nam là ngày kế tiếp)',
    async (zone) => {
      vi.stubEnv('TZ', zone);
      const { dialog } = await openBlocked([LICH_1]);
      expect(within(dialog).getByText('03/11/2026 00:30')).toBeInTheDocument();
    },
  );

  it('DW-49 NT-23 mã trạng thái lạ ⇒ "Chưa hoàn tất", không vỡ', async () => {
    const { dialog } = await openBlocked([{ ...LICH_1, trangThai: 'MaLa' }]);
    expect(within(dialog).getByText('Chưa hoàn tất')).toBeInTheDocument();
  });

  it('DW-50 NT-23 KHÔNG hiện thongBao của máy chủ và không hiện khoá nào ngoài năm khoá (mã nội bộ, khoá lạ)', async () => {
    const opened = await openDialog();
    opened.profile.relatives.failNext('DEACTIVATE', () =>
      json(409, {
        maLoi: 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
        thongBao: 'câu của API',
        chiTiet: [
          {
            ...LICH_1,
            lichHenId: '987654321',
            benhNhanId: '555',
            lyDo: 'đau đầu',
          },
        ],
      }),
    );
    fireEvent.click(confirmIn(opened.dialog));
    await within(opened.dialog).findByRole('list', {
      name: 'Lịch hẹn đang chặn',
    });

    expect(opened.dialog.textContent).not.toMatch(
      /câu của API|987654321|555|đau đầu/,
    );
    expect(opened.dialog).toHaveTextContent(BLOCKED_MESSAGE);
  });

  it('DW-51 NT-23 "Đóng" sau 409 chỉ đóng: focus về nút mở, không gọi API thêm, nền hết inert', async () => {
    const onClose = vi.fn();
    const opened = await openDialog({ onClose });
    opened.profile.relatives.blocking['1'] = [LICH_1];
    fireEvent.click(confirmIn(opened.dialog));
    await within(opened.dialog).findByRole('list', {
      name: 'Lịch hẹn đang chặn',
    });
    fireEvent.click(
      within(opened.dialog).getByRole('button', { name: 'Đóng' }),
    );

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opened.trigger).toHaveFocus();
    expect(inertChildren()).toHaveLength(0);
    expect(requests(opened.profile)).toHaveLength(1);
  });

  it('DW-52 NT-23 Esc ở pha 409 cũng chỉ đóng', async () => {
    const onClose = vi.fn();
    const opened = await openDialog({ onClose });
    opened.profile.relatives.blocking['1'] = [LICH_1];
    fireEvent.click(confirmIn(opened.dialog));
    await within(opened.dialog).findByRole('list', {
      name: 'Lịch hẹn đang chặn',
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('DW-53 NT-23 danh sách rất dài vẫn là một danh sách có tên, đủ phần tử', async () => {
    const many = Array.from({ length: 15 }, (_v, i) => ({
      ...LICH_1,
      maLichHen: `LH-${String(i + 1).padStart(4, '0')}`,
      bacSi: `Bác sĩ có tên rất dài ${'Nguyễn '.repeat(12)}${i}`,
      chiNhanh: `Chi nhánh có tên rất dài ${'Phường '.repeat(12)}${i}`,
    }));
    const { dialog } = await openBlocked(many);
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(15);
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeVisible();
  });
});

describe('404, lỗi mạng, quá giờ, phản hồi lạ, 500 (NT-23)', () => {
  it('DW-54 NT-23 404 KHONG_TIM_THAY ⇒ onReload(câu "không còn tồn tại") một lần, không onDeactivated, hộp thoại do nơi gọi đóng', async () => {
    const onReload = vi.fn();
    const onDeactivated = vi.fn();
    const { dialog, profile } = await openDialog({ onReload, onDeactivated });
    profile.relatives.items.length = 0;
    fireEvent.click(confirmIn(dialog));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));

    expect(onReload).toHaveBeenCalledWith(MISSING_MESSAGE);
    expect(onDeactivated).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  const failures: [string, () => Response, string][] = [
    [
      'mất mạng',
      () => {
        throw new TypeError('Failed to fetch');
      },
      DEACTIVATE_NETWORK_MESSAGE,
    ],
    [
      '502 HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      DEACTIVATE_UNEXPECTED_MESSAGE,
    ],
    [
      '200 sai thân',
      () => json(200, { ok: true }),
      DEACTIVATE_UNEXPECTED_MESSAGE,
    ],
    [
      '409 chiTiet sai hình dạng',
      () =>
        json(409, {
          maLoi: 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
          thongBao: 'câu của API',
          chiTiet: [],
        }),
      DEACTIVATE_UNEXPECTED_MESSAGE,
    ],
    [
      '500 LOI_HE_THONG',
      () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      SYSTEM_MESSAGE,
    ],
    [
      '403 mã khác',
      () => apiError(403, 'KHONG_DU_QUYEN'),
      GENERIC_ERROR_MESSAGE,
    ],
  ];

  it.each(failures)(
    'DW-55 NT-23 %s ⇒ câu đúng trong hộp cảnh báo ở hộp thoại, focus vào hộp cảnh báo, KHÔNG tự gửi lại; idempotent nên bấm lại ⇒ lời gọi thứ hai và thành công',
    async (_label, failure, message) => {
      const onDeactivated = vi.fn();
      const { dialog, profile } = await openDialog({ onDeactivated });
      profile.relatives.failNext('DEACTIVATE', failure);
      fireEvent.click(confirmIn(dialog));

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      expect(within(alert).queryByRole('button')).toBeNull();
      expect(confirmIn(dialog)).toBeEnabled();
      await sleep(50);
      expect(requests(profile)).toHaveLength(1);

      fireEvent.click(confirmIn(dialog));
      await waitFor(() => expect(onDeactivated).toHaveBeenCalledTimes(1));
      expect(requests(profile)).toHaveLength(2);
    },
  );

  it('DW-56 NT-23 quá giờ 15 giây ⇒ câu quá giờ (chưa rõ), không tự gửi lại sau 60 giây, bấm lại được', async () => {
    const { dialog, profile } = await openDialog();
    vi.useFakeTimers();
    profile.relatives.failNext('DEACTIVATE', (init) => hang(init));
    fireEvent.click(confirmIn(dialog));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      DEACTIVATE_TIMEOUT_MESSAGE,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(requests(profile)).toHaveLength(1);
    expect(confirmIn(dialog)).toBeEnabled();
  });

  it('DW-57 NT-23 câu "mất mạng" nói chưa rõ và "bấm lại là an toàn", KHÔNG nói chưa ngừng', async () => {
    const { dialog, profile } = await openDialog();
    profile.relatives.failNext('DEACTIVATE', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(confirmIn(dialog));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('chưa rõ hồ sơ đã được ngừng hay chưa');
    expect(alert).toHaveTextContent('không gây hại');
    expect(alert.textContent).not.toMatch(/chưa được ngừng|không ngừng được/);
  });

  it('DW-58 NT-23 sau lỗi rồi thử lại thành công ⇒ hộp cảnh báo cũ biến mất khi bấm lại (trong lúc gửi)', async () => {
    const { dialog, profile } = await openDialog();
    profile.relatives.failNext('DEACTIVATE', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(confirmIn(dialog));
    await within(dialog).findByRole('alert');
    const release = profile.relatives.hold('DEACTIVATE');
    fireEvent.click(confirmIn(dialog));
    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
    release(409, {
      maLoi: 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
      thongBao: 'x',
      chiTiet: [LICH_1],
    });
    await within(dialog).findByRole('list', { name: 'Lịch hẹn đang chặn' });
  });

  it('DW-59 NT-23 đăng xuất giữa lúc gửi (client huỷ) ⇒ không hộp cảnh báo, không onDeactivated, không lỗi chưa bắt', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const onDeactivated = vi.fn();
    const { dialog, profile } = await openDialog({ onDeactivated });
    profile.relatives.failNext('DEACTIVATE', (init) => hang(init));
    fireEvent.click(confirmIn(dialog));
    await waitFor(() => expect(confirmIn(dialog)).toBeDisabled());

    await act(async () => {
      await logout();
    });
    expect(getAuthState().status).toBe('unauthenticated');
    await waitFor(() => expect(confirmIn(dialog)).toBeEnabled());
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(onDeactivated).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('DW-60 NT-23 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, hộp thoại không hiện câu lỗi, không gửi lại', async () => {
    const { dialog, profile } = await openDialog();
    profile.relatives.failNext('DEACTIVATE', () =>
      json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
    );
    fireEvent.click(confirmIn(dialog));
    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    await waitFor(() => expect(confirmIn(dialog)).toBeEnabled());
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(requests(profile)).toHaveLength(1);
  });
});

describe('riêng tư (NT-23)', () => {
  it('DW-61 NT-23 mọi luồng (200, 409, 404, mạng, 500) không gọi console.*; họ tên, bác sĩ, mã lịch hẹn không lọt vào URL, lịch sử hay kho trình duyệt', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { dialog, profile } = await openDialog();
    profile.relatives.failNext('DEACTIVATE', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(confirmIn(dialog));
    await within(dialog).findByRole('alert');
    profile.relatives.failNext('DEACTIVATE', () =>
      json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    );
    fireEvent.click(confirmIn(dialog));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        SYSTEM_MESSAGE,
      ),
    );
    profile.relatives.blocking['1'] = [LICH_1];
    fireEvent.click(confirmIn(dialog));
    await within(dialog).findByRole('list', { name: 'Lịch hẹn đang chặn' });

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    const where = [
      window.location.href,
      document.title,
      JSON.stringify(window.history.state),
      JSON.stringify({ ...window.localStorage }),
      JSON.stringify({ ...window.sessionStorage }),
      ...profile.relatives.requests.map(
        (r) => `${r.path} ${JSON.stringify(r.body)}`,
      ),
    ].join('\n');
    expect(where).not.toMatch(SECRETS);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
