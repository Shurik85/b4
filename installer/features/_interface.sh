#!/bin/sh
# Feature registration and dispatch system
#
# Each feature file must define these functions (prefixed with feature_<id>_):
#   name             — Human-readable name
#   description      — Short description
#   default_enabled  — "yes" or "no"
#   run              — Execute the feature (install/configure)
#   remove           — Undo/clean up the feature
#
# Then register with: register_feature "<id>"

REGISTERED_FEATURES=""
ENABLED_FEATURES=""

register_feature() {
    id="$1"
    REGISTERED_FEATURES="${REGISTERED_FEATURES} ${id}"
}

# Dispatch to a specific feature
feature_dispatch() {
    fid="$1"
    func="$2"
    shift 2
    fn="feature_${fid}_${func}"
    if type "$fn" >/dev/null 2>&1; then
        "$fn" "$@"
    else
        log_warn "Feature '${fid}' does not implement '${func}'"
        return 1
    fi
}

# Run all enabled features
features_run() {
    for f in $ENABLED_FEATURES; do
        fname=$(feature_dispatch "$f" name)
        log_header "Feature: ${fname}"
        feature_dispatch "$f" run || log_warn "Feature '${fname}' had issues"
    done
}

# Remove all registered features
features_remove() {
    for f in $REGISTERED_FEATURES; do
        feature_dispatch "$f" remove || true
    done
}
