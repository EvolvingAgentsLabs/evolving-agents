1. The version lives in TWO places: `version` in pyproject.toml and `__version__` in greet/__init__.py. Change both.
2. Add the CHANGELOG entry at the top, right under `# Changelog`, as `## [X.Y.Z] - YYYY-MM-DD` (today's date) with an
   `### Added` and/or `### Fixed` list. Keep every older entry.
3. Every new option gets a test in tests/test_greet.py. Run the tests with `python3 -m unittest` before tagging.
4. Commit everything with the message `release X.Y.Z` (nothing else in the subject).
5. Annotated tag `vX.Y.Z` with the message `greet X.Y.Z`: `git tag -a vX.Y.Z -m "greet X.Y.Z"`. Leave the tree clean.
