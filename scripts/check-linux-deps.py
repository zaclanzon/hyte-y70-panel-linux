import sys
if sys.version_info < (3, 11):
    sys.exit("HYTE Panel requires Python 3.11+. Use a supported distro release.")
try:
    import venv
    import gi
    gi.require_version("Gtk", "4.0")
    gi.require_version("WebKit", "6.0")
    gi.require_version("Adw", "1")
    gi.require_foreign("cairo")
    from gi.repository import Gtk, WebKit, Adw
except (ImportError, ValueError) as exc:
    sys.exit(f"Missing HYTE desktop dependency: {exc}")
print(f"GTK4, WebKitGTK 6, libadwaita and Cairo OK: {sys.executable}")
