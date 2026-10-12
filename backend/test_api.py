"""Offline tests for API input boundaries and model response mapping."""
import base64
import io
import math
import asyncio
import json
import unittest

import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from pydantic import ValidationError

from backend.app.imaging import window_features
from backend.app.main import MAX_BODY_BYTES, PredictionRequest, app, build_predictions, imaging_scoring_status, validate_feature_values


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
        for features in ({"Unknown": 1}, {"Age": "52"}, {"Sex": 1}, {"Sex": "Other"}):
            with self.subTest(features=features):
                with self.assertRaises(ValueError):
                    validate_feature_values(features, self.schema)

    def test_treats_whitespace_category_values_as_blank(self):
        validate_feature_values({"Sex": "   "}, self.schema)

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
        status, _, body = self.request("/predict", "POST", {"features": {"Sex": "Other"}})
        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "INVALID_FEATURES")
        status, _, body = self.request("/predict", "POST", {"features": {"extra": 1}})
        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "INVALID_FEATURES")

    def test_prediction_rejects_empty_or_all_blank_clinical_inputs(self):
        for features in ({}, {"Age": None, "Sex": ""}, {"Age": None, "Sex": "   "}):
            with self.subTest(features=features):
                status, _, body = self.request("/predict", "POST", {"features": features})
                self.assertEqual(status, 422)
                self.assertEqual(body["error"]["code"], "NO_INPUTS")

    def test_oversized_request_is_rejected_before_json_parsing(self):
        status, _, body = self.request("/predict", "POST", None, ((b"content-length", str(MAX_BODY_BYTES + 1).encode()),))
        self.assertEqual(status, 413)
        self.assertEqual(body["error"]["code"], "REQUEST_TOO_LARGE")

    def test_oversized_stream_without_content_length_is_rejected(self):
        payload = {"features": {}, "padding": "x" * (MAX_BODY_BYTES + 1024)}
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


class ImageRequestTests(unittest.TestCase):
    @staticmethod
    def _png(size=24):
        buffer = io.BytesIO()
        Image.fromarray((np.random.RandomState(0).rand(size, size) * 255).astype(np.uint8)).save(buffer, format="PNG")
        return buffer.getvalue()

    def test_valid_png_is_accepted(self):
        request = PredictionRequest(features={}, image=base64.b64encode(self._png()).decode())
        self.assertTrue(request.image)

    def test_data_url_prefix_is_stripped(self):
        payload = "data:image/png;base64," + base64.b64encode(self._png()).decode()
        self.assertNotIn(",", PredictionRequest(features={}, image=payload).image)

    def test_invalid_base64_is_rejected(self):
        with self.assertRaises(ValidationError):
            PredictionRequest(features={}, image="not base64!!")

    def test_non_image_payload_is_rejected(self):
        payload = base64.b64encode(b"plain text, not an image").decode()
        with self.assertRaises(ValidationError):
            PredictionRequest(features={}, image=payload)


def tiny_imaging_bundle():
    rng = np.random.RandomState(11)
    features = window_features(rng.rand(192, 192).astype(np.float32))
    labels = np.array([0, 1, 0, 1, 0, 1, 0, 1, 1])[: len(features)]
    scaler = StandardScaler(with_mean=False).fit(features)
    classifier = LogisticRegression(max_iter=5000, random_state=11).fit(scaler.transform(features), labels)
    return {"scaler": scaler, "classifier": classifier, "config": {"patch": 96, "stride": 48, "max_side": 1024}, "classes": ["non-lesion", "lesion"]}


def tiny_png(size=128):
    buffer = io.BytesIO()
    Image.fromarray((np.random.RandomState(5).rand(size, size) * 255).astype(np.uint8)).save(buffer, format="PNG")
    return buffer.getvalue()


class ImagingIntegrationTests(unittest.TestCase):
    def setUp(self):
        pipeline = FixedPipeline(probability=0.6, prediction=1)
        app.state.model_bundle = {"features": ["Age", "Sex"], "models": {"CAD": pipeline, "LAD": pipeline, "LCX": pipeline, "RCA": pipeline}, "classes": {"CAD": ["No", "Yes"], "LAD": ["No", "Yes"], "LCX": ["No", "Yes"], "RCA": ["No", "Yes"]}}
        app.state.model_metadata = {"trained": True, "feature_schema": {"Age": {"type": "number"}, "Sex": {"type": "category", "options": ["Female", "Male"]}}}
        app.state.model_load_error = None
        app.state.imaging_bundle = tiny_imaging_bundle()
        app.state.imaging_metadata = {"trained": True, "frame_level": {"n": 9, "roc_auc": 0.9, "balanced_accuracy": 0.85}, "patient_level_vessels_affected": {"n": 4, "max": {"roc_auc": 0.9}, "confusion_0.5": [[2, 1], [1, 5]]}}
        app.state.imaging_scoring_enabled = True
        app.state.imaging_unavailable_reason = None

    def request(self, path, method="GET", body=None, extra_headers=()):
        return asyncio.run(asgi_request(path, method, body, extra_headers))

    def test_image_score_is_patient_unlinked_and_never_changes_cad(self):
        body = {"features": {"Age": 60}, "image": base64.b64encode(tiny_png()).decode()}
        status, _, response = self.request("/predict", "POST", body)
        self.assertEqual(status, 200)
        self.assertFalse(response["fusion"]["applied"])
        self.assertEqual(response["fusion"]["imaging_weight"], 0.0)
        self.assertIn("verified patient identifier", response["fusion"]["reason"])
        self.assertIsNotNone(response["imaging"]["lesion_probability"])
        self.assertAlmostEqual(response["predictions"]["CAD"]["probability"], 0.6)

    def test_predict_without_image_does_not_fuse(self):
        status, _, response = self.request("/predict", "POST", {"features": {"Age": 60}})
        self.assertEqual(status, 200)
        self.assertFalse(response["fusion"]["applied"])
        self.assertFalse(response["imaging"]["applied"])

    def test_image_with_unloaded_branch_is_unavailable(self):
        app.state.imaging_bundle = None
        body = {"features": {"Age": 60}, "image": base64.b64encode(tiny_png()).decode()}
        status, _, response = self.request("/predict", "POST", body)
        self.assertEqual(status, 503)
        self.assertEqual(response["error"]["code"], "IMAGING_UNAVAILABLE")

    def test_metadata_reports_imaging(self):
        status, _, response = self.request("/metadata")
        self.assertEqual(status, 200)
        self.assertTrue(response["imaging"]["trained"])

    def test_near_chance_model_is_marked_not_scored(self):
        metadata = {
            "trained": True,
            "frame_level": {"roc_auc": 0.5266, "balanced_accuracy": 0.4985},
            "patient_level_vessels_affected": {
                "max": {"roc_auc": 0.55},
                "confusion_0.5": [[0, 10], [0, 32]],
            },
        }
        enabled, reason = imaging_scoring_status(metadata)
        self.assertFalse(enabled)
        self.assertIn("no-skill", reason)

    def test_image_score_is_rejected_when_quality_gate_is_closed(self):
        app.state.imaging_bundle = None
        app.state.imaging_scoring_enabled = False
        app.state.imaging_unavailable_reason = "Patient-grouped evaluation is at or below the no-skill baseline."
        body = {"features": {"Age": 60}, "image": base64.b64encode(tiny_png()).decode()}
        status, _, response = self.request("/predict", "POST", body)
        self.assertEqual(status, 503)
        self.assertEqual(response["error"]["code"], "IMAGING_QUALITY_INSUFFICIENT")

    def test_incomplete_model_quality_metrics_disable_scoring(self):
        enabled, reason = imaging_scoring_status({"trained": True, "frame_level": {}, "patient_level_vessels_affected": {}})
        self.assertFalse(enabled)
        self.assertIn("incomplete", reason)

if __name__ == "__main__":
    unittest.main()
