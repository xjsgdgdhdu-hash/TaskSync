import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { Icon } from "./ui.jsx";
import "./AgentBar.css";

const AGENT_URL = import.meta.env.VITE_AGENT_URL || "http://localhost:8000";
const SUGGESTIONS = [
  "What's overdue?",
  "Summarize my projects",
  "Add a high priority task to my first project, due Friday",
];

function AgentBar({ onChanged }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);

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
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;

    const next = [...messages, { role: "user", content }];
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
        { role: "assistant", content: result.reply, actions: result.actions },
      ]);
      if (result.actions?.length) onChanged?.();
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "I couldn't reach the agent. Is the server running?", error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="agent-fab" onClick={() => setOpen(true)} aria-label="Ask TaskSync">
        <Icon name="sparkle" size={16} />
        Ask TaskSync
        <kbd>⌘K</kbd>
      </button>

      {open && (
        <div
          className="agent-overlay"
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <div className="agent-panel" role="dialog" aria-label="TaskSync assistant">
            <div className="agent-thread">
              {messages.length === 0 && (
                <div className="agent-empty">
                  <div className="agent-empty-icon"><Icon name="sparkle" size={24} /></div>
                  <h3>What would you like to do?</h3>
                  <p>Create tasks, move work forward or get a summary, in plain language.</p>
                  <div className="agent-suggestions">
                    {SUGGESTIONS.map((item) => (
                      <button key={item} onClick={() => send(item)}>{item}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div key={index} className={`agent-msg agent-${message.role} ${message.error ? "agent-error" : ""}`}>
                  {message.actions?.map((action, i) => (
                    <div className="agent-action" key={i}>
                      <Icon name="check" size={13} /> {action.summary}
                    </div>
                  ))}
                  {message.content && <p>{message.content}</p>}
                </div>
              ))}

              {busy && (
                <div className="agent-msg agent-assistant agent-typing" aria-label="Thinking">
                  <span /><span /><span />
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form className="agent-input" onSubmit={(event) => { event.preventDefault(); send(input); }}>
              <Icon name="sparkle" size={18} />
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask or tell TaskSync what to do…"
                maxLength={500}
              />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
                <Icon name="arrowL" size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default AgentBar;
