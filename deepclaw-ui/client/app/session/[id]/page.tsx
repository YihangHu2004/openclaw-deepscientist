import { Suspense } from 'react';
import SessionPageClient from './SessionPageClient';

export default function Page() {
  return (
    <Suspense>
      <SessionPageClient />
    </Suspense>
  );
}
