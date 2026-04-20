import { Suspense } from "react";
import ReaderPageClient from "@/components/reader-page-client";

function ReaderFallback() {
  return (
    <main className="min-h-screen grid place-items-center px-6 py-10">
      <div className="text-sm sm:text-base">Loading...</div>
    </main>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<ReaderFallback />}>
      <ReaderPageClient />
    </Suspense>
  );
}
