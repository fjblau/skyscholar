from fastapi import APIRouter

router = APIRouter()

DEPLOY_VERSION = "2026.07.22-2"


@router.get("/api/health")
def health_check():
    return {"status": "ok", "version": DEPLOY_VERSION}
