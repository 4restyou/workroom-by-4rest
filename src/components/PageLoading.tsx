// Suspense fallback shown while a lazy page chunk loads.
export default function PageLoading() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-label="불러오는 중">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-workroom-line border-t-workroom-ink" />
    </div>
  );
}
