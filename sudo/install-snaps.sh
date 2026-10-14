#!/bin/bash
set -euo pipefail

cleanup() {
    local status=$? cleanup_status=0
    trap - EXIT
    if [ "$status" -ne 0 ]; then
        timeout --kill-after=10s 30s vm exec snap changes >&2 || true
        timeout --kill-after=10s 30s vm exec journalctl -u snapd.service -n 100 --no-pager >&2 || true
        tail -n 100 /var/log/vm.log >&2 || true
    fi
    timeout --kill-after=10s 30s vm stop || cleanup_status=$?
    usermod -p '*' root || cleanup_status=$?
    rm -rf /home/hacker || cleanup_status=$?
    if [ "$status" -eq 0 ]; then
        status=$cleanup_status
    fi
    exit "$status"
}
trap cleanup EXIT

passwd -d root
mkdir -p /home/hacker
vm start
timeout --kill-after=10s 5m bash -o pipefail -c 'until vm exec echo ok | grep -qx ok; do sleep 1; done'
timeout --kill-after=10s 30s vm exec systemctl enable --now snapd.socket
timeout --kill-after=10s 5m vm exec "sh -c 'until snap wait system seed.loaded 2>/dev/null; do sleep 2; done'"

for snap in snapd core; do
    if timeout --kill-after=10s 30s vm exec snap list "$snap" >/dev/null 2>&1; then
        continue
    fi
    for attempt in 1 2 3 4 5; do
        if timeout --kill-after=30s 11m vm exec timeout --signal=INT --kill-after=30s 10m snap install "$snap"; then
            break
        fi
        if timeout --kill-after=10s 1m vm exec timeout --kill-after=10s 30s snap watch --last=install-snap && \
            timeout --kill-after=10s 30s vm exec snap list "$snap" >/dev/null 2>&1; then
            break
        fi
        if [ "$attempt" -eq 5 ]; then
            echo "Failed to install $snap after five attempts." >&2
            exit 1
        fi
        echo "Retrying snap install $snap in $((attempt * 10)) seconds." >&2
        sleep "$((attempt * 10))"
    done
done
