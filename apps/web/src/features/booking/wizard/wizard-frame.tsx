import type { ReactNode } from 'react';
import { BookingStepper, type StepLinks } from './booking-stepper';
import type { StepNumber } from './wizard-steps';

// Khung của MỘT trang trong wizard: thanh bước ở trên, nội dung của bước ở dưới. Nằm trong khung công khai (`PublicLayout`, Q36).
export function WizardFrame({
  step,
  links,
  children,
}: {
  step: StepNumber;
  links?: StepLinks;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <BookingStepper current={step} links={links} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
