"""The workspace: the greet package at 0.2.0, released the house way once already."""
import subprocess
import sys
from pathlib import Path

GIT = ["git", "-c", "user.name=bench", "-c", "user.email=bench@example.com"]


def main(d: Path) -> None:
    (d / "greet").mkdir(parents=True)
    (d / "tests").mkdir()
    (d / "pyproject.toml").write_text('[project]\nname = "greet"\nversion = "0.2.0"\n')
    (d / "greet" / "__init__.py").write_text(
        '__version__ = "0.2.0"\n\n\ndef greet(name, excited=False):\n'
        '    text = f"Hello, {name}!"\n    return text + "!!" if excited else text\n')
    (d / "tests" / "__init__.py").write_text("")
    (d / "tests" / "test_greet.py").write_text(
        "import unittest\n\nfrom greet import greet\n\n\nclass GreetTest(unittest.TestCase):\n"
        "    def test_greet(self):\n        self.assertEqual(greet(\"Ana\"), \"Hello, Ana!\")\n\n"
        "    def test_excited(self):\n        self.assertEqual(greet(\"Ana\", excited=True), \"Hello, Ana!!!\")\n")
    (d / "CHANGELOG.md").write_text("# Changelog\n\n## [0.2.0] - 2026-10-20\n### Added\n- `excited` option for greet()\n\n"
                                    "## [0.1.0] - 2026-10-01\n### Added\n- greet()\n")
    (d / ".gitignore").write_text("__pycache__/\n")
    for cmd in (["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "release 0.2.0"],
                ["tag", "-a", "v0.2.0", "-m", "greet 0.2.0"]):
        subprocess.run(GIT + cmd, cwd=d, check=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
