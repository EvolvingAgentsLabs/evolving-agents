"""A correct solution, used only by the tests to prove the check accepts the right thing."""
import datetime as dt
import subprocess
import sys
from pathlib import Path

GIT = ["git", "-c", "user.name=bench", "-c", "user.email=bench@example.com"]


def main(d: Path) -> None:
    (d / "pyproject.toml").write_text('[project]\nname = "greet"\nversion = "0.3.0"\n')
    (d / "greet" / "__init__.py").write_text(
        '__version__ = "0.3.0"\n\n\ndef greet(name, excited=False, name_upper=False):\n'
        '    if name_upper:\n        name = name.upper()\n'
        '    text = f"Hello, {name}!"\n    return text + "!!" if excited else text\n')
    t = d / "tests" / "test_greet.py"
    t.write_text(t.read_text() + "\n    def test_name_upper(self):\n"
                 "        self.assertEqual(greet(\"Ana\", name_upper=True), \"Hello, ANA!\")\n")
    log = d / "CHANGELOG.md"
    log.write_text(log.read_text().replace("# Changelog\n\n", f"# Changelog\n\n## [0.3.0] - {dt.date.today()}\n"
                                           "### Added\n- `name_upper` option for greet()\n\n", 1))
    for cmd in (["add", "-A"], ["commit", "-q", "-m", "release 0.3.0"], ["tag", "-a", "v0.3.0", "-m", "greet 0.3.0"]):
        subprocess.run(GIT + cmd, cwd=d, check=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
