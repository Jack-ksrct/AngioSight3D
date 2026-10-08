from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
import base64
import logging
import math
import os
import time
import uuid

import pandas as pd
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr, field_validator
from . import imaging
from .modeling import load_bundle, metadata as load_metadata

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = Path(os.getenv("MODEL_DIR", ROOT / "models"))
ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()]
ENABLE_API_DOCS = os.getenv("ENABLE_API_DOCS", "false").casefold() in {"1", "true", "yes"}
MAX_BODY_BYTES = 6 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
logger = logging.getLogger("angiosight.api")


@asynccontextmanager
async def lifespan(application: FastAPI):
    try:
        bundle = load_bundle(MODEL_DIR)
        artifact_metadata = load_metadata(MODEL_DIR)
        if bundle is not None:
            if not artifact_metadata or not artifact_metadata.get("trained"):
                raise ValueError("Trained model metadata is missing or marked untrained.")
            feature_names = bundle.get("features", [])
            feature_schema = artifact_metadata.get("feature_schema", {})
            if not feature_names or len(feature_names) != len(set(feature_names)):
                raise ValueError("The model feature list is empty or contains duplicate names.")
            if set(feature_names) - set(feature_schema):
                raise ValueError("The model feature list and metadata schema do not match.")
            if set(bundle.get("models", {})) != {"CAD", "LAD", "LCX", "RCA"}:
                raise ValueError("The model bundle must contain all four supported targets.")
        application.state.model_bundle = bundle
        application.state.model_metadata = artifact_metadata or {"trained": False}
        application.state.model_load_error = None
        imaging_bundle = imaging.load_imaging_bundle(MODEL_DIR)
        imaging_metadata = imaging.metadata(MODEL_DIR)
        if imaging_bundle is not None and (not imaging_metadata or not imaging_metadata.get("trained")):
            raise ValueError("Angiography model metadata is missing or marked untrained.")
        application.state.imaging_bundle = imaging_bundle
        application.state.imaging_metadata = imaging_metadata or {"trained": False}
    except Exception:
        logger.exception("Model artifacts could not be loaded")
        application.state.model_bundle = None
        application.state.model_metadata = {"trained": False}
        application.state.model_load_error = "Model artifacts could not be loaded. Check the trusted model files and restart the API."
        application.state.imaging_bundle = None
        application.state.imaging_metadata = {"trained": False}
    yield


app = FastAPI(
    title="AngioSight API",
    version="1.0.0",
    description="Research-only cardiovascular risk estimates. Not for clinical use.",
    docs_url="/docs" if ENABLE_API_DOCS else None,
    redoc_url=None,
    openapi_url="/openapi.json" if ENABLE_API_DOCS else None,
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Request-ID"])


Scalar = StrictStr | StrictInt | StrictFloat | None


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    features: dict[StrictStr, Scalar] = Field(..., max_length=128, description="Clinical inputs matching the trained model's feature schema")
    image: str | None = Field(default=None, max_length=8 * 1024 * 1024, description="Optional base64 (or data URL) PNG/JPEG angiography frame for the imaging branch")

    @field_validator("features")
    @classmethod
    def bound_feature_data(cls, features: dict[str, Any]) -> dict[str, Any]:
        if any(not name or len(name) > 200 for name in features):
            raise ValueError("Feature names must contain 1–200 characters.")
        if any(isinstance(value, str) and len(value) > 256 for value in features.values()):
            raise ValueError("Text feature values cannot exceed 256 characters.")
        return features

    @field_validator("image")
    @classmethod
    def bound_image_payload(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value.startswith("data:"):
            comma = value.find(",")
            if comma == -1:
                raise ValueError("Image payload is not a valid data URL.")
            value = value[comma + 1:]
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("Image payload must be base64-encoded.") from exc
        if not payload:
            raise ValueError("Image payload is empty.")
        if len(payload) > MAX_IMAGE_BYTES:
            raise ValueError("Image payload exceeds the 5 MB decoded limit.")
        if not (payload.startswith(b"\x89PNG") or payload.startswith(b"\xff\xd8")):
            raise ValueError("Only PNG and JPEG images are accepted.")
        return value


def validate_feature_values(features: dict[str, Any], schema: dict[str, Any]) -> None:
    unknown = sorted(set(features) - set(schema))
    if unknown:
        raise ValueError(f"Unknown input features: {', '.join(unknown[:8])}")
    for name, value in features.items():
        if value is None or value == "":
            continue
        spec = schema.get(name, {})
        if spec.get("type") == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                raise ValueError(f"{name} must be a finite number or blank.")
        elif not isinstance(value, str):
            raise ValueError(f"{name} must be text or blank.")


def build_predictions(features: dict[str, Any], bundle: dict[str, Any]) -> dict[str, Any]:
    expected = bundle["features"]
    row = pd.DataFrame(
        [{name: (None if features.get(name) == "" else features.get(name)) for name in expected}],
        columns=expected,
    )
    results: dict[str, Any] = {}
    for target, pipeline in bundle["models"].items():
        classes = list(pipeline.classes_)
        if not classes or (1 not in classes and len(classes) < 2):
            raise ValueError(f"Invalid class mapping for model target {target}.")
        positive_index = classes.index(1) if 1 in classes else len(classes) - 1
        probabilities = pipeline.predict_proba(row)[0]
        probability = float(probabilities[positive_index])
        if not math.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError(f"Invalid probability from model target {target}.")
        encoded_prediction = int(pipeline.predict(row)[0])
        original_classes = bundle.get("classes", {}).get(target, ["0", "1"])
        if encoded_prediction not in (0, 1) or len(original_classes) != 2:
            raise ValueError(f"Invalid class mapping for model target {target}.")
        results[target] = {
            "probability": probability,
            "prediction": str(original_classes[encoded_prediction]),
            "positive_class": str(original_classes[1]),
        }
    if not results:
        raise ValueError("The model bundle contains no prediction models.")
    return results


def decode_image(payload: str) -> bytes:
    """Strip a data URL prefix if present and return the raw image bytes."""
    if payload.startswith("data:"):
        payload = payload.split(",", 1)[1]
    return base64.b64decode(payload, validate=True)


def imaging_skill_weight(frame_auc: float | None) -> float:
    """Weight the imaging branch by how far its frame-level AUC beats chance.

    A branch that cannot discriminate frames (AUC <= 0.5) contributes nothing;
    a strong branch (AUC >= 0.75) is allowed up to half the fused estimate. This
    keeps the fusion honest: a near-chance model cannot move the clinical score.
    """
    if frame_auc is None or not isinstance(frame_auc, (int, float)) or not math.isfinite(float(frame_auc)):
        return 0.0
    return float(max(0.0, min(0.5, 2.0 * (float(frame_auc) - 0.5))))


def fuse_cad_probability(tabular: float, imaging_lesion: float, imaging_weight: float) -> tuple[float, dict[str, Any]]:
    weight = float(max(0.0, min(1.0, imaging_weight)))
    magnitude = max(0.0, min(1.0, tabular))
    imaging_value = max(0.0, min(1.0, imaging_lesion))
    fused = weight * imaging_value + (1.0 - weight) * magnitude
    return float(fused), {
        "method": "weighted average of the tabular CAD probability and the imaging lesion probability",
        "tabular_weight": float(1.0 - weight),
        "imaging_weight": weight,
        "applied": weight > 0.0,
    }


def imaging_summary(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not metadata or not metadata.get("trained"):
        return None
    frame = metadata.get("frame_level", {})
    patient = metadata.get("patient_level_vessels_affected", {})
    return {
        "trained": True,
        "source": metadata.get("source"),
        "evaluation": metadata.get("evaluation"),
        "folds": metadata.get("folds"),
        "frame_level": {"n": frame.get("n"), "roc_auc": frame.get("roc_auc"), "accuracy": frame.get("accuracy"), "balanced_accuracy": frame.get("balanced_accuracy")},
        "patient_level_vessels_affected": {"n": patient.get("n"), "roc_auc": patient.get("max", {}).get("roc_auc"), "accuracy": patient.get("max", {}).get("accuracy_0.5")},
        "fusion": metadata.get("fusion"),
    }


@app.middleware("http")
async def request_safety_headers(request: Request, call_next):
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    content_length = request.headers.get("content-length")
    if request.method == "POST":
        if content_length:
            try:
                cl = int(content_length)
                if cl < 0:
                    response = JSONResponse(status_code=400, content={"error": {"code": "INVALID_CONTENT_LENGTH", "message": "Invalid request size.", "request_id": request_id}})
                    response.headers["X-Request-ID"] = request_id
                    add_security_headers(response, request.url.path)
                    return response
                if cl > MAX_BODY_BYTES:
                    response = JSONResponse(status_code=413, content={"error": {"code": "REQUEST_TOO_LARGE", "message": "Request body exceeds the API size limit.", "request_id": request_id}})
                    response.headers["X-Request-ID"] = request_id
                    add_security_headers(response, request.url.path)
                    return response
            except ValueError:
                response = JSONResponse(status_code=400, content={"error": {"code": "INVALID_CONTENT_LENGTH", "message": "Invalid request size.", "request_id": request_id}})
                response.headers["X-Request-ID"] = request_id
                add_security_headers(response, request.url.path)
                return response
        # Content-Length can be absent for streamed/chunked requests. Bound the
        # bytes as they arrive, then replay the bounded body for FastAPI parsing.
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_BODY_BYTES:
                response = JSONResponse(status_code=413, content={"error": {"code": "REQUEST_TOO_LARGE", "message": "Request body exceeds the API size limit.", "request_id": request_id}})
                response.headers["X-Request-ID"] = request_id
                add_security_headers(response, request.url.path)
                return response
            body.extend(chunk)
        # Starlette's BaseHTTPMiddleware replays a cached _body to downstream
        # request parsing; setting it avoids losing the stream we just bounded.
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["Cache-Control"] = "no-store"
    add_security_headers(response, request.url.path)
    logger.info("request_complete request_id=%s method=%s path=%s status=%s duration_ms=%d", request_id, request.method, request.url.path, response.status_code, round((time.perf_counter() - started) * 1000))
    return response


def add_security_headers(response: Response, path: str) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if path.rstrip("/") not in {"/docs", "/openapi.json"}:
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"


@app.exception_handler(RequestValidationError)
async def invalid_request_handler(request: Request, _exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", "unavailable")
    return JSONResponse(status_code=422, content={"error": {"code": "INVALID_REQUEST", "message": "Request data is invalid. Check the feature names and values.", "request_id": request_id}})


@app.exception_handler(HTTPException)
async def api_error_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", "unavailable")
    detail = exc.detail
    if isinstance(detail, dict):
        code = str(detail.get("code", "REQUEST_FAILED"))
        message = str(detail.get("message", "Request failed."))
    else:
        code, message = "REQUEST_FAILED", str(detail)
    response = JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": message, "request_id": request_id}}, headers=exc.headers)
    response.headers["X-Request-ID"] = request_id
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, _exc: Exception):
    request_id = getattr(request.state, "request_id", "unavailable")
    logger.error("Unhandled API error request_id=%s exception_type=%s", request_id, type(_exc).__name__)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "The request could not be completed. Try again or contact the project maintainer.", "request_id": request_id}})


@app.get("/health")
def health():
    loaded = app.state.model_bundle is not None
    return {"status": "ok" if loaded else "degraded", "model_loaded": loaded}


@app.get("/metadata")
def get_metadata():
    if app.state.model_load_error:
        return {"trained": False, "message": app.state.model_load_error}
    if app.state.model_bundle is None:
        return {"trained": False, "message": "Train the four target models and restart the API."}
    response = dict(app.state.model_metadata or {"trained": False, "message": "Train models before requesting predictions and restart the API."})
    imaging_bundle = getattr(app.state, "imaging_bundle", None)
    imaging_metadata = getattr(app.state, "imaging_metadata", {"trained": False})
    response["imaging"] = imaging_summary(imaging_metadata) if imaging_bundle is not None else {"trained": False, "message": "No angiography model is loaded. Train it with backend/train_angiography.py and restart the API."}
    return response


@app.post("/predict")
def predict(payload: PredictionRequest, request: Request):
    bundle = app.state.model_bundle
    if bundle is None:
        raise HTTPException(status_code=503, detail={"code": "MODEL_UNAVAILABLE", "message": "No trusted model is loaded. Train the model and restart the API."})
    try:
        validate_feature_values(payload.features, app.state.model_metadata.get("feature_schema", {}))
        results = build_predictions(payload.features, bundle)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_FEATURES", "message": str(exc)}) from exc
    except Exception as exc:
        logger.error("Prediction failed request_id=%s exception_type=%s", request.state.request_id, type(exc).__name__)
        raise HTTPException(status_code=500, detail={"code": "PREDICTION_FAILED", "message": "The estimate could not be calculated. Check the model bundle and try again."}) from None
    imaging_bundle = getattr(app.state, "imaging_bundle", None)
    imaging_block = {
        "loaded": imaging_bundle is not None,
        "applied": False,
        "lesion_probability": None,
        "mean_window_probability": None,
        "windows": None,
        "message": "Attach a PNG or JPEG angiography frame to activate the imaging branch." if imaging_bundle is not None else "The angiography model is not loaded. Predictions use the tabular model only.",
    }
    fusion_block = {"applied": False, "method": None, "tabular_weight": None, "imaging_weight": None}
    if payload.image:
        if imaging_bundle is None:
            raise HTTPException(status_code=503, detail={"code": "IMAGING_UNAVAILABLE", "message": "An image was attached but the angiography model is not loaded. Remove the image or train backend/train_angiography.py."})
        try:
            image_bytes = decode_image(payload.image)
            image_result = imaging.predict_lesion(imaging_bundle, image_bytes)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE", "message": str(exc)}) from exc
        except Exception as exc:
            logger.error("Imaging prediction failed request_id=%s exception_type=%s", request.state.request_id, type(exc).__name__)
            raise HTTPException(status_code=500, detail={"code": "IMAGING_FAILED", "message": "The imaging branch could not process this frame. Check the uploaded file and the angiography model bundle."}) from None
        tabular_cad = results["CAD"]["probability"]
        imaging_metrics = getattr(app.state, "imaging_metadata", None) or {}
        frame_auc = (imaging_metrics.get("frame_level") or {}).get("roc_auc")
        weight = imaging_skill_weight(frame_auc)
        fused_cad, fusion = fuse_cad_probability(tabular_cad, image_result["lesion_probability"], weight)
        results["CAD"]["components"] = {"tabular": tabular_cad, "imaging": image_result["lesion_probability"]}
        if fusion["applied"]:
            results["CAD"]["probability"] = fused_cad
            results["CAD"]["prediction"] = str(results["CAD"]["positive_class"]) if fused_cad >= 0.5 else str(bundle.get("classes", {}).get("CAD", ["0", "1"])[0])
        fusion["frame_auc"] = frame_auc
        fusion["basis"] = "imaging weight = 2 x (frame-grouped AUC - 0.5), capped at 0.5"
        imaging_block.update({
            "applied": True,
            "lesion_probability": image_result["lesion_probability"],
            "mean_window_probability": image_result["mean_window_probability"],
            "windows": image_result["windows"],
            "positive_class": image_result.get("positive_class"),
        })
        fusion_block = fusion
    return {
        "predictions": results,
        "imaging": imaging_block,
        "fusion": fusion_block,
        "disclaimer": "Educational and research use only. Not a diagnosis or substitute for formal diagnostic imaging.",
    }
