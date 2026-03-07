#!/bin/sh
# Feature: HTTPS for B4 web interface
# Detects existing TLS certificates on the system and configures b4 to use them

feature_https_name() {
    echo "HTTPS web interface"
}

feature_https_description() {
    echo "Enable HTTPS for B4 web UI using detected TLS certificates"
}

feature_https_default_enabled() {
    # Only suggest if certificates exist
    _https_detect_certs >/dev/null 2>&1 && echo "yes" || echo "no"
}

feature_https_run() {
    cert_info=$(_https_detect_certs) || true
    if [ -z "$cert_info" ]; then
        log_info "No TLS certificates found on this system"
        log_info "You can configure HTTPS later in B4 Web UI > Settings > Web Server"
        return 0
    fi

    cert_path=$(echo "$cert_info" | cut -d'|' -f1)
    key_path=$(echo "$cert_info" | cut -d'|' -f2)
    cert_source=$(echo "$cert_info" | cut -d'|' -f3)

    log_info "Found TLS certificate: ${cert_source}"
    log_detail "Certificate" "$cert_path"
    log_detail "Key" "$key_path"

    if ! confirm "Enable HTTPS with this certificate?"; then
        return 0
    fi

    if ! command_exists jq; then
        log_warn "jq not found — please update config manually:"
        log_info "  Set system.web_server.tls_cert = $cert_path"
        log_info "  Set system.web_server.tls_key = $key_path"
        return 0
    fi

    if [ ! -f "$B4_CONFIG_FILE" ]; then
        ensure_dir "$(dirname "$B4_CONFIG_FILE")" "Config directory" || return 1
        jq -n \
            --arg cert "$cert_path" \
            --arg key "$key_path" \
            '{ system: { web_server: { tls_cert: $cert, tls_key: $key } } }' \
            >"$B4_CONFIG_FILE"
    else
        tmp="${B4_CONFIG_FILE}.tmp"
        if jq --arg cert "$cert_path" --arg key "$key_path" \
            '.system.web_server.tls_cert = $cert | .system.web_server.tls_key = $key' \
            "$B4_CONFIG_FILE" >"$tmp" 2>/dev/null; then
            mv "$tmp" "$B4_CONFIG_FILE"
        else
            rm -f "$tmp"
            log_warn "Failed to update config"
            return 1
        fi
    fi

    log_ok "HTTPS enabled"
}

_https_detect_certs() {
    # Common certificate locations on various systems
    if [ -f "/etc/uhttpd.crt" ] && [ -f "/etc/uhttpd.key" ]; then
        echo "/etc/uhttpd.crt|/etc/uhttpd.key|OpenWrt uhttpd"
        return 0
    fi
    if [ -f "/etc/cert.pem" ] && [ -f "/etc/key.pem" ]; then
        echo "/etc/cert.pem|/etc/key.pem|System default"
        return 0
    fi
    if [ -f "/etc/ssl/certs/server.crt" ] && [ -f "/etc/ssl/private/server.key" ]; then
        echo "/etc/ssl/certs/server.crt|/etc/ssl/private/server.key|System SSL"
        return 0
    fi
    return 1
}

feature_https_remove() {
    return 0
}

register_feature "https"
