import { Suspense } from 'react';
import ProjectPageClient from './ProjectPageClient';

export default function Page() {
  return <Suspense><ProjectPageClient /></Suspense>;
}
