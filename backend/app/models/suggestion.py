from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class Suggestion(Base):
    __tablename__ = "suggestions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, default="GENERAL")  # ACADEMIC, INFRASTRUCTURE, CANTEEN_FOOD, HOSTEL, SPORTS_RECREATION, GENERAL
    submitted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_anonymous = Column(Boolean, default=False)
    upvotes_count = Column(Integer, default=0)
    status = Column(String(30), default="UNDER_REVIEW")  # UNDER_REVIEW, ACCEPTED, IN_PROGRESS, DECLINED
    admin_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    submitted_by = relationship("User")
    upvotes = relationship("SuggestionUpvote", back_populates="suggestion", cascade="all, delete-orphan")

class SuggestionUpvote(Base):
    __tablename__ = "suggestion_upvotes"

    id = Column(Integer, primary_key=True, index=True)
    suggestion_id = Column(Integer, ForeignKey("suggestions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    suggestion = relationship("Suggestion", back_populates="upvotes")
    user = relationship("User")
