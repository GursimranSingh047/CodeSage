"""ShopFast — a deliberately vulnerable demo storefront.

DO NOT use this code anywhere for real. Every vulnerability in this app is
intentional and documented in VULNERABILITIES.md. It exists as a scoring
target for the CodeSage security-audit agent.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from database import init_db
from auth import router as auth_router
from shop import router as shop_router
from files import router as files_router
from admin import router as admin_router
from tasks import router as tasks_router
from payments import router as payments_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title=config.SETTINGS["app_name"], lifespan=lifespan)

# V7: any origin is allowed to make credentialed cross-site requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(shop_router)
app.include_router(files_router)
app.include_router(admin_router)
app.include_router(tasks_router)
app.include_router(payments_router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
