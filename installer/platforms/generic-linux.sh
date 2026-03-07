#!/bin/sh
# Platform: Generic Linux (Ubuntu, Debian, Fedora, Arch, Alpine, etc.)
# Covers any systemd-based or sysv-init desktop/server Linux

platform_generic_linux_name() {
    echo "Generic Linux (Ubuntu/Debian/Fedora/Arch/Alpine)"
}

platform_generic_linux_match() {
    # Match any Linux with systemd or standard init.d
    # This is the lowest-priority fallback — other platforms should match first
    [ "$(uname -s)" = "Linux" ] || return 1

    # Don't match if this looks like a router firmware
    [ -f /etc/openwrt_release ] && return 1
    [ -f /etc/merlinwrt_release ] && return 1
    [ -d /jffs ] && [ -d /opt/etc/init.d ] && return 1  # Merlin with Entware
    [ -d /etc/storage ] && [ -d /etc_ro ] && return 1   # Padavan
    [ -d /var/run/ndm ] && return 1                      # Keenetic NDMS
    command_exists ndmc && return 1                       # Keenetic NDMS
    command_exists nvram && nvram get firmver 2>/dev/null | grep -qi "merlin" && return 1
    [ -f /proc/device-tree/model ] && grep -qi "keenetic" /proc/device-tree/model 2>/dev/null && return 1

    # Match systemd or standard init
    command_exists systemctl && return 0
    [ -d /etc/init.d ] && return 0

    return 0
}

platform_generic_linux_info() {
    B4_BIN_DIR="/usr/local/bin"
    B4_DATA_DIR="/etc/b4"
    B4_CONFIG_FILE="${B4_DATA_DIR}/b4.json"

    if command_exists systemctl && systemctl list-units >/dev/null 2>&1; then
        B4_SERVICE_TYPE="systemd"
        B4_SERVICE_DIR="/etc/systemd/system"
        B4_SERVICE_NAME="b4.service"
    elif [ -d /etc/init.d ]; then
        B4_SERVICE_TYPE="sysv"
        B4_SERVICE_DIR="/etc/init.d"
        B4_SERVICE_NAME="b4"
    else
        B4_SERVICE_TYPE="none"
    fi

    detect_pkg_manager
}

platform_generic_linux_check_deps() {
    missing=""

    # Check basic tools
    if ! command_exists curl && ! command_exists wget; then
        missing="${missing} wget"
    fi
    command_exists tar || missing="${missing} tar"

    if [ -n "$missing" ]; then
        log_warn "Missing required:${missing}"
        if confirm "Install missing packages?"; then
            pkg_install $missing || log_warn "Some packages failed to install"
        else
            log_err "Cannot continue without:${missing}"
            exit 1
        fi
    fi

    ensure_https_support || exit 1

    # Check kernel modules
    _generic_linux_check_kmods

    # Recommended packages
    _generic_linux_check_recommended
}

_generic_linux_check_kmods() {
    for mod in xt_NFQUEUE xt_connbytes xt_multiport nf_conntrack; do
        _kmod_available "$mod" && continue
        modprobe "$mod" 2>/dev/null || true
    done

    if ! _kmod_available "xt_NFQUEUE" && ! _kmod_available "nfnetlink_queue"; then
        log_warn "xt_NFQUEUE kernel module not available"
        case "$B4_PKG_MANAGER" in
        apt) log_info "Try: apt install xtables-addons-common" ;;
        dnf | yum) log_info "Try: dnf install xtables-addons" ;;
        pacman) log_info "Try: pacman -S xtables-addons" ;;
        esac
    fi
}

_generic_linux_check_recommended() {
    rec_missing=""
    command_exists jq || rec_missing="${rec_missing} jq"
    command_exists iptables || command_exists nft || rec_missing="${rec_missing} iptables"

    if [ -n "$rec_missing" ]; then
        log_warn "Recommended but missing:${rec_missing}"
        if confirm "Install recommended packages?"; then
            pkg_install $rec_missing || true
        fi
    fi
}

platform_generic_linux_find_storage() {
    # Standard Linux — no special storage detection needed
    return 0
}

register_platform "generic_linux"
