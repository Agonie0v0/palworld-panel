import unittest
import uuid

from structurer import _parse_worker_container, _worker_sanity


class WorkerParsingTests(unittest.TestCase):
    def test_structured_worker_director_container_id(self):
        container_id = uuid.UUID("6f354c6b-b5cf-4ef8-a3b9-dad6ed19fc89")
        raw = {
            "array_type": "ByteProperty",
            "type": "ArrayProperty",
            "custom_type": ".worldSaveData.BaseCampSaveData.WorkerDirector.RawData",
            "value": {"container_id": container_id},
        }

        self.assertEqual(_parse_worker_container(raw), str(container_id))

    def test_missing_worker_sanity_defaults_to_full(self):
        self.assertEqual(_worker_sanity({}), 100.0)
        self.assertEqual(_worker_sanity({"SanityValue": {"value": 42.5}}), 42.5)


if __name__ == "__main__":
    unittest.main()
