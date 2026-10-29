import shutil
import uuid
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .config import UPLOAD_DIR
from .database import engine, Base, get_db
from . import models
from .models.issue import Issue  # explicit import — required by /health SLA checker
from .routers import auth, departments, issues, staff, admin, suggestions
from .services.auth_service import get_current_user

# Ensure database tables exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CampusFix API",
    description="Multi-Faculty College Issue Platform API — High Level Design Implementation",
    version="2.0.0"
)

# CORS Middleware (Allows frontend to communicate from any local dev port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploaded media directory as static files
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Include Routers
app.include_router(auth.router)
app.include_router(departments.router)
app.include_router(issues.router)
app.include_router(staff.router)
app.include_router(admin.router)
app.include_router(suggestions.router)

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB maximum upload limit
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

def validate_image_signature(content: bytes, ext: str) -> bool:
    """Validate file content begins with an authentic image signature (magic bytes)."""
    if len(content) < 12:
        return False
    if ext in [".jpg", ".jpeg"]:
        return content.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".webp":
        return content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    return False

@app.post("/api/v1/uploads", tags=["File Uploads"])
async def upload_file(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """Upload photos (complaint attachments or resolution proof) with strict size & signature validation."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing in upload request")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Only image files (.jpg, .jpeg, .png, .webp) allowed."
        )

    # Enforce strict 10 MB maximum upload size without unbounded memory consumption
    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the maximum allowed limit of 10 MB"
        )
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Validate actual file magic bytes signature; do not trust filename extension alone
    if not validate_image_signature(contents, ext):
        raise HTTPException(
            status_code=400,
            detail="File content does not match a valid image signature (.jpg, .jpeg, .png, .webp)"
        )

    # Safe random server-side filename prevents path traversal and script execution
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    target_path = (UPLOAD_DIR / unique_filename).resolve()

    # Defense-in-depth: Ensure target path remains strictly within UPLOAD_DIR
    if not str(target_path).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid destination path")

    with open(target_path, "wb") as buffer:
        buffer.write(contents)

    file_url = f"/uploads/{unique_filename}"
    return {"filename": unique_filename, "url": file_url}

@app.get("/api/v1/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    """Health check & background SLA overdue validator."""
    # Check for SLA breaches
    now = datetime.utcnow()
    overdue_issues = db.query(Issue).filter(
        Issue.status.in_(["SUBMITTED", "ASSIGNED", "IN_PROGRESS"]),
        Issue.sla_deadline < now,
        Issue.is_sla_breached == False
    ).all()

    for issue in overdue_issues:
        issue.is_sla_breached = True
    if overdue_issues:
        db.commit()

    return {
        "status": "healthy",
        "timestamp": now.isoformat(),
        "sla_breached_updated_count": len(overdue_issues)
    }

@app.get("/", tags=["Root"])
def root():
    return {
        "app": "CampusFix API",
        "docs_url": "/docs",
        "status": "online"
    }
