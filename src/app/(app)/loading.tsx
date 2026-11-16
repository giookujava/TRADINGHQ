/** Route-level loading state: skeleton that mirrors the page header + content blocks. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px]" aria-busy aria-label="Loading">
      <div className="skeleton mb-2 h-3 w-24" />
      <div className="skeleton mb-6 h-7 w-56" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-32 lg:col-span-2" />
        <div className="skeleton h-32" />
        <div className="skeleton h-72 lg:col-span-2" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}
