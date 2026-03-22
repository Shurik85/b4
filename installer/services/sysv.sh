#!/bin/sh
# Service type: sysv
# Manages b4 using a traditional SysV init.d script

service_sysv_install() {
    ensure_dir "$B4_SERVICE_DIR" "Service directory" || return 1

    cat >"${B4_SERVICE_DIR}/${B4_SERVICE_NAME}" <<EOF
#!/bin/sh
# B4 DPI Bypass Service
PROG="${B4_BIN_DIR}/${BINARY_NAME}"
CONFIG="${B4_CONFIG_FILE}"
PIDFILE="/var/run/b4.pid"

kernel_mod_load() {
    KERNEL=\$(uname -r)
    for mod in nfnetlink nf_conntrack nf_conntrack_netlink xt_connbytes xt_NFQUEUE nfnetlink_queue xt_multiport nf_tables nft_queue nft_ct nf_nat nft_masq; do
        modprobe "\$mod" >/dev/null 2>&1 && continue
        mod_path=\$(find /lib/modules/\$KERNEL -name "\${mod}.ko*" 2>/dev/null | head -1)
        [ -n "\$mod_path" ] && insmod "\$mod_path" >/dev/null 2>&1 || true
    done
}

start() {
    echo "Starting b4..."
    [ -f "\$PIDFILE" ] && kill -0 \$(cat "\$PIDFILE") 2>/dev/null && echo "Already running" && return 1
    kernel_mod_load
    if command -v nohup >/dev/null 2>&1; then
        nohup \$PROG --config \$CONFIG >/dev/null 2>&1 &
    else
        \$PROG --config \$CONFIG >/dev/null 2>&1 &
    fi
    echo \$! >"\$PIDFILE"
    sleep 1
    if kill -0 \$(cat "\$PIDFILE") 2>/dev/null; then
        echo "b4 started (PID: \$(cat \$PIDFILE))"
    else
        echo "b4 failed to start, check /var/log/b4/errors.log"
        rm -f "\$PIDFILE"
        return 1
    fi
}

stop() {
    echo "Stopping b4..."
    [ -f "\$PIDFILE" ] && kill \$(cat "\$PIDFILE") 2>/dev/null
    rm -f "\$PIDFILE"
    echo "b4 stopped"
}

case "\$1" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; sleep 1; start ;;
    *)       echo "Usage: \$0 {start|stop|restart}"; exit 1 ;;
esac
EOF

    chmod +x "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}"
    log_ok "Init script created: ${B4_SERVICE_DIR}/${B4_SERVICE_NAME}"
    log_info "  ${B4_SERVICE_DIR}/${B4_SERVICE_NAME} start"
    log_info "  ${B4_SERVICE_DIR}/${B4_SERVICE_NAME} stop"
}

service_sysv_remove() {
    if [ -f "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}" ]; then
        "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}" stop 2>/dev/null || true
        rm -f "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}"
        log_info "Removed init script: ${B4_SERVICE_DIR}/${B4_SERVICE_NAME}"
    fi
}

service_sysv_start() {
    if [ -f "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}" ]; then
        "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}" start 2>/dev/null || { log_warn "Could not start service"; return 1; }
        sleep 2
        if pidof b4 >/dev/null 2>&1 || pgrep -x b4 >/dev/null 2>&1; then
            log_ok "Service started"
            return 0
        fi
        log_err "Service crashed immediately after start"
        for _logf in /var/log/b4/errors.log; do
            if [ -s "$_logf" ]; then
                log_info "Last log entries from $_logf:"
                tail -5 "$_logf" 2>/dev/null | while IFS= read -r _line; do
                    log_info "  $_line"
                done
                break
            fi
        done
        return 1
    fi
    log_warn "Could not start service"
    return 1
}

service_sysv_stop() {
    if [ -f "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}" ]; then
        "${B4_SERVICE_DIR}/${B4_SERVICE_NAME}" stop 2>/dev/null || true
    fi
}

register_service "sysv"
