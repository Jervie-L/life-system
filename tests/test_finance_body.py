import tempfile
import unittest
from pathlib import Path

import backend.server as server


class LifeSystemTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        server.DATA_DIR = root
        server.DB_PATH = root / "life.db"
        server.init_db()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()


class FinancePrecisionTests(LifeSystemTestCase):
    def test_decimal_transactions_and_balance_edit_keep_cents(self) -> None:
        account = server.finance_accounts()[0]
        account_id = account["id"]

        server.insert_finance({
            "entry_date": "2026-06-01",
            "type": "收入",
            "amount": "100.256",
            "account_id": account_id,
        })
        server.insert_finance({
            "entry_date": "2026-06-02",
            "type": "支出",
            "amount": "20.101",
            "account_id": account_id,
        })
        self.assertEqual(server.finance_accounts()[0]["balance"], 80.16)

        updated = server.update_finance_account(account_id, {
            "name": "主要银行账户",
            "account_type": "银行账户",
            "balance": "8888.888",
        })
        self.assertEqual(updated["balance"], 8888.89)

        server.insert_finance({
            "entry_date": "2026-06-03",
            "type": "支出",
            "amount": "0.088",
            "account_id": account_id,
        })
        self.assertEqual(server.finance_accounts()[0]["balance"], 8888.80)
        self.assertEqual(len(server.rows("SELECT * FROM finance_entries")), 3)


class BodyTrendTests(LifeSystemTestCase):
    def test_weight_records_can_be_sorted_as_a_trend_series(self) -> None:
        server.insert_body({"entry_date": "2026-06-03", "weight": "65.45"})
        server.insert_body({"entry_date": "2026-06-01", "weight": "66.20"})
        server.insert_body({"entry_date": "2026-06-02", "weight": ""})

        points = server.rows(
            "SELECT entry_date, weight FROM body_logs WHERE weight IS NOT NULL ORDER BY entry_date, id"
        )
        self.assertEqual(
            points,
            [
                {"entry_date": "2026-06-01", "weight": 66.2},
                {"entry_date": "2026-06-03", "weight": 65.45},
            ],
        )


if __name__ == "__main__":
    unittest.main()
