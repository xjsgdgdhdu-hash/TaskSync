
import Dashboard from "./Dashboard.jsx";
import "./App.css";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import Projects from "./Projects.jsx";
import AgentBar from "./AgentBar.jsx";
import { Icon, useSpotlight } from "./ui.jsx";
import "./apple.css"; // must stay the last import

function App() {
  useSpotlight();
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState({
    projects: 0,
    tasks: 0,
    inProgress: 0,
    completed: 0,
  });

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (mounted && !error) {
        setSession(data.session);
      }

      if (mounted) {
        setAuthReady(true);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setView("dashboard");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setStats({
        projects: 0,
        tasks: 0,
        inProgress: 0,
        completed: 0,
      });
      return;
    }

    let cancelled = false;

    async function loadStats() {
      const [
        projectsResult,
        tasksResult,
        inProgressResult,
        completedResult,
      ] = await Promise.all([
        supabase
          .from("projects")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress"),

        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "done"),
      ]);

      if (cancelled) return;

      setStats({
        projects: projectsResult.count ?? 0,
        tasks: tasksResult.count ?? 0,
        inProgress: inProgressResult.count ?? 0,
        completed: completedResult.count ?? 0,
      });
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [session, view]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setMessage("Your account has been created. You can now log in.");
        setIsRegister(false);
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setMessage("Login successful!");
      }
    } catch (error) {
      setMessage("An error occurred: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage("Logout error: " + error.message);
    } else {
      setView("dashboard");
      setMessage("");
    }
  }

  if (!authReady) {
    return (
      <div className="app-loading">
        <div className="loading-mark">T</div>
        <span>Loading TaskSync...</span>
      </div>
    );
  }

  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-decoration auth-decoration-one" />
        <div className="auth-decoration auth-decoration-two" />

        <section className="auth-card">
          <div className="auth-brand">
            <div className="brand-mark">T</div>
            <span>TaskSync</span>
          </div>

          <div className="auth-heading">
            <span className="eyebrow">WORKSPACE · PRODUCTIVITY</span>
            <h1>
              {isRegister ? "Create your account." : "Welcome back."}
            </h1>
            <p>
              {isRegister
                ? "Join TaskSync and organize your work."
                : "Log in and get back to your projects."}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="e.g. you@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={6}
              required
            />

            <button className="primary-button auth-submit" type="submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : isRegister
                  ? "Create account"
                  : "Log in"}
              <span>→</span>
            </button>
          </form>

          {message && (
            <div className="auth-message" role="status">
              {message}
            </div>
          )}

          <div className="auth-switch">
            {isRegister ? "Already have an account?" : "Don't have an account yet?"}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setMessage("");
              }}
            >
              {isRegister ? "Log in" : "Create account"}
            </button>
          </div>

          <div className="auth-footer">
            Simple. Clear. Productive.
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">T</div>
          <span>TaskSync</span>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>

        <nav className="sidebar-nav" style={{ "--i": view === "projects" ? 1 : 0 }}>
          <span className="nav-pill" />
          <button
            className={`nav-item ${view === "dashboard" ? "active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            <span className="nav-icon"><Icon name="home" /></span>
            <span>Dashboard</span>
            {view === "dashboard" && <span className="active-indicator" />}
          </button>

          <button
            className={`nav-item ${view === "projects" ? "active" : ""}`}
            onClick={() => setView("projects")}
          >
            <span className="nav-icon"><Icon name="folder" /></span>
            <span>Projects</span>
            {view === "projects" && <span className="active-indicator" />}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="user-avatar">
              {session.user.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="user-info">
              <strong>My account</strong>
              <span>{session.user.email}</span>
            </div>
          </div>

          <button className="logout-button" onClick={handleLogout}>
            <span><Icon name="logout" size={17} /></span>
            Log out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{view === "dashboard" ? "Dashboard" : "Projects"}</strong>
          </div>

          <div className="topbar-right">
            <span className="online-indicator" />
            <span>All caught up</span>
            <div className="topbar-avatar">
              {session.user.email?.charAt(0).toUpperCase() || "U"}
            </div>
          </div>
        </header>

        {view === "projects" ? (
          <div className="page-content projects-page">
            <Projects key={refreshKey} />
          </div>
        ) : (
          <Dashboard
            key={refreshKey}
            onOpenProjects={() => setView("projects")}
            userEmail={session.user.email}
          />
        )}
      </main>

      <AgentBar onChanged={() => setRefreshKey((key) => key + 1)} />
    </div>
  );
}

export default App;
