import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin", tags=["admin"])

SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"

SCRIPT_REGISTRY: dict[str, dict[str, Any]] = {
    "seed_simulation": {
        "id": "seed_simulation",
        "name": "Seed Simulated Deployment",
        "description": (
            "Creates a single balloon deployment with realistic simulated ascent data "
            "(512 telemetry readings, ISA atmosphere, horizontal wind drift). "
            "Inserts a GroundStation, InventoryItem, Flight, and telemetry into the database."
        ),
        "script": "seed_simulation.py",
        "params": [
            {
                "name": "dry_run",
                "flag": "--dry-run",
                "type": "boolean",
                "label": "Dry run (no DB writes)",
                "default": False,
            },
            {
                "name": "flight_id",
                "flag": "--flight-id",
                "type": "string",
                "label": "Flight ID",
                "placeholder": "auto-generated if empty",
                "default": "",
                "required": False,
            },
            {
                "name": "seed",
                "flag": "--seed",
                "type": "integer",
                "label": "RNG seed",
                "default": 42,
            },
            {
                "name": "launch_lat",
                "flag": "--launch-lat",
                "type": "float",
                "label": "Launch latitude",
                "default": 47.8095,
            },
            {
                "name": "launch_lon",
                "flag": "--launch-lon",
                "type": "float",
                "label": "Launch longitude",
                "default": 13.0550,
            },
            {
                "name": "launch_alt",
                "flag": "--launch-alt",
                "type": "float",
                "label": "Launch altitude (m)",
                "default": 425.0,
            },
        ],
    },
    "reverse_predict": {
        "id": "reverse_predict",
        "name": "Reverse Trajectory Prediction",
        "description": (
            "Given a target landing point, estimate where a balloon would need to be launched from. "
            "Tawhiri only predicts forward, so this wraps the forward predictor in a fixed-point "
            "optimisation (launch += target_landing - predicted_landing) that converges in a few "
            "API calls. Calls the Tawhiri API directly; no database connection required."
        ),
        "script": "reverse_predict.py",
        "params": [
            {
                "name": "target_lat",
                "flag": "--target-lat",
                "type": "float",
                "label": "Target landing latitude",
                "required": True,
            },
            {
                "name": "target_lon",
                "flag": "--target-lon",
                "type": "float",
                "label": "Target landing longitude",
                "required": True,
            },
            {
                "name": "launch_time",
                "flag": "--launch-time",
                "type": "string",
                "label": "Launch time (ISO-8601 UTC)",
                "placeholder": "now if empty",
                "default": "",
                "required": False,
            },
            {
                "name": "ascent_rate",
                "flag": "--ascent-rate",
                "type": "float",
                "label": "Ascent rate (m/s)",
                "default": 5.0,
            },
            {
                "name": "burst_alt",
                "flag": "--burst-alt",
                "type": "float",
                "label": "Burst altitude (m)",
                "default": 30000.0,
            },
            {
                "name": "descent_rate",
                "flag": "--descent-rate",
                "type": "float",
                "label": "Descent rate (m/s)",
                "default": 6.0,
            },
            {
                "name": "launch_alt",
                "flag": "--launch-alt",
                "type": "float",
                "label": "Launch altitude (m)",
                "default": 0.0,
            },
            {
                "name": "max_iters",
                "flag": "--max-iters",
                "type": "integer",
                "label": "Max iterations",
                "default": 8,
            },
            {
                "name": "tol_km",
                "flag": "--tol-km",
                "type": "float",
                "label": "Convergence tolerance (km)",
                "default": 1.0,
            },
            {
                "name": "json",
                "flag": "--json",
                "type": "boolean",
                "label": "Emit JSON summary",
                "default": False,
            },
        ],
    },
}

SCRIPT_TIMEOUT_S = 120

SCRIPTS_WITH_TRAILING_JSON = {"reverse_predict"}


class RunScriptRequest(BaseModel):
    params: dict[str, Any] = {}


def _extract_trailing_json(stdout: str) -> tuple[dict | None, str]:
    if not stdout:
        return None, stdout
    idx = len(stdout)
    while True:
        idx = stdout.rfind("{", 0, idx)
        if idx == -1:
            break
        candidate = stdout[idx:]
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            cut = stdout[:idx].rstrip()
            return parsed, cut
    return None, stdout


@router.get("/scripts")
def list_scripts():
    return list(SCRIPT_REGISTRY.values())


@router.post("/scripts/{script_id}/run")
def run_script(script_id: str, body: RunScriptRequest):
    if script_id not in SCRIPT_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown script: {script_id}")

    definition = SCRIPT_REGISTRY[script_id]
    script_path = SCRIPTS_DIR / definition["script"]

    if not script_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Script file not found on server: {definition['script']}",
        )

    cmd = [sys.executable, str(script_path)]

    wants_trailing_json = script_id in SCRIPTS_WITH_TRAILING_JSON
    json_flag = None
    for param_def in definition["params"]:
        name = param_def["name"]
        flag = param_def["flag"]
        ptype = param_def["type"]
        value = body.params.get(name, param_def.get("default"))

        if ptype == "boolean":
            if name == "json" and wants_trailing_json:
                if flag not in cmd:
                    cmd.append(flag)
                json_flag = flag
                continue
            if value:
                cmd.append(flag)
        else:
            if value is not None and value != "":
                cmd.extend([flag, str(value)])

    env = {**os.environ}

    started = time.monotonic()
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=SCRIPT_TIMEOUT_S,
            env=env,
            cwd=str(SCRIPTS_DIR.parent),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail=f"Script timed out after {SCRIPT_TIMEOUT_S}s",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to execute script: {exc}")

    duration_ms = int((time.monotonic() - started) * 1000)

    stdout = result.stdout
    result_data = None
    if wants_trailing_json and json_flag and stdout:
        result_data, stdout = _extract_trailing_json(stdout)

    return {
        "script_id": script_id,
        "exit_code": result.returncode,
        "stdout": stdout,
        "stderr": result.stderr,
        "duration_ms": duration_ms,
        "command": " ".join(cmd),
        "result_data": result_data,
    }
