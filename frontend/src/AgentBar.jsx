import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { Icon } from "./ui.jsx";
import "./AgentBar.css";

const AGENT_URL = import.meta.env.VITE_AGENT_URL || "http://localhost:8000";

const SUGGESTIONS = [
  { icon: "clock", title: "What's overdue?", hint: "See what needs attention", text: "What's overdue?" },
  { icon: "list", title: "Summarize projects", hint: "Progress at a glance", text: "Summarize my projects" },
  { icon: "calendar", title: "Plan my week", hint: "Based on dates and priorities", text: "Help me plan my week based on due dates and priorities" },
  { icon: "plus", title: "Add a task", hint: "Just say it in plain words", text: "Add a high priority task to my first project, due Friday" },
];
const FOLLOWUPS_DONE = ["What's overdue?", "Summarize my projects"];
const FOLLOWUPS_INFO = ["Plan my week", "What's due this week?"];
const THINKING = ["Thinking…", "Checking your workspace…", "Putting it together…"];
const ACTION_ICON = { create_task: "plus", update_task: "check", create_project: "folder" };

function Orb({ size = 28, thinking = false }) {
  return <span className={`ai-orb ${thinking ? "thinking" : ""}`} style={{ "--s": `${size}px` }} aria-hidden="true" />;
}

/* Tiny markdown: **bold**, `code`, bullet and numbered lists */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function Rich({ text }) {
  const blocks = [];
  let list = null;
  text.split("\n").forEach((raw, i) => {
    const match = raw.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/);
    if (match) {
      if (!list) { list = []; blocks.push({ type: "ul", items: list, key: i }); }
      list.push(match[1]);
    } else {
      list = null;
      if (raw.trim()) blocks.push({ type: "p", text: raw, key: i });
    }
  });
  return blocks.map((b) =>
    b.type === "ul"
      ? <ul key={b.key}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>
      : <p key={b.key}>{inline(b.text)}</p>
  );
}

function useReveal(text, active, onProgress, onDone) {
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  const [count, setCount] = useState(active ? 0 : tokens.length);

  useEffect(() => {
    if (!active) return;
    let n = 0;
    const id = setInterval(() => {
      n = Math.min(tokens.length, n + 3);
      setCount(n);
      onProgress?.();
      if (n >= tokens.length) { clearInterval(id); onDone?.(); }
    }, 26);
    return () => clearInterval(id);
  }, [active]);

  return tokens.slice(0, count).join("");
}

function ActionCard({ action, index }) {
  const match = action.summary.match(/^(.*?) “(.*)”$/);
  return (
    <div className="agent-action" style={{ animationDelay: `${index * 110}ms` }}>
      <span className="agent-action-icon"><Icon name={ACTION_ICON[action.tool] || "check"} size={16} /></span>
      <div>
        <strong>{match ? match[1] : action.summary}</strong>
        {match && <span>{match[2]}</span>}
      </div>
      <svg className="agent-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </div>
  );
}

function AssistantMessage({ message, isLast, busy, onPick, onProgress, onRevealed }) {
  const content = message.content || "";
  const shown = useReveal(content, !!message.fresh, onProgress, onRevealed);
  const done = shown.length >= content.length;
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const followups = message.actions?.length ? FOLLOWUPS_DONE : FOLLOWUPS_INFO;

  return (
    <div className={`agent-row agent-assistant ${message.error ? "agent-error" : ""}`}>
      <Orb size={26} />
      <div className="agent-content">
        {message.actions?.length > 0 && (
          <div className="agent-actions">
            {message.actions.map((action, i) => <ActionCard key={i} action={action} index={i} />)}
          </div>
        )}
        {content && (
          <div className="agent-text">
            <Rich text={shown} />
            {!done && <span className="agent-caret" />}
          </div>
        )}
        {done && content && (
          <div className="agent-tools">
            <button type="button" onClick={copy} aria-label="Copy reply">
              <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {done && isLast && !busy && !message.error && (
          <div className="agent-followups">
            {followups.map((text) => <button key={text} type="button" onClick={() => onPick(text)}>{text}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % THINKING.length), 1900);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="agent-row agent-assistant">
      <Orb size={26} thinking />
      <span key={step} className="agent-shimmer">{THINKING[step]}</span>
    </div>
  );
}

function AgentBar({ onChanged }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const nextId = useRef(1);

  const scrollEnd = () => endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });

  useEffect(() => {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, busy, open]);

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;

    const next = [...messages, { id: nextId.current++, role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`${AGENT_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok) throw new Error(`Agent error (${response.status})`);
      const result = await response.json();

      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", content: result.reply, actions: result.actions, fresh: true },
      ]);
      if (result.actions?.length) onChanged?.();
    } catch {
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", content: "I couldn't reach the agent. Is the server running?", error: true, fresh: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const markRevealed = (id) =>
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, fresh: false } : m)));

  return (
    <>
      <button className="agent-fab" onClick={() => setOpen(true)} aria-label="Ask TaskSync">
        <Orb size={22} />
        <span>Ask TaskSync</span>
        <kbd>⌘K</kbd>
      </button>

      {open && (
        <div className="agent-overlay" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="agent-shell">
            <div className={`agent-glow ${busy ? "busy" : ""}`} />
            <div className={`agent-ring ${busy ? "busy" : ""}`} />

            <div className="agent-panel" role="dialog" aria-label="TaskSync assistant">
              <header className="agent-head">
                <Orb size={30} thinking={busy} />
                <div className="agent-head-text">
                  <strong>TaskSync AI</strong>
                  <span><i className={busy ? "busy" : ""} />{busy ? "Working on it" : "Ready"}</span>
                </div>
                {messages.length > 0 && (
                  <button type="button" className="agent-icon-btn" onClick={() => setMessages([])} aria-label="New chat" title="New chat">
                    <Icon name="edit" size={16} />
                  </button>
                )}
                <button type="button" className="agent-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                  <Icon name="x" size={16} />
                </button>
              </header>

              <div className="agent-thread">
                {messages.length === 0 && (
                  <div className="agent-empty">
                    <Orb size={72} />
                    <h3>How can I help?</h3>
                    <p>Create tasks, move work forward or get a summary. Just say it.</p>
                    <div className="agent-suggestions">
                      {SUGGESTIONS.map((item, i) => (
                        <button key={item.title} style={{ animationDelay: `${120 + i * 70}ms` }} onClick={() => send(item.text)}>
                          <span className="agent-sug-icon"><Icon name={item.icon} size={17} /></span>
                          <strong>{item.title}</strong>
                          <em>{item.hint}</em>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message, index) =>
                  message.role === "user" ? (
                    <div key={message.id} className="agent-row agent-user"><p>{message.content}</p></div>
                  ) : (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      isLast={index === messages.length - 1}
                      busy={busy}
                      onPick={send}
                      onProgress={scrollEnd}
                      onRevealed={() => markRevealed(message.id)}
                    />
                  )
                )}

                {busy && <Thinking />}
                <div ref={endRef} />
              </div>

              <form className="agent-input" onSubmit={(event) => { event.preventDefault(); send(input); }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask or tell TaskSync what to do…"
                  maxLength={500}
                />
                <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
                  <Icon name="arrowUp" size={17} />
                </button>
              </form>

              <footer className="agent-hints">
                <span><kbd>↵</kbd> Send</span>
                <span><kbd>Esc</kbd> Close</span>
                <span><kbd>⌘K</kbd> Toggle</span>
              </footer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AgentBar;
