import { useEffect, useRef } from 'react';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { FailureBox } from './failure-box';
import { monthTitle, totalCases } from './patient-exam-format';
import { noneInYear, PATIENT_TEXT } from './patient-exam-text';
import { PeriodCard } from './period-card';
import { PersonFilter } from './person-filter';
import { RecordList } from './record-list';
import { RecordPane } from './record-pane';
import { useExamBrowser, type ExamBrowser } from './use-exam-browser';
import { useExamDetail } from './use-exam-detail';

// Cột trái của hai cột: danh sách ca của tháng đang xem (bước B). Đang tải / lỗi kèm `Thử lại` chạy lại ĐÚNG bước B / rỗng / thẻ danh sách.
function ListColumn({
  browser,
  year,
  month,
  onSelect,
}: {
  browser: ExamBrowser;
  year: number;
  month: number;
  onSelect: (maLichHen: string) => void;
}) {
  const { list } = browser;
  if (list.status === 'error') {
    return <FailureBox error={list.error} onRetry={browser.retryList} />;
  }
  if (list.status === 'loading' || list.data === null) {
    return <LoadingState message={PATIENT_TEXT.loading} />;
  }
  if (list.data.items.length === 0) {
    return <EmptyState message={PATIENT_TEXT.noneInMonth} />;
  }
  return (
    <RecordList
      title={monthTitle(year, month)}
      total={list.data.total}
      items={list.data.items}
      selectedCase={browser.selectedCase}
      onSelect={onSelect}
    />
  );
}

// Trang "Hồ sơ khám bệnh" của Bệnh nhân (doctor-exam F5; PLAN 5.13; Figma `414:2`, `415:2`, `443:2`; Q6, Q18, Q19, Q21, Q22): bộ lọc người khám, năm và lưới 12 tháng, rồi hai cột: trái là danh sách ca `Hoàn thành` của tháng đang xem, phải là
// ngăn chi tiết của ca đang chọn (`?ca=`). Chỉ ĐỌC (GET): không nút ghi. h1 luôn hiện, kể cả khi đang tải hay lỗi. Từ `xl` trở lên hai cột (340 px và phần còn lại); hẹp hơn xếp một cột, ngăn chi tiết nằm DƯỚI danh sách.
// Rỗng ba mức (Q6, L6): tài khoản chưa có ca hoàn thành nào (`nguoiKham[]` rỗng), năm không có ca, tháng không có ca.
export function ExamRecordsPage() {
  const browser = useExamBrowser();
  const detail = useExamDetail(browser.selectedCase);
  const paneRef = useRef<HTMLElement>(null);
  // Chỉ chuyển tiêu điểm vào ngăn sau khi NGƯỜI DÙNG chọn ca; mở thẳng `?ca=` thì không (không cướp tiêu điểm lúc vào trang)
  const focusPane = useRef(false);
  const { selectedCase } = browser;
  useEffect(() => {
    if (focusPane.current && selectedCase !== null) {
      focusPane.current = false;
      paneRef.current?.focus();
    }
  }, [selectedCase]);

  function selectCase(maLichHen: string) {
    if (maLichHen === selectedCase) {
      paneRef.current?.focus();
      return;
    }
    focusPane.current = true;
    browser.selectCase(maLichHen);
  }

  const { counts, people, month, year } = browser;
  let body;
  if (people === null) {
    // Chưa tải xong lần nào: chưa biết có bao nhiêu người khám để vẽ bộ lọc
    body =
      counts.status === 'error' ? (
        <FailureBox error={counts.error} onRetry={browser.retryCounts} />
      ) : (
        <LoadingState message={PATIENT_TEXT.loading} />
      );
  } else if (people.length === 0) {
    body = <EmptyState message={PATIENT_TEXT.noneYet} />;
  } else {
    const yearEmpty =
      counts.status === 'ready' && totalCases(counts.data.demTheoThang) === 0;
    body = (
      <>
        <PersonFilter
          people={people}
          selected={browser.person}
          onSelect={browser.selectPerson}
        />
        <div className="mt-3">
          <PeriodCard
            years={browser.years}
            year={year}
            onYear={browser.selectYear}
            counts={counts}
            onRetry={browser.retryCounts}
            month={month}
            onMonth={browser.selectMonth}
          />
        </div>
        {yearEmpty && <EmptyState message={noneInYear(year)} />}
        {counts.status === 'ready' && month !== null && (
          <div className="mt-5 grid items-start gap-[15px] xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="min-w-0">
              <ListColumn
                browser={browser}
                year={year}
                month={month}
                onSelect={selectCase}
              />
            </div>
            <RecordPane
              caseCode={selectedCase}
              detail={detail.state}
              onRetry={detail.retry}
              paneRef={paneRef}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[72rem]">
      <h1 className="text-2xl font-bold text-gray-900">{PATIENT_TEXT.title}</h1>
      <p className="pt-1 text-sm text-gray-500">{PATIENT_TEXT.subtitle}</p>
      <div className="pt-5">{body}</div>
    </section>
  );
}
