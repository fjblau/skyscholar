import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from database.connection import get_db, COLLECTION_AUDIT_EVENTS

GENESIS_HASH = "0" * 64


def _canonical_json(obj: dict) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _payload_hash(payload: Optional[dict]) -> Optional[str]:
    if payload is None:
        return None
    return _sha256(_canonical_json(payload))


def _get_last_event(db) -> Optional[dict]:
    cursor = db.aql.execute(
        "FOR e IN audit_events SORT e.seq DESC LIMIT 1 RETURN e"
    )
    results = list(cursor)
    return results[0] if results else None


def _compute_prev_hash(last_event: Optional[dict]) -> tuple[str, int]:
    if last_event is None:
        return GENESIS_HASH, 0
    canonical = _canonical_json({k: v for k, v in last_event.items() if not k.startswith("_")})
    return _sha256(canonical), last_event["seq"]


def record_event(
    event_type: str,
    entity_type: str,
    entity_id: str,
    actor: str = "system",
    old_state: Optional[str] = None,
    new_state: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> dict:
    db = get_db()
    last = _get_last_event(db)
    prev_hash, last_seq = _compute_prev_hash(last)
    seq = last_seq + 1
    ts = datetime.now(timezone.utc).isoformat()

    event_body = {
        "event_id": str(uuid.uuid4()),
        "seq": seq,
        "event_type": event_type,
        "timestamp": ts,
        "actor": actor,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "old_state": old_state,
        "new_state": new_state,
        "payload": payload,
        "payload_hash": _payload_hash(payload),
        "prev_hash": prev_hash,
    }

    event_hash = _sha256(_canonical_json(event_body))
    event_body["event_hash"] = event_hash

    db.collection(COLLECTION_AUDIT_EVENTS).insert(event_body)
    return event_body
