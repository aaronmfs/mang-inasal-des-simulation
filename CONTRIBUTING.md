# Contributing

## Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

**Types:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`

**Scopes:** `config`, `engine`, `entities`, `metrics`, `arrivals`, `lifecycle`, `monitor`, `release`, `kiosk`, `patience`, `registry`

**Examples:**
```
feat(config): add peak-hour kitchen prep multiplier
fix(lifecycle): correct table resource release order
docs(readme): update setup instructions
refactor(metrics): extract report formatting into helper
```

## Branching

- `main` — production-ready
- `experiments/<name>` — scenario testing (e.g., `experiments/more-cashiers`)
- `fix/<short-description>` — bug fixes
- `feat/<short-description>` — new features

## Pull Request Workflow

1. Open an issue describing the change before starting work
2. Create a branch from `main`
3. Make changes, keeping commits small and scoped
4. Run the simulation and confirm no regressions:
   ```powershell
   python -m src.main
   ```
5. Run lint if available:
   ```powershell
   ruff check src\
   ```
6. Open a PR against `main` with a clear title and description referencing the issue

## Coding Standards

- **Python 3.10+** — use `str | None` over `Optional[str]`
- **Type hints** on all function signatures and class attributes
- **No comments** in source code — let types and naming speak
- **No emojis** in code, commit messages, or docs
- **One concern per file** — the existing module structure must be preserved
- **All simulation parameters** go in `config.json` — never hardcode magic numbers elsewhere. `src/config.py` reads from JSON at runtime.
- **Imports**: stdlib → third-party → local, separated by blank lines

## Adding a New Scenario

1. Add new parameter fields to `config.json` and expose them as `@property` in `src/config.py`
2. If a new resource is needed, create an entity wrapper under `src/entities/` extending `ResourceManager`
3. If a new process step is needed:
   - Write a step function in `src/engine/stages.py`
   - Register it in `BUILTIN_STAGES` or `EXPERIMENTAL_STAGES` in `src/engine/registry.py`
   - Insert its key into the pipeline in `src/engine/lifecycle.py`
4. Add any new KPIs to `Metrics` in `src/metrics.py`
5. Wire new resources in `src/main.py`

No parameter or logic change should require editing more than 2–3 files.
