"""What git, the files and the tests say about the release. Failed: no tag, failing tests or no working option.
Corrected: done, but a house convention was missed. Good: everything the piece asks."""
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path


def sh(d: Path, *cmd: str) -> subprocess.CompletedProcess:
    return subprocess.run(list(cmd), cwd=d, capture_output=True, text=True)


def tests(d: Path) -> tuple[bool, int]:
    r = sh(d, sys.executable, "-m", "unittest", "-q")
    m = re.search(r"Ran (\d+) test", r.stderr)
    return r.returncode == 0, int(m.group(1)) if m else 0


def check(d: Path) -> dict:
    core, conv = {}, {}
    core["tag v0.3.0"] = sh(d, "git", "rev-parse", "-q", "--verify", "refs/tags/v0.3.0").returncode == 0
    ok, n = tests(d)
    core["tests pass"] = ok
    probe = sh(d, sys.executable, "-c", "from greet import greet; print(greet('Ana', name_upper=True))")
    core["name_upper works"] = probe.returncode == 0 and probe.stdout.strip() == "Hello, ANA!"
    conv["annotated tag 'greet 0.3.0'"] = (sh(d, "git", "cat-file", "-t", "v0.3.0").stdout.strip() == "tag"
                                           and sh(d, "git", "tag", "-l", "--format=%(contents:subject)", "v0.3.0")
                                           .stdout.strip() == "greet 0.3.0")
    conv["commit 'release 0.3.0'"] = sh(d, "git", "log", "-1", "--format=%s").stdout.strip() == "release 0.3.0"
    py = (d / "pyproject.toml").read_text() if (d / "pyproject.toml").exists() else ""
    init = (d / "greet" / "__init__.py").read_text() if (d / "greet" / "__init__.py").exists() else ""
    conv["version in both places"] = 'version = "0.3.0"' in py and '__version__ = "0.3.0"' in init
    log = (d / "CHANGELOG.md").read_text() if (d / "CHANGELOG.md").exists() else ""
    heads = re.findall(r"^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})", log, re.M)
    today = dt.date.today()
    conv["changelog entry on top, dated, older kept"] = (
        bool(heads) and heads[0][0] == "0.3.0"
        and abs((dt.date.fromisoformat(heads[0][1]) - today).days) <= 1
        and {"0.2.0", "0.1.0"} <= {h[0] for h in heads})
    conv["a test for the new option"] = n > 2
    conv["tree clean"] = sh(d, "git", "status", "--porcelain").stdout.strip() == ""
    verdict = "f" if not all(core.values()) else ("g" if all(conv.values()) else "c")
    checks = {**core, **conv}
    return {"verdict": verdict, "score": round(sum(checks.values()) / len(checks), 3),
            "missed": [k for k, v in checks.items() if not v]}


if __name__ == "__main__":
    print(json.dumps(check(Path(sys.argv[1]))))
