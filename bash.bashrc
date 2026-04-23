#!/bin/bash

PROMPT_COMMAND="history -a"

mkdir -p /tmp/.dojo

if [ "${HOSTNAME:0:2}" != "vm" ] && [ ! -e "/tmp/.dojo/readme-once" ]; then
    if [ -e "/challenge/README.md" ]; then
        README="/challenge/README.md"
    elif [ -e "/challenge/DESCRIPTION.md" ]; then
        README="/challenge/DESCRIPTION.md"
    else
        README=""
    fi

    if [ -n "$README" ]; then
        if command -v glow > /dev/null 2>&1; then
            glow -p "$README"
        elif command -v less > /dev/null 2>&1; then
            less -ERX "$README"
        else
            cat "$README"
        fi

        touch /tmp/.dojo/readme-once
    fi
fi

AVAILABLE_M="$(df --block-size=1M --output=avail /home/hacker | tail -n +2 | head -n1)"
if [[ "$AVAILABLE_M" -lt 512 ]]; then
    echo 'Note: Your home directory is running low on storage:'
    df -h /home/hacker
    echo ''
    echo 'Filling your home directory completely could cause you to lose access to the workspace and/or desktop.'
    echo 'You can view a list of the largest files and directories using the command:'
    echo '  du -sh /home/hacker/{*,.*} | sort -h'
fi

export LANG=C.UTF-8

[ -f "/challenge/.bashrc" ] && source /challenge/.bashrc
