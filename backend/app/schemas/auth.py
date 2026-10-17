from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    full_name: str
    email: str
    password: str
    role: str = "STUDENT"  # STUDENT, TEACHER, HOD, SUPERVISOR, TECHNICIAN, ADMIN
    academic_department_id: Optional[int] = None
    trade_specialty: Optional[str] = None
    designation: Optional[str] = None
    phone_number: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    full_name: str
    email: str
    role: str
    academic_department_id: Optional[int]
    academic_department_name: Optional[str] = None
    trade_specialty: Optional[str] = None

class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    trade_specialty: Optional[str] = None
    academic_department_id: Optional[int] = None
    designation: Optional[str] = None
    phone_number: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
