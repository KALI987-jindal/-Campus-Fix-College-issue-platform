from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CommentOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    message: str
    is_staff_only_note: bool
    created_at: datetime

    class Config:
        from_attributes = True

class CommentCreate(BaseModel):
    message: str
    is_staff_only_note: bool = False

class ProofPhotoOut(BaseModel):
    id: int
    photo_url: str
    photo_type: str
    uploaded_by_user_id: int
    uploaded_at: datetime

    class Config:
        from_attributes = True

class IssueCreate(BaseModel):
    title: str
    description: str
    scope: str = "DEPARTMENT_ONLY"  # DEPARTMENT_ONLY, CAMPUS_WIDE, FACULTY_ROOM
    academic_department_id: int
    service_trade: str = "GENERAL"  # CIVIL_CARPENTRY, PLUMBING, ELECTRICAL, IT, SANITATION, CLINICAL_EQUIPMENT, GENERAL
    priority: str = "MEDIUM"       # LOW, MEDIUM, HIGH, CRITICAL, LECTURE_CRITICAL
    location_room_or_block: str
    teacher_availability_slot: Optional[str] = None
    image_url: Optional[str] = None
    is_anonymous: bool = False

class IssueStatusUpdate(BaseModel):
    status: str  # ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, REOPENED
    resolution_note: Optional[str] = None
    resolution_proof_url: Optional[str] = None

class IssueAssign(BaseModel):
    assigned_technician_id: int

class IssueVerify(BaseModel):
    action: str  # ACCEPT or REOPEN
    star_rating: Optional[int] = None  # 1 to 5
    feedback_comment: Optional[str] = None

class IssueOut(BaseModel):
    id: int
    title: str
    description: str
    scope: str
    academic_department_id: int
    academic_department_name: Optional[str] = None
    service_trade: str
    priority: str
    status: str
    reported_by_user_id: int
    reported_by_name: Optional[str] = None
    reported_by_role: Optional[str] = None
    assigned_technician_id: Optional[int] = None
    assigned_technician_name: Optional[str] = None
    supervisor_id: Optional[int] = None
    location_room_or_block: str
    teacher_availability_slot: Optional[str] = None
    image_url: Optional[str] = None
    resolution_proof_url: Optional[str] = None
    resolution_note: Optional[str] = None
    upvotes_count: int
    is_anonymous: bool
    is_faculty_private: bool
    sla_deadline: Optional[datetime] = None
    is_sla_breached: bool
    star_rating: Optional[int] = None
    feedback_comment: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    user_has_upvoted: Optional[bool] = False
    comments: Optional[List[CommentOut]] = []
    proof_photos: Optional[List[ProofPhotoOut]] = []

    class Config:
        from_attributes = True

class BroadcastNoticeOut(BaseModel):
    id: int
    title: str
    message: str
    scope: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class BroadcastNoticeCreate(BaseModel):
    title: str
    message: str
    scope: str = "CAMPUS_WIDE"
