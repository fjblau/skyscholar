from fastapi import APIRouter, HTTPException
from database.connection import get_db, COLLECTION_STATIONS
from database.models import GroundStation

router = APIRouter(prefix="/api/stations", tags=["stations"])


@router.get("")
def list_stations():
    db = get_db()
    cursor = db.aql.execute("FOR s IN ground_stations SORT s.name RETURN s")
    return list(cursor)


@router.get("/{station_id}")
def get_station(station_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR s IN ground_stations FILTER s.station_id == @id LIMIT 1 RETURN s",
        bind_vars={"id": station_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Station not found")
    return results[0]


@router.post("", status_code=201)
def create_station(station: GroundStation):
    db = get_db()
    cursor = db.aql.execute(
        "FOR s IN ground_stations FILTER s.station_id == @id LIMIT 1 RETURN s",
        bind_vars={"id": station.station_id},
    )
    if list(cursor):
        raise HTTPException(status_code=409, detail="Station ID already exists")
    doc = station.model_dump()
    db.collection(COLLECTION_STATIONS).insert(doc)
    return doc


@router.put("/{station_id}")
def update_station(station_id: str, station: GroundStation):
    db = get_db()
    cursor = db.aql.execute(
        "FOR s IN ground_stations FILTER s.station_id == @id LIMIT 1 RETURN s",
        bind_vars={"id": station_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Station not found")
    doc = station.model_dump()
    db.aql.execute(
        "FOR s IN ground_stations FILTER s.station_id == @id UPDATE s WITH @doc IN ground_stations",
        bind_vars={"id": station_id, "doc": doc},
    )
    return doc


@router.delete("/{station_id}")
def delete_station(station_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR s IN ground_stations FILTER s.station_id == @id LIMIT 1 RETURN s",
        bind_vars={"id": station_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Station not found")
    db.collection(COLLECTION_STATIONS).delete(results[0]["_key"])
    return {"deleted": station_id}


@router.get("/{station_id}/flights")
def get_station_flights(station_id: str):
    db = get_db()
    cursor = db.aql.execute(
        "FOR f IN flights FILTER f.station_id == @sid SORT f.launch_time DESC RETURN f",
        bind_vars={"sid": station_id},
    )
    return list(cursor)
