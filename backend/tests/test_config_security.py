"""
Test that config.py does NOT contain a hardcoded secret fallback.

This is a static analysis test — it reads the source file directly.
"""

import ast
import os


def test_no_hardcoded_secret_in_config():
    """
    config.py should use os.environ.get('SECRET_KEY') without a default value.
    The old code had: os.getenv("SECRET_KEY", "campus-fix-super-secret-jwt-key-...")
    The fixed code has: os.environ.get("SECRET_KEY") with a RuntimeError if None.
    """
    config_path = os.path.join(os.path.dirname(__file__), "..", "app", "config.py")
    with open(config_path, "r", encoding="utf-8") as f:
        source = f.read()

    # 1. The old hardcoded secret should NOT appear
    assert "campus-fix-super-secret" not in source, \
        "Hardcoded JWT secret still present in config.py!"

    # 2. There should be a RuntimeError guard
    assert "RuntimeError" in source, \
        "config.py should raise RuntimeError when SECRET_KEY is not set"

    # 3. The SECRET_KEY should be loaded from os.environ (no fallback)
    assert "os.environ.get(\"SECRET_KEY\")" in source or 'os.environ.get("SECRET_KEY")' in source, \
        "SECRET_KEY should be loaded via os.environ.get without a default"


def test_env_example_exists():
    """backend/.env.example must exist with a placeholder."""
    env_example_path = os.path.join(os.path.dirname(__file__), "..", ".env.example")
    assert os.path.isfile(env_example_path), ".env.example is missing"

    with open(env_example_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "SECRET_KEY" in content, ".env.example should mention SECRET_KEY"
    # The placeholder should NOT be a real secret
    assert "REPLACE" in content or "placeholder" in content.lower() or "DO_NOT_USE" in content, \
        ".env.example should contain a placeholder, not a real value"


def test_gitignore_blocks_env():
    """The .gitignore at repo root must ignore .env files."""
    gitignore_path = os.path.join(os.path.dirname(__file__), "..", "..", ".gitignore")
    with open(gitignore_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert ".env" in content, ".gitignore does not ignore .env files"
