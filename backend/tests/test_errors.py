from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.core.errors import install_error_handlers


def test_unexpected_error_response_does_not_leak_exception_details() -> None:
    test_app = FastAPI()
    install_error_handlers(test_app)

    @test_app.get("/explode")
    def explode() -> None:
        raise RuntimeError("private implementation detail")

    client = TestClient(test_app, raise_server_exceptions=False)
    response = client.get("/explode")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "internal_server_error",
            "message": "An unexpected error occurred.",
        }
    }
    assert "private implementation detail" not in response.text
