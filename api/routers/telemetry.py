from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime
from database.connection import get_db, COLLECTION_TELEMETRY
from database.models import TelemetryReading
from api.services.audit import record_event

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("")
def list_telemetry(
    flight_id: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = Query(default=500, le=5000),
):
    db = get_db()
    filters = []
    bind_vars: dict = {"limit": limit}
    if flight_id:
        filters.append("t.flight_id == @flight_id")
        bind_vars["flight_id"] = flight_id
    if source:
        filters.append("t.source == @source")
        bind_vars["source"] = source
    where = ("FILTER " + " AND ".join(filters)) if filters else ""
    cursor = db.aql.execute(
        f"FOR t IN telemetry {where} SORT t.timestamp DESC LIMIT @limit RETURN t",
        bind_vars=bind_vars,
    )
    return list(cursor)


@router.get("/flight/{flight_id}")
def get_flight_telemetry(
    flight_id: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = Query(default=1000, le=10000),
):
    db = get_db()
    filters = ["t.flight_id == @flight_id"]
    bind_vars: dict = {"flight_id": flight_id, "limit": limit}
    if start:
        filters.append("t.timestamp >= @start")
        bind_vars["start"] = start.isoformat()
    if end:
        filters.append("t.timestamp <= @end")
        bind_vars["end"] = end.isoformat()
    where = "FILTER " + " AND ".join(filters)
    cursor = db.aql.execute(
        f"FOR t IN telemetry {where} SORT t.timestamp ASC LIMIT @limit RETURN t",
        bind_vars=bind_vars,
    )
    return list(cursor)


@router.post("", status_code=201)
def ingest_reading(reading: TelemetryReading):
    db = get_db()
    doc = reading.model_dump()
    if doc.get("timestamp"):
        doc["timestamp"] = doc["timestamp"].isoformat()
    result = db.collection(COLLECTION_TELEMETRY).insert(doc)
    record_event(
        event_type="telemetry_ingested",
        entity_type="flight",
        entity_id=reading.flight_id,
        payload={
            "record_key": result["_key"],
            "source": reading.source,
            "timestamp": doc.get("timestamp"),
        },
    )
    return {"_key": result["_key"], **doc}


@router.post("/batch", status_code=201)
def ingest_batch(readings: list[TelemetryReading]):
    if len(readings) > 5000:
        raise HTTPException(status_code=400, detail="Batch size exceeds 5000 readings")
    db = get_db()
    docs = []
    flight_ids: set = set()
    for r in readings:
        doc = r.model_dump()
        if doc.get("timestamp"):
            doc["timestamp"] = doc["timestamp"].isoformat()
        docs.append(doc)
        flight_ids.add(r.flight_id)
    db.collection(COLLECTION_TELEMETRY).import_bulk(docs)
    for fid in flight_ids:
        batch_timestamps = [d["timestamp"] for d in docs if d["flight_id"] == fid]
        record_event(
            event_type="telemetry_batch_ingested",
            entity_type="flight",
            entity_id=fid,
            payload={
                "count": sum(1 for d in docs if d["flight_id"] == fid),
                "sources": list({d["source"] for d in docs if d["flight_id"] == fid}),
                "time_range": [min(batch_timestamps), max(batch_timestamps)] if batch_timestamps else None,
            },
        )
    return {"inserted": len(docs)}


@router.get("/flight/{flight_id}/latest")
def get_latest_reading(flight_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR t IN telemetry FILTER t.flight_id == @id SORT t.timestamp DESC LIMIT 1 RETURN t",
        bind_vars={"id": flight_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="No telemetry for this flight")
    return results[0]


@router.get("/flight/{flight_id}/profile")
def get_altitude_profile(flight_id: str):
    db = get_db()
    cursor = db.aql.execute(
        """
        FOR t IN telemetry
          FILTER t.flight_id == @id AND t.altitude_m != null
          SORT t.altitude_m ASC
          RETURN {
            altitude_m: t.altitude_m,
            timestamp: t.timestamp,
            temp_c: t.standard.temp_c,
            pressure_hpa: t.standard.pressure_hpa,
            humidity_pct: t.standard.humidity_pct,
            wind_speed_mps: t.standard.wind_speed_mps,
            wind_dir_deg: t.standard.wind_dir_deg
          }
        """,
        bind_vars={"id": flight_id},
    )
    return list(cursor)
