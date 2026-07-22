"""
Seed a single simulated balloon deployment with realistic ascent data.

Usage:
    python scripts/seed_simulation.py           # insert into ArangoDB
    python scripts/seed_simulation.py --dry-run # print JSON, no DB writes
    python scripts/seed_simulation.py --flight-id my-flight-001

Physics model
-------------
- ISA atmosphere (troposphere 0-11 km, tropopause 11-20 km, lower
  stratosphere 20-32 km) for temperature, pressure, humidity, and dew point.
- Constant mean ascent rate with small Gaussian noise (+/- 0.3 m/s).
- Altitude-varying sinusoidal wind model producing realistic horizontal drift.
- Telemetry recorded every 10 seconds from source="balloon".

Environment variables (same as the main API):
    ARANGO_HOST, ARANGO_USER, ARANGO_PASSWORD
"""

import argparse
import json
import math
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database.models import (
    Flight,
    GroundStation,
    InventoryItem,
    Location,
    StandardTelemetry,
    TelemetryReading,
)


TELEMETRY_INTERVAL_S = 10
ASCENT_RATE_MPS = 5.0
ASCENT_RATE_NOISE_MPS = 0.3
BURST_ALTITUDE_M = 26000.0

ISA_SEA_LEVEL_TEMP_C = 15.0
ISA_SEA_LEVEL_PRESSURE_HPA = 1013.25
ISA_LAPSE_RATE_K_PER_M = 0.0065
ISA_TROPOPAUSE_M = 11000.0
ISA_TROPOPAUSE_TEMP_C = -56.5
ISA_STRATOSPHERE_LAPSE_RATE_K_PER_M = -0.001

GRAVITY = 9.80665
MOLAR_MASS_AIR = 0.0289644
GAS_CONSTANT = 8.314462


def isa_temperature_c(alt_m: float) -> float:
    if alt_m <= ISA_TROPOPAUSE_M:
        return ISA_SEA_LEVEL_TEMP_C - ISA_LAPSE_RATE_K_PER_M * alt_m
    elif alt_m <= 20000.0:
        return ISA_TROPOPAUSE_TEMP_C
    else:
        return ISA_TROPOPAUSE_TEMP_C + ISA_STRATOSPHERE_LAPSE_RATE_K_PER_M * (alt_m - 20000.0)


def isa_pressure_hpa(alt_m: float) -> float:
    T0_K = ISA_SEA_LEVEL_TEMP_C + 273.15
    if alt_m <= ISA_TROPOPAUSE_M:
        T_K = isa_temperature_c(alt_m) + 273.15
        exp = GRAVITY * MOLAR_MASS_AIR / (GAS_CONSTANT * ISA_LAPSE_RATE_K_PER_M)
        return ISA_SEA_LEVEL_PRESSURE_HPA * (T_K / T0_K) ** exp
    else:
        p_trop = isa_pressure_hpa(ISA_TROPOPAUSE_M)
        T_trop_K = ISA_TROPOPAUSE_TEMP_C + 273.15
        if alt_m <= 20000.0:
            exp = GRAVITY * MOLAR_MASS_AIR / (GAS_CONSTANT * T_trop_K)
            return p_trop * math.exp(-exp * (alt_m - ISA_TROPOPAUSE_M))
        else:
            p20 = isa_pressure_hpa(20000.0)
            T20_K = ISA_TROPOPAUSE_TEMP_C + 273.15
            T_K = isa_temperature_c(alt_m) + 273.15
            lapse = ISA_STRATOSPHERE_LAPSE_RATE_K_PER_M
            exp = GRAVITY * MOLAR_MASS_AIR / (GAS_CONSTANT * abs(lapse))
            return p20 * (T_K / T20_K) ** (-exp)


def relative_humidity_pct(alt_m: float) -> float:
    surface_rh = random.uniform(65.0, 85.0)
    rh = surface_rh * math.exp(-alt_m / 4000.0)
    rh = max(1.0, min(100.0, rh + random.gauss(0, 2.0)))
    return round(rh, 1)


def dew_point_c(temp_c: float, rh_pct: float) -> float:
    a, b = 17.27, 237.7
    alpha = (a * temp_c / (b + temp_c)) + math.log(rh_pct / 100.0)
    dp = b * alpha / (a - alpha)
    return round(dp, 2)


def wind_at_altitude(alt_m: float, rng: random.Random) -> tuple[float, float]:
    base_speed = 3.0 + (alt_m / 1000.0) * 0.8
    direction = 270.0 + 60.0 * math.sin(alt_m / 3000.0) + rng.gauss(0, 5.0)
    speed = max(0.0, base_speed + rng.gauss(0, 1.5))
    return round(speed, 2), round(direction % 360.0, 1)


def simulate_ascent(
    launch_lat: float,
    launch_lon: float,
    launch_alt_m: float,
    launch_time: datetime,
    flight_id: str,
    rng: random.Random,
) -> list[TelemetryReading]:
    readings: list[TelemetryReading] = []

    alt_m = float(launch_alt_m)
    lat = launch_lat
    lon = launch_lon
    elapsed_s = 0.0

    while alt_m < BURST_ALTITUDE_M:
        elapsed_s += TELEMETRY_INTERVAL_S
        step_rate = ASCENT_RATE_MPS + rng.gauss(0, ASCENT_RATE_NOISE_MPS)
        step_rate = max(0.5, step_rate)
        alt_m += step_rate * TELEMETRY_INTERVAL_S
        alt_m = min(alt_m, BURST_ALTITUDE_M)

        wind_speed, wind_dir = wind_at_altitude(alt_m, rng)
        wind_dir_rad = math.radians(wind_dir)
        u = -wind_speed * math.sin(wind_dir_rad)
        v = -wind_speed * math.cos(wind_dir_rad)
        dlat = (v * TELEMETRY_INTERVAL_S) / 111_320.0
        dlon = (u * TELEMETRY_INTERVAL_S) / (111_320.0 * math.cos(math.radians(lat)))
        lat += dlat
        lon += dlon

        temp_c = round(isa_temperature_c(alt_m) + rng.gauss(0, 0.3), 2)
        pressure_hpa = round(isa_pressure_hpa(alt_m), 2)
        rh = relative_humidity_pct(alt_m)
        dp = dew_point_c(temp_c, rh)

        ts = launch_time + timedelta(seconds=elapsed_s)

        readings.append(
            TelemetryReading(
                flight_id=flight_id,
                timestamp=ts,
                lat=round(lat, 6),
                lon=round(lon, 6),
                altitude_m=round(alt_m, 1),
                standard=StandardTelemetry(
                    temp_c=temp_c,
                    pressure_hpa=pressure_hpa,
                    humidity_pct=rh,
                    dew_point_c=dp,
                    wind_speed_mps=wind_speed,
                    wind_dir_deg=wind_dir,
                ),
                source="balloon",
            )
        )

    return readings


def simulate_trajectory_points(
    launch_lat: float,
    launch_lon: float,
    launch_alt_m: float,
    launch_time: datetime,
    ascent_rate_mps: float,
    burst_alt_m: float,
    descent_rate_mps: float,
    rng: random.Random,
) -> dict:
    STEP = 60
    alt = float(launch_alt_m)
    lat = float(launch_lat)
    lon = float(launch_lon)
    t = launch_time
    points = []
    burst_point = None

    while alt < burst_alt_m:
        step_gain = min(ascent_rate_mps * STEP, burst_alt_m - alt)
        ws, wd = wind_at_altitude(alt, rng)
        wd_rad = math.radians(wd)
        u = -ws * math.sin(wd_rad)
        v = -ws * math.cos(wd_rad)
        lat += (v * STEP) / 111_320.0
        lon += (u * STEP) / (111_320.0 * math.cos(math.radians(lat)))
        alt = min(alt + step_gain, burst_alt_m)
        t = t + timedelta(seconds=STEP)
        points.append({"t": t.isoformat(), "lat": round(lat, 6), "lon": round(lon, 6), "alt_m": round(alt, 1)})

    burst_point = {"lat": round(lat, 6), "lon": round(lon, 6), "alt_m": round(burst_alt_m, 1), "time": t.isoformat()}

    while alt > launch_alt_m:
        step_drop = min(descent_rate_mps * STEP, alt - launch_alt_m)
        ws, wd = wind_at_altitude(alt, rng)
        wd_rad = math.radians(wd)
        u = -ws * math.sin(wd_rad)
        v = -ws * math.cos(wd_rad)
        lat += (v * STEP) / 111_320.0
        lon += (u * STEP) / (111_320.0 * math.cos(math.radians(lat)))
        alt = max(alt - step_drop, launch_alt_m)
        t = t + timedelta(seconds=STEP)
        points.append({"t": t.isoformat(), "lat": round(lat, 6), "lon": round(lon, 6), "alt_m": round(alt, 1)})

    return {
        "points": points,
        "burst": burst_point,
        "predicted_landing_lat": round(lat, 6),
        "predicted_landing_lon": round(lon, 6),
        "forecast_cycle": None,
        "point_count": len(points),
        "predicted_at": launch_time.isoformat(),
        "source": "simulated",
    }


def build_deployment(
    flight_id: str,
    station_id: str,
    balloon_item_id: str,
    launch_lat: float = 47.8095,
    launch_lon: float = 13.0550,
    launch_alt_m: float = 425.0,
    launch_time: datetime | None = None,
    seed: int = 42,
) -> dict:
    rng = random.Random(seed)

    if launch_time is None:
        launch_time = datetime.now(tz=timezone.utc).replace(microsecond=0)

    station = GroundStation(
        station_id=station_id,
        name="Salzburg Met Launch Site",
        location=Location(
            lat=launch_lat,
            lon=launch_lon,
            altitude_m=launch_alt_m,
            description="Simulated launch site — Salzburg, Austria",
        ),
        status="active",
        container_type="standard",
    )

    balloon_item = InventoryItem(
        item_id=balloon_item_id,
        station_id=station_id,
        item_type="balloon",
        name="Totex TA1200 (simulated)",
        quantity=1,
        unit="units",
        serial_number="BAL-SIM-001",
        status="deployed",
        metadata={"neck_lift_g": 1200, "diameter_m": 1.2},
    )

    flight = Flight(
        flight_id=flight_id,
        station_id=station_id,
        balloon_item_id=balloon_item_id,
        status="ascending",
        launch_time=launch_time,
        ascent_rate_mps=ASCENT_RATE_MPS,
        burst_altitude_m=BURST_ALTITUDE_M,
        notes=(
            "Simulated uncontrolled ascent for meteorological data collection."
        ),
    )

    telemetry_readings = simulate_ascent(
        launch_lat=launch_lat,
        launch_lon=launch_lon,
        launch_alt_m=launch_alt_m,
        launch_time=launch_time,
        flight_id=flight_id,
        rng=rng,
    )

    traj_rng = random.Random(seed + 1)
    trajectory = simulate_trajectory_points(
        launch_lat=launch_lat,
        launch_lon=launch_lon,
        launch_alt_m=launch_alt_m,
        launch_time=launch_time,
        ascent_rate_mps=ASCENT_RATE_MPS,
        burst_alt_m=BURST_ALTITUDE_M,
        descent_rate_mps=6.0,
        rng=traj_rng,
    )

    flight = flight.model_copy(
        update={
            "max_altitude_m": BURST_ALTITUDE_M,
            "predicted_landing_lat": trajectory["predicted_landing_lat"],
            "predicted_landing_lon": trajectory["predicted_landing_lon"],
        }
    )

    return {
        "station": station,
        "balloon_item": balloon_item,
        "flight": flight,
        "telemetry": telemetry_readings,
        "trajectory": trajectory,
    }


def insert_deployment(deployment: dict) -> None:
    from database.connection import (
        COLLECTION_FLIGHTS,
        COLLECTION_INVENTORY,
        COLLECTION_STATIONS,
        COLLECTION_TELEMETRY,
        connect_db,
        get_db,
    )

    if not connect_db():
        print("ERROR: Could not connect to ArangoDB. Aborting insert.", file=sys.stderr)
        sys.exit(1)

    db = get_db()

    station = deployment["station"]
    balloon_item = deployment["balloon_item"]
    flight = deployment["flight"]
    telemetry = deployment["telemetry"]

    def _upsert(collection: str, key_field: str, doc: dict) -> None:
        existing = list(
            db.aql.execute(
                f"FOR d IN {collection} FILTER d.{key_field} == @val LIMIT 1 RETURN d",
                bind_vars={"val": doc[key_field]},
            )
        )
        if existing:
            print(f"  {collection}/{doc[key_field]} already exists — skipping")
        else:
            db.collection(collection).insert(doc)
            print(f"  Inserted {collection}/{doc[key_field]}")

    print("Inserting ground station …")
    s_doc = station.model_dump()
    s_doc["location"] = s_doc["location"]
    _upsert(COLLECTION_STATIONS, "station_id", s_doc)

    print("Inserting balloon inventory item …")
    _upsert(COLLECTION_INVENTORY, "item_id", balloon_item.model_dump())

    print("Inserting flight …")
    f_doc = flight.model_dump()
    for field in ("launch_time", "landing_time"):
        if f_doc.get(field) and isinstance(f_doc[field], datetime):
            f_doc[field] = f_doc[field].isoformat()
    f_doc["trajectory"] = deployment.get("trajectory")

    existing_flight = list(
        db.aql.execute(
            f"FOR d IN {COLLECTION_FLIGHTS} FILTER d.flight_id == @val LIMIT 1 RETURN d",
            bind_vars={"val": f_doc["flight_id"]},
        )
    )
    if existing_flight:
        if not existing_flight[0].get("trajectory") and f_doc.get("trajectory"):
            db.aql.execute(
                f"""FOR f IN {COLLECTION_FLIGHTS} FILTER f.flight_id == @id
                    UPDATE f WITH {{
                        trajectory: @traj,
                        predicted_landing_lat: @lat,
                        predicted_landing_lon: @lon
                    }} IN {COLLECTION_FLIGHTS}""",
                bind_vars={
                    "id": f_doc["flight_id"],
                    "traj": f_doc["trajectory"],
                    "lat": f_doc.get("predicted_landing_lat"),
                    "lon": f_doc.get("predicted_landing_lon"),
                },
            )
            print(f"  Updated trajectory for {COLLECTION_FLIGHTS}/{f_doc['flight_id']}")
        else:
            print(f"  {COLLECTION_FLIGHTS}/{f_doc['flight_id']} already exists — skipping")
    else:
        db.collection(COLLECTION_FLIGHTS).insert(f_doc)
        print(f"  Inserted {COLLECTION_FLIGHTS}/{f_doc['flight_id']}")

    print(f"Inserting {len(telemetry)} telemetry readings …")
    docs = []
    for r in telemetry:
        d = r.model_dump()
        if d.get("timestamp") and isinstance(d["timestamp"], datetime):
            d["timestamp"] = d["timestamp"].isoformat()
        docs.append(d)
    db.collection(COLLECTION_TELEMETRY).import_bulk(docs)
    print(f"  Inserted {len(docs)} readings")


def print_summary(deployment: dict) -> None:
    flight = deployment["flight"]
    telemetry = deployment["telemetry"]
    first = telemetry[0]
    last = telemetry[-1]
    duration = last.timestamp - first.timestamp

    print("\n=== Simulated Deployment Summary ===")
    print(f"  Station  : {deployment['station'].station_id} — {deployment['station'].name}")
    print(f"  Balloon  : {deployment['balloon_item'].item_id}")
    print(f"  Flight   : {flight.flight_id}")
    print(f"  Launch   : {flight.launch_time}")
    print(f"  Readings : {len(telemetry)} ({TELEMETRY_INTERVAL_S}s cadence)")
    print(f"  Duration : {duration}")
    print(f"  Max alt  : {last.altitude_m} m")
    print(f"  Burst alt: {flight.burst_altitude_m} m")
    print(f"  Landing lat/lon (predicted): {flight.predicted_landing_lat}, {flight.predicted_landing_lon}")
    print(f"  Final position: lat={last.lat}, lon={last.lon}, alt={last.altitude_m} m")
    if last.standard:
        print(f"  Final met: T={last.standard.temp_c}°C  P={last.standard.pressure_hpa} hPa  "
              f"RH={last.standard.humidity_pct}%")
    print()


def deployment_to_json(deployment: dict) -> str:
    def _default(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    out = {
        "station": deployment["station"].model_dump(),
        "balloon_item": deployment["balloon_item"].model_dump(),
        "flight": deployment["flight"].model_dump(),
        "telemetry": [r.model_dump() for r in deployment["telemetry"]],
    }
    return json.dumps(out, default=_default, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a simulated balloon ascent deployment")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON output without writing to DB")
    parser.add_argument("--flight-id", default=None, help="Override flight ID (default: auto UUID)")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducibility (default: 42)")
    parser.add_argument(
        "--launch-lat", type=float, default=47.8095, help="Launch latitude (default: 47.8095 — Salzburg)"
    )
    parser.add_argument(
        "--launch-lon", type=float, default=13.0550, help="Launch longitude (default: 13.0550 — Salzburg)"
    )
    parser.add_argument(
        "--launch-alt", type=float, default=425.0, help="Launch altitude in metres (default 425)"
    )
    args = parser.parse_args()

    flight_id = args.flight_id or f"sim-ascent-{uuid.uuid4().hex[:8]}"
    station_id = "station-sim-salzburg"
    balloon_item_id = "balloon-sim-001"

    print(f"Building simulated deployment (flight_id={flight_id}, seed={args.seed}) …")
    deployment = build_deployment(
        flight_id=flight_id,
        station_id=station_id,
        balloon_item_id=balloon_item_id,
        launch_lat=args.launch_lat,
        launch_lon=args.launch_lon,
        launch_alt_m=args.launch_alt,
        seed=args.seed,
    )

    print_summary(deployment)

    if args.dry_run:
        print(deployment_to_json(deployment))
    else:
        insert_deployment(deployment)
        print("Done.")


if __name__ == "__main__":
    main()
