#!/bin/sh
# Main entry point — argument parsing and dispatch

main() {
    if [ ! -t 0 ] && [ -e /dev/tty ]; then
        exec </dev/tty
    fi

    ACTION="install"
    VERSION=""
    FORCE_ARCH=""

    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
        --remove | --uninstall | -r)
            ACTION="remove"
            ;;
        --update | -u)
            ACTION="update"
            ;;
        --sysinfo | --info | -i)
            ACTION="sysinfo"
            ;;
        --quiet | -q)
            QUIET_MODE=1
            ;;
        --arch=*)
            FORCE_ARCH="${arg#*=}"
            ;;
        --platform=*)
            B4_PLATFORM="${arg#*=}"
            ;;
        --bin-dir=*)
            B4_BIN_DIR="${arg#*=}"
            ;;
        --data-dir=*)
            B4_DATA_DIR="${arg#*=}"
            ;;
        --help | -h)
            _show_help
            exit 0
            ;;
        v* | V*)
            VERSION="$arg"
            ;;
        esac
    done

    # Dispatch
    case "$ACTION" in
    install) action_install "$VERSION" "$FORCE_ARCH" ;;
    remove) action_remove ;;
    update) action_update "$VERSION" "$FORCE_ARCH" ;;
    sysinfo) action_sysinfo ;;
    esac
}

_show_help() {
    echo "B4 Universal Installer"
    echo ""
    echo "Usage: $0 [OPTIONS] [VERSION]"
    echo ""
    echo "Actions:"
    echo "  (default)           Install b4 (interactive wizard)"
    echo "  --update, -u        Update b4 to latest version"
    echo "  --remove, -r        Uninstall b4"
    echo "  --sysinfo, -i       Show system diagnostics"
    echo ""
    echo "Options:"
    echo "  --arch=ARCH         Force architecture (skip detection)"
    echo "  --platform=ID       Force platform (skip detection)"
    echo "  --bin-dir=DIR       Override binary directory"
    echo "  --data-dir=DIR      Override data/config directory"
    echo "  --quiet, -q         Non-interactive mode with defaults"
    echo "  --help, -h          Show this help"
    echo ""
    echo "Environment overrides:"
    echo "  B4_PLATFORM         Platform ID (generic_linux, openwrt, merlinwrt, ...)"
    echo "  B4_BIN_DIR          Binary install directory"
    echo "  B4_DATA_DIR         Data/config directory"
    echo "  B4_PKG_MANAGER      Package manager (apt, dnf, pacman, opkg, ...)"
    echo ""
    echo "Architectures:"
    echo "  amd64, 386, arm64, armv5, armv6, armv7,"
    echo "  mips, mipsle, mips_softfloat, mipsle_softfloat,"
    echo "  mips64, mips64le, loong64, ppc64, ppc64le, riscv64, s390x"
    echo ""
    echo "Examples:"
    echo "  $0                            Interactive install"
    echo "  $0 v1.4.0                     Install specific version"
    echo "  $0 --arch=mipsle_softfloat    Force architecture"
    echo "  $0 --platform=openwrt         Force platform"
    echo "  $0 --quiet                    Non-interactive with defaults"
    echo "  $0 --update                   Update to latest"
    echo "  $0 --remove                   Uninstall"
    echo "  $0 --sysinfo                  Show diagnostics"
}

main "$@"
