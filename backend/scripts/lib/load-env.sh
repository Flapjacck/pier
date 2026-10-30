#!/usr/bin/env bash
# load-env.sh: safely parse .env files and export variables.
# Sourced by deploy-local.sh to load K3S_HOST, K3S_SSH_USER, PIER_API_TOKEN, etc.
# Never eval, never echo sensitive values.

# load_env_file <path>
# Reads <path> line by line. Skips blanks and comments.
# Splits on FIRST = only. Trims whitespace. Strips one matching quote pair.
# Only exports if var is not already set.
# Rejects invalid keys (not ^[A-Za-z_][A-Za-z0-9_]*$).
# Returns 1 if any key is invalid; 0 otherwise.
load_env_file() {
  local path="$1"
  local line_num=0
  local status=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    ((line_num++))

    # Skip blank lines.
    if [[ -z "${line//[[:space:]]/}" ]]; then
      continue
    fi

    # Skip comments (first non-space char is #).
    local trimmed="${line#"${line%%[![:space:]]*}"}"
    if [[ "${trimmed:0:1}" == "#" ]]; then
      continue
    fi

    # Strip leading "export " if present.
    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#*export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi

    # Split on FIRST = only.
    local key="${line%%=*}"
    local value="${line#*=}"

    # Trim key and value whitespace using parameter expansion.
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    # Validate key format: ^[A-Za-z_][A-Za-z0-9_]*$
    if ! [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      echo "load_env_file: invalid key on line $line_num of $path" >&2
      status=1
      continue
    fi

    # Strip one matching quote pair if present.
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    else
      # Not quoted: strip inline comment only if " #" (space-hash) appears.
      if [[ "$value" =~ ' #' ]]; then
        value="${value% #*}"
        # Re-trim trailing whitespace after comment removal.
        value="${value%"${value##*[![:space:]]}"}"
      fi
    fi

    # Export only if not already set in the environment.
    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
  done < "$path"

  return $status
}
