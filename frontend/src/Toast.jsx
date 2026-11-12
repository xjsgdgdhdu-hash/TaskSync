import "./Toast.css";

const ICONS = { success: "✓", error: "✕", info: "i", warning: "!" };
const TITLES = {
  success: "Success",
  error: "Something went wrong",
  warning: "Heads up",
  info: "Info"
};

function Toast({ toast, onClose }) {
  return (
    <div className={`toast toast-${toast.type}`} role="status">
      <div className="toast-icon">{ICONS[toast.type] || "✓"}</div>

      <div className="toast-content">
        <strong>{TITLES[toast.type] || TITLES.info}</strong>
        <p>{toast.message}</p>
      </div>

      <button
        className="toast-close"
        onClick={() => onClose(toast.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>

      <span className="toast-timer" />
    </div>
  );
}

export default Toast;
