from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class Issue(Base):
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    
    # Scoping: DEPARTMENT_ONLY, CAMPUS_WIDE, FACULTY_ROOM
    scope = Column(String(30), nullable=False, default="DEPARTMENT_ONLY")
    academic_department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    
    # Trade: CIVIL_CARPENTRY, PLUMBING, ELECTRICAL, IT, SANITATION, CLINICAL_EQUIPMENT, GENERAL
    service_trade = Column(String(50), nullable=False, default="GENERAL")
    
    # Priority: LOW, MEDIUM, HIGH, CRITICAL, LECTURE_CRITICAL
    priority = Column(String(30), nullable=False, default="MEDIUM")
    
    # Status: SUBMITTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, REOPENED
    status = Column(String(30), nullable=False, default="SUBMITTED")

    # Key Actors
    reported_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_technician_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Location & Faculty-specific details
    location_room_or_block = Column(String(120), nullable=False)
    teacher_availability_slot = Column(String(100), nullable=True)  # e.g., "1:30 PM - 3:00 PM"
    
    # Media & Proof
    image_url = Column(String(255), nullable=True)
    resolution_proof_url = Column(String(255), nullable=True)
    resolution_note = Column(Text, nullable=True)

    # Stats & Flags
    upvotes_count = Column(Integer, default=0)
    is_anonymous = Column(Boolean, default=False)
    is_faculty_private = Column(Boolean, default=False)

    # SLA Tracking
    sla_deadline = Column(DateTime, nullable=True)
    is_sla_breached = Column(Boolean, default=False)

    # Feedback / Verification
    star_rating = Column(Integer, nullable=True)
    feedback_comment = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    # Relationships
    academic_department = relationship("Department", back_populates="issues")
    reported_by = relationship("User", foreign_keys=[reported_by_user_id], back_populates="reported_issues")
    assigned_technician = relationship("User", foreign_keys=[assigned_technician_id], back_populates="assigned_issues")
    supervisor = relationship("User", foreign_keys=[supervisor_id], back_populates="supervised_issues")
    proof_photos = relationship("ProofPhoto", back_populates="issue", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="issue", cascade="all, delete-orphan")
    upvotes = relationship("Upvote", back_populates="issue", cascade="all, delete-orphan")
