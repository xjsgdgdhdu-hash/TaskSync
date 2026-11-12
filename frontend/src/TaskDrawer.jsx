import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { Icon } from "./ui.jsx";
import "./TaskDrawer.css";

function timeAgo(value) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Segmented({ options, value, onChange }) {
  const index = Math.max(0, options.findIndex((item) => item.value === value));
  return (
    <div className="seg" style={{ "--i": index, "--n": options.length }}>
      {options.map((item) => (
        <button key={item.value} type="button"
          className={item.value === value ? "active" : ""}
          onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TaskDrawer({ task, statuses, priorities, onClose, onUpdate, onSubStats, showToast }) {
  const [closing, setClosing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [subtasks, setSubtasks] = useState([]);
  const [comments, setComments] = useState([]);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [loading, setLoading] = useState(true);

  const labels = task.labels || [];
  const doneCount = subtasks.filter((item) => item.done).length;
  const percent = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : 0;

  function close() {
    setClosing(true);
    setTimeout(onClose, 220);
  }

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      const [subs, notes] = await Promise.all([
        supabase.from("subtasks").select("*").eq("task_id", task.id).order("created_at"),
        supabase.from("comments").select("*").eq("task_id", task.id).order("created_at"),
      ]);
      if (off) return;
      setSubtasks(subs.data || []);
      setComments(notes.data || []);
      setLoading(false);
      if (subs.error || notes.error) {
        showToast("Run supabase/task-details.sql first to enable subtasks and comments.", "warning");
      }
    })();
    return () => { off = true; };
  }, [task.id]);

  async function save(changes) {
    const previous = {};
    Object.keys(changes).forEach((key) => (previous[key] = task[key]));
    onUpdate(task.id, changes);
    const { error } = await supabase.from("tasks").update(changes).eq("id", task.id);
    if (error) {
      onUpdate(task.id, previous);
      showToast("Could not save: " + error.message, "error");
    }
  }

  function commitTitle() {
    const clean = title.trim();
    if (!clean) return setTitle(task.title);
    if (clean !== task.title) save({ title: clean });
  }

  function commitDescription() {
    if (description.trim() !== (task.description || "")) save({ description: description.trim() });
  }

  function addLabel(event) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const value = labelInput.trim().replace(/,/g, "").slice(0, 20);
    setLabelInput("");
    if (!value || labels.includes(value) || labels.length >= 6) return;
    save({ labels: [...labels, value] });
  }

  const report = (list) =>
    onSubStats(task.id, { done: list.filter((item) => item.done).length, total: list.length });

  async function addSubtask(event) {
    event.preventDefault();
    const value = newSub.trim();
    if (!value) return;
    setNewSub("");
    const { data, error } = await supabase
      .from("subtasks").insert({ task_id: task.id, title: value }).select().single();
    if (error) return showToast("Could not add subtask: " + error.message, "error");
    const list = [...subtasks, data];
    setSubtasks(list);
    report(list);
  }

  async function toggleSubtask(item) {
    const list = subtasks.map((s) => (s.id === item.id ? { ...s, done: !s.done } : s));
    setSubtasks(list);
    report(list);
    const { error } = await supabase.from("subtasks").update({ done: !item.done }).eq("id", item.id);
    if (error) { setSubtasks(subtasks); report(subtasks); showToast(error.message, "error"); }
  }

  async function removeSubtask(item) {
    const list = subtasks.filter((s) => s.id !== item.id);
    setSubtasks(list);
    report(list);
    const { error } = await supabase.from("subtasks").delete().eq("id", item.id);
    if (error) { setSubtasks(subtasks); report(subtasks); showToast(error.message, "error"); }
  }

  async function addComment(event) {
    event?.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    setNewComment("");
    const { data, error } = await supabase
      .from("comments").insert({ task_id: task.id, body }).select().single();
    if (error) { setNewComment(body); return showToast("Could not post: " + error.message, "error"); }
    setComments((current) => [...current, data]);
  }

  async function removeComment(item) {
    setComments((current) => current.filter((c) => c.id !== item.id));
    const { error } = await supabase.from("comments").delete().eq("id", item.id);
    if (error) { setComments(comments); showToast(error.message, "error"); }
  }

  return (
    <div className={`drawer-backdrop ${closing ? "closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside className="drawer" role="dialog" aria-label="Task details">
        <header className="drawer-head">
          <input className="drawer-title" value={title} maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
          <button className="drawer-close" onClick={close} aria-label="Close"><Icon name="x" size={16} /></button>
        </header>

        <div className="drawer-body">
          <section className="drawer-grid">
            <div>
              <label>Status</label>
              <Segmented options={statuses} value={task.status} onChange={(value) => save({ status: value })} />
            </div>
            <div>
              <label>Priority</label>
              <Segmented options={priorities} value={task.priority || "medium"} onChange={(value) => save({ priority: value })} />
            </div>
            <div>
              <label>Due date</label>
              <input type="date" className="drawer-field" value={task.due_date || ""}
                onChange={(event) => save({ due_date: event.target.value || null })} />
            </div>
          </section>

          <section>
            <label>Description</label>
            <textarea className="drawer-field drawer-textarea" value={description}
              placeholder="Add more detail…" maxLength={1000}
              onChange={(event) => setDescription(event.target.value)} onBlur={commitDescription} />
          </section>

          <section>
            <label>Labels</label>
            <div className="drawer-labels">
              {labels.map((item) => (
                <span className="drawer-label" key={item}>
                  {item}
                  <button type="button" onClick={() => save({ labels: labels.filter((l) => l !== item) })} aria-label={`Remove ${item}`}>
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
              {labels.length < 6 && (
                <input className="drawer-label-input" value={labelInput} placeholder="Add label…"
                  onChange={(event) => setLabelInput(event.target.value)} onKeyDown={addLabel} />
              )}
            </div>
          </section>

          <section>
            <div className="drawer-section-head">
              <label>Subtasks</label>
              {subtasks.length > 0 && <span>{doneCount}/{subtasks.length}</span>}
            </div>
            {subtasks.length > 0 && (
              <div className="drawer-progress"><i style={{ width: `${percent}%` }} /></div>
            )}
            <ul className="drawer-subtasks">
              {subtasks.map((item) => (
                <li key={item.id} className={item.done ? "done" : ""}>
                  <button type="button" className={`sub-check ${item.done ? "on" : ""}`}
                    onClick={() => toggleSubtask(item)} aria-label="Toggle subtask">
                    <Icon name="check" size={13} />
                  </button>
                  <span>{item.title}</span>
                  <button type="button" className="sub-remove" onClick={() => removeSubtask(item)} aria-label="Delete subtask">
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <form className="drawer-add" onSubmit={addSubtask}>
              <Icon name="plus" size={15} />
              <input value={newSub} onChange={(event) => setNewSub(event.target.value)} placeholder="Add a subtask" maxLength={120} />
            </form>
          </section>

          <section>
            <div className="drawer-section-head"><label>Comments</label>{comments.length > 0 && <span>{comments.length}</span>}</div>
            <div className="drawer-comments">
              {!loading && comments.length === 0 && <p className="drawer-hint">No comments yet.</p>}
              {comments.map((item) => (
                <div className="drawer-comment" key={item.id}>
                  <div className="drawer-avatar">Y</div>
                  <div>
                    <div className="drawer-comment-meta">
                      <strong>You</strong><span>{timeAgo(item.created_at)}</span>
                      <button type="button" onClick={() => removeComment(item)} aria-label="Delete comment"><Icon name="trash" size={12} /></button>
                    </div>
                    <p>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <form className="drawer-composer" onSubmit={addComment}>
              <textarea value={newComment} placeholder="Write a comment…" maxLength={2000}
                onChange={(event) => setNewComment(event.target.value)}
                onKeyDown={(event) => (event.metaKey || event.ctrlKey) && event.key === "Enter" && addComment(event)} />
              <button type="submit" disabled={!newComment.trim()} aria-label="Post comment">
                <Icon name="arrowL" size={16} />
              </button>
            </form>
          </section>
        </div>

        {task.created_at && <footer className="drawer-foot">Created {timeAgo(task.created_at)}</footer>}
      </aside>
    </div>
  );
}

export default TaskDrawer;
