"""Offline tests for API input boundaries and model response mapping."""
import math
import asyncio
import json
import unittest

from pydantic import ValidationError

from backend.app.main import PredictionRequest, app, build_predictions, validate_feature_values


class FixedPipeline:
    classes_ = [0, 1]

    def __init__(self, probability=0.75, prediction=1):
        self.probability = probability
        self.prediction = prediction
        self.received = None

    def predict_proba(self, row):
        self.received = row.copy()
        return [[1 - self.probability, self.probability]]

    def predict(self, _row):
        return [self.prediction]


class PredictionValidationTests(unittest.TestCase):
    def setUp(self):
        self.schema = {
            "Age": {"type": "number"},
            "Sex": {"type": "category", "options": ["Female", "Male"]},
        }

    def test_accepts_blank_and_scalar_values(self):
        request = PredictionRequest(features={"Age": 52, "Sex": "Female"})
        validate_feature_values(request.features, self.schema)
        validate_feature_values({"Age": None, "Sex": ""}, self.schema)

    def test_rejects_nested_values_and_boolean_numbers(self):
        for features in ({"Age": {"value": 52}}, {"Age": True}):
            with self.subTest(features=features):
                with self.assertRaises(ValidationError):
                    PredictionRequest(features=features)

    def test_rejects_unknown_or_wrongly_typed_features(self):
        for features in ({"Unknown": 1}, {"Age": "52"}, {"Sex": 1}):
            with self.subTest(features=features):
                with self.assertRaises(ValueError):
                    validate_feature_values(features, self.schema)

    def test_rejects_non_finite_numbers(self):
        for value in (math.inf, -math.inf, math.nan):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    validate_feature_values({"Age": value}, self.schema)

    def test_rejects_extra_top_level_properties(self):
        with self.assertRaises(ValidationError):
            PredictionRequest.model_validate({"features": {}, "debug": True})

    def test_rejects_oversized_feature_payloads(self):
        with self.assertRaises(ValidationError):
            PredictionRequest(features={f"f{i}": 0 for i in range(129)})


class PredictionMappingTests(unittest.TestCase):
    def test_uses_training_feature_order_and_original_class_labels(self):
        pipeline = FixedPipeline(probability=0.8, prediction=1)
        bundle = {
            "features": ["Age", "Sex"],
            "models": {"CAD": pipeline},
            "classes": {"CAD": ["No", "Yes"]},
        }
        result = build_predictions({"Age": 52}, bundle)
        self.assertEqual(list(pipeline.received.columns), ["Age", "Sex"])
        self.assertIsNone(pipeline.received.loc[0, "Sex"])
        self.assertEqual(result["CAD"]["prediction"], "Yes")
        self.assertEqual(result["CAD"]["positive_class"], "Yes")
        self.assertAlmostEqual(result["CAD"]["probability"], 0.8)

    def test_rejects_invalid_model_probability(self):
        bundle = {
            "features": ["Age"],
            "models": {"CAD": FixedPipeline(probability=1.5)},
            "classes": {"CAD": ["No", "Yes"]},
        }
        with self.assertRaises(ValueError):
            build_predictions({"Age": 52}, bundle)


async def asgi_request(path, method="GET", body=None, extra_headers=(), include_content_length=True):
    payload = b"" if body is None else json.dumps(body, allow_nan=True).encode()
    headers = [(b"host", b"testserver"), *extra_headers]
    if body is not None:
        headers.append((b"content-type", b"application/json"))
        if include_content_length:
            headers.append((b"content-length", str(len(payload)).encode()))
    first_message = True
    sent = []

    async def receive():
        nonlocal first_message
        if first_message:
            first_message = False
            return {"type": "http.request", "body": payload, "more_body": False}
        await asyncio.sleep(3600)
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1", "method": method, "scheme": "http",
        "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "",
        "headers": headers, "client": ("127.0.0.1", 50000), "server": ("testserver", 80),
        "state": {}, "extensions": {},
    }
    await app(scope, receive, send)
    start = next(message for message in sent if message["type"] == "http.response.start")
    response_body = b"".join(message.get("body", b"") for message in sent if message["type"] == "http.response.body")
    return start["status"], dict(start["headers"]), json.loads(response_body)


class ApiIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.pipeline = FixedPipeline(probability=0.75, prediction=1)
        app.state.model_bundle = {
            "features": ["Age", "Sex"], "models": {"CAD": self.pipeline},
            "classes": {"CAD": ["No", "Yes"]},
        }
        app.state.model_metadata = {
            "trained": True,
            "feature_schema": {
                "Age": {"type": "number"},
                "Sex": {"type": "category", "options": ["Female", "Male"]},
            },
        }
        app.state.model_load_error = None

    def request(self, path, method="GET", body=None, extra_headers=()):
        return asyncio.run(asgi_request(path, method, body, extra_headers))

    def test_health_and_metadata(self):
        status, _, health = self.request("/health")
        self.assertEqual(status, 200)
        self.assertEqual(health, {"status": "ok", "model_loaded": True})
        status, _, metadata = self.request("/metadata")
        self.assertEqual(status, 200)
        self.assertTrue(metadata["trained"])

    def test_prediction_success_and_security_headers(self):
        status, headers, body = self.request("/predict", "POST", {"features": {"Age": 52, "Sex": "Female"}})
        self.assertEqual(status, 200)
        self.assertEqual(body["predictions"]["CAD"]["positive_class"], "Yes")
        self.assertIn(b"x-request-id", headers)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertEqual(headers[b"x-content-type-options"], b"nosniff")

    def test_invalid_request_is_sanitized(self):
        status, _, body = self.request("/predict", "POST", {"features": {"Age": "52"}})
        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "INVALID_FEATURES")
        status, _, body = self.request("/predict", "POST", {"features": {"extra": 1}})
        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "INVALID_FEATURES")

    def test_oversized_request_is_rejected_before_json_parsing(self):
        status, _, body = self.request("/predict", "POST", None, ((b"content-length", b"20000"),))
        self.assertEqual(status, 413)
        self.assertEqual(body["error"]["code"], "REQUEST_TOO_LARGE")

    def test_oversized_stream_without_content_length_is_rejected(self):
        payload = {"features": {}, "padding": "x" * 17000}
        status, _, body = asyncio.run(asgi_request(
            "/predict", "POST", payload, include_content_length=False
        ))
        self.assertEqual(status, 413)
        self.assertEqual(body["error"]["code"], "REQUEST_TOO_LARGE")

    def test_negative_or_invalid_content_length_is_rejected(self):
        status, _, body = self.request("/predict", "POST", None, ((b"content-length", b"-1"),))
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "INVALID_CONTENT_LENGTH")
        status, _, body = self.request("/predict", "POST", None, ((b"content-length", b"invalid"),))
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "INVALID_CONTENT_LENGTH")

    def test_missing_model_returns_service_unavailable(self):
        app.state.model_bundle = None
        status, _, body = self.request("/predict", "POST", {"features": {"Age": 52}})
        self.assertEqual(status, 503)
        self.assertEqual(body["error"]["code"], "MODEL_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
