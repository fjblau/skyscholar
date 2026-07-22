from datetime import datetime
from typing import Optional, List, Dict, Any

BUFR_ENCODER_VERSION = "1.0.0"


def _u3(n: int) -> bytes:
    return n.to_bytes(3, 'big')


def _u2(n: int) -> bytes:
    return n.to_bytes(2, 'big')


def _u1(n: int) -> bytes:
    return n.to_bytes(1, 'big')


class _BitWriter:
    def __init__(self):
        self._bits: list = []

    def write(self, value: int, nbits: int) -> None:
        for i in range(nbits - 1, -1, -1):
            self._bits.append((value >> i) & 1)

    def to_bytes(self) -> bytes:
        bits = self._bits + [0] * (-len(self._bits) % 8)
        result = bytearray()
        for i in range(0, len(bits), 8):
            b = 0
            for j in range(8):
                b = (b << 1) | bits[i + j]
            result.append(b)
        return bytes(result)


_TABLE_B: Dict[int, tuple] = {
    0x0101: (0,  7, 0),
    0x0102: (0, 10, 0),
    0x0401: (0, 12, 0),
    0x0402: (0,  4, 0),
    0x0403: (0,  6, 0),
    0x0404: (0,  5, 0),
    0x0405: (0,  6, 0),
    0x1F01: (0,  8, 0),
    0x0704: (0, 14, -1),
    0x0C65: (0, 16,  2),
    0x0C67: (0, 16,  2),
    0x0B01: (0,  9,  0),
    0x0B02: (0, 13,  1),
}


def _encode_val(descriptor: int, value) -> tuple:
    ref, bits, scale = _TABLE_B[descriptor]
    missing = (1 << bits) - 1
    if value is None:
        return missing, bits
    if scale >= 0:
        enc = round((value - ref) * (10 ** scale))
    else:
        enc = round((value - ref) / (10 ** (-scale)))
    enc = max(0, min(enc, missing - 1))
    return enc, bits


def encode_bufr(
    flight_id: str,
    station_id: str,
    launch_dt: Optional[datetime],
    levels: List[Dict[str, Any]],
) -> bytes:
    dt = launch_dt or datetime.utcnow()

    s1_body = (
        _u1(0)
        + _u2(0)
        + _u2(0)
        + _u1(0)
        + _u1(0)
        + _u1(2)
        + _u1(4)
        + _u1(255)
        + _u1(36)
        + _u1(0)
        + _u2(dt.year)
        + _u1(dt.month)
        + _u1(dt.day)
        + _u1(dt.hour)
        + _u1(dt.minute)
        + _u1(dt.second)
    )
    s1 = _u3(3 + len(s1_body)) + s1_body

    _descs = [
        0x0101, 0x0102,
        0x0401, 0x0402, 0x0403, 0x0404, 0x0405,
        (1 << 14) | (5 << 8) | 0,
        0x1F01,
        0x0704, 0x0C65, 0x0C67, 0x0B01, 0x0B02,
    ]
    desc_bytes = b''.join(_u2(d) for d in _descs)
    s3_body = _u1(0) + _u2(1) + _u1(0) + desc_bytes
    s3 = _u3(3 + len(s3_body)) + s3_body

    bw = _BitWriter()
    bw.write(*_encode_val(0x0101, 0))
    bw.write(*_encode_val(0x0102, 0))
    bw.write(*_encode_val(0x0401, dt.year))
    bw.write(*_encode_val(0x0402, dt.month))
    bw.write(*_encode_val(0x0403, dt.day))
    bw.write(*_encode_val(0x0404, dt.hour))
    bw.write(*_encode_val(0x0405, dt.minute))
    bw.write(*_encode_val(0x1F01, len(levels)))

    for lvl in levels:
        press_hpa = lvl.get('pressure_hpa')
        press_pa = press_hpa * 100 if press_hpa is not None else None
        temp_c = lvl.get('temp_c')
        temp_k = (temp_c + 273.15) if temp_c is not None else None
        dp_c = lvl.get('dew_point_c')
        dp_k = (dp_c + 273.15) if dp_c is not None else None
        bw.write(*_encode_val(0x0704, press_pa))
        bw.write(*_encode_val(0x0C65, temp_k))
        bw.write(*_encode_val(0x0C67, dp_k))
        bw.write(*_encode_val(0x0B01, lvl.get('wind_dir_deg')))
        bw.write(*_encode_val(0x0B02, lvl.get('wind_speed_mps')))

    s4_body = _u1(0) + bw.to_bytes()
    s4 = _u3(3 + len(s4_body)) + s4_body

    s5 = b'7777'
    payload = s1 + s3 + s4 + s5
    s0 = b'BUFR' + _u3(8 + len(payload)) + _u1(4)
    return s0 + payload
