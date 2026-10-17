from pydantic import BaseModel
from typing import Optional

class DepartmentOut(BaseModel):
    id: int
    name: str
    code: str
    building_name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True

class DepartmentCreate(BaseModel):
    name: str
    code: str
    building_name: str
    description: Optional[str] = None
