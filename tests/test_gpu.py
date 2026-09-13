from hyte_panel.collectors.gpu import parse_nvidia_smi


def test_parse_nvidia_smi_csv():
    out = "NVIDIA GeForce RTX 5090, 37, 61, 4096, 32768, 210.55, 575.00, 45, 2520, 14001\n"
    gpus = parse_nvidia_smi(out)
    assert len(gpus) == 1
    g = gpus[0]
    assert g["name"] == "NVIDIA GeForce RTX 5090"
    assert g["util_percent"] == 37
    assert g["mem_percent"] == 12.5
    assert g["power_w"] == 210.55
    assert g["clock_mem_mhz"] == 14001


def test_parse_nvidia_smi_handles_na_and_junk():
    out = "GPU X, [N/A], N/A, 100, 1000, [Not Supported], , 0, 100, 200\nshort,line\n"
    g = parse_nvidia_smi(out)
    assert len(g) == 1
    assert g[0]["util_percent"] is None
    assert g[0]["temp_c"] is None
    assert g[0]["power_w"] is None
    assert g[0]["power_limit_w"] is None
    assert g[0]["mem_percent"] == 10.0


def test_multiple_smi_devices_keep_separate_memory():
    out = ('NVIDIA GeForce RTX 5090, 97, 65, 16384, 32768, 400, 575, 50, 2500, 14000, GPU-a, 0\n'
           'NVIDIA T400, 2, 38, 512, 4096, N/A, N/A, N/A, 300, 400, GPU-b, 1\n')
    a, b = parse_nvidia_smi(out)
    assert (a['uuid'], b['uuid']) == ('GPU-a', 'GPU-b')
    assert (a['mem_total_mb'], b['mem_total_mb']) == (32768, 4096)
    assert (a['mem_percent'], b['mem_percent']) == (50, 12.5)
    assert b['power_w'] is None
    assert b['temp_c'] == 38


class FakeNvml:
    NVML_TEMPERATURE_GPU = 0
    NVML_CLOCK_SM = 0
    NVML_CLOCK_MEM = 1

    def nvmlDeviceGetCount(self):
        return 2

    def nvmlDeviceGetHandleByIndex(self, i):
        return i

    def nvmlDeviceGetName(self, h):
        return [b'NVIDIA GeForce RTX 5090', b'NVIDIA T400'][h]

    def nvmlDeviceGetUUID(self, h):
        return [b'GPU-a', b'GPU-b'][h]

    def nvmlDeviceGetUtilizationRates(self, h):
        from types import SimpleNamespace
        return SimpleNamespace(gpu=[97, 2][h])

    def nvmlDeviceGetMemoryInfo(self, h):
        from types import SimpleNamespace
        return SimpleNamespace(used=[16384, 512][h] * 1024**2, total=[32768, 4096][h] * 1024**2)

    def nvmlDeviceGetTemperature(self, h, sensor):
        return [65, 38][h]

    def __getattr__(self, name):
        def unsupported(*args):
            raise RuntimeError('Not supported')
        return unsupported


def collector(nv):
    from hyte_panel.collectors.gpu import GpuCollector
    c = GpuCollector(enabled=False)
    c.enabled = True
    c._nvml = nv
    return c


def test_nvml_enumerates_all_devices():
    a, b = collector(FakeNvml()).snapshot()
    assert (a['uuid'], b['uuid']) == ('GPU-a', 'GPU-b')
    assert (a['mem_total_mb'], b['mem_total_mb']) == (32768, 4096)
    assert b['name'] == 'NVIDIA T400'
    assert b['util_percent'] == 2
    assert b['temp_c'] == 38
    assert b['power_w'] is None


def test_unsupported_readings_preserve_other_metrics_and_devices():
    nv = FakeNvml()
    nv.nvmlDeviceGetUtilizationRates = nv.unsupported
    nv.nvmlDeviceGetMemoryInfo = nv.unsupported
    c = collector(nv)
    gpus = c.snapshot()
    assert len(gpus) == 2
    assert all(g['util_percent'] is None and g['mem_total_mb'] is None for g in gpus)
    assert gpus[1]['temp_c'] == 38
    assert c._nvml is nv


def test_lost_device_does_not_hide_healthy_device():
    nv = FakeNvml()
    def handle(i):
        if i == 0:
            raise RuntimeError('GPU lost')
        return i
    nv.nvmlDeviceGetHandleByIndex = handle
    gpus = collector(nv).snapshot()
    assert len(gpus) == 1
    assert gpus[0]['uuid'] == 'GPU-b'
    assert gpus[0]['index'] == 1


def test_enumeration_failure_falls_back_to_smi(monkeypatch):
    nv = FakeNvml()
    nv.nvmlDeviceGetCount = nv.unsupported
    c = collector(nv)
    monkeypatch.setattr(c, '_via_smi', lambda: [{'name': 'fallback'}])
    assert c.snapshot() == [{'name': 'fallback'}]
    c.enabled = False
    assert c.snapshot() == []
