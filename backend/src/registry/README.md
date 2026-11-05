# Registry HTTP inspection

Image inspection uses the Docker Registry HTTP API over HTTPS, not a local
Docker daemon. It parses image references, follows `WWW-Authenticate: Bearer`
challenges, selects a Linux AMD64 manifest when available, and reads only the
manifest config blob.

The API returns the resolved digest, numeric exposed ports, declared volume
paths, working directory, and default user. Response bodies are size-capped and
credentials and upstream challenge bodies are never logged or returned.
