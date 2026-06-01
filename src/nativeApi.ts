type Row = Record<string, unknown> & { id: number };
type Table =
  | 'daily_checkins'
  | 'urge_logs'
  | 'finance_accounts'
  | 'finance_entries'
  | 'body_logs'
  | 'career_logs'
  | 'reviews'
  | 'checklist_items'
  | 'todo_items'
  | 'notes';

type Store = {
  version: 2;
  settings: Record<string, string>;
  counters: Record<Table, number>;
} & Record<Table, Row[]>;

const STORAGE_KEY = 'life-system-native-store-v1';
const UPDATED_AT_KEY = 'life-system-native-updated-at-v1';
const tables: Table[] = [
  'daily_checkins', 'urge_logs', 'finance_accounts', 'finance_entries', 'body_logs', 'career_logs',
  'reviews', 'checklist_items', 'todo_items', 'notes',
];

const checklistDefaults = [
  ['自控系统', '开启成人内容限制'],
  ['自控系统', '删除高风险账号、相册、链接和群聊'],
  ['自控系统', '23:00 后手机离开卧室'],
  ['存钱系统', '工资到账后先转出目标存款'],
  ['存钱系统', '每周日统计本周支出'],
  ['身体系统', '每周完成 3-5 次运动'],
  ['身体系统', '每天完成 10 分钟体态训练'],
  ['事业系统', '每周输出 1 页 AI 项目分析'],
  ['事业系统', '完成第一份 AI 产品 PRD'],
];

const timestamp = () => new Date().toISOString().slice(0, 19);
const today = () => new Date().toLocaleDateString('en-CA');
const text = (value: unknown, fallback = '') => String(value ?? fallback);
const number = (value: unknown) => Number(value) || 0;
const optionalNumber = (value: unknown) => value === '' || value == null ? null : number(value);
const boolInt = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true' || value === 'on' ? 1 : 0;

function initialStore(): Store {
  const counters = Object.fromEntries(tables.map((table) => [table, 0])) as Record<Table, number>;
  const store = {
    version: 2 as const,
    settings: {
      target_savings: '400000',
      initial_savings: '250000',
      target_date: '2029-12-14',
      privacy_mode: '1',
      daily_exercise_target: '20',
      daily_career_target: '25',
      self_control_start: '2026-05-24',
      self_control_end: '2026-06-22',
      today_goal_title: '今天的目标',
      today_goal_text: '先完成系统，不追求完美。',
    },
    counters,
    daily_checkins: [], urge_logs: [], finance_accounts: [], finance_entries: [], body_logs: [],
    career_logs: [], reviews: [], checklist_items: [], todo_items: [], notes: [],
  } satisfies Store;
  checklistDefaults.forEach(([system, title]) => insert(store, 'checklist_items', { system, title, is_done: 0, completed_at: null }));
  insert(store, 'finance_accounts', { name: '主要银行账户', account_type: '银行账户', opening_balance: 250000 });
  return store;
}

function load(): Store {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialStore();
  try {
    const store = migrateStore(JSON.parse(raw) as Store);
    if (raw !== JSON.stringify(store)) localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return store;
  } catch {
    return initialStore();
  }
}

function migrateStore(store: Store): Store {
  if (!Array.isArray(store.finance_accounts)) {
    store.finance_accounts = [];
    store.counters.finance_accounts = 0;
  }
  if (!store.finance_accounts.length) {
    insert(store, 'finance_accounts', { name: '主要银行账户', account_type: '银行账户', opening_balance: number(store.settings.initial_savings) });
  }
  const defaultAccountId = store.finance_accounts[0].id;
  store.finance_entries.forEach((row) => {
    if (!number(row.account_id)) row.account_id = defaultAccountId;
  });
  store.version = 2;
  return store;
}

function persist(store: Store, modified = false): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  if (modified) {
    localStorage.setItem(UPDATED_AT_KEY, String(Date.now()));
    window.dispatchEvent(new CustomEvent('life-system-data-changed', { detail: { source: 'local' } }));
  }
}

function insert(store: Store, table: Table, values: Record<string, unknown>): Row {
  const created_at = timestamp();
  const row = { id: ++store.counters[table], created_at, ...values };
  store[table].push(row);
  return row;
}

function desc(a: Row, b: Row, key: string): number {
  return text(b[key]).localeCompare(text(a[key])) || b.id - a.id;
}

function ensureTodos(store: Store, todoDate: string): Row[] {
  if (!store.todo_items.some((item) => item.todo_date === todoDate)) {
    ['完成今日记录', '运动/拉伸', '事业学习'].forEach((title) => {
      insert(store, 'todo_items', { todo_date: todoDate, title, is_done: 0, completed_at: null, updated_at: timestamp() });
    });
  }
  return store.todo_items.filter((item) => item.todo_date === todoDate).sort((a, b) => a.id - b.id);
}

function aggregates(store: Store, date: string) {
  const finance = store.finance_entries.filter((row) => row.entry_date === date);
  const body = store.body_logs.filter((row) => row.entry_date === date);
  const career = store.career_logs.filter((row) => row.entry_date === date);
  const urges = store.urge_logs.filter((row) => text(row.logged_at).slice(0, 10) === date);
  const urgeText = urges.map((row) => `${text(row.before_urge)} ${text(row.result)}`).join(' ');
  return {
    expense_amount: finance.filter((row) => row.type === '支出').reduce((sum, row) => sum + number(row.amount), 0),
    exercise_minutes: body.reduce((sum, row) => sum + number(row.exercise_minutes), 0),
    career_minutes: career.reduce((sum, row) => sum + number(row.learning_minutes), 0),
    urge_score: Math.max(0, ...urges.map((row) => number(row.urge_score))),
    self_control_breach: ['破戒', '色情', '擦边', '看片'].some((word) => urgeText.includes(word)) ? 1 : 0,
    masturbation: urgeText.includes('手淫') ? 1 : 0,
    trigger: urges.length ? '冲动记录' : '',
    replacement: body.length || career.length ? '身体/事业记录已同步' : '',
  };
}

function summary(store: Store) {
  const date = today();
  const settings = store.settings;
  const start = settings.self_control_start;
  const end = settings.self_control_end;
  const checkins = store.daily_checkins.filter((row) => text(row.entry_date) >= start && text(row.entry_date) <= end);
  const finance = {
    saved: store.finance_entries.filter((row) => row.type === '存款').reduce((sum, row) => sum + number(row.amount), 0),
    spent: store.finance_entries.filter((row) => row.type === '支出').reduce((sum, row) => sum + number(row.amount), 0),
    income: store.finance_entries.filter((row) => row.type === '收入').reduce((sum, row) => sum + number(row.amount), 0),
  };
  const target = number(settings.target_savings);
  const initial = store.finance_accounts.reduce((sum, row) => sum + number(row.opening_balance), 0);
  const total = initial + finance.saved + finance.income - finance.spent;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const week = weekStart.toLocaleDateString('en-CA');
  return {
    settings, today: date,
    today_checkin: store.daily_checkins.find((row) => row.entry_date === date) ?? null,
    today_todos: ensureTodos(store, date),
    today_aggregates: aggregates(store, date),
    recent_checkins: [...store.daily_checkins].sort((a, b) => desc(a, b, 'entry_date')).slice(0, 30),
    self_control: { days_logged: checkins.length, breaches: checkins.filter((row) => row.self_control_breach === 1).length, clean_days: checkins.filter((row) => row.self_control_breach !== 1).length, start, end },
    finance: { target, initial, saved_entries: finance.saved, spent: finance.spent, income: finance.income, total_savings: total, remaining: Math.max(target - total, 0) },
    body: { exercise_minutes: store.body_logs.filter((row) => text(row.entry_date) >= week).reduce((sum, row) => sum + number(row.exercise_minutes), 0), late_days: store.body_logs.filter((row) => text(row.entry_date) >= week).reduce((sum, row) => sum + number(row.stayed_up_late), 0) },
    career: { career_minutes: store.career_logs.filter((row) => text(row.entry_date) >= week).reduce((sum, row) => sum + number(row.learning_minutes), 0) },
  };
}

function reviewDraft(store: Store, type: string) {
  const end = today();
  const startDate = new Date();
  type === 'month' ? startDate.setDate(1) : startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
  const start = startDate.toLocaleDateString('en-CA');
  const within = (row: Row) => text(row.entry_date) >= start && text(row.entry_date) <= end;
  const checkins = store.daily_checkins.filter(within);
  const metrics = {
    周期: `${start} 至 ${end}`,
    打卡天数: checkins.length,
    自控破戒天数: checkins.reduce((sum, row) => sum + number(row.self_control_breach), 0),
    手淫天数: checkins.reduce((sum, row) => sum + number(row.masturbation), 0),
    运动分钟: checkins.reduce((sum, row) => sum + number(row.exercise_minutes), 0),
    事业学习分钟: checkins.reduce((sum, row) => sum + number(row.career_minutes), 0),
    熬夜天数: store.body_logs.filter(within).reduce((sum, row) => sum + number(row.stayed_up_late), 0),
    新增存款: store.finance_entries.filter((row) => within(row) && row.type === '存款').reduce((sum, row) => sum + number(row.amount), 0),
    支出: store.finance_entries.filter((row) => within(row) && row.type === '支出').reduce((sum, row) => sum + number(row.amount), 0) + checkins.reduce((sum, row) => sum + number(row.expense_amount), 0),
  };
  return { review_type: type === 'month' ? '月复盘' : '周复盘', period_start: start, period_end: end, metrics: JSON.stringify(metrics, null, 2) };
}

function get(store: Store, path: string, params: URLSearchParams): unknown {
  if (path === '/api/summary') return summary(store);
  if (path === '/api/settings') return store.settings;
  if (path === '/api/todos') return ensureTodos(store, params.get('date') ?? today());
  if (path === '/api/todos/calendar') {
    const start = params.get('start') ?? today();
    const end = params.get('end') ?? start;
    return store.todo_items.filter((item) => text(item.todo_date) >= start && text(item.todo_date) <= end).sort((a, b) => text(a.todo_date).localeCompare(text(b.todo_date)) || a.id - b.id);
  }
  if (path === '/api/review-draft') return reviewDraft(store, params.get('type') ?? 'week');
  if (path === '/api/finance-accounts') {
    return store.finance_accounts
      .map((account): Row => {
        const balance = store.finance_entries.filter((row) => number(row.account_id) === account.id).reduce((sum, row) => sum + financeDelta(row), number(account.opening_balance));
        return { ...account, balance };
      })
      .sort((a, b) => accountTypeOrder(text(a['account_type'])) - accountTypeOrder(text(b['account_type'])) || a.id - b.id);
  }
  const map: Record<string, Table> = {
    '/api/daily-checkins': 'daily_checkins', '/api/urge-logs': 'urge_logs', '/api/finance': 'finance_entries',
    '/api/body': 'body_logs', '/api/career': 'career_logs', '/api/reviews': 'reviews',
    '/api/checklist': 'checklist_items', '/api/notes': 'notes',
  };
  const table = map[path];
  if (!table) throw new Error('接口不存在');
  let rows = [...store[table]];
  if (table === 'finance_entries') {
    rows = rows.map((row) => ({ ...row, account_name: text(store.finance_accounts.find((account) => account.id === number(row.account_id))?.name, '未分类账户') }));
  }
  if (table === 'notes' && params.get('q')) {
    const keyword = text(params.get('q')).toLowerCase();
    rows = rows.filter((row) => `${text(row.title)} ${text(row.content)} ${text(row.tags)}`.toLowerCase().includes(keyword));
  }
  const sortKey = table === 'urge_logs' ? 'logged_at' : table === 'reviews' ? 'period_end' : table === 'checklist_items' ? 'system' : 'entry_date';
  return rows.sort((a, b) => table === 'checklist_items' ? text(a.system).localeCompare(text(b.system)) || a.id - b.id : desc(a, b, sortKey));
}

function post(store: Store, path: string, data: Record<string, unknown>): unknown {
  if (path === '/api/daily-checkins') {
    const entry_date = text(data.entry_date, today());
    const existing = store.daily_checkins.find((row) => row.entry_date === entry_date);
    const values = { ...data, entry_date, phone_outside: boolInt(data.phone_outside), self_control_breach: boolInt(data.self_control_breach), masturbation: boolInt(data.masturbation), urge_score: number(data.urge_score), expense_amount: number(data.expense_amount), exercise_minutes: number(data.exercise_minutes), career_minutes: number(data.career_minutes), updated_at: timestamp() };
    if (existing) return Object.assign(existing, values);
    return insert(store, 'daily_checkins', values);
  }
  const handlers: Record<string, () => Row> = {
    '/api/urge-logs': () => insert(store, 'urge_logs', { ...data, logged_at: text(data.logged_at, timestamp()), urge_score: number(data.urge_score) }),
    '/api/finance-accounts': () => insert(store, 'finance_accounts', { name: required(data.name, '账户名称不能为空'), account_type: text(data.account_type, '银行账户'), opening_balance: number(data.opening_balance) }),
    '/api/finance': () => insert(store, 'finance_entries', { ...data, entry_date: text(data.entry_date, today()), type: text(data.type, '支出'), amount: number(data.amount), account_id: requiredAccountId(store, data.account_id) }),
    '/api/body': () => insert(store, 'body_logs', { ...data, entry_date: text(data.entry_date, today()), weight: optionalNumber(data.weight), sleep_hours: optionalNumber(data.sleep_hours), exercise_minutes: number(data.exercise_minutes), stayed_up_late: boolInt(data.stayed_up_late), posture_training: boolInt(data.posture_training) }),
    '/api/career': () => insert(store, 'career_logs', { ...data, entry_date: text(data.entry_date, today()), learning_minutes: number(data.learning_minutes) }),
    '/api/reviews': () => insert(store, 'reviews', { ...data, review_type: text(data.review_type, '周复盘'), period_start: text(data.period_start, today()), period_end: text(data.period_end, today()) }),
    '/api/checklist': () => insert(store, 'checklist_items', { ...data, system: text(data.system, '自定义'), title: text(data.title), is_done: 0, completed_at: null }),
    '/api/todos': () => insert(store, 'todo_items', { ...data, todo_date: text(data.todo_date, today()), title: required(data.title, '待办内容不能为空'), is_done: boolInt(data.is_done), completed_at: boolInt(data.is_done) ? timestamp() : null, updated_at: timestamp() }),
    '/api/notes': () => insert(store, 'notes', { ...data, note_date: text(data.note_date, today()), title: required(data.title, '标题不能为空'), content: text(data.content), tags: text(data.tags), updated_at: timestamp() }),
  };
  if (!handlers[path]) throw new Error('接口不存在');
  return handlers[path]();
}

function required(value: unknown, message: string): string {
  const result = text(value).trim();
  if (!result) throw new Error(message);
  return result;
}

function requiredAccountId(store: Store, value: unknown): number {
  const accountId = number(value);
  if (!store.finance_accounts.some((account) => account.id === accountId)) throw new Error('请选择有效的资金账户');
  return accountId;
}

function financeDelta(row: Row): number {
  return row.type === '支出' ? -number(row.amount) : number(row.amount);
}

function accountTypeOrder(value: string): number {
  const index = ['银行账户', '现金', '保险'].indexOf(value);
  return index === -1 ? 99 : index;
}

function put(store: Store, path: string, data: Record<string, unknown>): unknown {
  if (path === '/api/settings') {
    Object.entries(data).forEach(([key, value]) => store.settings[key] = text(value));
    return store.settings;
  }
  const match = path.match(/^\/api\/(checklist|todos|notes)\/(\d+)$/);
  if (!match) throw new Error('接口不存在');
  const table = ({ checklist: 'checklist_items', todos: 'todo_items', notes: 'notes' } as const)[match[1] as 'checklist' | 'todos' | 'notes'];
  const row = store[table].find((item) => item.id === Number(match[2]));
  if (!row) throw new Error('记录不存在');
  if (table === 'checklist_items') Object.assign(row, { is_done: boolInt(data.is_done), completed_at: boolInt(data.is_done) ? timestamp() : null });
  if (table === 'todo_items') Object.assign(row, { ...data, title: required(data.title ?? row.title, '待办内容不能为空'), is_done: boolInt(data.is_done ?? row.is_done), completed_at: boolInt(data.is_done ?? row.is_done) ? text(row.completed_at, timestamp()) : null, updated_at: timestamp() });
  if (table === 'notes') Object.assign(row, { ...data, title: required(data.title, '标题不能为空'), note_date: text(data.note_date, today()), content: text(data.content), tags: text(data.tags), updated_at: timestamp() });
  return row;
}

function remove(store: Store, path: string): unknown {
  const match = path.match(/^\/api\/(daily-checkins|urge-logs|finance-accounts|finance|body|career|reviews|checklist|todos|notes)\/(\d+)$/);
  if (!match) throw new Error('接口不存在');
  const table: Table = ({ 'daily-checkins': 'daily_checkins', 'urge-logs': 'urge_logs', 'finance-accounts': 'finance_accounts', finance: 'finance_entries', body: 'body_logs', career: 'career_logs', reviews: 'reviews', checklist: 'checklist_items', todos: 'todo_items', notes: 'notes' } as Record<string, Table>)[match[1]];
  if (table === 'finance_accounts' && store.finance_entries.some((row) => number(row.account_id) === Number(match[2]))) throw new Error('该账户已有财务记录，不能删除');
  store[table] = store[table].filter((row) => row.id !== Number(match[2]));
  return { ok: true };
}

export async function nativeRequest<T>(rawPath: string, method: string, data?: unknown): Promise<T> {
  const store = load();
  const before = JSON.stringify(store);
  const url = new URL(rawPath, 'https://native.local');
  let result: unknown;
  if (method === 'GET') result = get(store, url.pathname, url.searchParams);
  else if (method === 'POST') result = post(store, url.pathname, (data ?? {}) as Record<string, unknown>);
  else if (method === 'PUT') result = put(store, url.pathname, (data ?? {}) as Record<string, unknown>);
  else if (method === 'DELETE') result = remove(store, url.pathname);
  else throw new Error('不支持的请求方式');
  persist(store, method !== 'GET' || before !== JSON.stringify(store));
  return result as T;
}

export function resetNativeData(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(UPDATED_AT_KEY, String(Date.now()));
  window.dispatchEvent(new CustomEvent('life-system-data-changed', { detail: { source: 'local' } }));
}

export function exportNativeData(): { updatedAt: number; store: Store } {
  return {
    updatedAt: Number(localStorage.getItem(UPDATED_AT_KEY)) || 0,
    store: load(),
  };
}

export function importNativeData(snapshot: { updatedAt: number; store: Store }): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrateStore(snapshot.store)));
  localStorage.setItem(UPDATED_AT_KEY, String(snapshot.updatedAt));
  window.dispatchEvent(new CustomEvent('life-system-data-changed', { detail: { source: 'remote' } }));
}
