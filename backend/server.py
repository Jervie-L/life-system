from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterator
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "life_system.sqlite3"
HOST = "127.0.0.1"
PORT = 8765


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS daily_checkins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entry_date TEXT NOT NULL UNIQUE,
              phone_outside INTEGER DEFAULT 0,
              self_control_breach INTEGER DEFAULT 0,
              masturbation INTEGER DEFAULT 0,
              urge_score INTEGER DEFAULT 0,
              trigger TEXT DEFAULT '',
              replacement TEXT DEFAULT '',
              expense_amount REAL DEFAULT 0,
              exercise_minutes INTEGER DEFAULT 0,
              career_minutes INTEGER DEFAULT 0,
              did_right TEXT DEFAULT '',
              avoid_tomorrow TEXT DEFAULT '',
              tomorrow_tasks TEXT DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS urge_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              logged_at TEXT NOT NULL,
              urge_score INTEGER DEFAULT 0,
              location TEXT DEFAULT '',
              before_urge TEXT DEFAULT '',
              feeling TEXT DEFAULT '',
              delay_action TEXT DEFAULT '',
              result TEXT DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS finance_entries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entry_date TEXT NOT NULL,
              type TEXT NOT NULL,
              amount REAL NOT NULL,
              account_id INTEGER,
              category TEXT DEFAULT '',
              note TEXT DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS finance_accounts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              account_type TEXT NOT NULL,
              opening_balance REAL NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS body_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entry_date TEXT NOT NULL,
              weight REAL,
              exercise_type TEXT DEFAULT '',
              exercise_minutes INTEGER DEFAULT 0,
              sleep_hours REAL,
              stayed_up_late INTEGER DEFAULT 0,
              posture_training INTEGER DEFAULT 0,
              note TEXT DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS career_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entry_date TEXT NOT NULL,
              topic TEXT DEFAULT '',
              learning_minutes INTEGER DEFAULT 0,
              output TEXT DEFAULT '',
              project_scene TEXT DEFAULT '',
              next_step TEXT DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reviews (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              review_type TEXT NOT NULL,
              period_start TEXT NOT NULL,
              period_end TEXT NOT NULL,
              metrics TEXT DEFAULT '',
              main_problem TEXT DEFAULT '',
              next_bottom_line TEXT DEFAULT '',
              next_actions TEXT DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS checklist_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              system TEXT NOT NULL,
              title TEXT NOT NULL,
              is_done INTEGER DEFAULT 0,
              completed_at TEXT,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS todo_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              todo_date TEXT NOT NULL,
              title TEXT NOT NULL,
              is_done INTEGER DEFAULT 0,
              completed_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              note_date TEXT NOT NULL,
              title TEXT NOT NULL,
              content TEXT DEFAULT '',
              tags TEXT DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )
        seed_settings(db)
        seed_checklist(db)
        migrate_finance_accounts(db)


def seed_settings(db: sqlite3.Connection) -> None:
    defaults = {
        "target_savings": "400000",
        "initial_savings": "0",
        "target_date": "2029-12-14",
        "privacy_mode": "1",
        "daily_exercise_target": "20",
        "daily_career_target": "25",
        "self_control_start": "2026-05-24",
        "self_control_end": "2026-06-22",
        "today_goal_title": "今天的目标",
        "today_goal_text": "先完成系统，不追求完美。",
    }
    for key, value in defaults.items():
        db.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )


def seed_checklist(db: sqlite3.Connection) -> None:
    exists = db.execute("SELECT COUNT(*) AS count FROM checklist_items").fetchone()["count"]
    if exists:
        return
    now = datetime.now().isoformat(timespec="seconds")
    items = [
        ("自控系统", "开启成人内容限制"),
        ("自控系统", "删除高风险账号、相册、链接和群聊"),
        ("自控系统", "23:00 后手机离开卧室"),
        ("存钱系统", "工资到账后先转出目标存款"),
        ("存钱系统", "每周日统计本周支出"),
        ("身体系统", "每周完成 3-5 次运动"),
        ("身体系统", "每天完成 10 分钟体态训练"),
        ("事业系统", "每周输出 1 页 AI 项目分析"),
        ("事业系统", "完成第一份 AI 产品 PRD"),
    ]
    db.executemany(
        "INSERT INTO checklist_items (system, title, created_at) VALUES (?, ?, ?)",
        [(system, title, now) for system, title in items],
    )


def migrate_finance_accounts(db: sqlite3.Connection) -> None:
    columns = {row["name"] for row in db.execute("PRAGMA table_info(finance_entries)").fetchall()}
    if "account_id" not in columns:
        db.execute("ALTER TABLE finance_entries ADD COLUMN account_id INTEGER")
    account = db.execute("SELECT id FROM finance_accounts ORDER BY id LIMIT 1").fetchone()
    if not account:
        initial = db.execute("SELECT value FROM settings WHERE key = 'initial_savings'").fetchone()
        cur = db.execute(
            "INSERT INTO finance_accounts (name, account_type, opening_balance, created_at) VALUES (?, ?, ?, ?)",
            ("主要银行账户", "银行账户", float(initial["value"] if initial else 0), now()),
        )
        account_id = cur.lastrowid
    else:
        account_id = account["id"]
    db.execute("UPDATE finance_entries SET account_id = ? WHERE account_id IS NULL", (account_id,))


def rows(query: str, args: tuple = ()) -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute(query, args).fetchall()]


def one(query: str, args: tuple = ()) -> dict | None:
    with connect() as db:
        row = db.execute(query, args).fetchone()
        return dict(row) if row else None


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if not length:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw) if raw else {}


def bool_int(value: object) -> int:
    return 1 if value in (True, 1, "1", "true", "on", "yes") else 0


def currency(value: object) -> float:
    return float(f"{float(value or 0):.2f}")


def settings_dict() -> dict:
    return {row["key"]: row["value"] for row in rows("SELECT key, value FROM settings")}


def summary() -> dict:
    settings = settings_dict()
    today = date.today().isoformat()
    start = settings.get("self_control_start", "2026-05-24")
    end = settings.get("self_control_end", "2026-06-22")
    target = float(settings.get("target_savings", "400000"))
    initial = one("SELECT COALESCE(SUM(opening_balance), 0) AS total FROM finance_accounts")["total"]

    daily = rows("SELECT * FROM daily_checkins ORDER BY entry_date DESC LIMIT 30")
    today_checkin = one("SELECT * FROM daily_checkins WHERE entry_date = ?", (today,))
    today_todos = ensure_today_todos(today)
    today_aggregates = daily_aggregates(today)
    finance = one(
        """
        SELECT
          COALESCE(SUM(CASE WHEN type = '存款' THEN amount ELSE 0 END), 0) AS saved,
          COALESCE(SUM(CASE WHEN type = '支出' THEN amount ELSE 0 END), 0) AS spent,
          COALESCE(SUM(CASE WHEN type = '收入' THEN amount ELSE 0 END), 0) AS income
        FROM finance_entries
        """
    )
    body_stats = one(
        """
        SELECT
          COALESCE(SUM(exercise_minutes), 0) AS exercise_minutes,
          COALESCE(SUM(stayed_up_late), 0) AS late_days
        FROM body_logs
        WHERE entry_date >= date('now', '-6 day')
        """
    )
    career_stats = one(
        """
        SELECT COALESCE(SUM(learning_minutes), 0) AS career_minutes
        FROM career_logs
        WHERE entry_date >= date('now', '-6 day')
        """
    )
    self_control_total = one(
        "SELECT COUNT(*) AS count FROM daily_checkins WHERE entry_date BETWEEN ? AND ?",
        (start, end),
    )["count"]
    self_control_breaches = one(
        """
        SELECT COUNT(*) AS count
        FROM daily_checkins
        WHERE entry_date BETWEEN ? AND ? AND self_control_breach = 1
        """,
        (start, end),
    )["count"]
    total_savings = float(initial) + float(finance["saved"]) + float(finance["income"]) - float(finance["spent"])
    return {
        "settings": settings,
        "today": today,
        "today_checkin": today_checkin,
        "today_todos": today_todos,
        "today_aggregates": today_aggregates,
        "recent_checkins": daily,
        "self_control": {
            "days_logged": self_control_total,
            "breaches": self_control_breaches,
            "clean_days": max(self_control_total - self_control_breaches, 0),
            "start": start,
            "end": end,
        },
        "finance": {
            "target": target,
            "initial": float(initial),
            "saved_entries": finance["saved"],
            "spent": finance["spent"],
            "income": finance["income"],
            "total_savings": total_savings,
            "remaining": max(target - total_savings, 0),
        },
        "body": body_stats,
        "career": career_stats,
    }


def daily_aggregates(entry_date: str) -> dict:
    finance = one(
        """
        SELECT COALESCE(SUM(CASE WHEN type = '支出' THEN amount ELSE 0 END), 0) AS expense_amount
        FROM finance_entries
        WHERE entry_date = ?
        """,
        (entry_date,),
    )
    body = one(
        """
        SELECT
          COALESCE(SUM(exercise_minutes), 0) AS exercise_minutes,
          COALESCE(MAX(stayed_up_late), 0) AS stayed_up_late
        FROM body_logs
        WHERE entry_date = ?
        """,
        (entry_date,),
    )
    career = one(
        """
        SELECT COALESCE(SUM(learning_minutes), 0) AS career_minutes
        FROM career_logs
        WHERE entry_date = ?
        """,
        (entry_date,),
    )
    urges = rows(
        """
        SELECT urge_score, result, before_urge
        FROM urge_logs
        WHERE substr(logged_at, 1, 10) = ?
        """,
        (entry_date,),
    )
    max_urge = max([int(row.get("urge_score") or 0) for row in urges], default=0)
    text = " ".join(f"{row.get('before_urge', '')} {row.get('result', '')}" for row in urges)
    return {
        "expense_amount": finance["expense_amount"],
        "exercise_minutes": body["exercise_minutes"],
        "career_minutes": career["career_minutes"],
        "urge_score": max_urge,
        "self_control_breach": 1 if any(word in text for word in ("破戒", "色情", "擦边", "看片")) else 0,
        "masturbation": 1 if "手淫" in text else 0,
        "trigger": "冲动记录" if urges else "",
        "replacement": "身体/事业记录已同步" if body["exercise_minutes"] or career["career_minutes"] else "",
    }


def ensure_today_todos(todo_date: str) -> list[dict]:
    with connect() as db:
        count = db.execute(
            "SELECT COUNT(*) AS count FROM todo_items WHERE todo_date = ?",
            (todo_date,),
        ).fetchone()["count"]
        if count == 0:
            timestamp = now()
            defaults = [
                "完成今日记录",
                "运动/拉伸",
                "事业学习",
            ]
            db.executemany(
                """
                INSERT INTO todo_items (todo_date, title, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                [(todo_date, title, timestamp, timestamp) for title in defaults],
            )
        return [
            dict(row)
            for row in db.execute(
                "SELECT * FROM todo_items WHERE todo_date = ? ORDER BY id",
                (todo_date,),
            ).fetchall()
        ]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def send_json(self, payload: object, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:
        self.send_json({})

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        query = parse_qs(urlparse(self.path).query)
        try:
            if path == "/api/health":
                self.send_json({"ok": True, "db": str(DB_PATH)})
            elif path == "/api/summary":
                self.send_json(summary())
            elif path == "/api/settings":
                self.send_json(settings_dict())
            elif path == "/api/daily-checkins":
                self.send_json(rows("SELECT * FROM daily_checkins ORDER BY entry_date DESC LIMIT 90"))
            elif path == "/api/urge-logs":
                self.send_json(rows("SELECT * FROM urge_logs ORDER BY logged_at DESC LIMIT 100"))
            elif path == "/api/finance":
                self.send_json(rows("""
                    SELECT finance_entries.*, finance_accounts.name AS account_name
                    FROM finance_entries
                    LEFT JOIN finance_accounts ON finance_accounts.id = finance_entries.account_id
                    ORDER BY entry_date DESC, finance_entries.id DESC LIMIT 200
                """))
            elif path == "/api/finance-accounts":
                self.send_json(finance_accounts())
            elif path == "/api/body":
                self.send_json(rows("SELECT * FROM body_logs ORDER BY entry_date DESC, id DESC LIMIT 200"))
            elif path == "/api/career":
                self.send_json(rows("SELECT * FROM career_logs ORDER BY entry_date DESC, id DESC LIMIT 200"))
            elif path == "/api/reviews":
                self.send_json(rows("SELECT * FROM reviews ORDER BY period_end DESC, id DESC LIMIT 100"))
            elif path == "/api/checklist":
                self.send_json(rows("SELECT * FROM checklist_items ORDER BY system, id"))
            elif path == "/api/todos":
                todo_date = query.get("date", [date.today().isoformat()])[0]
                self.send_json(ensure_today_todos(todo_date))
            elif path == "/api/todos/calendar":
                start = query.get("start", [date.today().isoformat()])[0]
                end = query.get("end", [start])[0]
                self.send_json(rows(
                    """
                    SELECT * FROM todo_items
                    WHERE todo_date >= ? AND todo_date <= ?
                    ORDER BY todo_date, id
                    """,
                    (start, end),
                ))
            elif path == "/api/notes":
                keyword = query.get("q", [""])[0].strip()
                if keyword:
                    pattern = f"%{keyword}%"
                    self.send_json(rows(
                        """
                        SELECT * FROM notes
                        WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
                        ORDER BY note_date DESC, id DESC
                        """,
                        (pattern, pattern, pattern),
                    ))
                else:
                    self.send_json(rows("SELECT * FROM notes ORDER BY note_date DESC, id DESC LIMIT 200"))
            elif path == "/api/review-draft":
                self.send_json(review_draft(query.get("type", ["week"])[0]))
            else:
                self.send_json({"error": "Not found"}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        data = body(self)
        try:
            if path == "/api/daily-checkins":
                self.send_json(save_checkin(data))
            elif path == "/api/urge-logs":
                self.send_json(insert_urge(data), 201)
            elif path == "/api/finance":
                self.send_json(insert_finance(data), 201)
            elif path == "/api/finance-accounts":
                self.send_json(insert_finance_account(data), 201)
            elif path == "/api/body":
                self.send_json(insert_body(data), 201)
            elif path == "/api/career":
                self.send_json(insert_career(data), 201)
            elif path == "/api/reviews":
                self.send_json(insert_review(data), 201)
            elif path == "/api/checklist":
                self.send_json(insert_checklist(data), 201)
            elif path == "/api/todos":
                self.send_json(insert_todo(data), 201)
            elif path == "/api/notes":
                self.send_json(insert_note(data), 201)
            else:
                self.send_json({"error": "Not found"}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        data = body(self)
        try:
            if path == "/api/settings":
                with connect() as db:
                    for key, value in data.items():
                        db.execute(
                            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                            (key, str(value)),
                        )
                self.send_json(settings_dict())
            elif path.startswith("/api/checklist/"):
                item_id = int(path.rsplit("/", 1)[1])
                is_done = bool_int(data.get("is_done"))
                completed_at = now() if is_done else None
                with connect() as db:
                    db.execute(
                        "UPDATE checklist_items SET is_done = ?, completed_at = ? WHERE id = ?",
                        (is_done, completed_at, item_id),
                    )
                self.send_json({"ok": True})
            elif path.startswith("/api/todos/"):
                item_id = int(path.rsplit("/", 1)[1])
                self.send_json(update_todo(item_id, data))
            elif path.startswith("/api/notes/"):
                item_id = int(path.rsplit("/", 1)[1])
                self.send_json(update_note(item_id, data))
            elif path.startswith("/api/finance-accounts/"):
                item_id = int(path.rsplit("/", 1)[1])
                self.send_json(update_finance_account(item_id, data))
            elif path.startswith("/api/finance/"):
                item_id = int(path.rsplit("/", 1)[1])
                self.send_json(update_finance(item_id, data))
            else:
                self.send_json({"error": "Not found"}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        try:
            table_map = {
                "/api/daily-checkins/": "daily_checkins",
                "/api/urge-logs/": "urge_logs",
                "/api/finance-accounts/": "finance_accounts",
                "/api/finance/": "finance_entries",
                "/api/body/": "body_logs",
                "/api/career/": "career_logs",
                "/api/reviews/": "reviews",
                "/api/checklist/": "checklist_items",
                "/api/todos/": "todo_items",
                "/api/notes/": "notes",
            }
            for prefix, table in table_map.items():
                if path.startswith(prefix):
                    item_id = int(path.rsplit("/", 1)[1])
                    with connect() as db:
                        if table == "finance_accounts":
                            linked = db.execute("SELECT COUNT(*) AS count FROM finance_entries WHERE account_id = ?", (item_id,)).fetchone()["count"]
                            if linked:
                                raise ValueError("该账户已有财务记录，不能删除")
                        db.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
                    self.send_json({"ok": True})
                    return
            self.send_json({"error": "Not found"}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)


def save_checkin(data: dict) -> dict:
    entry_date = data.get("entry_date") or date.today().isoformat()
    timestamp = now()
    fields = {
        "entry_date": entry_date,
        "phone_outside": bool_int(data.get("phone_outside")),
        "self_control_breach": bool_int(data.get("self_control_breach")),
        "masturbation": bool_int(data.get("masturbation")),
        "urge_score": int(data.get("urge_score") or 0),
        "trigger": data.get("trigger", ""),
        "replacement": data.get("replacement", ""),
        "expense_amount": float(data.get("expense_amount") or 0),
        "exercise_minutes": int(data.get("exercise_minutes") or 0),
        "career_minutes": int(data.get("career_minutes") or 0),
        "did_right": data.get("did_right", ""),
        "avoid_tomorrow": data.get("avoid_tomorrow", ""),
        "tomorrow_tasks": data.get("tomorrow_tasks", ""),
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    columns = ", ".join(fields.keys())
    placeholders = ", ".join("?" for _ in fields)
    updates = ", ".join(
        f"{key}=excluded.{key}" for key in fields if key not in ("entry_date", "created_at")
    )
    with connect() as db:
        db.execute(
            f"""
            INSERT INTO daily_checkins ({columns}) VALUES ({placeholders})
            ON CONFLICT(entry_date) DO UPDATE SET {updates}
            """,
            tuple(fields.values()),
        )
    return one("SELECT * FROM daily_checkins WHERE entry_date = ?", (entry_date,))


def insert_urge(data: dict) -> dict:
    timestamp = now()
    values = (
        data.get("logged_at") or timestamp,
        int(data.get("urge_score") or 0),
        data.get("location", ""),
        data.get("before_urge", ""),
        data.get("feeling", ""),
        data.get("delay_action", ""),
        data.get("result", ""),
        timestamp,
    )
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO urge_logs
            (logged_at, urge_score, location, before_urge, feeling, delay_action, result, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
        row = db.execute("SELECT * FROM urge_logs WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def insert_finance(data: dict) -> dict:
    timestamp = now()
    account_id = int(data.get("account_id") or 0)
    with connect() as db:
        if not db.execute("SELECT id FROM finance_accounts WHERE id = ?", (account_id,)).fetchone():
            raise ValueError("请选择有效的资金账户")
        cur = db.execute(
            """
            INSERT INTO finance_entries (entry_date, type, amount, account_id, category, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("entry_date") or date.today().isoformat(),
                data.get("type", "支出"),
                currency(data.get("amount")),
                account_id,
                data.get("category", ""),
                data.get("note", ""),
                timestamp,
            ),
        )
        row = db.execute("""
            SELECT finance_entries.*, finance_accounts.name AS account_name
            FROM finance_entries
            LEFT JOIN finance_accounts ON finance_accounts.id = finance_entries.account_id
            WHERE finance_entries.id = ?
        """, (cur.lastrowid,)).fetchone()
        return dict(row)


def update_finance(item_id: int, data: dict) -> dict:
    account_id = int(data.get("account_id") or 0)
    with connect() as db:
        if not db.execute("SELECT id FROM finance_entries WHERE id = ?", (item_id,)).fetchone():
            raise ValueError("财务记录不存在")
        if not db.execute("SELECT id FROM finance_accounts WHERE id = ?", (account_id,)).fetchone():
            raise ValueError("请选择有效的资金账户")
        db.execute(
            """
            UPDATE finance_entries
            SET entry_date = ?, type = ?, amount = ?, account_id = ?, category = ?, note = ?
            WHERE id = ?
            """,
            (
                data.get("entry_date") or date.today().isoformat(),
                data.get("type", "支出"),
                currency(data.get("amount")),
                account_id,
                data.get("category", ""),
                data.get("note", ""),
                item_id,
            ),
        )
        row = db.execute("""
            SELECT finance_entries.*, finance_accounts.name AS account_name
            FROM finance_entries
            LEFT JOIN finance_accounts ON finance_accounts.id = finance_entries.account_id
            WHERE finance_entries.id = ?
        """, (item_id,)).fetchone()
        return dict(row)


def finance_accounts() -> list[dict]:
    return rows("""
        SELECT
          finance_accounts.*,
          ROUND(opening_balance + COALESCE(SUM(
            CASE WHEN finance_entries.type = '支出' THEN -finance_entries.amount ELSE finance_entries.amount END
          ), 0), 2) AS balance
        FROM finance_accounts
        LEFT JOIN finance_entries ON finance_entries.account_id = finance_accounts.id
        GROUP BY finance_accounts.id
        ORDER BY CASE finance_accounts.account_type
            WHEN '银行账户' THEN 1
            WHEN '现金' THEN 2
            WHEN '保险' THEN 3
            ELSE 4
        END, finance_accounts.id
    """)


def insert_finance_account(data: dict) -> dict:
    timestamp = now()
    name = str(data.get("name", "")).strip()
    if not name:
        raise ValueError("账户名称不能为空")
    with connect() as db:
        cur = db.execute(
            "INSERT INTO finance_accounts (name, account_type, opening_balance, created_at) VALUES (?, ?, ?, ?)",
            (name, data.get("account_type", "银行账户"), currency(data.get("opening_balance")), timestamp),
        )
        row = db.execute("SELECT *, opening_balance AS balance FROM finance_accounts WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_finance_account(account_id: int, data: dict) -> dict:
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValueError("账户名称不能为空")
    balance = currency(data.get("balance"))
    with connect() as db:
        account = db.execute("SELECT * FROM finance_accounts WHERE id = ?", (account_id,)).fetchone()
        if not account:
            raise ValueError("账户不存在")
        delta = db.execute(
            """
            SELECT COALESCE(SUM(CASE WHEN type = '支出' THEN -amount ELSE amount END), 0) AS total
            FROM finance_entries
            WHERE account_id = ?
            """,
            (account_id,),
        ).fetchone()["total"]
        db.execute(
            "UPDATE finance_accounts SET name = ?, account_type = ?, opening_balance = ? WHERE id = ?",
            (name, data.get("account_type", "银行账户"), currency(balance - float(delta)), account_id),
        )
    return next(row for row in finance_accounts() if row["id"] == account_id)


def insert_body(data: dict) -> dict:
    timestamp = now()
    weight = data.get("weight")
    sleep_hours = data.get("sleep_hours")
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO body_logs
            (entry_date, weight, exercise_type, exercise_minutes, sleep_hours, stayed_up_late, posture_training, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("entry_date") or date.today().isoformat(),
                float(weight) if weight not in (None, "") else None,
                data.get("exercise_type", ""),
                int(data.get("exercise_minutes") or 0),
                float(sleep_hours) if sleep_hours not in (None, "") else None,
                bool_int(data.get("stayed_up_late")),
                bool_int(data.get("posture_training")),
                data.get("note", ""),
                timestamp,
            ),
        )
        row = db.execute("SELECT * FROM body_logs WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def insert_career(data: dict) -> dict:
    timestamp = now()
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO career_logs
            (entry_date, topic, learning_minutes, output, project_scene, next_step, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("entry_date") or date.today().isoformat(),
                data.get("topic", ""),
                int(data.get("learning_minutes") or 0),
                data.get("output", ""),
                data.get("project_scene", ""),
                data.get("next_step", ""),
                timestamp,
            ),
        )
        row = db.execute("SELECT * FROM career_logs WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def insert_review(data: dict) -> dict:
    timestamp = now()
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO reviews
            (review_type, period_start, period_end, metrics, main_problem, next_bottom_line, next_actions, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("review_type", "周复盘"),
                data.get("period_start") or date.today().isoformat(),
                data.get("period_end") or date.today().isoformat(),
                data.get("metrics", ""),
                data.get("main_problem", ""),
                data.get("next_bottom_line", ""),
                data.get("next_actions", ""),
                timestamp,
            ),
        )
        row = db.execute("SELECT * FROM reviews WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def insert_checklist(data: dict) -> dict:
    timestamp = now()
    with connect() as db:
        cur = db.execute(
            "INSERT INTO checklist_items (system, title, created_at) VALUES (?, ?, ?)",
            (data.get("system", "自定义"), data.get("title", ""), timestamp),
        )
        row = db.execute("SELECT * FROM checklist_items WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def insert_todo(data: dict) -> dict:
    timestamp = now()
    title = str(data.get("title", "")).strip()
    if not title:
        raise ValueError("待办内容不能为空")
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO todo_items (todo_date, title, is_done, completed_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("todo_date") or date.today().isoformat(),
                title,
                bool_int(data.get("is_done")),
                timestamp if bool_int(data.get("is_done")) else None,
                timestamp,
                timestamp,
            ),
        )
        row = db.execute("SELECT * FROM todo_items WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_todo(item_id: int, data: dict) -> dict:
    timestamp = now()
    existing = one("SELECT * FROM todo_items WHERE id = ?", (item_id,))
    if not existing:
        raise ValueError("待办不存在")
    title = str(data.get("title", existing["title"])).strip()
    if not title:
        raise ValueError("待办内容不能为空")
    is_done = bool_int(data.get("is_done", existing["is_done"]))
    completed_at = timestamp if is_done and not existing["completed_at"] else existing["completed_at"]
    if not is_done:
        completed_at = None
    with connect() as db:
        db.execute(
            """
            UPDATE todo_items
            SET title = ?, is_done = ?, completed_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (title, is_done, completed_at, timestamp, item_id),
        )
        row = db.execute("SELECT * FROM todo_items WHERE id = ?", (item_id,)).fetchone()
        return dict(row)


def insert_note(data: dict) -> dict:
    timestamp = now()
    title = str(data.get("title", "")).strip()
    if not title:
        raise ValueError("标题不能为空")
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO notes (note_date, title, content, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("note_date") or date.today().isoformat(),
                title,
                data.get("content", ""),
                data.get("tags", ""),
                timestamp,
                timestamp,
            ),
        )
        row = db.execute("SELECT * FROM notes WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_note(item_id: int, data: dict) -> dict:
    timestamp = now()
    title = str(data.get("title", "")).strip()
    if not title:
        raise ValueError("标题不能为空")
    with connect() as db:
        db.execute(
            """
            UPDATE notes
            SET note_date = ?, title = ?, content = ?, tags = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                data.get("note_date") or date.today().isoformat(),
                title,
                data.get("content", ""),
                data.get("tags", ""),
                timestamp,
                item_id,
            ),
        )
        row = db.execute("SELECT * FROM notes WHERE id = ?", (item_id,)).fetchone()
        return dict(row)


def review_draft(review_type: str) -> dict:
    today = date.today()
    if review_type == "month":
        period_start = today.replace(day=1)
    else:
        period_start = today - timedelta(days=today.weekday())
    period_end = today
    args = (period_start.isoformat(), period_end.isoformat())
    checkins = one(
        """
        SELECT
          COUNT(*) AS logged_days,
          COALESCE(SUM(self_control_breach), 0) AS self_control_breaches,
          COALESCE(SUM(masturbation), 0) AS masturbation_days,
          COALESCE(SUM(exercise_minutes), 0) AS exercise_minutes,
          COALESCE(SUM(career_minutes), 0) AS career_minutes,
          COALESCE(SUM(expense_amount), 0) AS expenses
        FROM daily_checkins
        WHERE entry_date BETWEEN ? AND ?
        """,
        args,
    )
    body = one(
        """
        SELECT COALESCE(SUM(stayed_up_late), 0) AS late_days
        FROM body_logs WHERE entry_date BETWEEN ? AND ?
        """,
        args,
    )
    finance = one(
        """
        SELECT
          COALESCE(SUM(CASE WHEN type = '存款' THEN amount ELSE 0 END), 0) AS savings,
          COALESCE(SUM(CASE WHEN type = '支出' THEN amount ELSE 0 END), 0) AS spending
        FROM finance_entries
        WHERE entry_date BETWEEN ? AND ?
        """,
        args,
    )
    metrics = {
        "周期": f"{period_start.isoformat()} 至 {period_end.isoformat()}",
        "打卡天数": checkins["logged_days"],
        "自控破戒天数": checkins["self_control_breaches"],
        "手淫天数": checkins["masturbation_days"],
        "运动分钟": checkins["exercise_minutes"],
        "事业学习分钟": checkins["career_minutes"],
        "熬夜天数": body["late_days"],
        "新增存款": finance["savings"],
        "支出": finance["spending"] + checkins["expenses"],
    }
    return {
        "review_type": "月复盘" if review_type == "month" else "周复盘",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "metrics": json.dumps(metrics, ensure_ascii=False, indent=2),
    }


def main() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Life System API running at http://{HOST}:{PORT}")
    print(f"Database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
