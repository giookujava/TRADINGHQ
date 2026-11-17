/** Route-level loading state: skeleton that mirrors the page header + content blocks. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px]" aria-busy aria-label="Loading">
      <div className="skeleton mb-2 h-3 w-24" />
      <div className="skeleton mb-7 h-10 w-72" />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-32" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-32 lg:col-span-2" />
        <div className="skeleton h-32" />
        <div className="skeleton h-72 lg:col-span-2" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}
