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

@app.post("/api/v1/uploads", tags=["File Uploads"])
async def upload_file(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """Upload photos (complaint attachments or resolution proof)."""
    # Sanitize and create unique filename
    ext = Path(file.filename).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only image files (.jpg, .jpeg, .png, .webp) allowed")

    unique_filename = f"{uuid.uuid4().hex}{ext}"
    target_path = UPLOAD_DIR / unique_filename

    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

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
