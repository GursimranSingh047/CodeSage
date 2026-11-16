# ShopFast (test target)

A small FastAPI storefront that is **deliberately vulnerable**. It is the
scoring target for the CodeSage project: every planted vulnerability is
documented with its CWE and a trigger command in
[VULNERABILITIES.md](./VULNERABILITIES.md).

> Do not deploy this anywhere. Do not copy code from it into a real project.

## Run it

```bash
cd test-target-repo
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Interactive API docs: http://127.0.0.1:8000/docs

## Tests

```bash
source venv/bin/activate
pytest -v
```
