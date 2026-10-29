import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'campus_fix.db'}")

# Security & JWT Configuration
# SECRET_KEY must be set in the environment (.env file).
# Copy .env.example to .env and set a long random value, e.g.:
#   python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable is not set. "
        "Copy backend/.env.example to backend/.env and fill in a strong random secret. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
