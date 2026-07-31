"""The package stays publishable, enforced instead of remembered.

agentvcs shipped 214 tests, a version number and a release workflow, and
`pip install agentvcs` still returned 404 for its entire life. The lesson is not
"remember to publish" — it is that packaging breaks silently, in ways no unit
test notices, because nothing imports a README.

Two failures this guards, both of which have already happened in this
organisation:

* `packages/memory` set `readme = "LICENSE"`. `pip install` died on a
  content-type error and nobody found out until CI existed.
* This README's links were written relative, which is correct on GitHub and
  wrong on PyPI — where `docs/SPEC.md` resolves against `pypi.org` and 404s.
  A reader who arrives from `pip install` would find every link broken.

These read the manifest and the README as data. They do not build a wheel; the
release workflow does that, and additionally installs it into an empty
environment before it is allowed to publish.

Reading the manifest needs `tomllib`, which is standard library only from 3.11.
The package supports 3.10, so on that interpreter this module skips rather than
grow a dependency for a metadata check. The CI matrix runs 3.10, 3.12 and 3.13
against the same files, and the release workflow builds on 3.12 — so the
properties below are still enforced on every push. What is lost on 3.10 is a
duplicate run, not coverage.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

if sys.version_info < (3, 11):  # pragma: no cover - exercised by the 3.10 CI leg
    pytest.skip("tomllib is stdlib from 3.11; checked on the 3.12 and 3.13 legs", allow_module_level=True)

import tomllib

PACKAGE = Path(__file__).resolve().parent.parent
PYPROJECT = tomllib.loads((PACKAGE / "pyproject.toml").read_text(encoding="utf-8"))
PROJECT = PYPROJECT["project"]

# `[label](target)` and `<img src="target">`, which is every way this README
# points at something.
MARKDOWN_LINK = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
HTML_SRC = re.compile(r'src="([^"]+)"')

# Fragments and mail links are resolved by the reader, not by the host.
LOCAL_PREFIXES = ("#", "mailto:")


def _readme_targets() -> list[str]:
    text = (PACKAGE / PROJECT["readme"]).read_text(encoding="utf-8")
    return MARKDOWN_LINK.findall(text) + HTML_SRC.findall(text)


def test_the_declared_readme_exists() -> None:
    """`readme = "LICENSE"` is how packages/memory became uninstallable."""
    readme = PACKAGE / PROJECT["readme"]
    assert readme.is_file(), f"pyproject declares readme = {PROJECT['readme']!r}, which is not a file"
    assert readme.suffix == ".md", "the manifest advertises text/markdown; a non-.md readme will not render"


def test_no_readme_link_is_relative() -> None:
    """Relative links are correct on GitHub and 404 on PyPI. This is the PyPI copy."""
    relative = [
        target
        for target in _readme_targets()
        if not target.startswith(("http://", "https://")) and not target.startswith(LOCAL_PREFIXES)
    ]
    assert not relative, (
        "these README links are relative, so they resolve against pypi.org and "
        f"break on the package page: {relative}. Point them at "
        "https://github.com/EvolvingAgentsLabs/evolving-agents/blob/main/packages/agentvcs/..."
    )


def test_the_readme_has_links_to_check() -> None:
    """Guards the test above: an empty README would pass it vacuously."""
    assert len(_readme_targets()) > 10, "expected the full README; found almost no links"


def test_project_urls_point_at_the_monorepo() -> None:
    """agentvcs is a directory of evolving-agents. The standalone repo is an ancestor.

    PyPI renders these as the sidebar, so a stale URL sends every reader who
    arrives from `pip install` to a tree that stopped receiving commits.
    """
    urls = PROJECT["urls"]
    assert "Homepage" in urls and "Source" in urls, f"PyPI shows the sidebar from these: {sorted(urls)}"
    stale = {name: url for name, url in urls.items() if "EvolvingAgentsLabs/agentvcs" in url}
    assert not stale, f"these point at the pre-monorepo repository: {stale}"


def test_the_zero_dependency_claim_is_in_the_manifest() -> None:
    """test_zero_dependencies.py enforces the code side; this is the metadata side.

    A dependency declared here but never imported would still be installed into
    the user's environment, which is the property being sold.
    """
    assert PROJECT["dependencies"] == [], f"agentvcs advertises zero runtime dependencies, manifest says {PROJECT['dependencies']}"


def test_every_console_script_resolves() -> None:
    """A typo here builds and installs fine, then fails the first time it is run."""
    import importlib

    for name, target in PROJECT["scripts"].items():
        module_name, _, function = target.partition(":")
        module = importlib.import_module(module_name)
        assert hasattr(module, function), f"console script {name!r} points at {target}, which does not exist"
