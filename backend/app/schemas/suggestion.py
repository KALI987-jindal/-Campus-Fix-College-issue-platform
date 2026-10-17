from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SuggestionCreate(BaseModel):
    title: str
    description: str
    category: str = "GENERAL"  # ACADEMIC, INFRASTRUCTURE, CANTEEN_FOOD, HOSTEL, SPORTS_RECREATION, GENERAL
    is_anonymous: bool = False

class SuggestionStatusUpdate(BaseModel):
    status: str  # UNDER_REVIEW, ACCEPTED, IN_PROGRESS, DECLINED
    admin_response: Optional[str] = None

class SuggestionOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    submitted_by_user_id: int
    submitted_by_name: Optional[str] = None
    is_anonymous: bool
    upvotes_count: int
    status: str
    admin_response: Optional[str] = None
    created_at: datetime
    user_has_upvoted: Optional[bool] = False

    class Config:
        from_attributes = True
