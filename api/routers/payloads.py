from fastapi import APIRouter, HTTPException
from database.connection import get_db, COLLECTION_PAYLOAD_SCHEMAS
from database.models import PayloadSchema

router = APIRouter(prefix="/api/payloads", tags=["payloads"])

STANDARD_BUFR_SCHEMA = PayloadSchema(
    schema_id="standard_met",
    name="Standard Meteorological (WMO BUFR)",
    payload_type="standard",
    description="Core atmospheric measurements mapped to WMO Table B descriptors",
    fields=[
        {"field_name": "temp_c", "bufr_descriptor": "012101", "bufr_status": "standard", "unit": "\u00b0C", "description": "Dry-bulb temperature"},
        {"field_name": "pressure_hpa", "bufr_descriptor": "010004", "bufr_status": "standard", "unit": "hPa", "description": "Station pressure"},
        {"field_name": "humidity_pct", "bufr_descriptor": "013003", "bufr_status": "standard", "unit": "%", "description": "Relative humidity"},
        {"field_name": "dew_point_c", "bufr_descriptor": "012003", "bufr_status": "standard", "unit": "\u00b0C", "description": "Dew-point temperature"},
        {"field_name": "wind_dir_deg", "bufr_descriptor": "011001", "bufr_status": "standard", "unit": "\u00b0", "description": "Wind direction"},
        {"field_name": "wind_speed_mps", "bufr_descriptor": "011002", "bufr_status": "standard", "unit": "m/s", "description": "Wind speed"},
        {"field_name": "solar_radiation_wm2", "bufr_descriptor": "014016", "bufr_status": "standard", "unit": "W/m\u00b2", "description": "Net short-wave radiation"},
        {"field_name": "daily_rain_mm", "bufr_descriptor": "013011", "bufr_status": "standard", "unit": "mm", "description": "Total precipitation"},
    ],
    version="1.0",
)


@router.get("")
def list_schemas():
    db = get_db()
    cursor = db.aql.execute("FOR p IN payload_schemas SORT p.name RETURN p")
    schemas = list(cursor)
    if not any(s["schema_id"] == "standard_met" for s in schemas):
        schemas.insert(0, STANDARD_BUFR_SCHEMA.model_dump())
    return schemas


@router.get("/{schema_id}")
def get_schema(schema_id: str):
    if schema_id == "standard_met":
        return STANDARD_BUFR_SCHEMA.model_dump()
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN payload_schemas FILTER p.schema_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": schema_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Payload schema not found")
    return results[0]


@router.post("", status_code=201)
def create_schema(schema: PayloadSchema):
    if schema.schema_id == "standard_met":
        raise HTTPException(status_code=409, detail="Cannot override the built-in standard_met schema")
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN payload_schemas FILTER p.schema_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": schema.schema_id},
    )
    if list(cursor):
        raise HTTPException(status_code=409, detail="Schema ID already exists")
    doc = schema.model_dump()
    db.collection(COLLECTION_PAYLOAD_SCHEMAS).insert(doc)
    return doc


@router.put("/{schema_id}")
def update_schema(schema_id: str, schema: PayloadSchema):
    if schema_id == "standard_met":
        raise HTTPException(status_code=400, detail="Cannot modify the built-in standard_met schema")
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN payload_schemas FILTER p.schema_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": schema_id},
    )
    if not list(cursor):
        raise HTTPException(status_code=404, detail="Payload schema not found")
    doc = schema.model_dump()
    db.aql.execute(
        "FOR p IN payload_schemas FILTER p.schema_id == @id UPDATE p WITH @doc IN payload_schemas",
        bind_vars={"id": schema_id, "doc": doc},
    )
    return doc


@router.delete("/{schema_id}")
def delete_schema(schema_id: str):
    if schema_id == "standard_met":
        raise HTTPException(status_code=400, detail="Cannot delete the built-in standard_met schema")
    db = get_db()
    cursor = db.aql.execute(
        "FOR p IN payload_schemas FILTER p.schema_id == @id LIMIT 1 RETURN p",
        bind_vars={"id": schema_id},
    )
    results = list(cursor)
    if not results:
        raise HTTPException(status_code=404, detail="Payload schema not found")
    db.collection(COLLECTION_PAYLOAD_SCHEMAS).delete(results[0]["_key"])
    return {"deleted": schema_id}
