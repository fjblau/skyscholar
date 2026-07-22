"""
Reverse trajectory prediction: given a target landing point, estimate where a
balloon would need to be launched from to land there.

Tawhiri (the trajectory model behind balloon-predictor) only predicts forward
(launch -> landing). There is no native reverse mode, so this script wraps the
forward predictor in a small 2-D optimisation. Because wind drift is
approximately a constant translation, the launch->landing map has a Jacobian
close to the identity, so a fixed-point iteration

    launch += (target_landing - predicted_landing)

converges in a handful of Tawhiri calls (typically 2-5).

Usage:
    python scripts/reverse_predict.py --target-lat 48.2 --target-lon 13.8
    python scripts/reverse_predict.py --target-lat 48.2 --target-lon 13.8 \\
        --launch-time 2026-07-21T12:00:00Z --burst-alt 30000 --json

No database connection is required; this calls the Tawhiri API directly.

Environment variables:
    TAWHIRI_BASE_URL (optional) — override the Tawhiri endpoint.
"""

import argparse
import asyncio
import json
import math
import sys
from datetime import datetime, timezone

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def _wrap_lon(lon: float) -> float:
    return ((lon + 180.0) % 360.0) - 180.0


def _clamp_lat(lat: float) -> float:
    return max(-89.0, min(89.0, lat))


async def reverse_predict(
    target_lat: float,
    target_lon: float,
    launch_time: datetime,
    ascent_rate_mps: float,
    burst_alt_m: float,
    descent_rate_mps: float,
    launch_alt_m: float,
    initial_lat: float | None,
    initial_lon: float | None,
    max_iters: int,
    tol_km: float,
    base_url: str | None,
) -> dict:
    from balloon_predictor import LaunchParams, TawhiriClient

    lat = float(initial_lat) if initial_lat is not None else float(target_lat)
    lon = float(initial_lon) if initial_lon is not None else float(target_lon)
    lon = _wrap_lon(lon)
    lat = _clamp_lat(lat)

    client_kwargs = {}
    if base_url:
        client_kwargs["base_url"] = base_url
    client = TawhiriClient(**client_kwargs)

    history = []
    best = None
    best_err_km = math.inf
    api_calls = 0

    try:
        for i in range(1, max_iters + 1):
            params = LaunchParams(
                launch_lat=lat,
                launch_lon=lon,
                launch_alt_m=launch_alt_m,
                launch_time=launch_time,
                ascent_rate_mps=ascent_rate_mps,
                burst_alt_m=burst_alt_m,
                descent_rate_mps=descent_rate_mps,
            )

            try:
                traj = await client.predict(params)
                api_calls += 1
            except Exception as exc:
                history.append({
                    "iter": i,
                    "launch_lat": round(lat, 6),
                    "launch_lon": round(lon, 6),
                    "error": f"Tawhiri request failed: {exc}",
                })
                break

            landing = traj.landing
            if landing is None:
                history.append({
                    "iter": i,
                    "launch_lat": round(lat, 6),
                    "launch_lon": round(lon, 6),
                    "error": "Tawhiri returned no landing point",
                })
                break

            err_km = haversine_km(landing.lat, landing.lon, target_lat, target_lon)
            entry = {
                "iter": i,
                "launch_lat": round(lat, 6),
                "launch_lon": round(lon, 6),
                "predicted_landing_lat": round(landing.lat, 6),
                "predicted_landing_lon": round(landing.lon, 6),
                "error_km": round(err_km, 4),
            }
            history.append(entry)

            if err_km < best_err_km:
                best_err_km = err_km
                best = {
                    "launch_lat": lat,
                    "launch_lon": lon,
                    "predicted_landing_lat": landing.lat,
                    "predicted_landing_lon": landing.lon,
                    "error_km": err_km,
                    "iterations": i,
                    "forecast_cycle": traj.forecast_cycle.isoformat() if traj.forecast_cycle else None,
                }

            if err_km <= tol_km:
                break

            lat = _clamp_lat(lat + (target_lat - landing.lat))
            lon = _wrap_lon(lon + (target_lon - landing.lon))
    finally:
        await client.close()

    if best is None:
        return {
            "ok": False,
            "error": "No successful prediction was obtained. Check Tawhiri connectivity and launch_time.",
            "target_lat": target_lat,
            "target_lon": target_lon,
            "history": history,
            "api_calls": api_calls,
        }

    return {
        "ok": True,
        "target_landing_lat": round(target_lat, 6),
        "target_landing_lon": round(target_lon, 6),
        "recommended_launch_lat": round(best["launch_lat"], 6),
        "recommended_launch_lon": round(best["launch_lon"], 6),
        "predicted_landing_lat": round(best["predicted_landing_lat"], 6),
        "predicted_landing_lon": round(best["predicted_landing_lon"], 6),
        "residual_km": round(best["error_km"], 4),
        "iterations": best["iterations"],
        "converged": best["error_km"] <= tol_km,
        "tolerance_km": tol_km,
        "forecast_cycle": best["forecast_cycle"],
        "launch_time": launch_time.isoformat(),
        "ascent_rate_mps": ascent_rate_mps,
        "burst_alt_m": burst_alt_m,
        "descent_rate_mps": descent_rate_mps,
        "launch_alt_m": launch_alt_m,
        "api_calls": api_calls,
        "history": history,
        "source": "tawhiri",
        "method": "fixed_point",
        "note": (
            "Estimated launch site whose forward-predicted landing is closest "
            "to the target. Not unique; depends on wind forecast quality."
        ),
    }


def _parse_launch_time(raw: str) -> datetime:
    if not raw:
        return datetime.now(timezone.utc).replace(microsecond=0)
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _print_summary(result: dict) -> None:
    if not result.get("ok"):
        print("=== Reverse prediction failed ===")
        print(f"  Target : {result.get('target_lat')}, {result.get('target_lon')}")
        for h in result.get("history", []):
            print(f"  iter {h.get('iter')}: {h.get('error', h)}")
        print(f"  API calls: {result.get('api_calls')}")
        return

    print("\n=== Reverse Trajectory Prediction ===")
    print(f"  Target landing : {result['target_landing_lat']}, {result['target_landing_lon']}")
    print(f"  Recommended launch : {result['recommended_launch_lat']}, {result['recommended_launch_lon']}")
    print(f"  Predicted landing    : {result['predicted_landing_lat']}, {result['predicted_landing_lon']}")
    print(f"  Residual distance    : {result['residual_km']} km")
    print(f"  Converged            : {result['converged']} (tolerance {result['tolerance_km']} km)")
    print(f"  Iterations           : {result['iterations']} ({result['api_calls']} API calls)")
    print(f"  Launch time          : {result['launch_time']}")
    print(f"  Ascent / burst / descent : {result['ascent_rate_mps']} m/s, "
          f"{result['burst_alt_m']} m, {result['descent_rate_mps']} m/s")
    print(f"  Launch altitude      : {result['launch_alt_m']} m")
    if result.get("forecast_cycle"):
        print(f"  Forecast cycle       : {result['forecast_cycle']}")
    print()
    print("  Iteration log:")
    for h in result["history"]:
        if "error" in h:
            print(f"    iter {h['iter']}: {h['error']}")
        else:
            print(f"    iter {h['iter']}: launch=({h['launch_lat']}, {h['launch_lon']}) "
                  f"landing=({h['predicted_landing_lat']}, {h['predicted_landing_lon']}) "
                  f"err={h['error_km']} km")
    print()
    print(f"  Note: {result['note']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reverse trajectory prediction: find a launch site for a target landing."
    )
    parser.add_argument("--target-lat", type=float, required=True, help="Target landing latitude")
    parser.add_argument("--target-lon", type=float, required=True, help="Target landing longitude")
    parser.add_argument("--launch-time", default="", help="Launch time ISO-8601 UTC (default: now)")
    parser.add_argument("--ascent-rate", type=float, default=5.0, help="Ascent rate m/s (default 5.0)")
    parser.add_argument("--burst-alt", type=float, default=30000.0, help="Burst altitude m (default 30000)")
    parser.add_argument("--descent-rate", type=float, default=6.0, help="Descent rate m/s (default 6.0)")
    parser.add_argument("--launch-alt", type=float, default=0.0, help="Launch altitude m (default 0)")
    parser.add_argument("--initial-lat", type=float, default=None, help="Initial launch-lat guess (default: target)")
    parser.add_argument("--initial-lon", type=float, default=None, help="Initial launch-lon guess (default: target)")
    parser.add_argument("--max-iters", type=int, default=8, help="Max optimisation iterations (default 8)")
    parser.add_argument("--tol-km", type=float, default=1.0, help="Convergence tolerance in km (default 1.0)")
    parser.add_argument("--json", action="store_true", help="Emit a JSON summary")
    args = parser.parse_args()

    try:
        from balloon_predictor import LaunchParams  # noqa: F401
    except ImportError:
        print(
            "ERROR: balloon-predictor library not installed. "
            "Install with: pip install 'balloon-predictor @ git+https://github.com/fjblau/balloon-predictor.git'",
            file=sys.stderr,
        )
        sys.exit(1)

    import os
    base_url = os.getenv("TAWHIRI_BASE_URL") or None

    launch_time = _parse_launch_time(args.launch_time)

    print(f"Reverse-predicting launch site for target "
          f"({args.target_lat}, {args.target_lon}) at {launch_time.isoformat()} …")

    result = asyncio.run(
        reverse_predict(
            target_lat=args.target_lat,
            target_lon=args.target_lon,
            launch_time=launch_time,
            ascent_rate_mps=args.ascent_rate,
            burst_alt_m=args.burst_alt,
            descent_rate_mps=args.descent_rate,
            launch_alt_m=args.launch_alt,
            initial_lat=args.initial_lat,
            initial_lon=args.initial_lon,
            max_iters=args.max_iters,
            tol_km=args.tol_km,
            base_url=base_url,
        )
    )

    _print_summary(result)

    if args.json:
        print("\n" + json.dumps(result, indent=2))

    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
