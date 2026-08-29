from pydantic import BaseModel, EmailStr
from typing import Optional

class TeamInviteRequest(BaseModel):
    email: EmailStr
    role: str

class RoleUpdateRequest(BaseModel):
    role: str

class TeamMemberCreateRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
