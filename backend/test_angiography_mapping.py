"""Data-integrity tests for CADICA patient-to-metadata label mapping."""
import io
import unittest
import zipfile

from openpyxl import Workbook

from backend.train_angiography import vessel_labels


def metadata_archive(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "METADATA"
    sheet.append(["Patient ID", "Number of vessels affected", "Age"])
    for row in rows:
        sheet.append(row)
    data = io.BytesIO()
    workbook.save(data)
    archive_data = io.BytesIO()
    with zipfile.ZipFile(archive_data, "w") as archive:
        archive.writestr("CADICA/metadata.xlsx", data.getvalue())
    archive_data.seek(0)
    return zipfile.ZipFile(archive_data)


class CadicaPatientMappingTests(unittest.TestCase):
    def test_maps_exact_patient_ids_without_filling_or_reordering(self):
        archive = metadata_archive([[12, 0, 57], [3, 2, 63]])
        with archive:
            result = vessel_labels(archive, [3, 12])
        self.assertEqual(result, {3: True, 12: False})

    def test_rejects_missing_metadata_patient(self):
        archive = metadata_archive([[3, 1, 63]])
        with archive, self.assertRaisesRegex(ValueError, "does not match"):
            vessel_labels(archive, [3, 12])

    def test_rejects_duplicate_patient_rows(self):
        archive = metadata_archive([[3, 1, 63], [3, 0, 61]])
        with archive, self.assertRaisesRegex(ValueError, "Duplicate"):
            vessel_labels(archive, [3])

    def test_rejects_blank_or_invalid_label(self):
        for value in (None, "unknown", -1):
            archive = metadata_archive([[3, value, 63]])
            with archive, self.subTest(value=value), self.assertRaises(ValueError):
                vessel_labels(archive, [3])

    def test_rejects_missing_required_metadata_columns(self):
        workbook = Workbook()
        workbook.active.title = "METADATA"
        workbook.active.append(["Patient ID", "Age"])
        data = io.BytesIO()
        workbook.save(data)
        archive_data = io.BytesIO()
        with zipfile.ZipFile(archive_data, "w") as archive:
            archive.writestr("CADICA/metadata.xlsx", data.getvalue())
        archive_data.seek(0)
        with zipfile.ZipFile(archive_data) as archive, self.assertRaisesRegex(ValueError, "missing required columns"):
            vessel_labels(archive, [3])


if __name__ == "__main__":
    unittest.main()
