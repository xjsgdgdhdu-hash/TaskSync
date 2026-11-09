
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./Dashboard.css";

const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Completed",
};

const PRIORITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function formatDate(value) {
  if (!value) return "No due date";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard({ onOpenProjects, userEmail }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const [projectsResult, tasksResult] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name, description, created_at")
            .order("created_at", { ascending: false }),

          supabase
            .from("tasks")
            .select("id, title, description, status, priority, due_date, created_at, project_id")
            .order("created_at", { ascending: false }),
        ]);

        if (projectsResult.error) throw projectsResult.error;
        if (tasksResult.error) throw tasksResult.error;

        if (!cancelled) {
          setProjects(projectsResult.data ?? []);
          setTasks(tasksResult.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load dashboard data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const completed = tasks.filter((task) => task.status === "done").length;
  const inProgress = tasks.filter((task) => task.status === "in_progress").length;
  const overdue = tasks.filter(
    (task) =>
      task.due_date &&
      task.due_date < today &&
      task.status !== "done"
  ).length;

  const completion = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  const recentTasks = tasks.slice(0, 5);

  const projectProgress = useMemo(() => {
    return projects.map((project) => {
      const projectTasks = tasks.filter(
        (task) => task.project_id === project.id
      );

      const done = projectTasks.filter(
        (task) => task.status === "done"
      ).length;

      return {
        ...project,
        taskCount: projectTasks.length,
        completedCount: done,
        percentage: projectTasks.length
          ? Math.round((done / projectTasks.length) * 100)
          : 0,
      };
    });
  }, [projects, tasks]);

  const activity = useMemo(() => {
    const days = [];

    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);

      const dateKey = date.toISOString().slice(0, 10);
      const count = tasks.filter(
        (task) => task.created_at?.slice(0, 10) === dateKey
      ).length;

      days.push({
        date: dateKey,
        count,
        label: date.toLocaleDateString("en-GB", { weekday: "short" }),
      });
    }

    return days;
  }, [tasks]);

  const maxActivity = Math.max(1, ...activity.map((day) => day.count));

  const chartPoints = activity
    .map((day, index) => {
      const x = 18 + index * 57;
      const y = 112 - (day.count / maxActivity) * 88;
      return `${x},${y}`;
    })
    .join(" ");

  const chartArea = `18,112 ${chartPoints} 360,112`;

  const firstName = userEmail?.split("@")[0] || "there";

  return (
    <div className="page-content dashboard-page dashboard-v2">
      <section className="dash-welcome">
        <div className="dash-welcome-copy">
          <span className="dash-eyebrow">YOUR WORKSPACE</span>
          <h1>
            {getGreeting()}, <span>{firstName}</span>
            <span className="dash-heading-period">.</span>
          </h1>
          <p>Your central hub for managing projects and tasks.</p>
        </div>

        <button className="dash-primary-button" onClick={onOpenProjects}>
          <span className="dash-button-plus">＋</span>
          Open Projects
          <span className="dash-button-arrow">→</span>
        </button>
      </section>

      {error && (
        <div className="dash-error" role="alert">
          <strong>Unable to load data.</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="dash-stats-grid">
        <article className="dash-stat-card dash-stat-purple">
          <div className="dash-stat-top">
            <span className="dash-stat-icon">▦</span>
            <span className="dash-stat-caption">WORKSPACE</span>
          </div>
          <div className="dash-stat-number">{loading ? "—" : projects.length}</div>
          <div className="dash-stat-label">Projects</div>
          <div className="dash-stat-foot">Your workspaces</div>
          <span className="dash-stat-watermark">▦</span>
        </article>

        <article className="dash-stat-card dash-stat-blue">
          <div className="dash-stat-top">
            <span className="dash-stat-icon">☷</span>
            <span className="dash-stat-caption">ALL TASKS</span>
          </div>
          <div className="dash-stat-number">{loading ? "—" : tasks.length}</div>
          <div className="dash-stat-label">All Tasks</div>
          <div className="dash-stat-foot">Across your workspace</div>
          <span className="dash-stat-watermark">☷</span>
        </article>

        <article className="dash-stat-card dash-stat-orange">
          <div className="dash-stat-top">
            <span className="dash-stat-icon">◷</span>
            <span className="dash-stat-caption">IN PROGRESS</span>
          </div>
          <div className="dash-stat-number">{loading ? "—" : inProgress}</div>
          <div className="dash-stat-label">In Progress</div>
          <div className="dash-stat-foot">Currently in progress</div>
          <span className="dash-stat-watermark">◷</span>
        </article>

        <article className="dash-stat-card dash-stat-green">
          <div className="dash-stat-top">
            <span className="dash-stat-icon">✓</span>
            <span className="dash-stat-caption">COMPLETED</span>
          </div>
          <div className="dash-stat-number">{loading ? "—" : completed}</div>
          <div className="dash-stat-label">Completed</div>
          <div className="dash-stat-foot">Great work!</div>
          <span className="dash-stat-watermark">✓</span>
        </article>
      </section>

      <section className="dash-main-grid">
        <article className="dash-panel dash-productivity">
          <div className="dash-panel-heading">
            <div>
              <span className="dash-eyebrow">OVERVIEW</span>
              <h2>Your Productivity</h2>
              <p>An overview of all your task progress in one place.</p>
            </div>
            <span className="dash-period-tag">ALL WORKSPACE</span>
          </div>

          <div className="dash-productivity-content">
            <div className="dash-progress-ring" style={{ "--progress": `${completion}%` }}>
              <div className="dash-progress-inner">
                <strong>{loading ? "—" : `${completion}%`}</strong>
                <span>completed</span>
              </div>
            </div>

            <div className="dash-progress-details">
              <div className="dash-progress-detail">
                <span className="dash-detail-dot dash-dot-green" />
                <div>
                  <strong>{loading ? "—" : completed}</strong>
                  <span>Completed Tasks</span>
                </div>
              </div>
              <div className="dash-progress-detail">
                <span className="dash-detail-dot dash-dot-blue" />
                <div>
                  <strong>{loading ? "—" : tasks.length - completed}</strong>
                  <span>Remaining Tasks</span>
                </div>
              </div>
              <div className="dash-progress-detail">
                <span className="dash-detail-dot dash-dot-orange" />
                <div>
                  <strong>{loading ? "—" : overdue}</strong>
                  <span>Overdue Tasks</span>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-productivity-bottom">
            <span>Overall Progress</span>
            <strong>{loading ? "Loading..." : `${completed} / ${tasks.length}`}</strong>
          </div>
          <div className="dash-horizontal-track">
            <div style={{ width: `${completion}%` }} />
          </div>
        </article>

        <article className="dash-panel dash-activity">
          <div className="dash-panel-heading">
            <div>
              <span className="dash-eyebrow">ACTIVITY</span>
              <h2>Activity</h2>
              <p>New tasks from the last 7 days.</p>
            </div>
            <span className="dash-activity-icon">↗</span>
          </div>

          <div className="dash-chart">
            <div className="dash-chart-total">
              <strong>{loading ? "—" : activity.reduce((sum, day) => sum + day.count, 0)}</strong>
              <span>tasks created</span>
            </div>

            <svg viewBox="0 0 378 132" role="img" aria-label="Chart showing tasks created over the last seven days">
              <defs>
                <linearGradient id="dashChartGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#8175ef" stopOpacity=".24" />
                  <stop offset="100%" stopColor="#8175ef" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="10" y1="112" x2="368" y2="112" className="dash-chart-baseline" />
              <line x1="10" y1="68" x2="368" y2="68" className="dash-chart-gridline" />
              <line x1="10" y1="24" x2="368" y2="24" className="dash-chart-gridline" />
              {!loading && (
                <>
                  <polygon points={chartArea} fill="url(#dashChartGradient)" />
                  <polyline points={chartPoints} className="dash-chart-line" />
                  {activity.map((day, index) => {
                    const x = 18 + index * 57;
                    const y = 112 - (day.count / maxActivity) * 88;
                    return (
                      <circle
                        key={day.date}
                        cx={x}
                        cy={y}
                        r="4"
                        className="dash-chart-point"
                      />
                    );
                  })}
                </>
              )}
            </svg>

            <div className="dash-chart-labels">
              {activity.map((day) => (
                <span key={day.date}>{day.label}</span>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="dash-bottom-grid">
        <article className="dash-panel dash-projects-panel">
          <div className="dash-panel-heading dash-list-heading">
            <div>
              <span className="dash-eyebrow">YOUR WORK</span>
              <h2>Project Progress</h2>
              <p>Track the progress of your projects.</p>
            </div>
            <button className="dash-link-button" onClick={onOpenProjects}>
              View all <span>→</span>
            </button>
          </div>

          {loading ? (
            <div className="dash-empty-state">Loading projects...</div>
          ) : projectProgress.length === 0 ? (
            <div className="dash-empty-state">
              <span className="dash-empty-icon">▦</span>
              <strong>No projects yet</strong>
              <span>Create your first project and start organizing your work.</span>
              <button className="dash-inline-action" onClick={onOpenProjects}>
                Create Project <span>→</span>
              </button>
            </div>
          ) : (
            <div className="dash-project-list">
              {projectProgress.slice(0, 4).map((project, index) => (
                <button
                  className="dash-project-row"
                  key={project.id}
                  onClick={onOpenProjects}
                >
                  <span className={`dash-project-symbol dash-project-symbol-${index % 4}`}>
                    {project.name?.charAt(0)?.toUpperCase() || "P"}
                  </span>
                  <span className="dash-project-info">
                    <strong>{project.name}</strong>
                    <span>
                      {project.completedCount} of {project.taskCount} tasks completed
                    </span>
                    <span className="dash-project-track">
                      <i style={{ width: `${project.percentage}%` }} />
                    </span>
                  </span>
                  <strong className="dash-project-percent">{project.percentage}%</strong>
                  <span className="dash-project-arrow">→</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="dash-panel dash-recent-panel">
          <div className="dash-panel-heading dash-list-heading">
            <div>
              <span className="dash-eyebrow">LATEST UPDATES</span>
              <h2>Recent Tasks</h2>
              <p>Recently added to your projects.</p>
            </div>
            <button className="dash-link-button" onClick={onOpenProjects}>
              Open <span>→</span>
            </button>
          </div>

          {loading ? (
            <div className="dash-empty-state">Loading tasks...</div>
          ) : recentTasks.length === 0 ? (
            <div className="dash-empty-state">
              <span className="dash-empty-icon">☷</span>
              <strong>No tasks yet</strong>
              <span>Add tasks to one of your projects.</span>
              <button className="dash-inline-action" onClick={onOpenProjects}>
                Go to Projects <span>→</span>
              </button>
            </div>
          ) : (
            <div className="dash-recent-list">
              {recentTasks.map((task) => (
                <button
                  className="dash-recent-row"
                  key={task.id}
                  onClick={onOpenProjects}
                >
                  <span className={`dash-task-status-dot dash-task-${task.status}`} />
                  <span className="dash-recent-info">
                    <strong>{task.title}</strong>
                    <span>{STATUS_LABELS[task.status] || task.status || "No status"}</span>
                  </span>
                  <span className={`dash-priority dash-priority-${task.priority}`}>
                    {PRIORITY_LABELS[task.priority] || "—"}
                  </span>
                  <span className="dash-recent-date">{formatDate(task.due_date)}</span>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="dash-bottom-banner">
        <div className="dash-banner-symbol">✦</div>
        <div>
          <strong>Small steps lead to big results.</strong>
          <span>Stay on top of your projects and work at your own pace.</span>
        </div>
        <button onClick={onOpenProjects}>
          Get to Work <span>→</span>
        </button>
      </section>

      <footer className="page-footer dash-footer">
        <span>TaskSync</span>
        <span>Organize your work. Find your flow.</span>
      </footer>
    </div>
  );
}

export default Dashboard;
