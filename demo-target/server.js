import { createServer } from "node:http";

// In-memory only — resets on restart. Good enough for a demo target.
let tasks = [
  { id: 1, title: "Write test charter", done: false },
  { id: 2, title: "Review PR feedback", done: true },
  { id: 3, title: "Ship the release notes", done: false },
];
let nextId = 4;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function renderPage() {
  const items = tasks
    .map(
      (task) =>
        `<li class="task-item" data-id="${task.id}">` +
        `<span class="task-title">${escapeHtml(task.title)}</span>` +
        `${task.done ? " (done)" : ""}</li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Task Manager</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; }
    nav a { margin-right: 1rem; }
    #stats-output { background: #f4f4f4; padding: 0.5rem; min-height: 1.5rem; }
  </style>
</head>
<body>
  <nav>
    <a href="/">Home</a>
    <a href="/archive">Archive</a>
  </nav>
  <h1>Task Manager</h1>
  <img src="/img/logo.png" alt="Task Manager logo" width="48" height="48" />

  <section>
    <h2>Tasks</h2>
    <ul id="task-list">
${items}
    </ul>
    <button id="sort-btn" type="button">Sort</button>
  </section>

  <section>
    <h2>Add a task</h2>
    <form id="add-task-form">
      <input id="task-title-input" name="title" placeholder="New task title" aria-label="New task title" />
      <button type="submit">Add</button>
    </form>
  </section>

  <section>
    <h2>Stats</h2>
    <button id="stats-btn" type="button">Show stats</button>
    <pre id="stats-output"></pre>
  </section>

  <script>
    document.getElementById("sort-btn").addEventListener("click", () => {
      // Bug: NodeList has no .sortItems — throws an uncaught TypeError.
      const items = document.querySelectorAll(".task-item");
      items.sortItems((a, b) => a.textContent.localeCompare(b.textContent));
    });

    document.getElementById("stats-btn").addEventListener("click", async () => {
      const output = document.getElementById("stats-output");
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) {
          output.textContent = "Failed to load stats (" + res.status + ")";
          return;
        }
        output.textContent = JSON.stringify(await res.json());
      } catch (err) {
        output.textContent = "Failed to load stats";
      }
    });

    document.getElementById("add-task-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("task-title-input");
      // Bug: no client-side trim/empty check before submitting.
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.value }),
      });
      if (res.ok) {
        const list = document.getElementById("task-list");
        const task = await res.json();
        const li = document.createElement("li");
        li.className = "task-item";
        li.dataset.id = String(task.id);
        const span = document.createElement("span");
        span.className = "task-title";
        span.textContent = task.title;
        li.appendChild(span);
        list.appendChild(li);
        input.value = "";
      }
    });
  </script>
</body>
</html>`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length > 0 ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderPage());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tasks));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks") {
      const body = await readJsonBody(req);
      // Bug: accepts an empty or whitespace-only title — no server-side
      // validation either. This is the seeded form-validation gap.
      const task = { id: nextId++, title: body.title ?? "", done: false };
      tasks.push(task);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(task));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      // Bug: dereferences a property on undefined — always throws, always 500.
      const summary = undefined;
      const completedCount = summary.completed;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ completedCount }));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

const requestedPort = Number(process.env.DEMO_TARGET_PORT ?? process.env.PORT ?? 0);
server.listen(requestedPort, () => {
  const { port } = server.address();
  console.log(`Task Manager demo target listening on http://127.0.0.1:${port}`);
});

process.once("SIGINT", () => server.close(() => process.exit(0)));
process.once("SIGTERM", () => server.close(() => process.exit(0)));
