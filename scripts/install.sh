#!/usr/bin/env bash
# Install hyte-panel for the current user on any Linux distribution.
#
#   scripts/install.sh                 # system packages + venv + setup
#   scripts/install.sh --no-packages   # skip the package manager step
#
# System packages give Python access to GTK4, WebKitGTK and libadwaita; they
# cannot come from pip. Everything else is a virtualenv under
# ~/.local/share/hyte-panel and `hyte-panel setup`, which writes the config,
# the app grid entry and the systemd user unit (or an autostart entry when
# there is no systemd).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/hyte-panel"
VENV="$DATA_DIR/venv"
DO_PACKAGES=1; PACKAGES_ONLY=0; DO_SETUP=1; LINUX_SETUP_DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --no-packages) DO_PACKAGES=0 ;;
    --packages-only) PACKAGES_ONLY=1 ;;
    --no-setup) DO_SETUP=0 ;;
    --dry-run) LINUX_SETUP_DRY_RUN=1 ;;
    -h|--help) echo 'Usage: scripts/install.sh [--no-packages] [--packages-only] [--no-setup] [--dry-run]'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
. "$REPO_DIR/scripts/linux-deps.sh"
if [[ "$LINUX_SETUP_DRY_RUN" == 0 && "$EUID" == 0 && "$PACKAGES_ONLY" == 0 ]]; then
  echo 'Run as your desktop user; only system packages use sudo.' >&2; exit 1
fi
[[ "$DO_PACKAGES" == 0 ]] || linux_dependencies
[[ "$LINUX_SETUP_DRY_RUN" == 0 ]] || { echo 'Dry run: packages, private venv, and user desktop setup; no changes made.'; exit 0; }
# Select the interpreter that sees the distribution's GI bindings.
PYTHON=/usr/bin/python3
[[ -x "$PYTHON" ]] || PYTHON=$(command -v python3)
"$PYTHON" "$REPO_DIR/scripts/check-linux-deps.py"
[[ "$PACKAGES_ONLY" == 0 ]] || exit 0

# ---- 2. virtualenv ------------------------------------------------------------
echo "==> Creating virtualenv in $VENV"
mkdir -p "$DATA_DIR"
# --system-site-packages lets the venv see the distro's PyGObject (gi).
"$PYTHON" -m venv --system-site-packages "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet "$REPO_DIR[nvidia]"

# ---- 3. config, app grid entry, startup -----------------------------------------
echo "==> Setting up"
if [[ "$DO_SETUP" == 1 ]]; then "$VENV/bin/hyte-panel" setup; fi

cat <<MSG

Next:
  1. Rotate the HYTE screen to portrait in your display settings (docs/hyte-y70-ubuntu.md).
  2. Map touch to the HYTE screen:  $REPO_DIR/scripts/map-touch.sh
  3. Open HYTE Panel from the app grid and press Start.
  4. Adjust widgets and weather location in Settings.
MSG
