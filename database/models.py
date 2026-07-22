from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from datetime import datetime


class AuditEvent(BaseModel):
    event_id: str
    seq: int
    event_type: str
    timestamp: datetime
    actor: str = "system"
    entity_type: str
    entity_id: str
    old_state: Optional[str] = None
    new_state: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    payload_hash: Optional[str] = None
    prev_hash: str
    event_hash: str


class Location(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    altitude_m: float = Field(0, ge=0)
    description: Optional[str] = None


class GroundStation(BaseModel):
    station_id: str
    name: str
    location: Location
    status: Literal["online", "offline", "maintenance"] = "online"
    # TinyGS-inspired fields
    listening: Optional[str] = None
    firmware_version: Optional[str] = None
    qth_locator: Optional[str] = None
    antenna_type: Optional[str] = None
    band: Optional[str] = None
    radio_status: Optional[str] = None
    auto_tune_freq_mhz: Optional[float] = None
    test_mode: bool = False
    auto_update: bool = True
    confirmed_packets: int = 0
    telemetry_packets: int = 0
    record_distance_km: Optional[float] = None
    local_ip: Optional[str] = None
    wifi_rssi: Optional[str] = None
    last_seen: Optional[datetime] = None
    last_packet: Optional[datetime] = None
    notes: Optional[str] = None


class InventoryItem(BaseModel):
    item_id: str
    station_id: str
    item_type: Literal[
        "balloon", "hydrogen_tank", "parachute", "sensor_payload", "other"
    ]
    name: str
    quantity: float = 1.0
    unit: str = "units"
    serial_number: Optional[str] = None
    status: Literal["available", "deployed", "maintenance", "retired"] = "available"
    metadata: Optional[dict[str, Any]] = None


class BufrFieldMapping(BaseModel):
    field_name: str
    bufr_descriptor: Optional[str] = None
    bufr_status: Literal["standard", "draft_extension", "custom"] = "custom"
    unit: Optional[str] = None
    description: Optional[str] = None


class PayloadSchema(BaseModel):
    schema_id: str
    name: str
    payload_type: Literal["standard", "custom"] = "custom"
    description: Optional[str] = None
    fields: list[BufrFieldMapping] = []
    version: str = "1.0"


class StandardTelemetry(BaseModel):
    temp_c: Optional[float] = None
    pressure_hpa: Optional[float] = None
    humidity_pct: Optional[float] = None
    dew_point_c: Optional[float] = None
    wind_speed_mps: Optional[float] = None
    wind_dir_deg: Optional[float] = None


class Flight(BaseModel):
    flight_id: str
    balloon_item_id: Optional[str] = None
    launch_lat: Optional[float] = None
    launch_lon: Optional[float] = None
    launch_alt_m: Optional[float] = 0
    payload_schema_ids: list[str] = []
    status: Literal[
        "planned", "launching", "ascending", "descending", "landed", "recovered", "aborted"
    ] = "planned"
    launch_time: Optional[datetime] = None
    landing_time: Optional[datetime] = None
    max_altitude_m: Optional[float] = None
    ascent_rate_mps: Optional[float] = None
    burst_altitude_m: Optional[float] = None
    descent_rate_mps: Optional[float] = None
    predicted_landing_lat: Optional[float] = None
    predicted_landing_lon: Optional[float] = None
    actual_landing_lat: Optional[float] = None
    actual_landing_lon: Optional[float] = None
    notes: Optional[str] = None


class TelemetryReading(BaseModel):
    flight_id: str
    timestamp: datetime
    lat: Optional[float] = None
    lon: Optional[float] = None
    altitude_m: Optional[float] = None
    standard: Optional[StandardTelemetry] = None
    custom_payloads: Optional[dict[str, Any]] = None
    source: Literal["balloon", "ground"] = "balloon"
    bufr_standard_fields: list[str] = []
    bufr_custom_fields: list[str] = []
