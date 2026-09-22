"""Login endpoints."""

import base64

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["auth"])

# V3: user credentials are stored — and compared — in plaintext.
USERS = {
    "alice": "wonderland123",
    "bob": "builder456",
}


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    expected = USERS.get(body.username)
    if expected is None or expected != body.password:
        raise HTTPException(status_code=401, detail="invalid credentials")
    token = base64.b64encode(f"{body.username}:{body.password}".encode()).decode()
    return {"access_token": token, "token_type": "bearer"}
