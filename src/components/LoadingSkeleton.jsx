function LoadingSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-80 animate-pulse rounded-2xl bg-slate-900" />
      <div className="h-80 animate-pulse rounded-2xl bg-slate-900" />
    </div>
  );
}

export default LoadingSkeleton;