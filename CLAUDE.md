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

## Branch & Deploy Workflow (обязательно для каждой сессии)
Чтобы избежать повторения инцидента 2026-05-05, когда параллельные сессии затирали деплои друг друга — следующие шаги выполняются АВТОМАТИЧЕСКИ, без напоминания пользователя:

1. **В начале сессии** — перед первой правкой кода: убедиться, что текущая ветка стартует со свежей `origin/main`. Если worktree устарел — `git fetch origin && git rebase origin/main`. Если есть конфликты при rebase — остановиться и спросить пользователя.
2. **Перед деплоем** — повторить `git fetch origin && git rebase origin/main`. Если ничего не подтянулось, деплоить можно. Если в `main` появились новые коммиты от другой сессии — ребейзнуть свою ветку поверх и убедиться, что всё ещё работает локально, прежде чем выкатывать.
3. **После успешного деплоя и подтверждения пользователем, что всё работает на проде** — fast-forward merge ветки в `main`, push `main` на origin, удалить локальную ветку (`git branch -d`), удалить ветку на origin (`git push origin --delete`), удалить свой worktree (`git worktree remove`).
4. **Никогда не деплоить из ветки, которая отстала от `origin/main`** — сначала ребейз, потом деплой.

Полная спецификация процесса с примерами фраз для пользователя: `docs/handoff/parallel-sessions-process.md`.

## Tests (to be organized)
- Backend: `backend/tests/` — pytest
- Frontend: `frontend/src/__tests__/` — React Testing Library
