import hashlib

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, JSONResponse
from datetime import datetime, timezone
from typing import Optional

from database.connection import get_db
from api.services.bufr_encoder import encode_bufr, BUFR_ENCODER_VERSION
from api.services.audit import record_event

router = APIRouter(prefix="/api/flights", tags=["exports"])

MANDATORY_LEVELS_HPA = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30, 20, 10]


def _get_flight_and_levels(flight_id: str):
    db = get_db()
    fcur = db.aql.execute(
        "FOR f IN flights FILTER f.flight_id == @id LIMIT 1 RETURN f",
        bind_vars={"id": flight_id},
    )
    flights = list(fcur)
    if not flights:
        raise HTTPException(status_code=404, detail="Flight not found")
    flight = flights[0]

    tcur = db.aql.execute(
        """
        FOR t IN telemetry
          FILTER t.flight_id == @id AND t.altitude_m != null
          SORT t.altitude_m ASC
          RETURN {
            _key:            t._key,
            altitude_m:      t.altitude_m,
            timestamp:       t.timestamp,
            pressure_hpa:    t.standard.pressure_hpa,
            temp_c:          t.standard.temp_c,
            dew_point_c:     t.standard.dew_point_c,
            humidity_pct:    t.standard.humidity_pct,
            wind_speed_mps:  t.standard.wind_speed_mps,
            wind_dir_deg:    t.standard.wind_dir_deg,
            custom_payloads: t.custom_payloads
          }
        """,
        bind_vars={"id": flight_id},
    )
    levels = list(tcur)
    return flight, levels


def _parse_dt(raw) -> Optional[datetime]:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(raw)
    except Exception:
        return None


# -- Skew-T JSON --

@router.get("/{flight_id}/export/skewt")
def export_skewt(flight_id: str):
    flight, levels = _get_flight_and_levels(flight_id)

    formatted_levels = []
    for lvl in levels:
        entry = {
            "altitude_m":     lvl.get("altitude_m"),
            "p":              lvl.get("pressure_hpa"),
            "T":              lvl.get("temp_c"),
            "Td":             lvl.get("dew_point_c"),
            "rh":             lvl.get("humidity_pct"),
            "wind_dir":       lvl.get("wind_dir_deg"),
            "wind_speed_mps": lvl.get("wind_speed_mps"),
        }
        if lvl.get("custom_payloads"):
            entry["payloads"] = lvl["custom_payloads"]
        formatted_levels.append(entry)

    payload_schema_ids = flight.get("payload_schema_ids", [])
    db = get_db()
    payloads_meta = {}
    if payload_schema_ids:
        pcur = db.aql.execute(
            "FOR p IN payload_schemas FILTER p.schema_id IN @ids RETURN p",
            bind_vars={"ids": payload_schema_ids},
        )
        for p in pcur:
            payloads_meta[p["schema_id"]] = {
                "name": p.get("name"),
                "description": p.get("description"),
                "fields": [
                    {"field_name": f.get("field_name"), "bufr_descriptor": f.get("bufr_descriptor"), "unit": f.get("unit")}
                    for f in p.get("fields", [])
                ],
            }

    result = {
        "flight_id":    flight_id,
        "station_id":   flight.get("station_id"),
        "launch_time":  flight.get("launch_time"),
        "status":       flight.get("status"),
        "max_altitude_m": flight.get("max_altitude_m"),
        "levels":       formatted_levels,
        "payload_schemas": payloads_meta,
    }
    return JSONResponse(
        content=result,
        headers={"Content-Disposition": f'attachment; filename="{flight_id}_skewt.json"'},
    )


# -- NWP FM-35 TEMP --

def _temp_group(temp_c: Optional[float]) -> str:
    if temp_c is None:
        return "/////"
    sign = 0 if temp_c >= 0 else 5
    abs_t = abs(temp_c)
    whole = int(abs_t)
    tenth = round((abs_t - whole) * 10)
    return f"{sign}{whole:02d}{tenth}"


def _dewdep_group(temp_c: Optional[float], dew_c: Optional[float]) -> str:
    if temp_c is None or dew_c is None:
        return "///"
    dep = temp_c - dew_c
    if dep < 0:
        dep = 0.0
    if dep <= 5.5:
        return f"{round(dep * 10):03d}"
    return f"{min(int(dep) + 50, 99):03d}"


def _wind_group(wdir: Optional[float], wspd_mps: Optional[float]) -> str:
    if wdir is None or wspd_mps is None:
        return "/////"
    dd = round(wdir / 10) % 36
    ff = round(wspd_mps)
    return f"{dd:02d}{ff:03d}"


def _closest_level(levels: list, target_hpa: float):
    if not levels:
        return None
    candidates = [lvl for lvl in levels if lvl.get("pressure_hpa") is not None]
    if not candidates:
        return None
    return min(candidates, key=lambda l: abs(l["pressure_hpa"] - target_hpa))


def _pressure_code(p_hpa: float) -> str:
    p = round(p_hpa)
    if p >= 1000:
        return f"{p - 1000:03d}"
    return f"{p:03d}"


@router.get("/{flight_id}/export/nwp")
def export_nwp(flight_id: str):
    flight, levels = _get_flight_and_levels(flight_id)
    dt = _parse_dt(flight.get("launch_time")) or datetime.utcnow()
    station_id = flight.get("station_id", "00000")
    station_num = "".join(c for c in station_id if c.isdigit()).zfill(5)[:5]

    yy = f"{dt.day:02d}"
    gg = f"{dt.hour:02d}"
    header = f"TTAA {yy}{gg}01 {station_num}"
    lines = [header]

    surface_candidates = [l for l in levels if l.get("pressure_hpa") is not None]
    if surface_candidates:
        sfc = surface_candidates[0]
        pp = _pressure_code(sfc["pressure_hpa"])
        t_grp = _temp_group(sfc.get("temp_c"))
        dd_grp = _dewdep_group(sfc.get("temp_c"), sfc.get("dew_point_c"))
        w_grp = _wind_group(sfc.get("wind_dir_deg"), sfc.get("wind_speed_mps"))
        lines.append(f"99{pp} {t_grp}{dd_grp} {w_grp}")

    for lvl_hpa in MANDATORY_LEVELS_HPA:
        closest = _closest_level(levels, lvl_hpa)
        if closest is None:
            continue
        if abs(closest.get("pressure_hpa", 0) - lvl_hpa) > lvl_hpa * 0.15:
            continue
        pp = f"{lvl_hpa:05d}"[:5]
        alt_m = closest.get("altitude_m")
        hhh = f"{round(alt_m / 10):03d}" if alt_m is not None else "///"
        t_grp = _temp_group(closest.get("temp_c"))
        dd_grp = _dewdep_group(closest.get("temp_c"), closest.get("dew_point_c"))
        w_grp = _wind_group(closest.get("wind_dir_deg"), closest.get("wind_speed_mps"))
        lines.append(f"{lvl_hpa:05d} {t_grp}{dd_grp} {w_grp}")

    lines.append("=")
    lines.append("")
    lines.append("// WMO FM-35 TEMP format")
    lines.append("// or netCDF / GRIB2")

    content = "\n".join(lines)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{flight_id}_nwp.txt"'},
    )


# -- BUFR --

@router.get("/{flight_id}/export/bufr")
def export_bufr(flight_id: str):
    flight, levels = _get_flight_and_levels(flight_id)
    dt = _parse_dt(flight.get("launch_time"))

    db = get_db()
    payload_schema_ids = flight.get("payload_schema_ids", [])
    schema_versions: dict = {}
    if payload_schema_ids:
        scur = db.aql.execute(
            "FOR p IN payload_schemas FILTER p.schema_id IN @ids RETURN {id: p.schema_id, version: p.version}",
            bind_vars={"ids": payload_schema_ids},
        )
        for s in scur:
            schema_versions[s["id"]] = s["version"]

    bufr_bytes = encode_bufr(
        flight_id=flight_id,
        station_id=flight.get("station_id", ""),
        launch_dt=dt,
        levels=levels,
    )

    output_sha256 = hashlib.sha256(bufr_bytes).hexdigest()
    telemetry_keys = [lvl["_key"] for lvl in levels if lvl.get("_key")]

    record_event(
        event_type="bufr_generated",
        entity_type="flight",
        entity_id=flight_id,
        payload={
            "telemetry_record_count": len(telemetry_keys),
            "telemetry_record_keys": telemetry_keys,
            "payload_schema_versions": schema_versions,
            "bufr_encoder_version": BUFR_ENCODER_VERSION,
            "output_sha256": output_sha256,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by": "system",
        },
    )

    return Response(
        content=bufr_bytes,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{flight_id}.bufr"',
            "X-Bufr-Sha256": output_sha256,
            "X-Bufr-Encoder-Version": BUFR_ENCODER_VERSION,
        },
    )
