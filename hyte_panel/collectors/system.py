"""CPU, memory, disk, network and sensor readings via psutil."""

from __future__ import annotations

import os
import platform
import re
import time
from pathlib import Path
from typing import Any

import psutil

_CPU_TEMP_KEYS = ("k10temp", "zenpower", "coretemp", "cpu_thermal", "acpitz")
_CPU_LABEL_PREF = ("Tctl", "Tdie", "Package id 0", "Core 0", "")
_HWMON = Path("/sys/class/hwmon")


def _cpu_temp_path() -> Path | None:
    """Discover the CPU input without reading every GPU/disk temperature."""
    chips: dict[str, list[tuple[str, Path]]] = {}
    for directory in sorted(_HWMON.glob("hwmon*")):
        for base in (directory, directory / "device"):
            try:
                name = (base / "name").read_text().strip()
            except OSError:
                continue
            if name not in _CPU_TEMP_KEYS:
                continue
            for sensor in sorted(base.glob("temp*_input")):
                try:
                    label = sensor.with_name(sensor.name.replace("_input", "_label")).read_text().strip()
                except OSError:
                    label = ""
                chips.setdefault(name, []).append((label, sensor))
    for key in _CPU_TEMP_KEYS:
        entries = chips.get(key, [])
        for pref in _CPU_LABEL_PREF:
            for label, sensor in entries:
                if label == pref or (pref and label.startswith(pref)):
                    return sensor
        if entries:
            return entries[0][1]
    return None


def _cpu_model() -> str:
    try:
        with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if line.lower().startswith("model name"):
                    name = line.split(":", 1)[1].strip()
                    return re.sub(r"\s+", " ", name)
    except OSError:
        pass
    return platform.processor() or "CPU"


class SystemCollector:
    def __init__(self, disks: list[str], network_interface: str = "") -> None:
        self.disks = disks or ["/"]
        self.iface = network_interface
        self.cpu_model = _cpu_model()
        self._last_net: tuple[float, int, int] | None = None
        self._temp_path: Path | None = None
        self._temp_discover_at = 0.0
        psutil.cpu_percent(interval=None)  # prime the counter

    def cpu_temp(self) -> float | None:
        now = time.monotonic()
        if now >= self._temp_discover_at:
            self._temp_path = _cpu_temp_path()
            self._temp_discover_at = now + 30
        if self._temp_path is not None:
            try:
                return float(self._temp_path.read_text()) / 1000
            except (OSError, ValueError):
                self._temp_path = None
                self._temp_discover_at = 0.0
        # Keep psutil's thermal-zone and non-Linux fallback behavior.
        try:
            temps = psutil.sensors_temperatures()
        except (AttributeError, OSError):
            return None
        for key in _CPU_TEMP_KEYS:
            entries = temps.get(key)
            if not entries:
                continue
            for pref in _CPU_LABEL_PREF:
                for e in entries:
                    if (e.label or "") == pref or (pref and (e.label or "").startswith(pref)):
                        return float(e.current)
            return float(entries[0].current)
        for entries in temps.values():
            if entries:
                return float(entries[0].current)
        return None

    def fans(self) -> list[dict[str, Any]]:
        try:
            fans = psutil.sensors_fans()
        except (AttributeError, OSError):
            return []
        out = []
        for chip, entries in fans.items():
            for e in entries:
                if e.current and e.current > 0:
                    out.append({"name": e.label or chip, "rpm": int(e.current)})
        return out[:8]

    def network(self) -> dict[str, Any]:
        now = time.monotonic()
        if self.iface:
            per = psutil.net_io_counters(pernic=True)
            c = per.get(self.iface)
            rx, tx = (c.bytes_recv, c.bytes_sent) if c else (0, 0)
        else:
            c = psutil.net_io_counters()
            rx, tx = c.bytes_recv, c.bytes_sent
        down = up = 0.0
        if self._last_net:
            t0, rx0, tx0 = self._last_net
            dt = max(now - t0, 1e-3)
            down = max(rx - rx0, 0) / dt
            up = max(tx - tx0, 0) / dt
        self._last_net = (now, rx, tx)
        return {"interface": self.iface or "all", "down_bps": down, "up_bps": up}

    def disks_usage(self) -> list[dict[str, Any]]:
        out = []
        for mount in self.disks:
            try:
                u = psutil.disk_usage(mount)
            except OSError:
                continue
            out.append({"mount": mount, "used": u.used, "total": u.total, "percent": u.percent})
        return out

    def snapshot(self) -> dict[str, Any]:
        vm = psutil.virtual_memory()
        freq = None
        try:
            f = psutil.cpu_freq()
            freq = f.current if f else None
        except (AttributeError, OSError, RuntimeError):
            freq = None
        try:
            load1, load5, load15 = os.getloadavg()
        except OSError:
            load1 = load5 = load15 = 0.0
        return {
            "hostname": platform.node(),
            "uptime_seconds": time.time() - psutil.boot_time(),
            "cpu": {
                "model": self.cpu_model,
                "percent": psutil.cpu_percent(interval=None),
                "per_core": psutil.cpu_percent(interval=None, percpu=True),
                "freq_mhz": freq,
                "temp_c": self.cpu_temp(),
                "load": [load1, load5, load15],
                "cores": psutil.cpu_count(logical=True),
            },
            "memory": {"used": vm.used, "total": vm.total, "percent": vm.percent},
            "disks": self.disks_usage(),
            "network": self.network(),
            "fans": self.fans(),
        }
