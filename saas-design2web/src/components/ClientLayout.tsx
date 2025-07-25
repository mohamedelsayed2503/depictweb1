"use client";

import { ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Import CustomCursor component with no SSR
const CustomCursor = dynamic(() => import("@/components/CustomCursor"), {
  ssr: false,
});

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <CustomCursor />
    </>
  );
}