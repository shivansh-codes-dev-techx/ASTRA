function StatusMessage({ type = "loading", message }) {
  const styles = {
    loading: "border-cyan-500/20 bg-cyan-500/5 text-cyan-400",
    error: "border-red-500/20 bg-red-500/5 text-red-400",
    success: "border-green-500/20 bg-green-500/5 text-green-400",
  };

  const icons = {
    loading: "⟳",
    error: "⚠",
    success: "✓",
  };

  return (
    <div
      className={`rounded-xl border p-4 ${styles[type]}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">
          {icons[type]}
        </span>

        <p className="text-sm">
          {message}
        </p>
      </div>
    </div>
  );
}

export default StatusMessage;