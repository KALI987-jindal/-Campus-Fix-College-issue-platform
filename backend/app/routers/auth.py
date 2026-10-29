from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.department import Department
from ..schemas.auth import UserRegister, UserLogin, TokenResponse, UserOut
from ..services.auth_service import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    # Roles that any member of the public may self-assign.
    # ADMIN, SUPERVISOR, and HOD require an administrator to create
    # the account directly (via seed_data.py or a future admin endpoint).
    SELF_REGISTERABLE_ROLES = {"STUDENT", "TEACHER", "TECHNICIAN"}
    requested_role = user_in.role.upper()
    if requested_role not in SELF_REGISTERABLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Role '{requested_role}' cannot be self-registered. "
                   f"Allowed roles for public registration: {sorted(SELF_REGISTERABLE_ROLES)}."
        )

    # Check if user already exists
    existing = db.query(User).filter(User.email == user_in.email.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already registered")

    # If academic department provided, verify it exists
    dept_name = None
    if user_in.academic_department_id:
        dept = db.query(Department).filter(Department.id == user_in.academic_department_id).first()
        if not dept:
            raise HTTPException(status_code=400, detail="Invalid academic department ID")
        dept_name = dept.name

    new_user = User(
        full_name=user_in.full_name.strip(),
        email=user_in.email.strip().lower(),
        hashed_password=hash_password(user_in.password),
        role=requested_role,
        academic_department_id=user_in.academic_department_id,
        trade_specialty=user_in.trade_specialty.upper() if user_in.trade_specialty else None,
        designation=user_in.designation,
        phone_number=user_in.phone_number
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": str(new_user.id), "role": new_user.role})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=new_user.id,
        full_name=new_user.full_name,
        email=new_user.email,
        role=new_user.role,
        academic_department_id=new_user.academic_department_id,
        academic_department_name=dept_name,
        trade_specialty=new_user.trade_specialty
    )

@router.post("/login", response_model=TokenResponse)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email.strip().lower()).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    dept_name = user.academic_department.name if user.academic_department else None
    token = create_access_token({"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        academic_department_id=user.academic_department_id,
        academic_department_name=dept_name,
        trade_specialty=user.trade_specialty
    )

@router.get("/me", response_model=UserOut)
def get_profile(current_user: User = Depends(get_current_user)):
    return current_user
