import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import Kanban from "./Kanban.jsx";
import { useToast } from "./hooks/useToast.js";
import Toast from "./components/Toast.jsx";
import "./Projects.css";
import { Icon, useConfirm } from "./ui.jsx";

const pluralProjects = (count) =>
  count === 1 ? "project" : "projects";

function Projects() {
  const [projects, setProjects] = useState([]);
  const [projectStats, setProjectStats] = useState({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  const { toasts, showToast, removeToast } = useToast();
  const { ask, dialog } = useConfirm();

  useEffect(() => {
    function onKey(event) {
      const tag = event.target.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "n" && !showForm && !selectedProject) {
        event.preventDefault();
        openCreateForm();
      }
      if (event.key === "/" && !selectedProject) {
        event.preventDefault();
        document.querySelector(".projects-search input")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, selectedProject]);

  async function loadProjects() {
    setLoading(true);

    const [projectsResult, tasksResult] = await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("project_id, status")
    ]);

    if (projectsResult.error) {
      showToast(
        "Could not load projects: " + projectsResult.error.message,
        "error"
      );
      setLoading(false);
      return;
    }

    if (tasksResult.error) {
      showToast(
        "Could not load task statistics: " + tasksResult.error.message,
        "error"
      );
    }

    const stats = {};

    (tasksResult.data || []).forEach((task) => {
      if (!stats[task.project_id]) {
        stats[task.project_id] = {
          total: 0,
          completed: 0,
          inProgress: 0,
          todo: 0
        };
      }

      stats[task.project_id].total += 1;

      if (task.status === "done") {
        stats[task.project_id].completed += 1;
      } else if (task.status === "in_progress") {
        stats[task.project_id].inProgress += 1;
      } else {
        stats[task.project_id].todo += 1;
      }
    });

    setProjects(projectsResult.data || []);
    setProjectStats(stats);
    setLoading(false);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!showForm) return;

    function handleEscape(event) {
      if (event.key === "Escape" && !saving) {
        closeForm();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showForm, saving]);

  function openCreateForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setShowForm(true);
  }

  function startEditing(project) {
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description || "");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setName("");
    setDescription("");
  }

  async function saveProject(event) {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!cleanName) {
      showToast("Enter a project name.", "warning");
      return;
    }

    setSaving(true);

    let error;

    if (editingId) {
      const result = await supabase
        .from("projects")
        .update({
          name: cleanName,
          description: cleanDescription
        })
        .eq("id", editingId);

      error = result.error;
    } else {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        showToast("Could not retrieve the user.", "error");
        setSaving(false);
        return;
      }

      const result = await supabase
        .from("projects")
        .insert({
          name: cleanName,
          description: cleanDescription,
          owner_id: user.id
        });

      error = result.error;
    }

    if (error) {
      showToast("Save error: " + error.message, "error");
      setSaving(false);
      return;
    }

    showToast(
      editingId
        ? "Project updated successfully!"
        : "New project created successfully!"
    );

    setShowForm(false);
    setEditingId(null);
    setName("");
    setDescription("");

    await loadProjects();
    setSaving(false);
  }

  async function deleteProject(id) {
    const confirmed = await ask({
      title: "Delete this project?",
      message: "All of its tasks will be deleted too. This can't be undone.",
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id);

    if (error) {
      showToast("Delete error: " + error.message, "error");
      return;
    }

    showToast("Project deleted.");

    if (editingId === id) {
      closeForm();
    }

    await loadProjects();
  }

  const filteredProjects = useMemo(() => {
    let result = [...projects];

    const searchValue = search.trim().toLowerCase();

    if (searchValue) {
      result = result.filter((project) =>
        `${project.name} ${project.description || ""}`
          .toLowerCase()
          .includes(searchValue)
      );
    }

    if (filter === "active") {
      result = result.filter((project) => {
        const stats = projectStats[project.id] || { total: 0, completed: 0 };
        return stats.total === 0 || stats.completed < stats.total;
      });
    }

    if (filter === "completed") {
      result = result.filter((project) => {
        const stats = projectStats[project.id] || { total: 0, completed: 0 };
        return stats.total > 0 && stats.completed === stats.total;
      });
    }

    if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name, "en"));
    } else if (sort === "progress") {
      result.sort((a, b) => {
        const aStats = projectStats[a.id] || { total: 0, completed: 0 };
        const bStats = projectStats[b.id] || { total: 0, completed: 0 };
        const aProgress = aStats.total ? aStats.completed / aStats.total : 0;
        const bProgress = bStats.total ? bStats.completed / bStats.total : 0;
        return bProgress - aProgress;
      });
    } else {
      result.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
    }

    return result;
  }, [projects, projectStats, search, filter, sort]);

  const totalTasks = Object.values(projectStats).reduce(
    (sum, stats) => sum + stats.total,
    0
  );

  const completedTasks = Object.values(projectStats).reduce(
    (sum, stats) => sum + stats.completed,
    0
  );

  if (selectedProject) {
    return (
      <>
        <Kanban
          project={selectedProject}
          onBack={() => {
            setSelectedProject(null);
            loadProjects();
          }}
        />

        <div className="toast-container">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              toast={toast}
              onClose={removeToast}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="projects-page">
      <section className="projects-hero">
        <div className="projects-hero-copy">
          <div className="projects-eyebrow">
            <span className="projects-eyebrow-dot" />
            YOUR TEAM WORKSPACE
          </div>

          <h1>
            All Projects
            <span>.</span>
          </h1>

          <p>
            Organize your work, track progress, and turn ideas
            into completed projects.
          </p>
        </div>

        <button className="projects-create-button" onClick={openCreateForm}>
          <Icon name="plus" size={16} />
          New Project
        </button>
      </section>

      <section className="projects-overview">
        <div className="projects-overview-card">
          <div className="projects-overview-icon icon-purple">
            <Icon name="folder" />
          </div>
          <div>
            <span className="projects-overview-label">All Projects</span>
            <strong>{projects.length}</strong>
            <small>{pluralProjects(projects.length)} in your workspace</small>
          </div>
        </div>

        <div className="projects-overview-card">
          <div className="projects-overview-icon icon-blue">
            <Icon name="clock" />
          </div>
          <div>
            <span className="projects-overview-label">All Tasks</span>
            <strong>{totalTasks}</strong>
            <small>Tasks across all projects</small>
          </div>
        </div>

        <div className="projects-overview-card">
          <div className="projects-overview-icon icon-green">
            <Icon name="check" size={12} />
          </div>
          <div>
            <span className="projects-overview-label">Completed Tasks</span>
            <strong>{completedTasks}</strong>
            <small>
              {totalTasks
                ? `${Math.round((completedTasks / totalTasks) * 100)}% of all tasks`
                : "No completed tasks yet"}
            </small>
          </div>
        </div>
      </section>

      <section className="projects-workspace">
        <div className="projects-section-heading">
          <div>
            <h2>Your Workspace</h2>
            <p>Select a project and get back to work.</p>
          </div>

          <span className="projects-results-count">
            {filteredProjects.length} results
          </span>
        </div>

        <div className="projects-toolbar">
          <div className="projects-search">
            <span className="projects-search-icon"><Icon name="search" size={16} /></span>
            <input
              type="search"
              placeholder="Search projects (press /)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search projects"
            />
            {search && (
              <button
                className="projects-clear-search"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="projects-toolbar-right">
            <div className="projects-filters" data-active={["all", "active", "completed"].indexOf(filter)}>
              <button
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                className={filter === "active" ? "active" : ""}
                onClick={() => setFilter("active")}
              >
                Active
              </button>
              <button
                className={filter === "completed" ? "active" : ""}
                onClick={() => setFilter("completed")}
              >
                Completed
              </button>
            </div>

            <select
              className="projects-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort projects"
            >
              <option value="newest">Newest</option>
              <option value="name">Name A–Z</option>
              <option value="progress">Progress</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="projects-loading-grid">
            {[1, 2, 3].map((item) => (
              <div className="project-skeleton" key={item}>
                <div />
                <div />
                <div />
                <div />
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="projects-empty">
            <div className="projects-empty-icon">
              <Icon name={search || filter !== "all" ? "search" : "sparkle"} size={26} />
            </div>
            <h3>
              {search || filter !== "all"
                ? "No projects found"
                : "Start with your first project"}
            </h3>
            <p>
              {search || filter !== "all"
                ? "Try changing your search or selected filter."
                : "Create a project, add tasks, and plan your team's work."}
            </p>
            {search || filter !== "all" ? (
              <button
                className="projects-empty-button secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear Filters
              </button>
            ) : (
              <button
                className="projects-empty-button"
                onClick={openCreateForm}
              >
                <span>+</span> Create Your First Project
              </button>
            )}
          </div>
        ) : (
          <div className="projects-grid">
            {filteredProjects.map((project, index) => {
              const stats = projectStats[project.id] || {
                total: 0,
                completed: 0,
                inProgress: 0,
                todo: 0
              };

              const progress = stats.total
                ? Math.round((stats.completed / stats.total) * 100)
                : 0;

              const isCompleted = stats.total > 0 && progress === 100;

              return (
                <article
                  className={`project-card project-card-accent-${index % 4}`}
                  key={project.id}
                >
                  <div className="project-card-top">
                    <div className="project-card-symbol">
                      <Icon name="folder" />
                    </div>

                    <div className="project-card-menu">
                      <button
                        className="project-icon-button"
                        onClick={() => startEditing(project)}
                        title="Edit project"
                        aria-label={`Edit project ${project.name}`}
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        className="project-icon-button danger"
                        onClick={() => deleteProject(project.id)}
                        title="Delete project"
                        aria-label={`Delete project ${project.name}`}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="project-card-content">
                    <div className="project-card-title-row">
                      <h3>{project.name}</h3>
                      {isCompleted && (
                        <span className="project-completed-badge">
                          <Icon name="check" size={12} /> Completed
                        </span>
                      )}
                    </div>

                    <p className="project-card-description">
                      {project.description || "This project has no description yet."}
                    </p>
                  </div>

                  <div className="project-card-stats">
                    <div>
                      <span className="project-stat-number">{stats.total}</span>
                      <span className="project-stat-label">Tasks</span>
                    </div>
                    <div>
                      <span className="project-stat-number">{stats.inProgress}</span>
                      <span className="project-stat-label">In Progress</span>
                    </div>
                    <div>
                      <span className="project-stat-number">{stats.completed}</span>
                      <span className="project-stat-label">Completed</span>
                    </div>
                  </div>

                  <div className="project-progress-area">
                    <div className="project-progress-heading">
                      <span>Project Progress</span>
                      <strong>{progress}%</strong>
                    </div>
                    <div
                      className="project-progress-track"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label={`Project progress for ${project.name}`}
                    >
                      <div
                        className="project-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="project-card-footer">
                    <span className="project-created-date">
                      Created{" "}
                      {project.created_at
                        ? new Date(project.created_at).toLocaleDateString("en-GB")
                        : "—"}
                    </span>

                    <button
                      className="project-open-button"
                      onClick={() => setSelectedProject(project)}
                    >
                      Open Project <span>→</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {showForm && (
        <div
          className="projects-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <form className="projects-modal" onSubmit={saveProject}>
            <div className="projects-modal-header">
              <div>
                <span className="projects-modal-eyebrow">
                  {editingId ? "PROJECT SETTINGS" : "NEW WORKSPACE"}
                </span>
                <h2>{editingId ? "Edit Project" : "Create Project"}</h2>
                <p>
                  {editingId
                    ? "Update your project information."
                    : "Give your project a name and describe what you'll be working on."}
                </p>
              </div>

              <button
                type="button"
                className="projects-modal-close"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className="projects-form-label" htmlFor="project-name">
              Project Name
            </label>
            <input
              id="project-name"
              className="projects-form-input"
              placeholder="e.g. New Website"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              autoFocus
            />

            <label className="projects-form-label" htmlFor="project-description">
              Description <span>(optional)</span>
            </label>
            <textarea
              id="project-description"
              className="projects-form-textarea"
              placeholder="Briefly describe the project's goals and scope..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={500}
            />

            <div className="projects-modal-footer">
              <button
                type="button"
                className="projects-cancel-button"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="projects-submit-button"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Create Project"}
                {!saving && <span>→</span>}
              </button>
            </div>
          </form>
        </div>
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
    </div>
  );
}

export default Projects;



