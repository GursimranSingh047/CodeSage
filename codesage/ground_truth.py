"""Ground truth for the seeded test target (test-target-repo/VULNERABILITIES.md).

These are the eight intentionally planted vulnerabilities, used to score
triage precision/recall. File paths are repo-relative, matching Finding.file_path.
"""

from pydantic import BaseModel


class PlantedVulnerability(BaseModel):
    id: str  # V1..V8
    name: str
    file_path: str
    line_number: int
    cwe_id: str
    severity: str


PLANTED_VULNERABILITIES = [
    PlantedVulnerability(
        id="V1", name="SQL Injection", file_path="shop.py",
        line_number=17, cwe_id="CWE-89", severity="critical",
    ),
    PlantedVulnerability(
        id="V2", name="Hardcoded API Key", file_path="payments.py",
        line_number=10, cwe_id="CWE-798", severity="high",
    ),
    PlantedVulnerability(
        id="V3", name="Plaintext Password Auth", file_path="auth.py",
        line_number=11, cwe_id="CWE-259", severity="high",
    ),
    PlantedVulnerability(
        id="V4", name="Insecure Deserialization", file_path="tasks.py",
        line_number=21, cwe_id="CWE-502", severity="critical",
    ),
    PlantedVulnerability(
        id="V5", name="Path Traversal", file_path="files.py",
        line_number=16, cwe_id="CWE-22", severity="high",
    ),
    PlantedVulnerability(
        id="V6", name="Command Injection", file_path="admin.py",
        line_number=14, cwe_id="CWE-78", severity="critical",
    ),
    PlantedVulnerability(
        id="V7", name="Insecure CORS", file_path="main.py",
        line_number=34, cwe_id="CWE-942", severity="medium",
    ),
    PlantedVulnerability(
        id="V8", name="Vulnerable Dependencies", file_path="requirements.txt",
        line_number=9, cwe_id="CWE-1104", severity="medium",
    ),
]
