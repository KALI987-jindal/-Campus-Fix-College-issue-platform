from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from ..database import Base

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False, index=True)
    building_name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)

    users = relationship("User", back_populates="academic_department")
    issues = relationship("Issue", back_populates="academic_department")
