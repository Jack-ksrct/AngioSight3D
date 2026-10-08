"""Offline tests for the angiography imaging branch (feature extraction, bundle
loading, and frame prediction). These pin the pipeline geometry so the trainer
and the inference module cannot drift apart silently."""
import io
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from backend.app.imaging import (
    CONFIG,
    _from_skimage_hog,
    frame_to_grayscale,
    load_imaging_bundle,
    metadata,
    predict_lesion,
    window_features,
)


def png_bytes(array):
    image = Image.fromarray((np.clip(array, 0, 1) * 255).astype(np.uint8))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def synthetic_bundle_with_config(config=None):
    rng = np.random.RandomState(7)
    config = config or dict(CONFIG)
    image = rng.rand(192, 192).astype(np.float32)
    features = window_features(image, config)
    labels = np.array([0, 1, 0, 1, 0, 1, 0, 1, 1])[: len(features)]
    scaler = StandardScaler(with_mean=False).fit(features)
    classifier = LogisticRegression(max_iter=5000, random_state=7)
    classifier.fit(scaler.transform(features), labels)
    return {
        "scaler": scaler,
        "classifier": classifier,
        "config": config,
        "classes": ["non-lesion", "lesion"],
        "feature": "hog-patch-lesion-detector",
    }


class GrayscaleTests(unittest.TestCase):
    def test_decode_returns_normalized_gray(self):
        array = np.arange(64 * 64, dtype=np.float32).reshape(64, 64) / (64 * 64)
        decoded = frame_to_grayscale(png_bytes(array))
        self.assertEqual(decoded.shape, (64, 64))
        self.assertEqual(decoded.dtype, np.float32)
        self.assertGreaterEqual(decoded.min(), 0.0)
        self.assertLessEqual(decoded.max(), 1.0)

    def test_large_images_are_downscaled_to_max_side(self):
        array = np.random.RandomState(1).rand(2048, 1024).astype(np.float32)
        decoded = frame_to_grayscale(png_bytes(array))
        self.assertLessEqual(max(decoded.shape), CONFIG["max_side"])


class FeatureTests(unittest.TestCase):
    def test_window_features_single_patch_and_dims(self):
        image = np.random.RandomState(2).rand(CONFIG["patch"], CONFIG["patch"]).astype(np.float32)
        features = window_features(image)
        self.assertEqual(features.shape, (1, 4356))

    def test_window_features_slides_over_larger_frame(self):
        image = np.random.RandomState(3).rand(192, 192).astype(np.float32)
        features = window_features(image)
        self.assertEqual(features.shape, (9, 4356))

    def test_window_features_upscales_tiny_frames(self):
        image = np.random.RandomState(4).rand(32, 32).astype(np.float32)
        features = window_features(image)
        self.assertEqual(features.shape, (1, 4356))

    def test_hog_is_deterministic(self):
        cell = np.random.RandomState(5).rand(96, 96).astype(np.float32)
        first = _from_skimage_hog(cell, CONFIG)
        second = _from_skimage_hog(cell, CONFIG)
        np.testing.assert_array_equal(first, second)
        self.assertEqual(first.shape, (4356,))


class BundleTests(unittest.TestCase):
    def test_missing_bundle_returns_none(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(load_imaging_bundle(directory))
            self.assertIsNone(metadata(directory))

    def test_invalid_bundle_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            import joblib

            joblib.dump({"scaler": None}, Path(directory) / "angiography.joblib")
            with self.assertRaises(ValueError):
                load_imaging_bundle(directory)


class PredictionTests(unittest.TestCase):
    def test_predict_lesion_returns_bounded_score_and_diagnostics(self):
        image = np.random.RandomState(8).rand(160, 160).astype(np.float32)
        bundle = synthetic_bundle_with_config()
        result = predict_lesion(bundle, png_bytes(image))
        self.assertGreaterEqual(result["lesion_probability"], 0.0)
        self.assertLessEqual(result["lesion_probability"], 1.0)
        self.assertGreaterEqual(result["windows"], 1)
        self.assertEqual(result["positive_class"], "lesion")

    def test_undecodable_bytes_raise_value_error(self):
        bundle = synthetic_bundle_with_config()
        with self.assertRaises(ValueError):
            predict_lesion(bundle, b"this is not an image")


if __name__ == "__main__":
    unittest.main()