import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buildStepNotes,
  NO_MILESTONE_TEXT,
  type StatusMilestones,
} from './status-notes';
import { StatusTimeline } from './status-timeline';

// Booking B19 (issue #551; TRACKING 3.46.3) — MOW-02 (hàm dựng dòng phụ) và MOW-09 (bố cục thanh trạng thái khi có giờ: dòng phụ vẫn MỘT dòng `min-h-4`, đoạn nối đều nhau, UI-05). Hàm giờ ở
// `appointment-format.test.ts` (MOW-01), bộ đọc ở ba `*-api.test.ts` (MOW-03), từng trang ở `*-detail-page.test.tsx` (MOW-04 đến MOW-06, MOW-08). jsdom không đo khoảng cách: số đo thật ở TRACKING 3.46.
const ALL: StatusMilestones = {
  xacNhan: '2026-10-16T03:00:00.000Z',
  tiepDon: '2026-10-19T07:20:00.000Z',
  hoanThanh: '2026-10-19T08:05:00.000Z',
};
const NONE: StatusMilestones = {
  xacNhan: null,
  tiepDon: null,
  hoanThanh: null,
};

describe('MOW-02 buildStepNotes', () => {
  it('đúng ba khoá là MÃ BƯỚC (DaXacNhan, DaTiepDon, HoanThanh), mỗi khoá lấy đúng mốc của nó theo giờ Việt Nam dạng HH:mm dd/MM', () => {
    expect(buildStepNotes(ALL)).toEqual({
      DaXacNhan: '10:00 16/10',
      DaTiepDon: '14:20 19/10',
      HoanThanh: '15:05 19/10',
    });
    expect(Object.keys(buildStepNotes(ALL)).sort()).toEqual([
      'DaTiepDon',
      'DaXacNhan',
      'HoanThanh',
    ]);
  });

  it('mốc null ⇒ dấu gạch dài (lịch cũ không bịa giờ); mỗi bước độc lập', () => {
    expect(NO_MILESTONE_TEXT).toBe('—');
    expect(buildStepNotes(NONE)).toEqual({
      DaXacNhan: '—',
      DaTiepDon: '—',
      HoanThanh: '—',
    });
    expect(buildStepNotes({ ...NONE, tiepDon: ALL.tiepDon })).toEqual({
      DaXacNhan: '—',
      DaTiepDon: '14:20 19/10',
      HoanThanh: '—',
    });
  });

  it('không sửa đầu vào', () => {
    const before = JSON.stringify(ALL);
    buildStepNotes(ALL);
    expect(JSON.stringify(ALL)).toBe(before);
  });
});

describe('MOW-09 StatusTimeline với dòng phụ là giờ: bố cục giữ nguyên (UI-05)', () => {
  const renderTimeline = (trangThai: string, moc: StatusMilestones) =>
    render(
      <StatusTimeline
        trangThai={trangThai}
        title="Trạng thái lịch hẹn"
        unknown="upcoming"
        notes={buildStepNotes(moc)}
      />,
    );
  const steps = () =>
    within(
      screen.getByRole('list', { name: 'Trạng thái lịch hẹn' }),
    ).getAllByRole('listitem');

  it('DaTiepDon có giờ: hai bước đã qua và hiện tại mỗi bước đúng MỘT dòng phụ là giờ (min-h-4), bước chưa tới chỉ "Chưa đến", không còn chỗ chừa trống; đủ (số bước − 1) đoạn nối', () => {
    renderTimeline('DaTiepDon', ALL);
    const notes = screen.getAllByTestId('timeline-note');
    expect(notes.map((note) => note.textContent)).toEqual([
      '10:00 16/10',
      '14:20 19/10',
    ]);
    for (const note of notes) expect(note).toHaveClass('min-h-4');
    expect(screen.queryAllByTestId('timeline-reserved-line')).toHaveLength(0);
    expect(screen.getAllByText('Chưa đến')).toHaveLength(1);
    expect(screen.getAllByTestId('timeline-connector')).toHaveLength(
      steps().length - 1,
    );
  });

  it('lịch cũ (ba mốc null) ở DaTiepDon: hai dòng "—" thay cho giờ, cùng bố cục', () => {
    renderTimeline('DaTiepDon', NONE);
    expect(
      screen.getAllByTestId('timeline-note').map((note) => note.textContent),
    ).toEqual(['—', '—']);
    expect(screen.queryAllByTestId('timeline-reserved-line')).toHaveLength(0);
  });

  it.each(['ChoThanhToan', 'DaHuy', 'VangMat'])(
    'trạng thái %s: dù có notes từ API, không bước nào đã qua hay hiện tại nên KHÔNG có dòng giờ (giữ bố cục F13)',
    (trangThai) => {
      renderTimeline(trangThai, ALL);
      expect(screen.queryAllByTestId('timeline-note')).toHaveLength(0);
    },
  );
});
