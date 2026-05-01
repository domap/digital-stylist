# Review agents — pre-merge personas and checklists

Use these **review personas** after substantive changes (features, refactors, graph/MCP/invoke). A single human or a **second LLM pass** can walk the lists; automate what you can in CI (Ruff, tests, typecheck).

---

## R1 — Graph & state correctness

**Focus:** LangGraph topology matches intent and state.

- [ ] `graph.py` edges match **`route_from_intent`** return type and conditional map.
- [ ] **`StylistState`** / intent **`next_node`** literals updated together.
- [ ] **`StylistAgentBundle`** registers every node agent referenced by the graph.
- [ ] **`python -c "from digital_stylist.graph import build_graph; build_graph()"`** succeeds.
- [ ] Terminal nodes on user-facing paths still produce **`messages`** / **`assistant_message`** behavior expected by **`worker_app`** (document if intentionally changed).

---

## R2 — Configuration & security

**Focus:** No leaks; env-driven behavior.

- [ ] No new secrets or API keys in code; use **`StylistSettings`** fields and **`.env.example`** updates.
- [ ] Defaults safe for dev; production requires explicit env (document in config docstring if non-obvious).
- [ ] CORS / proxy assumptions unchanged or documented.
- [ ] PII: logging does not include raw user messages at INFO in new paths unless gated.

---

## R3 — MCP & side effects

**Focus:** Tooling robustness.

- [ ] MCP calls go through **`McpRuntime`**; narrow exception handling in **`act`**.
- [ ] Tool names and payloads align with **`mcp_servers/handlers`** and stdio servers.
- [ ] Behavior when **`STYLIST_MCP_ENABLED=false`** or remote URL down is acceptable (degrade or clear error).

---

## R4 — Observability & operations

**Focus:** Debuggability in staging/prod.

- [ ] New logs use **`extra`** keys whitelisted in **`logging_config`** (or list extended with justification).
- [ ] Request correlation still bound in worker paths that touch new code.
- [ ] Latency-sensitive paths: no huge string concatenation in hot loops; trace truncation where needed (follow catalog/explainability patterns).

---

## R5 — API & backward compatibility

**Focus:** Clients and orchestration.

- [ ] **`InvokeBody`** / response JSON changes documented; **Connect/Clienteling** updated if required.
- [ ] **`/api/v1`** routes: status codes and error shape consistent with existing routers.
- [ ] Orchestration proxy paths unchanged or updated in **both** server and docs.

---

## R6 — Code quality & maintainability

**Focus:** Diff discipline and readability.

- [ ] Diff limited to the task; no unrelated formatting or renames.
- [ ] Types and naming match surrounding modules.
- [ ] Ruff clean on touched files; no unjustified `# noqa`.
- [ ] Comments only where non-obvious **why** (not **what**).

---

## R7 — Documentation

**Focus:** Truthful docs.

- [ ] **ARCHITECTURE.md** / **DeepWiki** updated if ports, graph, invoke contract, or observability changed.
- [ ] **README** or **BUILDING_SIMILAR_PROJECT** updated if bootstrap steps changed.

---

## Review agent assignment (by change type)

| Change type | Minimum personas |
|-------------|-------------------|
| `graph.py` / intent / state | R1, R6, R7 |
| New env / secrets surface | R2, R7 |
| MCP tool or server | R3, R1 (if graph calls it), R7 |
| Logging / middleware | R4, R7 |
| HTTP / invoke / TS client | R5, R6, R7 |
| Docs only | R7 |

**Merge recommendation:** All selected checklists green, or explicit documented exceptions with follow-up issues.
