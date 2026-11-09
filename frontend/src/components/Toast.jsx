import "./Toast.css";

function Toast({ toast, onClose }) {
  const icons = {
    success: "✓",
    error: "✕",
    info: "i",
    warning: "!"
  };

  return (
    <div className={`toast toast-${toast.type}`}>
      <div className="toast-icon">
        {icons[toast.type] || "✓"}
      </div>

      <div className="toast-content">
        <strong>
          {toast.type === "success"
            ? "Sukces"
            : toast.type === "error"
              ? "Wystąpił błąd"
              : toast.type === "warning"
                ? "Uwaga"
                : "Informacja"}
        </strong>

        <p>{toast.message}</p>
      </div>

      <button
        className="toast-close"
        onClick={() => onClose(toast.id)}
        aria-label="Zamknij powiadomienie"
      >
        ×
      </button>
    </div>
  );
}

export default Toast;