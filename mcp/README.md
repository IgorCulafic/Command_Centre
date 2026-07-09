# Command Center — MCP server

Lets an AI client (Claude Desktop, Claude Code, ChatGPT desktop via MCP, …)
read and edit your Command Center lists in natural language:

> "Add the Riverside night market to my Local Events — here's the link and poster."
> "What events do I have coming up?"
> "Mark the dentist task done."

It's a **thin client over the REST API** (the API is the stable contract). It
stores nothing itself and does **no scraping** — *the AI* finds things in its own
environment, then calls these tools to file the results here as posts (title +
link + image + date → a list). See [`docs/CLAUDE.md`](../docs/CLAUDE.md) §12.

## Tools

| Tool | What it does |
|---|---|
| `cc_list_spaces` | List your lists/folders (read-only) |
| `cc_list_items` | List items, filter by list/type (read-only) |
| `cc_create_item` | **Create a post** — task/note/link/opportunity/**event** with link + image + date |
| `cc_update_item` | Edit, set status, or move an item |
| `cc_delete_item` | Soft-delete (recoverable) |
| `cc_create_space` | Make a new list (optionally nested) |
| `cc_list_statuses` | List statuses + behaviors (for setting status) |

## Setup (one time)

```powershell
cd D:\AI\Me_Command_Center\mcp
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Configuration (environment variables)

| Var | Default | When to set |
|---|---|---|
| `COMMAND_CENTER_URL` | `https://igorc-1.tailac7b3.ts.net` | If the backend lives elsewhere (e.g. the NAS, or `http://localhost:8000`) |
| `COMMAND_CENTER_TOKEN` | *(none)* | Only if the backend has `AUTH_TOKEN` set — then use the same value |

The machine running the AI client must be on the Tailscale network to reach the
default URL.

## Register it

### Claude Desktop
Edit `%APPDATA%\Claude\claude_desktop_config.json` and add (use **full paths**):

```json
{
  "mcpServers": {
    "command-center": {
      "command": "D:\\AI\\Me_Command_Center\\mcp\\.venv\\Scripts\\python.exe",
      "args": ["D:\\AI\\Me_Command_Center\\mcp\\command_center_mcp.py"],
      "env": {
        "COMMAND_CENTER_URL": "https://igorc-1.tailac7b3.ts.net"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see a 🔌/tools indicator; ask it "list my Command
Center spaces" to confirm.

### Claude Code (CLI)
```powershell
claude mcp add command-center `
  --env COMMAND_CENTER_URL=https://igorc-1.tailac7b3.ts.net `
  -- "D:\AI\Me_Command_Center\mcp\.venv\Scripts\python.exe" "D:\AI\Me_Command_Center\mcp\command_center_mcp.py"
```

### Codex (OpenAI desktop app)
Codex runs locally and supports local MCP servers, so it reaches the backend over
the tailnet with **no public exposure** — the private equivalent of using Claude.
Add to `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.command_center]
command = 'D:\AI\Me_Command_Center\mcp\.venv\Scripts\python.exe'
args = ['D:\AI\Me_Command_Center\mcp\command_center_mcp.py']
startup_timeout_sec = 120

[mcp_servers.command_center.env]
COMMAND_CENTER_URL = 'https://igorc-1.tailac7b3.ts.net'
```

Restart Codex, then ask it "list my Command Center spaces" to confirm.

> **The ChatGPT *chat app* cannot use this.** ChatGPT only connects to *remote,
> public* MCP/Action endpoints and refuses localhost/private addresses — you'd have
> to expose the backend publicly (Tailscale Funnel + a strong token). Codex (a local
> agent, like Claude Code) is the private way to get the ChatGPT-side experience.

## Test it (optional)
Use the MCP Inspector to click through the tools:

```powershell
npx @modelcontextprotocol/inspector `
  "D:\AI\Me_Command_Center\mcp\.venv\Scripts\python.exe" `
  "D:\AI\Me_Command_Center\mcp\command_center_mcp.py"
```

## How events get filed
When the AI finds an event, it calls `cc_create_item` with:
`type="event"`, `url=`event page, `image_url=`poster/photo, `due_at=`start time
(ISO 8601), `location=`venue. The image becomes the card thumbnail and the link
is clickable in the UI — exactly the "post with a link and an image" shape.
