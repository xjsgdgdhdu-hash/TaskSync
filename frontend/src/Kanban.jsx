
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { useToast } from "./hooks/useToast.js";
import Toast from "./components/Toast.jsx";
import "./Kanban.css";
import { Icon, CountUp, useConfirm } from "./ui.jsx";
import TaskDrawer from "./TaskDrawer.jsx";

const statuses = [
  { value: "todo", label: "To Do", icon: "○" },
  { value: "in_progress", label: "In Progress", icon: "◷" },
  { value: "done", label: "Done", icon: "✓" }
];

const priorities = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

function Kanban({ project, onBack }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [subStats, setSubStats] = useState({});

  useEffect(() => {
    const ids = tasks.map((task) => task.id);
    if (!ids.length) return;
    supabase
      .from("subtasks")
      .select("task_id, done")
      .in("task_id", ids)
      .then(({ data }) => {
        if (!data) return;
        const stats = {};
        data.forEach((row) => {
          const entry = (stats[row.task_id] ||= { done: 0, total: 0 });
          entry.total += 1;
          if (row.done) entry.done += 1;
        });
        setSubStats(stats);
      });
  }, [tasks.length, project.id]);

  const { toasts, showToast, removeToast } = useToast();
  const { ask, dialog } = useConfirm();

  async function loadTasks() {
    setLoading(true);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });

    if (error) {
      showToast("Could not load tasks: " + error.message, "error");
    } else {
      setTasks(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, [project.id]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDate("");
    setEditingId(null);
  }

  function openNewTaskForm() {
    resetForm();
    setFormOpen(true);
  }

  function startEditing(task) {
    setEditingId(task.id);
    setTitle(task.title);
    setDescription(task.description || "");
    setPriority(task.priority || "medium");
    setDueDate(task.due_date || "");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
  }

  async function saveTask(event) {
    event.preventDefault();

    if (!title.trim()) {
      showToast("Enter a task name.", "warning");
      return;
    }

    setSaving(true);

    const taskData = {
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date: dueDate || null
    };

    const wasEditing = Boolean(editingId);
    let error;

    if (wasEditing) {
      const result = await supabase
        .from("tasks")
        .update(taskData)
        .eq("id", editingId)
        .eq("project_id", project.id);

      error = result.error;
    } else {
      const result = await supabase
        .from("tasks")
        .insert({
          ...taskData,
          project_id: project.id,
          status: "todo"
        });

      error = result.error;
    }

    if (error) {
      showToast("Save error: " + error.message, "error");
      setSaving(false);
      return;
    }

    showToast(
      wasEditing
        ? "Task updated successfully!"
        : "New task added successfully!"
    );

    closeForm();
    await loadTasks();
    setSaving(false);
  }

  async function changeStatus(task, newStatus) {
    if (task.status === newStatus) return;

    const previousStatus = task.status;

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: newStatus }
          : item
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", task.id)
      .eq("project_id", project.id);

    if (error) {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, status: previousStatus }
            : item
        )
      );

      showToast("Could not update status: " + error.message, "error");
      return;
    }

    const label = statuses.find((item) => item.value === newStatus)?.label;
    showToast(`Task moved to: ${label}.`);
  }

  function handleDragStart(event, task) {
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.id));
  }

  function handleDragOver(event, status) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  }

  async function handleDrop(event, newStatus) {
    event.preventDefault();

    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    const task = tasks.find((item) => String(item.id) === String(taskId));

    setDraggedTaskId(null);
    setDragOverStatus(null);

    if (!task || task.status === newStatus) return;

    await changeStatus(task, newStatus);
  }

  function handleDragEnd() {
    setDraggedTaskId(null);
    setDragOverStatus(null);
  }

  async function deleteTask(id) {
    const confirmed = await ask({
      title: "Delete this task?",
      message: "This can't be undone.",
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("project_id", project.id);

    if (error) {
      showToast("Delete error: " + error.message, "error");
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== id));
    showToast("Task deleted.");

    if (editingId === id) {
      closeForm();
    }
  }

  function getPriorityLabel(value) {
    return priorities.find((item) => item.value === value)?.label || value;
  }

  function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    return new Date(Number(year), Number(month) - 1, Number(day))
      .toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
  }

  function isOverdue(task) {
    return task.due_date &&
      task.due_date < getToday() &&
      task.status !== "done";
  }

  const completedCount = tasks.filter(
    (task) => task.status === "done"
  ).length;

  const progress = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;

  const highPriorityCount = tasks.filter(
    (task) => task.priority === "high" && task.status !== "done"
  ).length;

  const overdueCount = tasks.filter(isOverdue).length;

  return (
    <main className="kanban-page">
      <div className="kanban-topbar">
        <button className="kanban-back-button" onClick={onBack}>
          <Icon name="arrowL" size={17} /> All Projects
        </button>

        <span className="kanban-breadcrumb">
          Projects / <strong>{project.name}</strong>
        </span>
      </div>

      <header className="kanban-heading">
        <div>
          <div className="kanban-eyebrow">PROJECT WORKSPACE</div>
          <h1>{project.name}</h1>
          <p>{project.description || "Manage tasks and track project progress."}</p>
        </div>

        <button className="kanban-add-button" onClick={openNewTaskForm}>
          <Icon name="plus" size={16} /> Add task
        </button>
      </header>

      <section className="kanban-overview">
        <div className="kanban-stat">
          <span className="kanban-stat-icon purple"><Icon name="list" /></span>
          <div>
            <strong><CountUp value={tasks.length} /></strong>
            <span>All Tasks</span>
          </div>
        </div>

        <div className="kanban-stat">
          <span className="kanban-stat-icon green"><Icon name="check" /></span>
          <div>
            <strong><CountUp value={completedCount} /></strong>
            <span>Completed</span>
          </div>
        </div>

        <div className="kanban-stat">
          <span className="kanban-stat-icon orange"><Icon name="flag" /></span>
          <div>
            <strong><CountUp value={highPriorityCount} /></strong>
            <span>High Priority</span>
          </div>
        </div>

        <div className="kanban-stat">
          <span className="kanban-stat-icon red"><Icon name="clock" /></span>
          <div>
            <strong><CountUp value={overdueCount} /></strong>
            <span>Overdue</span>
          </div>
        </div>

        <div className="kanban-progress">
          <div className="kanban-progress-heading">
            <span>Project Progress</span>
            <strong><CountUp value={progress} suffix="%" /></strong>
          </div>
          <div className="kanban-progress-track">
            <div
              className="kanban-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <small>{completedCount} of {tasks.length} tasks completed</small>
        </div>
      </section>

      {formOpen && (
        <div className="kanban-form-overlay">
          <form className="kanban-task-form" onSubmit={saveTask}>
            <div className="kanban-form-heading">
              <div>
                <span className="kanban-eyebrow">
                  {editingId ? "EDIT TASK" : "NEW TASK"}
                </span>
                <h2>{editingId ? "Edit Task" : "Create Task"}</h2>
              </div>

              <button
                type="button"
                className="kanban-form-close"
                onClick={closeForm}
                aria-label="Close form"
              >
                ×
              </button>
            </div>

            <label htmlFor="task-title">Task Name</label>
            <input
              id="task-title"
              className="kanban-input"
              placeholder="e.g. Prepare the interface design..."
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              autoFocus
            />

            <label htmlFor="task-description">Description</label>
            <textarea
              id="task-description"
              className="kanban-input kanban-textarea"
              placeholder="Describe what needs to be done..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />

            <div className="kanban-form-row">
              <div>
                <label htmlFor="task-priority">Priority</label>
                <select
                  id="task-priority"
                  className="kanban-input"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {priorities.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="task-date">Due Date</label>
                <input
                  id="task-date"
                  className="kanban-input"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>

            <div className="kanban-form-actions">
              <button
                type="button"
                className="kanban-cancel-button"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="kanban-add-button"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Create Task"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="kanban-board-heading">
        <div>
          <h2>Task Board</h2>
          <p>Drag tasks between columns to update their status.</p>
        </div>
        <span className="kanban-total-badge">{tasks.length} tasks</span>
      </div>

      {loading ? (
        <div className="kanban-loading">Loading board...</div>
      ) : (
        <div className="kanban-board">
          {statuses.map((status) => {
            const columnTasks = tasks.filter(
              (task) => task.status === status.value
            );

            return (
              <section
                key={status.value}
                className={`kanban-column ${dragOverStatus === status.value ? "kanban-column-over" : ""}`}
                onDragOver={(event) => handleDragOver(event, status.value)}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDragOverStatus(null);
                  }
                }}
                onDrop={(event) => handleDrop(event, status.value)}
              >
                <div className="kanban-column-header">
                  <div className="kanban-column-title">
                    <span className={`kanban-status-dot status-${status.value}`} />
                    <h3>{status.label}</h3>
                    <span className="kanban-column-count">{columnTasks.length}</span>
                  </div>
                  <span className="kanban-column-symbol">{status.icon}</span>
                </div>

                <div className="kanban-column-content">
                  {columnTasks.map((task) => (
                    <article
                      key={task.id}
                      className={`kanban-task-card ${draggedTaskId === task.id ? "kanban-task-dragging" : ""}`}
                      draggable
                      onDragStart={(event) => handleDragStart(event, task)}
                      onDragEnd={handleDragEnd}
                      tabIndex={0}
                      onClick={(event) => {
                        if (event.target.closest("button, select, label")) return;
                        setOpenTaskId(task.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && event.target === event.currentTarget) setOpenTaskId(task.id);
                      }}
                    >
                      <div className="kanban-card-top">
                        <span className={`kanban-priority priority-${task.priority || "medium"}`}>
                          <span />
                          {getPriorityLabel(task.priority || "medium")}
                        </span>

                        <span className="kanban-drag-handle" title="Drag task">
                          ⠿
                        </span>
                      </div>

                      <h4>{task.title}</h4>

                      {task.description && (
                        <p className="kanban-card-description">
                          {task.description}
                        </p>
                      )}

                      {(subStats[task.id]?.total > 0 || task.labels?.length > 0) && (
                        <div className="kanban-card-meta">
                          {subStats[task.id]?.total > 0 && (
                            <span className="kanban-meta-chip">
                              <Icon name="check" size={11} /> {subStats[task.id].done}/{subStats[task.id].total}
                            </span>
                          )}
                          {task.labels?.slice(0, 3).map((label) => (
                            <span className="kanban-label" key={label}>{label}</span>
                          ))}
                        </div>
                      )}

                      <div className="kanban-card-footer">
                        {task.due_date ? (
                          <span className={`kanban-due-date ${isOverdue(task) ? "overdue" : ""}`}>
                            <Icon name="calendar" size={12} /> {isOverdue(task) ? "Overdue · " : ""}
                            {formatDate(task.due_date)}
                          </span>
                        ) : (
                          <span className="kanban-no-date">No due date</span>
                        )}

                        <div className="kanban-card-actions">
                          <button
                            type="button"
                            onClick={() => startEditing(task)}
                            title="Edit task"
                            aria-label="Edit task"
                          >
                            <Icon name="edit" size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTask(task.id)}
                            title="Delete task"
                            aria-label="Delete task"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="kanban-card-status">
                        <label htmlFor={`status-${task.id}`}>Change Status</label>
                        <select
                          id={`status-${task.id}`}
                          value={task.status}
                          onChange={(event) => changeStatus(task, event.target.value)}
                        >
                          {statuses.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </article>
                  ))}

                  {columnTasks.length === 0 && (
                    <div className="kanban-empty-column">
                      <span>{status.icon}</span>
                      <p>No tasks</p>
                      <small>Drag a task here</small>
                    </div>
                  )}
                </div>

                <button
                  className="kanban-column-add"
                  type="button"
                  onClick={openNewTaskForm}
                >
                  <Icon name="plus" size={14} /> Add task
                </button>
              </section>
            );
          })}
        </div>
      )}

      {tasks.find((task) => task.id === openTaskId) && (
        <TaskDrawer
          key={openTaskId}
          task={tasks.find((task) => task.id === openTaskId)}
          statuses={statuses}
          priorities={priorities}
          onClose={() => setOpenTaskId(null)}
          onUpdate={(id, changes) =>
            setTasks((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
          }
          onSubStats={(id, stats) => setSubStats((current) => ({ ...current, [id]: stats }))}
          showToast={showToast}
        />
      )}

      {dialog}

      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onClose={removeToast}
          />
        ))}
      </div>
    </main>
  );
}

export default Kanban;
