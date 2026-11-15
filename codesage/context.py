"""Module 3 — context extraction (design.md 2.2 and 4.1).

Two responsibilities:

1. AST context: parse the flagged file with tree-sitter, find the smallest
   node containing the flagged line, and walk up parents until a
   function_definition / class_definition — that node's source span becomes
   `enclosing_function`. Module-level findings (no enclosing function, e.g. a
   hardcoded key) fall back to a +/-5 line window.
2. Chunk retrieval: a ChromaDB store holding one chunk per top-level
   function/class in the repo; `related_chunks` returns the top-3 semantically
   similar chunks for related-pattern awareness, excluding the finding's own.
"""

import logging
import os
import sys
from pathlib import Path
from typing import List, Optional

from codesage.ingestion import SKIP_DIRS
from codesage.schemas import CodeContext, Finding

logger = logging.getLogger(__name__)

# ChromaDB requires sqlite >= 3.35; swap in pysqlite3 when the bundled one is
# older (macOS system Pythons can ship 3.32). Must run before chromadb import.
try:
    import sqlite3 as _sqlite3

    if _sqlite3.sqlite_version_info < (3, 35, 0):  # pragma: no cover
        import pysqlite3  # type: ignore

        sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
except ImportError:
    pass

import tree_sitter_python as tspython
from tree_sitter import Language, Parser

COLLECTION_NAME = "code_chunks"
DEFAULT_PERSIST_DIR = Path(
    os.environ.get("CHROMA_PERSIST_DIR", "codesage_data/chroma")
)
RELATED_TOP_K = 3
FALLBACK_WINDOW_LINES = 5  # +/- lines for module-level findings

_DECORATED = "decorated_definition"
_DEFINITIONS = ("function_definition", "class_definition", _DECORATED)


class ContextError(RuntimeError):
    """Raised when context cannot be extracted for a finding."""


def _inner_definition(node):
    """Decorated definitions wrap the real function/class — describe by it."""
    if node.type == _DECORATED:
        inner = next(
            (
                c
                for c in node.children
                if c.type in ("function_definition", "class_definition")
            ),
            None,
        )
        if inner is not None:
            return inner
    return node


_parser = None


def _get_parser():
    """Parser factory that tolerates the tree-sitter 0.21/0.22+ API split."""
    global _parser
    if _parser is None:
        language = Language(tspython.language())
        try:
            _parser = Parser(language)
        except TypeError:  # tree-sitter < 0.22
            _parser = Parser()
            _parser.set_language(language)  # type: ignore[union-attr]
    return _parser


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------

def _parse(source: bytes):
    return _get_parser().parse(source)


def _smallest_node_containing(root, line0: int):
    """Descend to the smallest AST node whose span covers `line0` (0-based)."""
    node = root
    while True:
        child = next(
            (
                c
                for c in node.children
                if c is not node
                and c.start_point.row <= line0 <= c.end_point.row
            ),
            None,
        )
        if child is None:
            return node
        node = child


def _nearest_function_or_class(node):
    while node is not None and node.type not in _DEFINITIONS:
        node = node.parent
    if node is not None and node.type != _DECORATED:
        parent = node.parent
        if parent is not None and parent.type == _DECORATED:
            node = parent  # keep decorators; also aligns with chunk ids
    return node


def _node_text(node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _module_imports(root, source: bytes) -> List[str]:
    """Source text of every top-level import/import-from statement."""
    return [
        _node_text(child, source).strip()
        for child in root.children
        if child.type in ("import_statement", "import_from_statement")
    ]


def _fallback_window(source: bytes, line0: int) -> str:
    lines = source.decode("utf-8", errors="replace").splitlines()
    start = max(0, line0 - FALLBACK_WINDOW_LINES)
    end = min(len(lines), line0 + FALLBACK_WINDOW_LINES + 1)
    return "\n".join(lines[start:end]).strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_code_context(
    finding: Finding,
    repo_path: Path,
    store: Optional["ChunkStore"] = None,
) -> CodeContext:
    """Build the CodeContext for one finding (design.md 4.1, steps 1-4 + 5)."""
    repo_path = Path(repo_path)
    file_path = repo_path / finding.file_path
    if not file_path.is_file():
        raise ContextError(f"File not found for finding {finding.id}: {file_path}")

    source = file_path.read_bytes()
    is_python = file_path.suffix.lower() == ".py"
    root = None
    line0 = max(0, finding.line_number - 1)
    enclosing = ""
    start_line = None
    self_chunk_id = None
    imports: List[str] = []

    if is_python:
        try:
            tree = _parse(source)
            root = tree.root_node
            smallest = _smallest_node_containing(root, line0)
            definition = _nearest_function_or_class(smallest)
            if definition is not None and definition is not root:
                enclosing = _node_text(definition, source)
                start_line = definition.start_point.row + 1
                self_chunk_id = f"{finding.file_path}:{start_line}"
            else:
                enclosing = _fallback_window(source, line0)
            imports = _module_imports(root, source)
        except Exception as exc:
            logger.debug("Tree-sitter parse failed for %s, falling back to window: %s", file_path, exc)
            enclosing = _fallback_window(source, line0)
    else:
        # Non-Python files (JS, TS, Go, Java, Dockerfile, etc.): safe window fallback
        enclosing = _fallback_window(source, line0)

    query_text = enclosing or finding.code_snippet
    # Redact raw secret from query_text for ChromaDB indexing
    if finding.tool_source == "gitleaks" and finding.code_snippet:
        secret_val = finding.code_snippet.strip()
        if secret_val and secret_val in query_text:
            query_text = query_text.replace(secret_val, "[REDACTED_SECRET]")

    related: List[str] = []
    if store is not None and query_text:
        hits = store.query(
            query_text, top_k=RELATED_TOP_K, exclude_ids=[self_chunk_id]
            if self_chunk_id else None
        )
        related = [hit["document"] for hit in hits]

    return CodeContext(
        finding_id=finding.id,
        enclosing_function=enclosing,
        imports=imports,
        related_chunks=related,
    )



def extract_chunks(repo_path: Path) -> List[dict]:
    """One chunk per top-level function/class: id, document, metadata."""
    repo_path = Path(repo_path)
    chunks: List[dict] = []
    for file_path in sorted(repo_path.rglob("*.py")):
        if any(part in SKIP_DIRS for part in file_path.parts):
            continue
        if not file_path.is_file():
            continue
        source = file_path.read_bytes()
        rel_path = file_path.relative_to(repo_path).as_posix()
        root = _parse(source).root_node
        for node in root.children:
            if node.type not in _DEFINITIONS:
                continue
            start_line = node.start_point.row + 1
            inner = _inner_definition(node)
            name_node = inner.child_by_field_name("name")
            chunks.append(
                {
                    "id": f"{rel_path}:{start_line}",
                    "document": _node_text(node, source).strip(),
                    "metadata": {
                        "file_path": rel_path,
                        "start_line": start_line,
                        "end_line": node.end_point.row + 1,
                        "kind": inner.type,
                        "name": _node_text(name_node, source)
                        if name_node is not None
                        else "",
                    },
                }
            )
    return chunks


class ChunkStore:
    """ChromaDB-backed store of repo code chunks (architecture.md 2.5)."""

    def __init__(self, persist_dir: Optional[Path] = None):
        import chromadb
        from chromadb.config import Settings

        persist_dir = Path(persist_dir or DEFAULT_PERSIST_DIR)
        persist_dir.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(
            str(persist_dir),
            settings=Settings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
        )

    def count(self) -> int:
        return self.collection.count()

    def index_repo(self, repo_path: Path, batch_size: int = 100) -> int:
        """Rebuild the index for a repo: replace all stored chunks."""
        chunks = extract_chunks(repo_path)
        existing = self.collection.get()
        if existing["ids"]:
            self.collection.delete(ids=existing["ids"])
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            self.collection.upsert(
                ids=[c["id"] for c in batch],
                documents=[c["document"] for c in batch],
                metadatas=[c["metadata"] for c in batch],
            )
        logger.info("Indexed %d chunks from %s", len(chunks), repo_path)
        return len(chunks)

    def query(
        self,
        text: str,
        top_k: int = RELATED_TOP_K,
        exclude_ids: Optional[List[str]] = None,
    ) -> List[dict]:
        """Top-k similar chunks as {id, document, metadata}, exclusions applied."""
        if self.count() == 0:
            return []
        exclude_ids = exclude_ids or []
        result = self.collection.query(
            query_texts=[text], n_results=min(top_k + len(exclude_ids), self.count())
        )
        ids = result["ids"][0]
        documents = result["documents"][0]
        # chroma wraps every field in one extra list level — un-nest metadatas
        # too, or zip() truncates everything to a single hit.
        metadatas = (result.get("metadatas") or [[None] * len(ids)])[0]
        hits = []
        for chunk_id, document, metadata in zip(ids, documents, metadatas):
            if chunk_id in exclude_ids:
                continue
            hits.append({"id": chunk_id, "document": document, "metadata": metadata})
            if len(hits) == top_k:
                break
        return hits
