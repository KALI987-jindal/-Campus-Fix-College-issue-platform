from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    phone_number = Column(String(20), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(30), nullable=False, default="STUDENT")  # STUDENT, TEACHER, HOD, SUPERVISOR, TECHNICIAN, ADMIN
    trade_specialty = Column(String(50), nullable=True)  # CARPENTER, PLUMBER, ELECTRICIAN, IT, SANITATION
    academic_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    designation = Column(String(100), nullable=True)  # e.g., "B.Tech CSE 3rd Year", "Asst. Professor", "JE Civil"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    academic_department = relationship("Department", back_populates="users")
    reported_issues = relationship("Issue", foreign_keys="[Issue.reported_by_user_id]", back_populates="reported_by")
    assigned_issues = relationship("Issue", foreign_keys="[Issue.assigned_technician_id]", back_populates="assigned_technician")
    supervised_issues = relationship("Issue", foreign_keys="[Issue.supervisor_id]", back_populates="supervisor")
    comments = relationship("Comment", back_populates="user")
    upvotes = relationship("Upvote", back_populates="user")
