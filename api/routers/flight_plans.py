from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from database.connection import get_db, COLLECTION_FLIGHT_PLANS, COLLECTION_FLIGHTS
from database.models import FlightPlan

router = APIRouter(prefix="/api/flight-plans", tags=["flight-plans"])


def _serialize(doc: dict) -> dict:
    for field in ("launch_time", "created_at"):
        if doc.get(field) and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    return doc


@router.get("")
def list_flight_plans():
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN flight_plans SORT p.created_at DESC RETURN p"
    )
    return list(cursor)


@router.get("/{plan_id}")
def get_flight_plan(plan_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN flight_plans FILTER p.plan_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": plan_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight plan not found")
    return results[0]


@router.post("", status_code=201)
def create_flight_plan(plan: FlightPlan):
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN flight_plans FILTER p.plan_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": plan.plan_id},
    )
    if list(cursor):
        raise HTTPException(status_code=409, detail="Plan ID already exists")
    if plan.created_at is None:
        plan = plan.model_copy(update={"created_at": datetime.now(tz=timezone.utc)})
    doc = _serialize(plan.model_dump())
    db.collection(COLLECTION_FLIGHT_PLANS).insert(doc)
    return doc


@router.put("/{plan_id}")
def update_flight_plan(plan_id: str, plan: FlightPlan):
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN flight_plans FILTER p.plan_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": plan_id},
    )
    if not list(cursor):
        raise HTTPException(status_code=404, detail="Flight plan not found")
    doc = _serialize(plan.model_dump())
    db.aql.execute(
        "FOR p IN flight_plans FILTER p.plan_id == @id UPDATE p WITH @doc IN flight_plans",
        bind_vars={"id": plan_id, "doc": doc},
    )
    return doc


@router.delete("/{plan_id}")
def delete_flight_plan(plan_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN flight_plans FILTER p.plan_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": plan_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight plan not found")
    db.collection(COLLECTION_FLIGHT_PLANS).delete(results[0]["_key"])
    return {"deleted": plan_id}


@router.post("/{plan_id}/promote")
def promote_flight_plan(plan_id: str, body: dict):
    flight_id = body.get("flight_id")
    if not flight_id:
        raise HTTPException(status_code=400, detail="flight_id is required")

    db = get_db()

    cursor = db.aql.execute(
        "FOR p IN flight_plans FILTER p.plan_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": plan_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight plan not found")
    plan = results[0]

    if plan.get("promoted_flight_id"):
        raise HTTPException(
            status_code=409,
            detail=f"Plan already promoted to flight {plan['promoted_flight_id']}",
        )

    existing = list(db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight_id},
    ))
    if existing:
        raise HTTPException(status_code=409, detail="Flight ID already exists")

    flight_doc = {
        "flight_id": flight_id,
        "status": "planned",
        "launch_lat": plan.get("launch_lat"),
        "launch_lon": plan.get("launch_lon"),
        "launch_alt_m": plan.get("launch_alt_m"),
        "launch_time": plan.get("launch_time"),
        "ascent_rate_mps": plan.get("ascent_rate_mps"),
        "burst_altitude_m": plan.get("burst_altitude_m"),
        "descent_rate_mps": plan.get("descent_rate_mps"),
        "predicted_landing_lat": plan.get("predicted_landing_lat"),
        "predicted_landing_lon": plan.get("predicted_landing_lon"),
        "notes": plan.get("notes"),
        "payload_schema_ids": [],
    }
    db.collection(COLLECTION_FLIGHTS).insert(flight_doc)

    db.aql.execute(
        "FOR p IN flight_plans FILTER p.plan_id == @id UPDATE p WITH {promoted_flight_id: @fid} IN flight_plans",
        bind_vars={"id": plan_id, "fid": flight_id},
    )

    return {"plan_id": plan_id, "flight_id": flight_id, "flight": flight_doc}
