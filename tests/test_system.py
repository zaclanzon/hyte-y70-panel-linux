from types import SimpleNamespace

from hyte_panel.collectors import system


def sensor(root, chip, name, index, label, value):
    directory = root / chip
    directory.mkdir(exist_ok=True)
    (directory / 'name').write_text(name)
    path = directory / f'temp{index}_input'
    path.write_text(str(value))
    (directory / f'temp{index}_label').write_text(label)
    return path


def test_cpu_sensor_reads_fresh_values_without_full_scan(tmp_path, monkeypatch):
    monkeypatch.setattr(system, '_HWMON', tmp_path)
    sensor(tmp_path, 'hwmon0', 'nvme', 1, 'Composite', 99000)
    sensor(tmp_path, 'hwmon1', 'k10temp', 1, 'Tdie', 42000)
    path = sensor(tmp_path, 'hwmon1', 'k10temp', 2, 'Tctl', 45000)
    collector = system.SystemCollector(['/'])
    monkeypatch.setattr(system.psutil, 'sensors_temperatures', lambda: (_ for _ in ()).throw(AssertionError('full scan')))
    assert collector.cpu_temp() == 45
    path.write_text('46500')
    assert collector.cpu_temp() == 46.5
    assert collector._temp_path == path


def test_cpu_sensor_disappearance_falls_back_and_rediscovers(tmp_path, monkeypatch):
    monkeypatch.setattr(system, '_HWMON', tmp_path)
    path = sensor(tmp_path, 'hwmon0', 'coretemp', 1, 'Package id 0', 51000)
    collector = system.SystemCollector(['/'])
    assert collector.cpu_temp() == 51
    path.unlink()
    monkeypatch.setattr(system.psutil, 'sensors_temperatures', lambda: {'cpu_thermal': [SimpleNamespace(label='', current=52)]})
    assert collector.cpu_temp() == 52
    sensor(tmp_path, 'hwmon1', 'coretemp', 1, 'Package id 0', 53000)
    assert collector.cpu_temp() == 53


def test_unknown_sensor_layout_uses_psutil(tmp_path, monkeypatch):
    monkeypatch.setattr(system, '_HWMON', tmp_path)
    monkeypatch.setattr(system.psutil, 'sensors_temperatures', lambda: {'other': [SimpleNamespace(label='', current=40)]})
    assert system.SystemCollector(['/']).cpu_temp() == 40
