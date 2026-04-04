# CLAUDE.md — beta.optioner.online

## Project
Options trading platform. React frontend, FastAPI (Python) backend, PostgreSQL database.
Live at: beta.optioner.online

## Stack
- **Frontend:** React (react-scripts), JavaScript/JSX
- **Backend:** FastAPI, Python 3.x, SQLAlchemy, uvicorn (port 8002)
- **DB:** PostgreSQL (prod), SQLite (local dev)
- **ML:** ONNX model in `MODEL/`

## SDD Config
```
deploy_cmd: ./scripts/deploy_local.sh
test_cmd: cd frontend && CI=false npm test -- --watchAll=false; cd ../backend && python -m pytest tests/ -v
```

## Deploy Notes
- Build runs **locally** on Mac, artifacts uploaded via rsync over SSH
- SSH host alias: `gelimo` (root@185.135.137.110, key `~/.ssh/id_gelimo`)
- Remote path: `/var/www/beta`
- PM2 app name: `optioner-backend-beta`
- Frontend: built locally (`npm run build`) → rsync to server → served by nginx
- Backend: rsync source → `pip install` → `pm2 restart`

## SDD Git Convention
```
type(scope): brief description

Task: {task-name}
Phase: {phase}
Artifacts: {list}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
Types: `feat`, `fix`, `refactor`, `hotfix`, `docs`, `test`, `chore`

## Key Paths
| Path | What |
|------|------|
| `frontend/src/` | React app source |
| `frontend/src/components/` | UI components |
| `frontend/src/pages/` | Page-level components |
| `backend/` | FastAPI backend |
| `backend/app/` | Main app module |
| `MODEL/` | ONNX ML model files |
| `docs/` | All documentation |
| `tasks/` | SDD task artifacts |
| `scripts/` | Dev and deploy scripts |

## Communication
- **Language:** Russian always — all responses, questions, reports
- **No code in responses** — user is not a programmer. Report at logic level: what changed, what effect, how verified. 1-3 sentences.
- **No technical details** — no function names, line numbers, file contents, debug traces
- **Questions** — situation + 2-3 options with consequences. No code.
- Comments in code: Russian, explain WHY not HOW

## Rules
- **Max 300 lines per file** — enforced by CI (GitHub Actions)
- **No .env files committed** — use `.env.*.template` as reference
- **No hardcoded secrets** — API keys, passwords only via environment variables
- GATE is mandatory before each pipeline phase (see global `~/.claude/CLAUDE.md`)
- Security check required in every VERIFY phase
- **try-catch everywhere** — clear error messages for users

## Tests (to be organized)
- Backend: `backend/tests/` — pytest
- Frontend: `frontend/src/__tests__/` — React Testing Library
