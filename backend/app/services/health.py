def get_health_status() -> dict[str, str]:
    """Keep the route thin; richer health checks can be added when needed."""
    return {"status": "ok"}
