#!/bin/sh
# Platform: OpenWrt
#
# Key characteristics:
#   - Embedded Linux distribution for routers and embedded devices
#   - /etc/openwrt_release identifies the system
#   - Uses procd as init system (OpenWrt 15.05+) or sysv for older versions
#   - opkg is the package manager
#   - Root filesystem is often SquashFS overlay with limited space
#   - /tmp is tmpfs (volatile)
#   - External storage may be mounted at /mnt/* or /opt (extroot/USB)
#   - Kernel modules may need to be installed via opkg

platform_openwrt_name() {
    echo "OpenWrt"
}

platform_openwrt_match() {
    # Primary: /etc/openwrt_release exists
    [ -f /etc/openwrt_release ] && return 0

    # Secondary: /etc/os-release contains openwrt
    if [ -f /etc/os-release ]; then
        grep -qi "openwrt" /etc/os-release 2>/dev/null && return 0
    fi

    # Tertiary: board.json exists (OpenWrt-specific)
    [ -f /etc/board.json ] && return 0

    return 1
}

platform_openwrt_info() {
    # Default paths — overlay root has limited space
    B4_BIN_DIR="/usr/bin"
    B4_DATA_DIR="/etc/b4"
    B4_CONFIG_FILE="${B4_DATA_DIR}/b4.json"
    B4_PKG_MANAGER="opkg"

    # Init system: procd on modern OpenWrt, sysv fallback
    if [ -f /sbin/procd ] || command_exists procd; then
        B4_SERVICE_TYPE="procd"
        B4_SERVICE_DIR="/etc/init.d"
        B4_SERVICE_NAME="b4"
    elif [ -d /etc/init.d ]; then
        B4_SERVICE_TYPE="sysv"
        B4_SERVICE_DIR="/etc/init.d"
        B4_SERVICE_NAME="b4"
    else
        B4_SERVICE_TYPE="none"
    fi

    # Prefer external storage if available (/opt from extroot or USB)
    if [ -d "/opt" ] && [ -w "/opt" ]; then
        # Check if /opt has meaningful space (not just an empty dir on overlay)
        _opt_avail=$(df /opt 2>/dev/null | tail -1 | awk '{print $4}')
        if [ -n "$_opt_avail" ] && [ "$_opt_avail" -gt 10000 ] 2>/dev/null; then
            B4_BIN_DIR="/opt/bin"
            B4_DATA_DIR="/opt/etc/b4"
            B4_CONFIG_FILE="${B4_DATA_DIR}/b4.json"
        fi
    fi

    # Check for USB/external mounts with space
    if [ "$B4_BIN_DIR" = "/usr/bin" ]; then
        for mnt in /mnt/sda1 /mnt/sda2 /mnt/mmcblk* /mnt/usb*; do
            if [ -d "$mnt" ] && [ -w "$mnt" ]; then
                _mnt_avail=$(df "$mnt" 2>/dev/null | tail -1 | awk '{print $4}')
                if [ -n "$_mnt_avail" ] && [ "$_mnt_avail" -gt 10000 ] 2>/dev/null; then
                    log_info "External storage found: $mnt"
                    B4_BIN_DIR="${mnt}/b4"
                    B4_DATA_DIR="${mnt}/b4"
                    B4_CONFIG_FILE="${B4_DATA_DIR}/b4.json"
                    break
                fi
            fi
        done
    fi
}

platform_openwrt_check_deps() {
    # Check basic download tools
    if ! command_exists curl && ! command_exists wget; then
        log_warn "Neither curl nor wget found"
        log_info "Installing wget-ssl..."
        pkg_install wget-ssl ca-certificates || true
    fi

    command_exists tar || {
        log_warn "tar not found"
        pkg_install tar || true
    }

    ensure_https_support || exit 1

    # Kernel modules
    _openwrt_load_kmods

    # Recommended packages
    _openwrt_check_recommended
}

_openwrt_load_kmods() {
    for mod in xt_NFQUEUE nfnetlink_queue xt_connbytes xt_multiport nf_conntrack; do
        _kmod_available "$mod" && continue
        modprobe "$mod" 2>/dev/null && continue
        kver=$(uname -r)
        mod_path=$(find /lib/modules/"$kver" -name "${mod}.ko*" 2>/dev/null | head -1)
        [ -n "$mod_path" ] && insmod "$mod_path" 2>/dev/null || true
    done

    if ! _kmod_available "xt_NFQUEUE" && ! _kmod_available "nfnetlink_queue"; then
        log_warn "xt_NFQUEUE not available — b4 may not work"
        log_info "Try: opkg install kmod-nfnetlink-queue kmod-ipt-nfqueue"
    fi
}

_openwrt_check_recommended() {
    rec_missing=""
    command_exists jq || rec_missing="${rec_missing} jq"
    command_exists iptables || rec_missing="${rec_missing} iptables"

    # SSL support
    if ! command_exists curl || ! curl -sI --max-time 3 "https://github.com" >/dev/null 2>&1; then
        if ! opkg list-installed 2>/dev/null | grep -q "^ca-certificates "; then
            rec_missing="${rec_missing} ca-certificates"
        fi
        if ! opkg list-installed 2>/dev/null | grep -q "^wget-ssl "; then
            rec_missing="${rec_missing} wget-ssl"
        fi
    fi

    if [ -n "$rec_missing" ]; then
        log_warn "Recommended but missing:${rec_missing}"
        if confirm "Install recommended packages?"; then
            opkg update >/dev/null 2>&1 || true
            for pkg in $rec_missing; do
                log_info "Installing ${pkg}..."
                opkg install "$pkg" >/dev/null 2>&1 && log_ok "Installed ${pkg}" || log_warn "Failed: ${pkg}"
            done
        fi
    fi
}

platform_openwrt_find_storage() {
    # OpenWrt storage priority:
    # 1. /opt (extroot or USB) — has space
    # 2. External mounts at /mnt/*
    # 3. Root overlay — very limited space

    if [ -d "/opt" ] && [ -w "/opt" ]; then
        _opt_avail=$(df /opt 2>/dev/null | tail -1 | awk '{print $4}')
        if [ -n "$_opt_avail" ] && [ "$_opt_avail" -gt 10000 ] 2>/dev/null; then
            return 0
        fi
    fi

    for mnt in /mnt/sda1 /mnt/sda2 /mnt/mmcblk* /mnt/usb*; do
        if [ -d "$mnt" ] && [ -w "$mnt" ]; then
            return 0
        fi
    done

    # Check root overlay space
    _root_avail=$(df / 2>/dev/null | tail -1 | awk '{print $4}')
    if [ -n "$_root_avail" ] && [ "$_root_avail" -lt 2000 ] 2>/dev/null; then
        log_warn "Root filesystem has very little space ($(df -h / 2>/dev/null | tail -1 | awk '{print $4}') available)"
        log_info "Consider using extroot or USB storage"
        log_info "See: https://openwrt.org/docs/guide-user/additional-software/extroot_configuration"
    fi

    return 0
}

register_platform "openwrt"
