"""TaskSync agent: an LLM that manages projects and tasks through tools.

Security model: the browser sends the user's Supabase access token. Every
database call runs *as that user*, so Row Level Security still applies and the
agent can never touch data the user couldn't touch themselves.
"""
import json
import os
from datetime import date
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
MAX_STEPS = 6

llm = OpenAI()
app = FastAPI(title="TaskSync Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

STATUSES = ["todo", "in_progress", "done"]
PRIORITIES = ["low", "medium", "high"]


# ---------- Tools the model can call ----------
def _fn(name, description, properties, required=()):
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties, "required": list(required)}}}

TOOLS = [
    _fn("list_projects", "List all of the user's projects with their ids.", {}),
    _fn("list_tasks", "List tasks, optionally filtered. Use to answer questions about workload, overdue or urgent work.",
        {"project_id": {"type": "string"},
         "status": {"type": "string", "enum": STATUSES},
         "priority": {"type": "string", "enum": PRIORITIES},
         "overdue_only": {"type": "boolean", "description": "Only tasks past their due date and not done."}}),
    _fn("create_project", "Create a new project.",
        {"name": {"type": "string"}, "description": {"type": "string"}}, ["name"]),
    _fn("create_task", "Create a task in a project. Resolve due dates to YYYY-MM-DD.",
        {"project_id": {"type": "string"}, "title": {"type": "string"}, "description": {"type": "string"},
         "priority": {"type": "string", "enum": PRIORITIES}, "due_date": {"type": "string"}},
        ["project_id", "title"]),
    _fn("update_task", "Change a task's status, priority, due date or title.",
        {"task_id": {"type": "string"}, "title": {"type": "string"},
         "status": {"type": "string", "enum": STATUSES}, "priority": {"type": "string", "enum": PRIORITIES},
         "due_date": {"type": "string"}}, ["task_id"]),
]
WRITE_TOOLS = {"create_project", "create_task", "update_task"}


def run_tool(name, args, db, user_id):
    if name == "list_projects":
        rows = db.table("projects").select("id, name, description").order("created_at", desc=True).execute().data
        return {"projects": rows}

    if name == "list_tasks":
        q = db.table("tasks").select("id, title, status, priority, due_date, project_id")
        for key in ("project_id", "status", "priority"):
            if args.get(key):
                q = q.eq(key, args[key])
        rows = q.order("created_at", desc=True).limit(60).execute().data
        if args.get("overdue_only"):
            today = date.today().isoformat()
            rows = [r for r in rows if r["due_date"] and r["due_date"] < today and r["status"] != "done"]
        return {"tasks": rows}

    if name == "create_project":
        row = db.table("projects").insert({
            "name": args["name"].strip()[:80],
            "description": args.get("description", ""),
            "owner_id": user_id,
        }).execute().data[0]
        return {"id": row["id"], "name": row["name"]}

    if name == "create_task":
        if not db.table("projects").select("id").eq("id", args["project_id"]).execute().data:
            return {"error": "Project not found. Call list_projects to get a valid id."}
        row = db.table("tasks").insert({
            "project_id": args["project_id"],
            "title": args["title"].strip(),
            "description": args.get("description", ""),
            "priority": args.get("priority", "medium"),
            "due_date": args.get("due_date") or None,
            "status": "todo",
        }).execute().data[0]
        return {"id": row["id"], "title": row["title"]}

    if name == "update_task":
        changes = {k: args[k] for k in ("title", "status", "priority", "due_date") if args.get(k)}
        if not changes:
            return {"error": "Nothing to update."}
        rows = db.table("tasks").update(changes).eq("id", args["task_id"]).execute().data
        if not rows:
            return {"error": "Task not found."}
        return {"id": rows[0]["id"], "title": rows[0]["title"]}

    return {"error": f"Unknown tool {name}"}


def summarize(name, result):
    label = {"create_project": "Created project", "create_task": "Created task", "update_task": "Updated task"}[name]
    return f'{label} “{result.get("name") or result.get("title")}”'


# ---------- API ----------
class Msg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    messages: list[Msg] = Field(min_length=1, max_length=40)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
def chat(body: ChatIn, authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing access token")
    token = authorization.split(" ", 1)[1]

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        user = db.auth.get_user(token).user
    except Exception:
        raise HTTPException(401, "Invalid or expired session")
    db.postgrest.auth(token)  # run every query as this user (RLS applies)

    system = (
        "You are TaskSync's assistant. You manage the user's projects and tasks using tools.\n"
        f"Today is {date.today().isoformat()}. Resolve relative dates (e.g. 'Friday') to YYYY-MM-DD.\n"
        "Always call list_projects before using a project id; never guess ids. "
        "Match project names loosely. If a request is ambiguous, ask one short question instead of guessing. "
        "You cannot delete anything. Be brief, reply in the user's language, and state what you changed."
    )
    messages = [{"role": "system", "content": system}] + [m.model_dump() for m in body.messages[-12:]]
    actions = []

    for _ in range(MAX_STEPS):
        msg = llm.chat.completions.create(model=MODEL, messages=messages, tools=TOOLS).choices[0].message
        if not msg.tool_calls:
            return {"reply": msg.content or "", "actions": actions}

        messages.append(msg.model_dump(exclude_none=True))
        for call in msg.tool_calls:
            name = call.function.name
            try:
                result = run_tool(name, json.loads(call.function.arguments or "{}"), db, user.id)
            except Exception as exc:  # let the model see the error and recover
                result = {"error": str(exc)}
            if name in WRITE_TOOLS and "error" not in result:
                actions.append({"tool": name, "summary": summarize(name, result)})
            messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, default=str)})

    return {"reply": "I couldn't finish that. Try a simpler request.", "actions": actions}
