import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModalDialogOptions } from '../../../../../shared/hooks/use-modal-dialog';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import { makeReceptionDetail } from '../../../testing/fake-reception-api';
import {
  cleanUpReceptionPage,
  currentUrl,
  openReceptionDetail,
  RECEPTION_CODE,
} from '../../../testing/reception-harness';
import { receptionAppointmentDetailPath } from '../../../../../shared/routes/booking-paths';
import { ACTION_TEXT, DETAIL_TEXT } from './detail-messages';

// booking F12b: hộp thao tác là modal DUY NHẤT của trang chi tiết (F9: MODAL LỒNG MODAL, hộp chồng lên ngăn; TRACKING 3.30 F9-K; F12b: TRACKING 3.44 F12b-D). Mã UIF-15 là [đề xuất] (PLAN booking mục 7.48); giữ mã LTA-15 của F9
// cho các hành vi không đổi. Khoá: Esc đóng đúng MỘT lớp (hộp; trang không phải lớp), Tab bị bẫy trong hộp, `inert` gỡ đúng phần đã đặt, tiêu điểm về đúng nút đã mở (nút biến mất thì về h1), và MỘT hộp chỉ dùng MỘT
// ref object ổn định cho `useModalDialog`. Mỗi hộp tự gọi MỘT `useModalDialog` (F9: ngăn gọi MỘT hook và đổi phần tử bẫy; xem `cancel-dialog.tsx`, `no-show-dialog.tsx`).

// Bọc `useModalDialog` THẬT để ghi lại danh tính của `dialogRef` ở mỗi lần vẽ: hook phụ thuộc `[open, dialogRef, initialFocusRef, returnFocusRef]`, nên đổi danh tính trong lúc hộp mở sẽ chạy lại
// cleanup (trả focus về nút mở, gỡ khoá cuộn) rồi `initialFocusRef.focus()` lại. Ba ref bên dưới phải ổn định suốt một lần mở hộp.
const seen = vi.hoisted(() => ({
  options: [] as Array<{
    dialogRef: unknown;
    initialFocusRef: unknown;
    returnFocusRef: unknown;
  }>,
}));
vi.mock('../../../../../shared/hooks/use-modal-dialog', async (original) => {
  const actual =
    await original<
      typeof import('../../../../../shared/hooks/use-modal-dialog')
    >();
  return {
    ...actual,
    useModalDialog: (options: ModalDialogOptions) => {
      seen.options.push({
        dialogRef: options.dialogRef,
        initialFocusRef: options.initialFocusRef,
        returnFocusRef: options.returnFocusRef,
      });
      actual.useModalDialog(options);
    },
  };
});

afterEach(() => {
  cleanUpReceptionPage();
  seen.options.length = 0;
});

const ALL = {
  chuyenDuoc: ['DaHuy', 'DaTiepDon', 'VangMat'],
  conPhaiThu: '0.00',
};
const inPage = (page: HTMLElement, name: string) =>
  within(page).getByRole('button', { name });
const press = (key: string, shiftKey = false) =>
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key,
    shiftKey,
  });
const cancelBox = () =>
  screen.queryByRole('dialog', { name: ACTION_TEXT.cancel.title });
const noShowBox = () =>
  screen.queryByRole('dialog', { name: ACTION_TEXT.noShow.title });
const reason = (box: HTMLElement) =>
  within(box).getByRole('textbox', { name: ACTION_TEXT.cancel.reasonLabel });
// Trang vẫn ở lại (h1 còn đó) và URL vẫn là trang chi tiết
const pageStays = () => {
  expect(
    screen.getByRole('heading', { level: 1, name: DETAIL_TEXT.title }),
  ).toBeInTheDocument();
  expect(currentUrl()).toBe(receptionAppointmentDetailPath(RECEPTION_CODE));
};

async function openCancel() {
  const view = await openReceptionDetail(ALL);
  const trigger = inPage(view.page, 'Hủy lịch');
  fireEvent.click(trigger);
  const box = await screen.findByRole('dialog', {
    name: ACTION_TEXT.cancel.title,
  });
  return { ...view, box, trigger };
}

describe('Esc đóng đúng MỘT lớp (hộp)', () => {
  it('UIF-15 LTA-15 hộp mở: Esc đóng RIÊNG hộp, trang còn nguyên; Esc lần hai không đóng gì (trang không phải lớp hộp thoại); luôn đúng MỘT dialog khi hộp mở', async () => {
    await openCancel();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    press('Escape');
    await waitFor(() => expect(cancelBox()).toBeNull());
    pageStays();

    press('Escape');
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    pageStays();
  });

  it('UIF-15 LTA-15 mở hộp, Esc, mở lại hộp, Esc, mở hộp khác, Esc: mỗi Esc đóng đúng hộp, trang luôn còn', async () => {
    const { page } = await openCancel();
    for (const open of ['Hủy lịch', 'Vắng mặt', 'Hủy lịch']) {
      press('Escape');
      await waitFor(() =>
        expect(screen.queryAllByRole('dialog')).toHaveLength(0),
      );
      pageStays();
      fireEvent.click(inPage(page, open));
      await waitFor(() =>
        expect(screen.queryAllByRole('dialog')).toHaveLength(1),
      );
    }
    expect(cancelBox()).toBeInTheDocument();
    press('Escape');
    await waitFor(() => expect(cancelBox()).toBeNull());
    pageStays();
  });

  it('LTA-15 bấm lớp phủ của HỘP chỉ đóng hộp, trang còn nguyên', async () => {
    const { box } = await openCancel();
    fireEvent.click(box.parentElement as HTMLElement);
    await waitFor(() => expect(cancelBox()).toBeNull());
    pageStays();
  });
});

describe('Tab bị bẫy trong hộp', () => {
  it('LTA-15 hộp huỷ: từ nút cuối Tab về ô lý do, Shift+Tab từ ô lý do về nút cuối; thứ tự ô lý do, `Đóng`, `Xác nhận hủy`', async () => {
    const { box } = await openCancel();
    const field = reason(box);
    const close = within(box).getByRole('button', {
      name: ACTION_TEXT.cancel.close,
    });
    const confirm = within(box).getByRole('button', {
      name: ACTION_TEXT.cancel.confirm,
    });
    expect(field).toHaveFocus();

    press('Tab', true);
    expect(confirm).toHaveFocus();
    press('Tab');
    expect(field).toHaveFocus();
    // Giữa chừng Tab để trình duyệt tự đi (không có bẫy can thiệp): chỉ biên mới bị chặn
    close.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
      bubbles: true,
    });
    close.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('LTA-15 tiêu điểm đang ở NGOÀI hộp (ví dụ nút của trang) thì Tab kéo về trong hộp, không rơi về trang', async () => {
    const { box, page } = await openCancel();
    inPage(page, 'Vắng mặt').focus();
    press('Tab');
    expect(box.contains(document.activeElement)).toBe(true);
    expect(reason(box)).toHaveFocus();
    inPage(page, 'Vắng mặt').focus();
    press('Tab', true);
    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.confirm }),
    ).toHaveFocus();
  });

  it('LTA-15 hộp vắng mặt: `Hủy` và `Xác nhận` là hai điểm dừng, `Hủy` nhận tiêu điểm đầu tiên, Tab và Shift+Tab xoay vòng trong hộp', async () => {
    const view = await openReceptionDetail(ALL);
    fireEvent.click(inPage(view.page, 'Vắng mặt'));
    const box = await screen.findByRole('dialog', {
      name: ACTION_TEXT.noShow.title,
    });
    const keep = within(box).getByRole('button', {
      name: ACTION_TEXT.noShow.keep,
    });
    const accept = within(box).getByRole('button', {
      name: ACTION_TEXT.noShow.confirm,
    });
    expect(keep).toHaveFocus();
    press('Tab', true);
    expect(accept).toHaveFocus();
    press('Tab');
    expect(keep).toHaveFocus();
  });
});

describe('`inert` và khoá cuộn', () => {
  const inertState = () =>
    Array.from(document.body.children).map((element) => ({
      element,
      inert: element.hasAttribute('inert'),
    }));

  it('UIF-15 LTA-15 hộp mở ⇒ gốc ứng dụng (trang) bị `inert`, hộp thì không; đóng hộp ⇒ gỡ ĐÚNG phần hộp đặt (trang hết `inert`; phần tử đã `inert` từ trước vẫn `inert`)', async () => {
    const pre = document.createElement('div');
    pre.setAttribute('inert', '');
    pre.id = 'da-inert-tu-truoc';
    document.body.append(pre);

    const { box } = await openCancel();
    const boxOverlay = box.parentElement as HTMLElement;
    expect(boxOverlay).not.toHaveAttribute('inert');
    // Mọi phần tử con khác của `body` đều `inert` trừ lớp phủ của hộp
    for (const { element, inert } of inertState()) {
      expect(inert, element.outerHTML.slice(0, 40)).toBe(
        element !== boxOverlay,
      );
    }

    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    // Trang dùng được lại; chỉ phần tử có sẵn `inert` từ trước còn `inert`
    for (const { element, inert } of inertState()) {
      expect(inert, element.outerHTML.slice(0, 40)).toBe(element === pre);
    }
  });

  it('UIF-15 khoá cuộn của trang: bật khi hộp mở, trả đúng giá trị cũ khi hộp đóng (hộp là modal duy nhất nên không còn lớp ngăn giữ khoá)', async () => {
    expect(document.body.style.overflow).toBe('');
    const { box } = await openCancel();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    expect(document.body.style.overflow).toBe('');
  });
});

describe('tiêu điểm', () => {
  it('UIF-15 LTA-15 đóng hộp ⇒ tiêu điểm về ĐÚNG nút đã mở (hộp vắng mặt về nút `Vắng mặt`, không phải nút `Hủy lịch`)', async () => {
    const { page, trigger, box } = await openCancel();
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    const noShowTrigger = inPage(page, 'Vắng mặt');
    fireEvent.click(noShowTrigger);
    await screen.findByRole('dialog', { name: ACTION_TEXT.noShow.title });
    press('Escape');
    await waitFor(() => expect(noShowBox()).toBeNull());
    await waitFor(() => expect(noShowTrigger).toHaveFocus());
  });

  it('UIF-15 nút đã mở hộp BIẾN MẤT (409: trạng thái đổi ở nơi khác, hết nút) ⇒ đóng hộp trả tiêu điểm về h1 của trang (không rơi về `body`)', async () => {
    const { page, api, box } = await openCancel();
    api.failNext('status', () =>
      apiErrorResponse(409, 'LICH_HEN_KHONG_CHO_HUY', undefined, {
        trangThai: 'DaTiepDon',
      }),
    );
    api.failNext('detail', () =>
      jsonResponse(
        makeReceptionDetail({
          trangThai: 'DaTiepDon',
          chuyenDuoc: [],
          conPhaiThu: null,
        }),
      ),
    );
    fireEvent.change(reason(box), { target: { value: 'Bận' } });
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.confirm }),
    );
    expect(await within(box).findByRole('alert')).toBeInTheDocument();
    await within(page).findByText('Đã tiếp đón');
    expect(within(page).queryByRole('button', { name: 'Hủy lịch' })).toBeNull();

    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    const heading = screen.getByRole('heading', {
      level: 1,
      name: DETAIL_TEXT.title,
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe('MỘT lần mở hộp dùng ref ổn định', () => {
  it('UIF-15 LTA-15 suốt một lần mở hộp huỷ (gõ lý do, bấm xác nhận bị chặn ở client, vẽ lại nhiều lần): `useModalDialog` nhận cùng MỘT `dialogRef`, MỘT `initialFocusRef`, MỘT `returnFocusRef` (đổi danh tính sẽ chạy lại cleanup, trả focus và mở khoá cuộn giữa chừng)', async () => {
    const { box } = await openCancel();
    const from = seen.options.length;
    fireEvent.change(reason(box), { target: { value: 'a' } });
    fireEvent.change(reason(box), { target: { value: 'ab' } });
    fireEvent.change(reason(box), { target: { value: '' } });
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.confirm }),
    );
    expect(await within(box).findByRole('alert')).toBeInTheDocument();
    // Chỉ có hộp huỷ gọi hook trong ca này; sau khi mở đã có lần gọi đầu, các lần gõ và báo lỗi thêm lần vẽ lại
    const mine = seen.options;
    expect(mine.length).toBeGreaterThan(from);
    expect(new Set(mine.map((item) => item.dialogRef)).size).toBe(1);
    expect(new Set(mine.map((item) => item.initialFocusRef)).size).toBe(1);
    expect(new Set(mine.map((item) => item.returnFocusRef)).size).toBe(1);
    // Khoá cuộn không bị mở giữa chừng
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('UIF-15 hai hộp (huỷ rồi vắng mặt) dùng CÙNG vùng bẫy Tab `dialogRef` của trang (một ref object ổn định); mỗi hộp một `useModalDialog` đang hoạt động tại một thời điểm', async () => {
    const { box, page } = await openCancel();
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    fireEvent.click(inPage(page, 'Vắng mặt'));
    await screen.findByRole('dialog', { name: ACTION_TEXT.noShow.title });
    press('Escape');
    await waitFor(() => expect(noShowBox()).toBeNull());

    // Mỗi hộp mount gọi hook ít nhất một lần (hai hộp ⇒ ít nhất hai lần), và cả hai nhận CÙNG MỘT `dialogRef` của trang
    expect(seen.options.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seen.options.map((item) => item.dialogRef)).size).toBe(1);
  });
});

describe('thuộc tính hộp thoại', () => {
  it('UIF-15 LTA-15 hộp có `role="dialog"`, `aria-modal`, tên là tiêu đề; trang KHÔNG là hộp thoại (không `aria-modal` nào khác); hộp là lớp phủ duy nhất trong `body`', async () => {
    const { box } = await openCancel();
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(box).toHaveAccessibleName(ACTION_TEXT.cancel.title);
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    // Hộp là con trực tiếp của `body` (portal), nằm sau gốc ứng dụng
    const overlays = Array.from(document.body.children);
    expect(overlays.indexOf(box.parentElement as HTMLElement)).toBe(
      overlays.length - 1,
    );
  });

  it('UIF-10 hộp rộng 360 px (`max-w-sm`; Figma 490:507 — F9 để `max-w-[22.5rem]` = 337,5 px vì chia 16 thay 15) và hai nút cao 39 px (`min-h-[2.6rem]`; Figma 490:518: 39,1 px)', async () => {
    const { box } = await openCancel();
    expect(box).toHaveClass('max-w-sm');
    expect(box.className).not.toMatch(/22\.5rem/);
    for (const name of [ACTION_TEXT.cancel.close, ACTION_TEXT.cancel.confirm]) {
      const button = within(box).getByRole('button', { name });
      expect(button).toHaveClass('min-h-[2.6rem]');
      expect(button).not.toHaveClass('min-h-11');
    }
  });
});
