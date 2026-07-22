from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime

from database.connection import get_db, COLLECTION_FLIGHTS
from database.models import Flight
from api.services.audit import record_event

router = APIRouter(prefix="/api/flights", tags=["flights"])


@router.get("")
def list_flights(station_id: Optional[str] = None, status: Optional[str] = None):
    db = get_db()
    filters = []
    bind_vars: dict = {}
    if station_id:
        filters.append("f.station_id == @sid")
        bind_vars["sid"] = station_id
    if status:
        filters.append("f.status == @status")
        bind_vars["status"] = status
    where = ("FILTER " + " AND ".join(filters)) if filters else ""
    cursor = db.aql.execute(
        f"FOR f IN flights {where} SORT f.launch_time DESC RETURN f",
        bind_vars=bind_vars,
    )
    return list(cursor)


@router.get("/{flight_id}")
def get_flight(flight_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight not found")
    return results[0]


@router.post("", status_code=201)
def create_flight(flight: Flight):
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight.flight_id},
    )
    if list(cursor):
        raise HTTPException(status_code=409, detail="Flight ID already exists")
    doc = _serialize_flight(flight.model_dump())
    db.collection(COLLECTION_FLIGHTS).insert(doc)
    record_event(
        event_type="flight_created",
        entity_type="flight",
        entity_id=flight.flight_id,
        new_state=flight.status,
        payload={"station_id": flight.station_id, "balloon_item_id": flight.balloon_item_id},
    )
    return doc


@router.put("/{flight_id}")
def update_flight(flight_id: str, flight: Flight):
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight_id},
    )
    if not list(cursor):
        raise HTTPException(status_code=404, detail="Flight not found")
    doc = _serialize_flight(flight.model_dump())
    db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id UPDATE f WITH @doc IN flights",
        bind_vars={"id": flight_id, "doc": doc},
    )
    return doc


@router.patch("/{flight_id}/status")
def update_flight_status(flight_id: str, status: str):
    valid = {"planned", "launching", "ascending", "descending", "landed", "recovered", "aborted"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid}")
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight not found")
    old_status = results[0].get("status")
    db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id UPDATE f WITH {status: @status} IN flights",
        bind_vars={"id": flight_id, "status": status},
    )
    record_event(
        event_type="flight_status_changed",
        entity_type="flight",
        entity_id=flight_id,
        old_state=old_status,
        new_state=status,
    )
    return {"flight_id": flight_id, "status": status}


@router.post("/{flight_id}/predict-trajectory")
async def predict_trajectory(flight_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight not found")
    flight = results[0]

    station_id = flight.get("station_id")
    scursor = db.aql.execute(
        "FOR s IN ground_stations FILTER s.station_id == @sid LIMIT 1 RETURN s",
        bind_vars={"sid": station_id},
    )
    station_results = list(scursor)

    try:
        from balloon_predictor import LaunchParams, TawhiriClient
        from datetime import timezone

        if not station_results:
            raise HTTPException(status_code=422, detail="Station not found for trajectory prediction")

        station = station_results[0]
        loc = station.get("location", {})

        launch_time_raw = flight.get("launch_time")
        if not launch_time_raw:
            raise HTTPException(status_code=422, detail="Flight must have a launch_time to predict trajectory")

        if isinstance(launch_time_raw, str):
            launch_time = datetime.fromisoformat(launch_time_raw)
        else:
            launch_time = launch_time_raw

        if launch_time.tzinfo is None:
            launch_time = launch_time.replace(tzinfo=timezone.utc)

        params = LaunchParams(
            launch_lat=loc.get("lat", 0),
            launch_lon=loc.get("lon", 0),
            launch_alt_m=loc.get("altitude_m", 0),
            launch_time=launch_time,
            ascent_rate_mps=flight.get("ascent_rate_mps") or 5.0,
            burst_alt_m=flight.get("burst_altitude_m") or 30000,
            descent_rate_mps=flight.get("descent_rate_mps") or 6.0,
        )

        client = TawhiriClient()
        trajectory = await client.predict(params)

        landing = trajectory.landing
        prediction = {
            "predicted_landing_lat": landing.lat if landing else None,
            "predicted_landing_lon": landing.lon if landing else None,
            "forecast_cycle": trajectory.forecast_cycle.isoformat() if trajectory.forecast_cycle else None,
            "burst": {
                "lat": trajectory.burst.lat,
                "lon": trajectory.burst.lon,
                "alt_m": trajectory.burst.alt_m,
                "time": trajectory.burst.t.isoformat(),
            } if trajectory.burst else None,
            "point_count": len(trajectory.points),
            "points": [
                {"t": p.t.isoformat(), "lat": p.lat, "lon": p.lon, "alt_m": p.alt_m}
                for p in trajectory.points
            ],
        }

        prediction["predicted_at"] = datetime.now(timezone.utc).isoformat()
        prediction["source"] = "tawhiri"

        db.aql.execute(
            """FOR f IN flights FILTER f.flight_id == @id
               UPDATE f WITH {
                 predicted_landing_lat: @lat,
                 predicted_landing_lon: @lon,
                 trajectory: @traj
               } IN flights""",
            bind_vars={
                "id": flight_id,
                "lat": landing.lat if landing else None,
                "lon": landing.lon if landing else None,
                "traj": prediction,
            },
        )

        return prediction

    except ImportError:
        return {
            "error": "balloon-predictor library not installed",
            "stub": True,
            "message": "Install balloon-predictor from https://github.com/fjblau/balloon-predictor",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc) or "Trajectory prediction failed")


@router.get("/{flight_id}/stored-trajectory")
def get_stored_trajectory(flight_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN {trajectory: f.trajectory}",
        bind_vars={"id": flight_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight not found")
    traj = results[0].get("trajectory")
    if not traj:
        raise HTTPException(status_code=404, detail="No stored trajectory for this flight. Run Predict first.")
    return traj


@router.delete("/{flight_id}")
def delete_flight(flight_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Flight not found")
    db.collection(COLLECTION_FLIGHTS).delete(results[0]["_key"])
    return {"deleted": flight_id}


def _serialize_flight(doc: dict) -> dict:
    for field in ("launch_time", "landing_time"):
        if doc.get(field) and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    return doc
