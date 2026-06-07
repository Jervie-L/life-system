import tempfile
import unittest
from datetime import date, timedelta
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

    def test_finance_categories_and_decimal_amounts_are_preserved(self) -> None:
        account_id = server.finance_accounts()[0]["id"]

        expense = server.insert_finance({
            "entry_date": "2026-06-02",
            "type": "支出",
            "amount": "35.68",
            "account_id": account_id,
            "category": "食品餐饮",
        })
        income = server.insert_finance({
            "entry_date": "2026-06-02",
            "type": "收入",
            "amount": "888.88",
            "account_id": account_id,
            "category": "工资",
        })

        self.assertEqual(expense["amount"], 35.68)
        self.assertEqual(expense["category"], "食品餐饮")
        self.assertEqual(income["amount"], 888.88)
        self.assertEqual(income["category"], "工资")

    def test_finance_entry_can_be_edited_without_losing_precision(self) -> None:
        account_id = server.finance_accounts()[0]["id"]
        entry = server.insert_finance({
            "entry_date": "2026-06-02",
            "type": "支出",
            "amount": "35.68",
            "account_id": account_id,
            "category": "食品餐饮",
        })

        updated = server.update_finance(entry["id"], {
            "entry_date": "2026-06-03",
            "type": "收入",
            "amount": "88.88",
            "account_id": account_id,
            "category": "工资",
            "note": "补发",
        })

        self.assertEqual(updated["entry_date"], "2026-06-03")
        self.assertEqual(updated["type"], "收入")
        self.assertEqual(updated["amount"], 88.88)
        self.assertEqual(updated["category"], "工资")
        self.assertEqual(updated["note"], "补发")
        self.assertEqual(server.finance_accounts()[0]["balance"], 88.88)


class BodyTrendTests(LifeSystemTestCase):
    def test_body_decimal_fields_are_preserved(self) -> None:
        row = server.insert_body({
            "entry_date": "2026-06-03",
            "weight": "65.45",
            "sleep_hours": "7.75",
        })

        self.assertEqual(row["weight"], 65.45)
        self.assertEqual(row["sleep_hours"], 7.75)

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


class SelfControlSummaryTests(LifeSystemTestCase):
    def test_abstinence_resets_after_last_breach_and_interruptions_count_urge_logs(self) -> None:
        today = date.today()
        start = (today - timedelta(days=7)).isoformat()
        end = (today + timedelta(days=7)).isoformat()
        breach_date = today - timedelta(days=3)
        with server.connect() as db:
            db.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                ("self_control_start", start),
            )
            db.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                ("self_control_end", end),
            )

        server.insert_urge({
            "logged_at": f"{today - timedelta(days=6)} 21:10",
            "urge_score": 7,
            "before_urge": "压力大但守住了",
            "result": "散步十分钟后平复",
        })
        server.insert_urge({
            "logged_at": f"{breach_date} 22:20",
            "urge_score": 9,
            "before_urge": "刷到擦边内容",
            "result": "破戒",
        })
        server.insert_urge({
            "logged_at": f"{today - timedelta(days=2)} 23:00",
            "urge_score": 8,
            "before_urge": "刷到擦边内容但守住了",
            "result": "冲动下降，守住了",
        })

        summary = server.summary()

        self.assertEqual(summary["self_control"]["breaches"], 3)
        self.assertEqual(summary["self_control"]["days_logged"], 3)
        self.assertEqual(summary["self_control"]["clean_days"], summary["self_control"]["days_logged"])

    def test_urge_log_can_be_updated(self) -> None:
        row = server.insert_urge({
            "logged_at": "2026-06-02 21:10",
            "urge_score": 7,
            "before_urge": "压力大",
            "result": "守住了",
        })

        updated = server.update_urge(row["id"], {
            "logged_at": "2026-06-03 22:20",
            "urge_score": 4,
            "location": "客厅",
            "before_urge": "无聊",
            "feeling": "想逃避压力",
            "delay_action": "散步",
            "result": "平复",
        })

        self.assertEqual(updated["logged_at"], "2026-06-03 22:20")
        self.assertEqual(updated["urge_score"], 4)
        self.assertEqual(updated["location"], "客厅")
        self.assertEqual(updated["result"], "平复")


if __name__ == "__main__":
    unittest.main()
