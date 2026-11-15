import { Finding, TriageResult } from "@/types";

export interface SecurityExploitability {
  attackSurface: string;
  entryPoint: string;
  dataFlow: string;
  conceptualExplanation: string;
}

export interface SecurityImpact {
  confidentiality: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  integrity: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  availability: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  consequences: string[];
}

export interface SecurityAnalysisDetails {
  title: string;
  cweDisplay: string;
  cweNumber: string;
  whatIsIt: string;
  whyDangerous: string;
  exploitability: SecurityExploitability;
  impact: SecurityImpact;
  recommendedRemediation: string;
  scannerRule: string;
  evidence: string;
}

/**
 * Known CWE security definitions based on industry standards (MITRE CWE, OWASP Top 10)
 */
const KNOWN_VULNERABILITIES: Record<string, Partial<SecurityAnalysisDetails>> = {
  "CWE-78": {
    title: "OS Command Injection",
    cweDisplay: "CWE-78: Improper Neutralization of Special Elements used in an OS Command",
    cweNumber: "CWE-78",
    whatIsIt:
      "The application constructs an operating system command using externally controlled input, without properly neutralizing characters that alter the intended command or argument boundaries.",
    whyDangerous:
      "If untrusted input reaches a system shell without sanitization, an attacker can append command delimiters (such as semicolons, pipes, or command substitutions) to execute arbitrary shell commands under the web server's system privileges.",
    exploitability: {
      attackSurface: "Command execution wrapper / API endpoint",
      entryPoint: "HTTP request parameters, URL query strings, or unvalidated payload strings",
      dataFlow: "HTTP Parameter Handler → String Interpolation (f-string/format) → OS Shell Execution Sink (os.system / subprocess.run(shell=True))",
      conceptualExplanation:
        "An attacker may provide crafted input through the affected parameter. If that input reaches the command execution path without validation or parameterized arguments, the attacker can influence the operating system command and execute arbitrary processes.",
    },
    impact: {
      confidentiality: "HIGH",
      integrity: "HIGH",
      availability: "HIGH",
      consequences: [
        "Remote Code Execution (RCE)",
        "Operating System Compromise",
        "Arbitrary File Read & Write",
        "Host Process Hijacking",
      ],
    },
    recommendedRemediation:
      "Refactor the invocation to pass commands and arguments as a discrete list of arguments with `shell=False` (e.g. `subprocess.run(['command', arg], shell=False)`). Avoid shell interpolation entirely and enforce strict validation on allowed arguments.",
  },
  "CWE-89": {
    title: "SQL Injection",
    cweDisplay: "CWE-89: Improper Neutralization of Special Elements used in an SQL Command",
    cweNumber: "CWE-89",
    whatIsIt:
      "The software constructs all or part of an SQL command using externally influenced input from an upstream component, but fails to neutralize special elements that can modify the syntax of the intended SQL query.",
    whyDangerous:
      "An attacker can bypass authentication, read sensitive records from the database, tamper with relational integrity, execute administrative database operations, or write files to the database server.",
    exploitability: {
      attackSurface: "Database Query / Object Lookup Endpoint",
      entryPoint: "Request parameters, filter arguments, or path parameters",
      dataFlow: "Request Argument Handler → String Formatting / Concat → Raw Database Cursor (db.execute(raw_sql))",
      conceptualExplanation:
        "By injecting SQL control characters (e.g. quotes, boolean conditions, UNION operators), an attacker can escape the literal context and alter the logical structure of the SQL statement processed by the database backend.",
    },
    impact: {
      confidentiality: "HIGH",
      integrity: "HIGH",
      availability: "HIGH",
      consequences: [
        "Unauthorized Data Exfiltration",
        "Authentication & Privilege Bypass",
        "Database Record Modification or Deletion",
        "Underlying Host Storage Access",
      ],
    },
    recommendedRemediation:
      "Use parameterized queries (prepared statements) with bound variables or an established ORM. Parameter binding ensures the SQL engine treats user input strictly as data values, preventing query structure alteration.",
  },
  "CWE-798": {
    title: "Hardcoded Cryptographic Secret",
    cweDisplay: "CWE-798: Use of Hard-coded Credentials",
    cweNumber: "CWE-798",
    whatIsIt:
      "The software contains hardcoded credentials, such as cryptographic keys, JWT signing tokens, or database passwords, directly inside repository source code or default configuration files.",
    whyDangerous:
      "Anyone with read access to the source code, version control history, or deployed package artifacts can extract the secret and authenticate as a privileged service, forge tokens, or decrypt protected data.",
    exploitability: {
      attackSurface: "Source code repository & deployed assets",
      entryPoint: "Git commit history, binary builds, or public repo mirrors",
      dataFlow: "Source File Literal Declaration → Version Control Commit → Public / Internal Repo Exposure",
      conceptualExplanation:
        "Hardcoded credentials cannot be easily rotated without modifying and redeploying the code. Once committed, the secret is preserved in the Git commit history and can be discovered by automated scrapers.",
    },
    impact: {
      confidentiality: "HIGH",
      integrity: "HIGH",
      availability: "MEDIUM",
      consequences: [
        "Cryptographic Token Forgery",
        "Privileged API Impersonation",
        "Lateral Service Account Takeover",
        "Data Encryption Key Compromise",
      ],
    },
    recommendedRemediation:
      "Remove the hardcoded secret immediately and rotate the compromised credential. Ingest secrets at runtime using environment variables (`os.environ.get(...)`) or a dedicated secret management service (such as AWS Secrets Manager or HashiCorp Vault).",
  },
  "CWE-502": {
    title: "Insecure Deserialization",
    cweDisplay: "CWE-502: Deserialization of Untrusted Data",
    cweNumber: "CWE-502",
    whatIsIt:
      "The application deserializes untrusted data without sufficiently verifying that the resulting data will be valid or safe, using hazardous formats like Python's `pickle` or `yaml.load`.",
    whyDangerous:
      "Python pickle byte streams can instantiate arbitrary Python callable objects and invoke OS-level syscalls during unpickling, allowing attackers to achieve immediate arbitrary code execution.",
    exploitability: {
      attackSurface: "Data ingestion, webhook, or session cookie handler",
      entryPoint: "Binary payloads, base64 encoded request headers, or uploaded files",
      dataFlow: "Untrusted Client Payload → Base64 Decode → pickle.loads() / yaml.load() Sink",
      conceptualExplanation:
        "By crafting a serialized payload containing reduced object definitions with system execution instructions (e.g. `__reduce__` method returning `os.system`), an attacker triggers code execution as soon as the server unpacks the stream.",
    },
    impact: {
      confidentiality: "HIGH",
      integrity: "HIGH",
      availability: "HIGH",
      consequences: [
        "Immediate Remote Code Execution",
        "Full Application Server Hijack",
        "Internal Network Pivot",
        "Arbitrary Memory Corruption",
      ],
    },
    recommendedRemediation:
      "Replace insecure serialization formats like `pickle` with safe data interchange standards like JSON (`json.loads`) or safe YAML parsers (`yaml.safe_load`). Never deserialize arbitrary binary streams from untrusted clients.",
  },
  "CWE-79": {
    title: "Cross-Site Scripting (XSS)",
    cweDisplay: "CWE-79: Improper Neutralization of Input During Web Page Generation",
    cweNumber: "CWE-79",
    whatIsIt:
      "The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page that is served to other users.",
    whyDangerous:
      "An attacker can execute arbitrary JavaScript in the victim's browser session, steal session tokens and cookies, capture keystrokes, or redirect the user to malicious phishing destinations.",
    exploitability: {
      attackSurface: "Web user interface & rendering views",
      entryPoint: "URL parameters, search fields, or form inputs",
      dataFlow: "HTTP Parameter Handler → Raw String Concat / f-string in HTML template → HTTP Response Body Sink",
      conceptualExplanation:
        "If user input containing script tags or event handlers is reflected into HTML output without context-aware escaping, the browser interprets the input as executable code rather than text content.",
    },
    impact: {
      confidentiality: "MEDIUM",
      integrity: "MEDIUM",
      availability: "LOW",
      consequences: [
        "Session Hijacking & Cookie Theft",
        "DOM Defacement & Malicious Redirection",
        "Credential Harvesting Phishing",
        "Unauthorized Actions on Behalf of User",
      ],
    },
    recommendedRemediation:
      "Use auto-escaping template engines (like Jinja2 or modern frontend frameworks like React). When rendering dynamic strings into HTML, explicitly sanitize and context-encode data before output generation.",
  },
  "CWE-20": {
    title: "Improper Input Validation / XXE",
    cweDisplay: "CWE-20: Improper Input Validation",
    cweNumber: "CWE-20",
    whatIsIt:
      "The product receives input or data, but it does not validate or incorrectly validates that the input conforms to required properties regarding structure, syntax, and security limits.",
    whyDangerous:
      "In XML parsing contexts, standard parsers allow external entity resolution (XXE), enabling attackers to read local server configuration files or trigger server-side request forgery (SSRF).",
    exploitability: {
      attackSurface: "XML / Structured Document Parser Endpoint",
      entryPoint: "Uploaded XML files, SAML assertions, or SOAP request bodies",
      dataFlow: "Request Body Stream → xml.etree.ElementTree.fromstring() Parser",
      conceptualExplanation:
        "Attackers submit XML documents referencing external system entities (e.g. `<!ENTITY xxe SYSTEM 'file:///etc/passwd'>`). Unprotected parsers fetch and disclose the referenced file in the output response.",
    },
    impact: {
      confidentiality: "HIGH",
      integrity: "LOW",
      availability: "MEDIUM",
      consequences: [
        "Local System File Disclosure",
        "Server-Side Request Forgery (SSRF)",
        "Denial of Service via Entity Expansion",
        "Internal Port Scanning",
      ],
    },
    recommendedRemediation:
      "Disable external entity resolution (DTD processing) in XML parsers or use hardened packages such as `defusedxml` which automatically defuses entity expansion and external references.",
  },
  "CWE-94": {
    title: "Code Injection / Debug Execution",
    cweDisplay: "CWE-94: Improper Control of Generation of Code ('Code Injection')",
    cweNumber: "CWE-94",
    whatIsIt:
      "The application executes code using dynamic evaluation routines (such as `eval` or running with interactive debuggers exposed to public networks).",
    whyDangerous:
      "Interactive debuggers like Werkzeug allow direct pin-based or interactive code execution on the server, permitting anyone who reaches the debug endpoint to execute arbitrary Python instructions.",
    exploitability: {
      attackSurface: "Public network port / error handler",
      entryPoint: "Interactive debug console / unhandled exception page",
      dataFlow: "Public Network Interface (0.0.0.0) → Flask debug=True Console → Interactive Python REPL",
      conceptualExplanation:
        "Running applications in production with `debug=True` exposes diagnostic consoles and tracebacks. Attackers can interact with the debugger console or pass arbitrary code to evaluate.",
    },
    impact: {
      confidentiality: "HIGH",
      integrity: "HIGH",
      availability: "HIGH",
      consequences: [
        "Arbitrary Code Execution",
        "Full Application Server Compromise",
        "System Memory & Environment Disclosure",
        "Complete Host Takeover",
      ],
    },
    recommendedRemediation:
      "Never run production applications with `debug=True`. Bind server sockets to localhost or private network interfaces behind a hardened reverse proxy (e.g. NGINX) with debuggers strictly disabled.",
  },
};

/**
 * Derives comprehensive security analysis details from finding and triage artifacts
 */
export function getSecurityAnalysisDetails(
  finding: Finding,
  triage?: TriageResult | null
): SecurityAnalysisDetails {
  const cweKey = finding.cwe_id?.toUpperCase() || "";
  let baseDetails: Partial<SecurityAnalysisDetails> = {};

  // Find matching CWE or fall back to rule name checks
  for (const [key, details] of Object.entries(KNOWN_VULNERABILITIES)) {
    if (cweKey.includes(key.replace("CWE-", "")) || cweKey === key) {
      baseDetails = details;
      break;
    }
  }

  // Fallback checks based on raw message or tool rules
  const rawLower = (finding.raw_message + " " + (finding.finding_id || "")).toLowerCase();
  if (!baseDetails.title) {
    if (rawLower.includes("command") || rawLower.includes("subproces") || rawLower.includes("b602") || rawLower.includes("b404")) {
      baseDetails = KNOWN_VULNERABILITIES["CWE-78"];
    } else if (rawLower.includes("sql") || rawLower.includes("query") || rawLower.includes("b608")) {
      baseDetails = KNOWN_VULNERABILITIES["CWE-89"];
    } else if (rawLower.includes("secret") || rawLower.includes("api-key") || rawLower.includes("token") || rawLower.includes("b105")) {
      baseDetails = KNOWN_VULNERABILITIES["CWE-798"];
    } else if (rawLower.includes("pickle") || rawLower.includes("deserializ") || rawLower.includes("b301") || rawLower.includes("b506")) {
      baseDetails = KNOWN_VULNERABILITIES["CWE-502"];
    } else if (rawLower.includes("xss") || rawLower.includes("script")) {
      baseDetails = KNOWN_VULNERABILITIES["CWE-79"];
    } else if (rawLower.includes("xml") || rawLower.includes("b314") || rawLower.includes("b405")) {
      baseDetails = KNOWN_VULNERABILITIES["CWE-20"];
    } else if (rawLower.includes("debug") || rawLower.includes("eval") || rawLower.includes("b201")) {
      baseDetails = KNOWN_VULNERABILITIES["CWE-94"];
    }
  }

  // Fallback generic security details
  const fallback: SecurityAnalysisDetails = {
    title: finding.cwe_id || "Potential Security Vulnerability",
    cweDisplay: finding.cwe_id ? `${finding.cwe_id}` : "Unclassified Vulnerability",
    cweNumber: finding.cwe_id || "CWE-General",
    whatIsIt:
      finding.raw_message ||
      "The static analysis pipeline identified an unsafe pattern in source code execution flow that may allow unintended behaviors under malicious inputs.",
    whyDangerous:
      "Unvalidated code patterns can be leveraged by attackers to alter application flow, access unauthorized resources, or disrupt service integrity.",
    exploitability: {
      attackSurface: "Code execution path",
      entryPoint: "Caller inputs or data parameters",
      dataFlow: `Input parameter → ${finding.file_path}:${finding.line_number} → Vulnerable code execution`,
      conceptualExplanation:
        "An attacker may be able to influence this code path if external input reaches the vulnerable construct without sufficient boundary checking or sanitization.",
    },
    impact: {
      confidentiality: finding.severity === "critical" ? "HIGH" : "MEDIUM",
      integrity: finding.severity === "critical" ? "HIGH" : "MEDIUM",
      availability: "LOW",
      consequences: [
        "Potential System Misbehavior",
        "Data Integrity Risk",
        "Violation of Secure Coding Standards",
      ],
    },
    recommendedRemediation:
      "Review the highlighted source context and implement strict input validation, type safety, and standard secure design patterns to prevent unsafe execution.",
    scannerRule: finding.finding_id || `${finding.tool_source}-rule`,
    evidence: finding.code_snippet || finding.raw_message,
  };

  const merged = { ...fallback, ...baseDetails };

  // Overlay real triage reasoning if present
  if (triage?.reasoning) {
    merged.whyDangerous = `${triage.reasoning} ${merged.whyDangerous}`;
  }

  // Format scanner rule from finding_id or tool
  if (finding.finding_id?.includes(":")) {
    const parts = finding.finding_id.split(":");
    merged.scannerRule = parts[parts.length - 1] || merged.scannerRule;
  }

  return merged;
}

export interface SimplifiedSecuritySummary {
  riskSummary: string; // One sentence for the hero header
  risk: string; // ⚡ Risk column
  exploit: string; // 🎯 How to Exploit column
  impact: string; // 📦 Impact column
}

export function getSimplifiedSecuritySummary(
  finding: Finding,
  triage?: TriageResult | null
): SimplifiedSecuritySummary {
  const cwe = (finding.cwe_id || "").toUpperCase();
  const rawLower = ((finding.raw_message || "") + " " + (finding.finding_id || "")).toLowerCase();

  if (cwe.includes("78") || rawLower.includes("command") || rawLower.includes("subprocess")) {
    return {
      riskSummary: "User input is used directly in a system command, allowing attackers to run arbitrary commands.",
      risk: "Execute arbitrary commands on the server",
      exploit: "Send malicious input through the affected endpoint",
      impact: "High - data theft, system compromise, or deletion",
    };
  }

  if (cwe.includes("89") || rawLower.includes("sql") || rawLower.includes("query")) {
    return {
      riskSummary: "User input is used directly in a SQL query, allowing attackers to manipulate database commands.",
      risk: "Extract unauthorized database records or bypass authentication",
      exploit: "Send malicious SQL fragments through query parameters",
      impact: "High - unauthorized database access and data loss",
    };
  }

  if (cwe.includes("798") || rawLower.includes("secret") || rawLower.includes("token") || rawLower.includes("key")) {
    return {
      riskSummary: "A secret key or credential is hardcoded in the codebase, exposing it to unauthorized actors.",
      risk: "Compromise sensitive cryptographic keys and service credentials",
      exploit: "Extract hardcoded credentials from source code or Git history",
      impact: "High - privileged credential abuse and token forgery",
    };
  }

  if (cwe.includes("502") || rawLower.includes("pickle") || rawLower.includes("deserializ")) {
    return {
      riskSummary: "Untrusted input is deserialized directly, allowing attackers to execute arbitrary code.",
      risk: "Execute arbitrary code via malicious deserialization payloads",
      exploit: "Supply crafted serialized objects to the unpickling endpoint",
      impact: "Critical - full system compromise and remote code execution",
    };
  }

  if (cwe.includes("79") || rawLower.includes("xss") || rawLower.includes("script")) {
    return {
      riskSummary: "Unsanitized user input is reflected in HTML output, allowing attackers to inject malicious scripts.",
      risk: "Execute malicious JavaScript in victim browsers",
      exploit: "Inject unsanitized input into reflected web parameters",
      impact: "Medium - session hijacking and client-side credential theft",
    };
  }

  const details = getSecurityAnalysisDetails(finding, triage);
  return {
    riskSummary: (details.whyDangerous || "Unsafe execution pattern detected.").split(".")[0] + ".",
    risk: (details.whatIsIt || "Unsafe execution flow").split(".")[0],
    exploit: (details.exploitability.conceptualExplanation || "Malicious input sent through affected endpoint").split(".")[0],
    impact: `${details.impact.confidentiality || "High"} - ${(details.impact.consequences || ["security breach"]).slice(0, 2).join(", ")}`,
  };
}
