"""Unit tests for Module 3: AST context extraction and ChromaDB chunk store.

AST tests run offline against test-target-repo. ChromaDB tests build a real
index; they skip gracefully if chromadb is not installed.
"""

from pathlib import Path

import pytest

from codesage.context import (
    ChunkStore,
    ContextError,
    extract_chunks,
    extract_code_context,
)
from codesage.schemas import CodeContext, Finding

REPO_ROOT = Path(__file__).resolve().parent.parent
TEST_TARGET = REPO_ROOT / "test-target-repo"


def make_finding(file_path: str, line_number: int, finding_id: str = "test:1") -> Finding:
    return Finding(
        id=finding_id,
        file_path=file_path,
        line_number=line_number,
        cwe_id="CWE-89",
        severity="high",
        tool_source="semgrep",
        raw_message="test",
        code_snippet="",
    )


# ---------------------------------------------------------------------------
# AST context extraction
# ---------------------------------------------------------------------------

def test_enclosing_function_for_sqli_finding():
    # shop.py line 18 is inside search_products — the whole function (with
    # its route decorator) must come back, not just the flagged line.
    context = extract_code_context(make_finding("shop.py", 18), TEST_TARGET)
    assert context.finding_id == "test:1"
    assert context.enclosing_function.startswith("@router.get")
    assert "def search_products" in context.enclosing_function
    assert "SELECT * FROM products" in context.enclosing_function
    assert "q: str" in context.enclosing_function


def test_enclosing_function_for_pickle_finding():
    context = extract_code_context(make_finding("tasks.py", 21), TEST_TARGET)
    assert context.enclosing_function.startswith("@router.post")
    assert "def import_tasks" in context.enclosing_function
    assert "pickle.loads" in context.enclosing_function


def test_module_level_finding_falls_back_to_window():
    # payments.py line 10 (STRIPE_API_KEY) sits at module level: no enclosing
    # function exists, so a +/-5 line window is returned instead.
    context = extract_code_context(make_finding("payments.py", 10), TEST_TARGET)
    assert "STRIPE_API_KEY" in context.enclosing_function
    assert "def create_checkout" not in context.enclosing_function


def test_imports_extracted_from_module_scope():
    context = extract_code_context(make_finding("shop.py", 18), TEST_TARGET)
    assert context.imports == [
        "import sqlite3",
        "from fastapi import APIRouter, HTTPException",
        "from database import get_connection",
    ]


def test_method_inside_class_returns_method():
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "widget.py").write_text(
            "import os\n"
            "\n"
            "class Widget:\n"
            "    NAME = 'w'\n"
            "\n"
            "    def resize(self, factor: str):\n"
            "        scale = int(factor)\n"
            "        return scale * 2\n",
            encoding="utf-8",
        )
        context = extract_code_context(make_finding("widget.py", 8), repo)
        assert context.enclosing_function.startswith("def resize")
        assert "class Widget" not in context.enclosing_function
        assert context.imports == ["import os"]


def test_missing_file_raises_context_error(tmp_path):
    with pytest.raises(ContextError):
        extract_code_context(make_finding("ghost.py", 1), tmp_path)


def test_code_context_schema_matches_design():
    context = extract_code_context(make_finding("shop.py", 18), TEST_TARGET)
    assert isinstance(context, CodeContext)
    assert set(context.model_dump()) == {
        "finding_id", "enclosing_function", "imports", "related_chunks"
    }


# ---------------------------------------------------------------------------
# Chunking + ChromaDB retrieval
# ---------------------------------------------------------------------------

def test_extract_chunks_from_test_target():
    chunks = extract_chunks(TEST_TARGET)
    by_id = {c["id"]: c for c in chunks}
    # at least the eight app functions/classes must be chunked
    assert any(c["metadata"]["name"] == "search_products" for c in chunks)
    assert any(c["metadata"]["name"] == "import_tasks" for c in chunks)
    assert all("venv" not in c["metadata"]["file_path"] for c in chunks)
    assert "shop.py:12" in by_id or any(
        c["metadata"]["file_path"] == "shop.py" for c in chunks
    )
    sample = next(
        c for c in chunks if c["metadata"]["name"] == "search_products"
    )
    assert sample["metadata"]["kind"] == "function_definition"
    assert "SELECT * FROM products" in sample["document"]


@pytest.fixture(scope="module")
def chunk_store(tmp_path_factory):
    pytest.importorskip("chromadb")
    persist_dir = tmp_path_factory.mktemp("chroma")
    store = ChunkStore(persist_dir=persist_dir)
    store.index_repo(TEST_TARGET)
    return store


def test_index_populates_collection(chunk_store):
    assert chunk_store.count() >= 8


def test_index_rebuild_is_idempotent(chunk_store):
    before = chunk_store.count()
    chunk_store.index_repo(TEST_TARGET)
    assert chunk_store.count() == before


def test_query_returns_top_k_similar_chunks(chunk_store):
    hits = chunk_store.query(
        "execute a raw SQL query string built from user input", top_k=3
    )
    assert 1 <= len(hits) <= 3
    assert all(h["document"] for h in hits)
    assert all("id" in h and "metadata" in h for h in hits)


def test_query_excludes_own_chunk(chunk_store):
    own_id = "tasks.py:15"  # import_tasks chunk
    hits = chunk_store.query(
        "pickle loads of base64 data", top_k=3, exclude_ids=[own_id]
    )
    assert own_id not in {h["id"] for h in hits}


def test_store_persists_across_instances(chunk_store, tmp_path_factory):
    # same persist dir as the module fixture — reopen and compare
    reopen_dir = None  # fixture's dir is internal; instead re-index in a new dir
    persist_dir = tmp_path_factory.mktemp("chroma-reopen")
    store = ChunkStore(persist_dir=persist_dir)
    n = store.index_repo(TEST_TARGET)
    assert ChunkStore(persist_dir=persist_dir).count() == n
    assert n == chunk_store.count()


def test_extract_code_context_with_retrieval(chunk_store):
    finding = make_finding(
        "tasks.py", 21, finding_id="semgrep:tasks.py:21:python-insecure-deserialization"
    )
    context = extract_code_context(finding, TEST_TARGET, store=chunk_store)
    assert context.related_chunks, "expected non-empty related_chunks"
    assert len(context.related_chunks) <= 3
    # the finding's own function must never be retrieved as 'related'
    assert all(
        "def import_tasks" not in chunk for chunk in context.related_chunks
    )
    assert all(isinstance(chunk, str) for chunk in context.related_chunks)


def test_extract_code_context_without_store_has_empty_related():
    context = extract_code_context(make_finding("admin.py", 14), TEST_TARGET)
    assert context.related_chunks == []
    assert "os.system" in context.enclosing_function
