import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

from app.database import SessionLocal, engine, Base
from app.models.department import Department
from app.models.user import User
from app.models.issue import Issue
from app.models.interactions import BroadcastNotice, Upvote, Comment
from app.models.suggestion import Suggestion
from app.services.auth_service import hash_password

def seed():
    print("[*] Initializing Database Tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 1. Seed Academic Departments & Central Campus
    departments_data = [
        {"name": "Engineering & Technology", "code": "ENG", "building_name": "Aryabhata Block (Engg Wing)", "description": "B.Tech & M.Tech Labs, Workshops & Classrooms"},
        {"name": "School of Law", "code": "LAW", "building_name": "Justice Block (Law Wing)", "description": "Moot Courts, Legal Research Labs & Seminar Halls"},
        {"name": "Dental Sciences", "code": "DENT", "building_name": "Dhanwantari Block (Dental Wing)", "description": "Dental Clinics, Autoclave Labs & Patient Chairs"},
        {"name": "College of Physiotherapy", "code": "PHYSIO", "building_name": "Sushruta Health Block", "description": "BPT & MPT Rehabilitation Gym & Electrotherapy OPD"},
        {"name": "School of Basic & Applied Sciences", "code": "SCI", "building_name": "C.V. Raman Science Block", "description": "B.Sc. & M.Sc. Chemistry Wet Labs, Physics Darkrooms & Bio Labs"},
        {"name": "Postgraduate (PG / Masters) Center", "code": "PG", "building_name": "PG Academic Complex", "description": "Masters Thesis Presentation Rooms & High-RAM Simulation Labs"},
        {"name": "Doctoral & Ph.D. Research Wing", "code": "PHD", "building_name": "Advanced Research Center (ARC)", "description": "24x7 Research Scholar Workstations & Central Instrumentation (CIF)"},
        {"name": "Central Campus & Shared Amenities", "code": "CENTRAL", "building_name": "University Central Campus", "description": "Central Library, Main Canteens, Campus Buses, Sports Grounds, Hostels"}
    ]

    dept_map = {}
    for d in departments_data:
        existing = db.query(Department).filter(Department.code == d["code"]).first()
        if not existing:
            dept_obj = Department(**d)
            db.add(dept_obj)
            db.commit()
            db.refresh(dept_obj)
            dept_map[d["code"]] = dept_obj
        else:
            dept_map[d["code"]] = existing

    print(f"[+] Loaded {len(dept_map)} Academic Departments & Central Facilities.")

    # 2. Seed Users
    default_pw = hash_password("college123")
    users_data = [
        # Students
        {"full_name": "Aarav Sharma", "email": "student.engg@college.edu", "role": "STUDENT", "dept": "ENG", "designation": "B.Tech CSE 3rd Year"},
        {"full_name": "Ananya Verma", "email": "student.law@college.edu", "role": "STUDENT", "dept": "LAW", "designation": "BA.LLB 4th Year"},
        {"full_name": "Rohan Mehra", "email": "student.dental@college.edu", "role": "STUDENT", "dept": "DENT", "designation": "BDS Final Year"},
        {"full_name": "Pooja Nair", "email": "student.physio@college.edu", "role": "STUDENT", "dept": "PHYSIO", "designation": "BPT 3rd Year"},
        {"full_name": "Vikram Singh", "email": "student.sci@college.edu", "role": "STUDENT", "dept": "SCI", "designation": "M.Sc. Chemistry 1st Year"},
        {"full_name": "Neha Gupta", "email": "scholar.phd@college.edu", "role": "STUDENT", "dept": "PHD", "designation": "Ph.D. Research Scholar (Nanotech)"},

        # Teachers / Faculty
        {"full_name": "Dr. Rajesh Kulkarni", "email": "teacher.engg@college.edu", "role": "TEACHER", "dept": "ENG", "designation": "Associate Professor (Mechanical)"},
        {"full_name": "Prof. Meenakshi Sundaram", "email": "teacher.law@college.edu", "role": "TEACHER", "dept": "LAW", "designation": "Professor of Constitutional Law"},
        {"full_name": "Dr. Priya Joshi", "email": "teacher.physio@college.edu", "role": "TEACHER", "dept": "PHYSIO", "designation": "Head of Electrotherapy OPD"},

        # HODs
        {"full_name": "Dr. Arvind Swaminathan", "email": "hod.engg@college.edu", "role": "HOD", "dept": "ENG", "designation": "HOD Computer Science & Engg"},

        # Estate Supervisors
        {"full_name": "Er. Satish Sharma", "email": "supervisor.civil@college.edu", "role": "SUPERVISOR", "dept": "CENTRAL", "designation": "Junior Engineer (JE Civil & Estate)"},
        {"full_name": "Er. Alok Kumar", "email": "supervisor.elec@college.edu", "role": "SUPERVISOR", "dept": "CENTRAL", "designation": "Junior Engineer (JE Electrical)"},

        # Ground Technicians (Plumber, Carpenter, Electrician, IT, Sanitation)
        {"full_name": "Suresh Kumar", "email": "plumber.suresh@college.edu", "role": "TECHNICIAN", "trade": "PLUMBING", "dept": "CENTRAL", "designation": "Senior Plumber"},
        {"full_name": "Ramesh Carpenter", "email": "carpenter.ramesh@college.edu", "role": "TECHNICIAN", "trade": "CIVIL_CARPENTRY", "dept": "CENTRAL", "designation": "Estate Carpenter"},
        {"full_name": "Mahesh Electrician", "email": "electrician.mahesh@college.edu", "role": "TECHNICIAN", "trade": "ELECTRICAL", "dept": "CENTRAL", "designation": "Campus Electrician"},
        {"full_name": "Vikram IT", "email": "it.vikram@college.edu", "role": "TECHNICIAN", "trade": "IT", "dept": "CENTRAL", "designation": "Lab Systems Administrator"},

        # Central Executive Admin
        {"full_name": "Dean Dr. H.S. Bawa", "email": "dean.admin@college.edu", "role": "ADMIN", "dept": "CENTRAL", "designation": "Dean of Infrastructure & Student Affairs"}
    ]

    user_map = {}
    for u in users_data:
        existing = db.query(User).filter(User.email == u["email"]).first()
        if not existing:
            user_obj = User(
                full_name=u["full_name"],
                email=u["email"],
                hashed_password=default_pw,
                role=u["role"],
                academic_department_id=dept_map[u["dept"]].id,
                trade_specialty=u.get("trade"),
                designation=u.get("designation")
            )
            db.add(user_obj)
            db.commit()
            db.refresh(user_obj)
            user_map[u["email"]] = user_obj
        else:
            user_map[u["email"]] = existing

    print(f"[+] Loaded {len(user_map)} Demo Users across Students, Teachers, Staff & Dean.")

    # 3. Seed Sample Issues
    issues_data = [
        # Engineering Department Specific
        {
            "title": "CNC Milling machine spindle jamming in Workshop Lab 3",
            "description": "The spindle on CNC machine #2 emits abnormal grinding noise and stops rotating above 2000 RPM. Workshop practicals affected.",
            "scope": "DEPARTMENT_ONLY",
            "dept": "ENG",
            "trade": "CIVIL_CARPENTRY",
            "priority": "HIGH",
            "status": "IN_PROGRESS",
            "reporter": "student.engg@college.edu",
            "location": "Mechanical Workshop Block, Lab 3, Bay 2",
            "upvotes": 5
        },
        # Law Department Specific
        {
            "title": "Moot Court Hall 1 wireless podium collar mic static",
            "description": "During mock trial sessions, the cordless microphone experiences severe buzzing static interference whenever the AC compressor switches on.",
            "scope": "DEPARTMENT_ONLY",
            "dept": "LAW",
            "trade": "IT",
            "priority": "MEDIUM",
            "status": "SUBMITTED",
            "reporter": "student.law@college.edu",
            "location": "Moot Court Hall 1, Justice Block 2nd Floor",
            "upvotes": 3
        },
        # Physiotherapy Specific
        {
            "title": "Ultrasound Therapy unit #2 probe output intensity fluctuates",
            "description": "In the Electrotherapy OPD, the 1 MHz ultrasound head probe display flickers and therapeutic intensity cuts off intermittently.",
            "scope": "DEPARTMENT_ONLY",
            "dept": "PHYSIO",
            "trade": "CLINICAL_EQUIPMENT",
            "priority": "HIGH",
            "status": "SUBMITTED",
            "reporter": "student.physio@college.edu",
            "location": "Electrotherapy OPD Room 104, Sushruta Block",
            "upvotes": 4
        },
        # Sciences Specific
        {
            "title": "Chemistry Lab 2 fume hood exhaust suction stopped",
            "description": "The acid vapor exhaust suction in the organic chemistry synthesis bay is not functioning, posing an inhalation hazard during experiments.",
            "scope": "DEPARTMENT_ONLY",
            "dept": "SCI",
            "trade": "GENERAL",
            "priority": "CRITICAL",
            "status": "SUBMITTED",
            "reporter": "student.sci@college.edu",
            "location": "C.V. Raman Block, 3rd Floor, Organic Chemistry Lab 2",
            "upvotes": 7
        },
        # Teacher's Lecture-Critical Alert
        {
            "title": "Lecture Hall 201 smart projector lamp blown during lecture",
            "description": "Projector bulb went pop in the middle of Thermodynamics class. 65 students waiting for visual slides.",
            "scope": "DEPARTMENT_ONLY",
            "dept": "ENG",
            "trade": "IT",
            "priority": "LECTURE_CRITICAL",
            "status": "SUBMITTED",
            "reporter": "teacher.engg@college.edu",
            "location": "Aryabhata Block, Lecture Hall 201",
            "upvotes": 0
        },
        # Teacher's Confidential Faculty Room Issue (Hidden from students!)
        {
            "title": "Law Faculty Room heavy-duty laser printer paper roller jam",
            "description": "The main HP LaserJet in the Law Staff Lounge is jamming on double-sided exam paper printing. Toner light also flashing orange.",
            "scope": "FACULTY_ROOM",
            "dept": "LAW",
            "trade": "IT",
            "priority": "MEDIUM",
            "status": "SUBMITTED",
            "reporter": "teacher.law@college.edu",
            "location": "Law Faculty Room 202, Justice Block",
            "teacher_slot": "Available 1:30 PM - 3:00 PM (Lunch period)",
            "is_faculty_private": True,
            "upvotes": 0
        },
        # Whole-College Shared Facility (Canteen)
        {
            "title": "Central Canteen main drinking water cooler sensor broken",
            "description": "The automated sensor water cooler near the south dining hall is continuously dispensing water and overflowing on the floor.",
            "scope": "CAMPUS_WIDE",
            "dept": "CENTRAL",
            "trade": "PLUMBING",
            "priority": "HIGH",
            "status": "ASSIGNED",
            "reporter": "student.engg@college.edu",
            "location": "Central Student Cafeteria, Ground Floor Dining Area",
            "assigned_to": "plumber.suresh@college.edu",
            "upvotes": 18
        },
        # Whole-College Shared Facility (Bus)
        {
            "title": "University Bus Route #4 air conditioner blower failure",
            "description": "Bus registration DL-1PC-4022 AC blower not cooling during the evening commute route.",
            "scope": "CAMPUS_WIDE",
            "dept": "CENTRAL",
            "trade": "GENERAL",
            "priority": "MEDIUM",
            "status": "SUBMITTED",
            "reporter": "student.law@college.edu",
            "location": "Bus Fleet Depot, Bay 4",
            "upvotes": 12
        }
    ]

    for item in issues_data:
        existing = db.query(Issue).filter(Issue.title == item["title"]).first()
        if not existing:
            issue_obj = Issue(
                title=item["title"],
                description=item["description"],
                scope=item["scope"],
                academic_department_id=dept_map[item["dept"]].id,
                service_trade=item["trade"],
                priority=item["priority"],
                status=item["status"],
                reported_by_user_id=user_map[item["reporter"]].id,
                assigned_technician_id=user_map[item["assigned_to"]].id if item.get("assigned_to") else None,
                location_room_or_block=item["location"],
                teacher_availability_slot=item.get("teacher_slot"),
                is_faculty_private=item.get("is_faculty_private", False),
                upvotes_count=item.get("upvotes", 0),
                sla_deadline=datetime.utcnow() + timedelta(hours=24),
                is_sla_breached=False
            )
            db.add(issue_obj)
            db.commit()

    # 4. Seed Broadcast Announcement
    existing_notice = db.query(BroadcastNotice).filter(BroadcastNotice.title.like("%Water Tank Cleaning%")).first()
    if not existing_notice:
        notice = BroadcastNotice(
            title="Notice: Central Campus Water Tank Cleaning on Saturday",
            message="Overhead reservoir tanks in the Sports Complex and Main Canteen will undergo biochemical chlorination and cleaning from 10:00 AM to 4:00 PM. Alternate water points active.",
            scope="CAMPUS_WIDE",
            is_active=True,
            created_by_user_id=user_map["dean.admin@college.edu"].id
        )
        db.add(notice)
        db.commit()

    # 5. Seed Campus Suggestions (Separate from complaints)
    suggestions_data = [
        {
            "title": "Extend Central Library hours to 24x7 during semester final exams",
            "description": "During the 3 weeks of semester finals, the reading halls on 2nd and 3rd floor should stay open overnight with Wi-Fi and security guards.",
            "category": "ACADEMIC",
            "submitted_by": "student.engg@college.edu",
            "upvotes": 24,
            "status": "UNDER_REVIEW"
        },
        {
            "title": "Install touchless water bottle refill sensors near sports ground",
            "description": "Standard push taps are getting contaminated. Installing automated sensor dispensers will improve hygiene for players and runners.",
            "category": "INFRASTRUCTURE",
            "submitted_by": "student.physio@college.edu",
            "upvotes": 15,
            "status": "ACCEPTED",
            "admin_response": "Approved by Campus Welfare Committee. Procurement initiated for 2 units."
        }
    ]

    for s_item in suggestions_data:
        existing_s = db.query(Suggestion).filter(Suggestion.title == s_item["title"]).first()
        if not existing_s:
            s_obj = Suggestion(
                title=s_item["title"],
                description=s_item["description"],
                category=s_item["category"],
                submitted_by_user_id=user_map[s_item["submitted_by"]].id,
                upvotes_count=s_item["upvotes"],
                status=s_item["status"],
                admin_response=s_item.get("admin_response")
            )
            db.add(s_obj)
            db.commit()

    print("[SUCCESS] Database successfully seeded with full academic faculties, users, real-world issues, and student suggestions!")
    db.close()

if __name__ == "__main__":
    seed()
