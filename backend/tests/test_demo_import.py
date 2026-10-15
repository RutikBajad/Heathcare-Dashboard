import unittest
from datetime import datetime, time

from import_demo_data import iso_date, iso_time, validate_target, whole_number


class DemoImportTests(unittest.TestCase):
    def test_import_rejects_local_database(self):
        with self.assertRaisesRegex(ValueError, 'localhost'):
            validate_target('mongodb://127.0.0.1:27017', 'healthpilot')

    def test_import_rejects_wrong_database(self):
        with self.assertRaisesRegex(ValueError, 'healthpilot'):
            validate_target('mongodb+srv://user:pass@cluster.example.net', 'other')

    def test_excel_dates_and_times_are_normalized_for_api_records(self):
        self.assertEqual(iso_date(datetime(2026, 10, 8), 'date'), '2026-10-08')
        self.assertEqual(iso_time(time(9, 30), 'time'), '09:30')
        self.assertEqual(iso_date('2026-10-08', 'date'), '2026-10-08')

    def test_whole_number_accepts_excel_numeric_values(self):
        self.assertEqual(whole_number(42, 'age'), 42)
        self.assertEqual(whole_number('42', 'age'), 42)
        with self.assertRaisesRegex(ValueError, 'whole number'):
            whole_number(42.5, 'age')


if __name__ == '__main__':
    unittest.main()
