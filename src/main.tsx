import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import {
  Activity,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  ClipboardCheck,
  Dumbbell,
  Home,
  Menu,
  PiggyBank,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import './styles.css';
import { nativeRequest, resetNativeData } from './nativeApi';
import { getSyncStatus, getSyncUsername, initializeDataSync, isSyncLoggedIn, loginSyncAccount, logoutSyncAccount, registerSyncAccount, syncNow, SYNC_STATUS_EVENT } from './sync';

type Summary = {
  settings: Record<string, string>;
  today: string;
  today_checkin: DailyCheckin | null;
  today_todos?: TodoItem[];
  today_aggregates?: {
    expense_amount: number;
    exercise_minutes: number;
    career_minutes: number;
    urge_score: number;
    self_control_breach: number;
    masturbation: number;
    trigger: string;
    replacement: string;
  };
  recent_checkins: DailyCheckin[];
  self_control: {
    days_logged: number;
    breaches: number;
    clean_days: number;
    start: string;
    end: string;
  };
  finance: {
    target: number;
    initial: number;
    saved_entries: number;
    spent: number;
    income: number;
    total_savings: number;
    remaining: number;
  };
  body: { exercise_minutes: number; late_days: number };
  career: { career_minutes: number };
};

type TodoItem = {
  id: number;
  todo_date: string;
  title: string;
  is_done: number;
  completed_at: string | null;
};

type DailyCheckin = {
  id: number;
  entry_date: string;
  phone_outside: number;
  self_control_breach: number;
  masturbation: number;
  urge_score: number;
  trigger: string;
  replacement: string;
  expense_amount: number;
  exercise_minutes: number;
  career_minutes: number;
  did_right: string;
  avoid_tomorrow: string;
  tomorrow_tasks: string;
};

type FinanceEntry = {
  id: number;
  entry_date: string;
  type: string;
  amount: number;
  account_id: number;
  account_name: string;
  category: string;
  note: string;
};

type FinanceAccount = {
  id: number;
  name: string;
  account_type: '银行账户' | '现金' | '保险';
  opening_balance: number;
  balance: number;
};

type BodyLog = {
  id: number;
  entry_date: string;
  weight: number | null;
  exercise_type: string;
  exercise_minutes: number;
  sleep_hours: number | null;
  stayed_up_late: number;
  posture_training: number;
  note: string;
};

type CareerLog = {
  id: number;
  entry_date: string;
  topic: string;
  learning_minutes: number;
  output: string;
  project_scene: string;
  next_step: string;
};

type Review = {
  id: number;
  review_type: string;
  period_start: string;
  period_end: string;
  metrics: string;
  main_problem: string;
  next_bottom_line: string;
  next_actions: string;
};

type Note = {
  id: number;
  note_date: string;
  title: string;
  content: string;
  tags: string;
  updated_at: string;
};

type ChecklistItem = {
  id: number;
  system: string;
  title: string;
  is_done: number;
  completed_at: string | null;
};

const api = {
  async get<T>(path: string): Promise<T> {
    if (useLocalStorage) return nativeRequest<T>(path, 'GET');
    const res = await fetch(apiUrl(path));
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async send<T>(path: string, method: string, data?: unknown): Promise<T> {
    if (useLocalStorage) return nativeRequest<T>(path, method, data);
    const res = await fetch(apiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const privacyPolicyUrl = import.meta.env.VITE_PRIVACY_POLICY_URL ?? '';
const useLocalStorage = (Capacitor.isNativePlatform() || import.meta.env.MODE === 'pwa') && !apiBaseUrl;

function apiUrl(path: string): string {
  if (Capacitor.isNativePlatform() && apiBaseUrl && !apiBaseUrl.startsWith('https://')) {
    throw new Error('iOS 版本需要配置有效的 HTTPS API 地址。');
  }
  return `${apiBaseUrl}${path}`;
}

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`;
const recordStartDate = '2026-06-01';
const columnLabels: Record<string, string> = {
  logged_at: '时间',
  urge_score: '冲动分',
  location: '地点',
  before_urge: '冲动前发生了什么',
  feeling: '想获得或逃避什么',
  delay_action: '10分钟延迟动作',
  result: '结果',
  entry_date: '日期',
  type: '类型',
  amount: '金额',
  account_name: '资金账户',
  account_type: '账户类型',
  opening_balance: '期初余额',
  balance: '当前余额',
  category: '分类',
  note: '备注',
  weight: '体重',
  exercise_type: '运动类型',
  exercise_minutes: '运动分钟',
  sleep_hours: '睡眠小时',
  stayed_up_late: '熬夜',
  posture_training: '体态训练',
  topic: '学习主题',
  learning_minutes: '学习分钟',
  output: '输出物',
  project_scene: '项目场景',
  next_step: '下一步',
  review_type: '复盘类型',
  period_start: '开始日期',
  period_end: '结束日期',
  metrics: '数据摘要',
  main_problem: '最大问题',
  next_actions: '下周行动',
};

const careerRouteDetails = [
  {
    title: '产品基本功',
    period: '第1个月',
    goal: '从项目管理员语言切换成产品经理语言。',
    learn: ['用户、客户、场景、痛点、需求、方案的区别', '需求访谈和优先级判断', 'PRD、用户故事、验收标准', '效率、成本、质量、风险等指标设计'],
    outputs: ['当前岗位的用户/客户/场景/痛点分析', '1份需求调研记录', '1份基础PRD', '1份指标设计表'],
  },
  {
    title: 'AI应用基础',
    period: '第2个月',
    goal: '能判断一个企业场景是否适合AI，并能和技术同事沟通。',
    learn: ['大模型能力边界、上下文、温度、结构化输出', '提示词结构：角色、任务、背景、约束、输出格式', 'RAG、知识库、引用来源、权限边界', 'Agent、工作流、工具调用和人工确认'],
    outputs: ['大模型能做/不能做清单', '3版工作场景提示词', '企业知识库问答方案', '一个流程的AI可自动化拆解'],
  },
  {
    title: '作品集项目',
    period: '第3个月',
    goal: '做出第一个能展示的AI产品案例。',
    learn: ['选题和场景分析', '现状流程图和目标流程图', '低保真原型', '完整PRD和试点计划'],
    outputs: ['1个真实企业AI场景案例', '流程图', '低保真原型', '完整PRD', '试点计划'],
  },
  {
    title: '小试点和数据证明',
    period: '第4个月',
    goal: '拿到真实反馈和可量化结果。',
    learn: ['试点范围控制', '试点前基线采集', '用户反馈收集', '问题清单和迭代方案', '效果评估报告'],
    outputs: ['试点启动说明', '试点前后数据', '用户反馈记录', '迭代方案', '效果评估报告'],
  },
  {
    title: '简历作品集',
    period: '第5个月',
    goal: '把你的经历翻译成AI产品岗位能听懂的价值。',
    learn: ['项目经历 STAR 表达', '产品岗位简历改写', '3-5页作品集摘要', '面试故事准备'],
    outputs: ['AI产品经理方向简历', '3-5页作品集', '10个面试故事', '一套自我介绍'],
  },
  {
    title: '投递和迭代',
    period: '第6个月',
    goal: '接触市场，用面试反馈修正路线。',
    learn: ['岗位画像分析', 'JD能力缺口拆解', '面试复盘', '路线调整：产品/解决方案/交付'],
    outputs: ['每周10-20个岗位投递记录', 'JD能力缺口表', '面试复盘表', '下一阶段主攻方向'],
  },
];

function App() {
  const [page, setPage] = useState('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const refresh = async () => {
    try {
      setSummary(await api.get<Summary>('/api/summary'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法连接后端服务');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!useLocalStorage) return;
    return initializeDataSync(refresh);
  }, []);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const nav = [
    ['dashboard', '总看板', Home],
    ['today', '今日打卡', ClipboardCheck],
    ['calendar', '日历', CalendarDays],
    ['self-control', '自控系统', ShieldCheck],
    ['finance', '存钱系统', PiggyBank],
    ['body', '身体系统', Dumbbell],
    ['career', '事业系统', BriefcaseBusiness],
    ['notes', '笔记', BookOpen],
    ['reviews', '复盘', BarChart3],
    ['settings', '设置', Settings],
  ] as const;

  return (
    <div
      className="app"
      onTouchStart={event => {
        const touch = event.touches[0];
        swipeStart.current = touch.clientX <= 28 ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={event => {
        const start = swipeStart.current;
        const touch = event.changedTouches[0];
        swipeStart.current = null;
        if (start && touch.clientX - start.x >= 56 && Math.abs(touch.clientY - start.y) < 72) setDrawerOpen(true);
      }}
    >
      {drawerOpen && <button className="drawer-backdrop" aria-label="关闭菜单" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">人</div>
          <div>
            <strong>人生系统</strong>
            <span>本地私用管理台</span>
          </div>
          <button className="drawer-close" aria-label="关闭菜单" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button className={page === id ? 'active' : ''} key={id} onClick={() => { setPage(id); setDrawerOpen(false); }}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main>
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu-button" aria-label="打开菜单" onClick={() => setDrawerOpen(true)}><Menu size={20} /></button>
            <div>
              <p>{recordStartDate} 起持续记录</p>
              <h1>{nav.find(([id]) => id === page)?.[1]}</h1>
            </div>
          </div>
          <button className="ghost" onClick={refresh}>
            刷新数据
          </button>
        </header>

        {error && <div className="error">后端连接异常：{error}</div>}
        {notice && <div className="toast">{notice}</div>}
        {!summary && !error && <div className="loading">正在读取本地数据库...</div>}

        {summary && page === 'dashboard' && <Dashboard summary={summary} onSaved={refresh} notify={notify} />}
        {summary && page === 'today' && <TodayForm summary={summary} onSaved={refresh} notify={notify} />}
        {summary && page === 'calendar' && <CalendarPage onSaved={refresh} notify={notify} />}
        {summary && page === 'self-control' && <SelfControl summary={summary} onSaved={refresh} />}
        {summary && page === 'finance' && <Finance onSaved={refresh} notify={notify} />}
        {summary && page === 'body' && <Body onSaved={refresh} />}
        {summary && page === 'career' && <Career onSaved={refresh} />}
        {summary && page === 'notes' && <Notes />}
        {summary && page === 'reviews' && <Reviews onSaved={refresh} />}
        {summary && page === 'settings' && <SettingsPage summary={summary} onSaved={refresh} notify={notify} />}
      </main>
    </div>
  );
}

function Dashboard({ summary, onSaved, notify }: { summary: Summary; onSaved: () => void; notify: (message: string) => void }) {
  const progress = Math.min((summary.finance.total_savings / summary.finance.target) * 100, 100);

  return (
    <section className="stack">
      <EditableHero summary={summary} onSaved={onSaved} notify={notify} />

      <div className="grid four">
        <Metric icon={<ShieldCheck />} label="30天自控记录" value={`${summary.self_control.days_logged}/30天`} hint={`中断 ${summary.self_control.breaches} 天`} />
        <Metric icon={<PiggyBank />} label="存款进度" value={money(summary.finance.total_savings)} hint={`还差 ${money(summary.finance.remaining)}`} />
        <Metric icon={<Dumbbell />} label="近7天运动" value={`${summary.body.exercise_minutes || 0}分钟`} hint={`熬夜 ${summary.body.late_days || 0} 天`} />
        <Metric icon={<BriefcaseBusiness />} label="近7天事业学习" value={`${summary.career.career_minutes || 0}分钟`} hint="目标每周至少175分钟" />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>今日待办</h3>
          <span>{summary.today}</span>
        </div>
        <EditableTodos date={summary.today} initialTodos={summary.today_todos || []} onSaved={onSaved} notify={notify} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>40万目标</h3>
          <span>{progress.toFixed(1)}%</span>
        </div>
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
      </div>
    </section>
  );
}

function EditableHero({ summary, onSaved, notify }: { summary: Summary; onSaved: () => void; notify: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(summary.settings.today_goal_title || '今天的目标');
  const [text, setText] = useState(summary.settings.today_goal_text || '先完成系统，不追求完美。');

  useEffect(() => {
    setTitle(summary.settings.today_goal_title || '今天的目标');
    setText(summary.settings.today_goal_text || '先完成系统，不追求完美。');
  }, [summary.settings.today_goal_title, summary.settings.today_goal_text]);

  const save = async () => {
    await api.send('/api/settings', 'PUT', {
      today_goal_title: title.trim() || '今天的目标',
      today_goal_text: text.trim() || '先完成系统，不追求完美。',
    });
    setEditing(false);
    notify('今日目标已保存。');
    onSaved();
  };

  return (
    <div className="hero editable-hero">
      <div className="hero-content">
        {editing ? (
          <>
            <input value={title} onChange={event => setTitle(event.target.value)} />
            <textarea value={text} onChange={event => setText(event.target.value)} />
          </>
        ) : (
          <>
            <p>{title}</p>
            <h2>{text}</h2>
          </>
        )}
      </div>
      <div className="hero-actions">
        {editing ? (
          <>
            <button className="ghost" onClick={() => setEditing(false)}>取消</button>
            <button onClick={save}><Save size={16} /> 保存</button>
          </>
        ) : (
          <button className="ghost" onClick={() => setEditing(true)}>编辑目标</button>
        )}
      </div>
    </div>
  );
}

function EditableTodos({ date, initialTodos, onSaved, notify }: { date: string; initialTodos: TodoItem[]; onSaved: () => void; notify: (message: string) => void }) {
  const [todos, setTodos] = useState<TodoItem[]>(initialTodos);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    setTodos(initialTodos);
  }, [initialTodos]);

  const updateTodo = async (todo: TodoItem, patch: Partial<TodoItem>) => {
    const next = { ...todo, ...patch };
    setTodos(todos.map(item => item.id === todo.id ? next : item));
    await api.send<TodoItem>(`/api/todos/${todo.id}`, 'PUT', {
      title: next.title,
      is_done: next.is_done,
    });
    notify(next.is_done ? '完成得很好，继续保持。' : '已改为未完成。');
    onSaved();
  };

  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const created = await api.send<TodoItem>('/api/todos', 'POST', { todo_date: date, title });
    setTodos([...todos, created]);
    setNewTitle('');
    notify('已添加新的今日待办。');
    onSaved();
  };

  const deleteTodo = async (todo: TodoItem) => {
    await api.send(`/api/todos/${todo.id}`, 'DELETE');
    setTodos(todos.filter(item => item.id !== todo.id));
    notify('已删除待办。');
    onSaved();
  };

  const doneCount = todos.filter(todo => todo.is_done).length;

  return (
    <div className="todo-editor">
      <div className="todo-feedback">
        <span>{doneCount}/{todos.length} 已完成</span>
        {todos.length > 0 && doneCount === todos.length && <strong>今天这一组已经清掉了。</strong>}
      </div>
      <div className="todo-list editable">
        {todos.map(todo => (
          <div className={todo.is_done ? 'todo checked' : 'todo'} key={todo.id}>
            <button className="todo-check" onClick={() => updateTodo(todo, { is_done: todo.is_done ? 0 : 1 })} title="切换完成状态">
              <CheckCircle2 className={todo.is_done ? 'done' : ''} size={20} />
            </button>
            <input
              value={todo.title}
              onChange={event => setTodos(todos.map(item => item.id === todo.id ? { ...item, title: event.target.value } : item))}
              onBlur={() => updateTodo(todo, { title: todos.find(item => item.id === todo.id)?.title || todo.title })}
              onKeyDown={event => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <button className="icon danger" onClick={() => deleteTodo(todo)} title="删除待办"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="todo-add">
        <input
          value={newTitle}
          onChange={event => setNewTitle(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') addTodo();
          }}
          placeholder="添加一个今天要完成的事项"
        />
        <button onClick={addTodo}><Plus size={16} /> 添加</button>
      </div>
    </div>
  );
}

function CalendarPage({ onSaved, notify }: { onSaved: () => void; notify: (message: string) => void }) {
  const current = new Date();
  const [month, setMonth] = useState(() => new Date(current.getFullYear(), current.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today());
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(false);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthStart = formatLocalDate(new Date(year, monthIndex, 1));
  const monthEnd = formatLocalDate(new Date(year, monthIndex + 1, 0));

  const loadTodos = async () => {
    setLoading(true);
    try {
      setTodos(await api.get<TodoItem[]>(`/api/todos/calendar?start=${monthStart}&end=${monthEnd}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTodos();
  }, [monthStart, monthEnd]);

  const todosByDate = useMemo(() => {
    return todos.reduce<Record<string, TodoItem[]>>((result, todo) => {
      (result[todo.todo_date] ||= []).push(todo);
      return result;
    }, {});
  }, [todos]);

  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const selectedTodos = todosByDate[selectedDate] || [];

  const moveMonth = (offset: number) => {
    const next = new Date(year, monthIndex + offset, 1);
    setMonth(next);
    setSelectedDate(formatLocalDate(next));
  };

  const handleSaved = () => {
    loadTodos();
    onSaved();
  };

  return (
    <section className="calendar-layout">
      <div className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div>
            <p>按月查看待办安排</p>
            <h2>{year}年{monthIndex + 1}月</h2>
          </div>
          <div className="calendar-actions">
            <button className="ghost" aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
            <button className="ghost" onClick={() => { setMonth(new Date(current.getFullYear(), current.getMonth(), 1)); setSelectedDate(today()); }}>今天</button>
            <button className="ghost" aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="calendar-weekdays">
          {['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>周{day}</span>)}
        </div>
        <div className="calendar-grid">
          {cells.map((day, index) => {
            if (!day) return <span className="calendar-cell empty" key={`empty-${index}`} />;
            const date = formatLocalDate(new Date(year, monthIndex, day));
            const dayTodos = todosByDate[date] || [];
            const doneCount = dayTodos.filter(todo => todo.is_done).length;
            return (
              <button
                className={`calendar-cell${selectedDate === date ? ' selected' : ''}${date === today() ? ' today' : ''}`}
                key={date}
                onClick={() => setSelectedDate(date)}
              >
                <span className="calendar-day">{day}</span>
                {dayTodos.length > 0 && (
                  <>
                    <span className="calendar-todo-count">{doneCount}/{dayTodos.length}</span>
                    <span className="calendar-dot-row">{dayTodos.slice(0, 3).map(todo => <i className={todo.is_done ? 'done' : ''} key={todo.id} />)}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {loading && <p className="calendar-loading">正在读取待办...</p>}
      </div>

      <div className="panel calendar-detail">
        <div className="panel-head">
          <div>
            <h3>{selectedDate} 待办</h3>
            <p>{selectedTodos.length ? `共 ${selectedTodos.length} 项，已完成 ${selectedTodos.filter(todo => todo.is_done).length} 项` : '当天还没有安排'}</p>
          </div>
        </div>
        <EditableTodos date={selectedDate} initialTodos={selectedTodos} onSaved={handleSaved} notify={notify} />
      </div>
    </section>
  );
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}

function TodayForm({ summary, onSaved, notify }: { summary: Summary; onSaved: () => void; notify: (message: string) => void }) {
  const existing = summary.today_checkin;
  const syncedForm = () => ({
    entry_date: summary.today,
    phone_outside: false,
    self_control_breach: Boolean(existing?.self_control_breach ?? summary.today_aggregates?.self_control_breach),
    masturbation: Boolean(existing?.masturbation ?? summary.today_aggregates?.masturbation),
    urge_score: existing?.urge_score || summary.today_aggregates?.urge_score || 0,
    trigger: existing?.trigger || summary.today_aggregates?.trigger || '',
    replacement: existing?.replacement || summary.today_aggregates?.replacement || '',
    expense_amount: existing?.expense_amount ?? summary.today_aggregates?.expense_amount ?? 0,
    exercise_minutes: existing?.exercise_minutes ?? summary.today_aggregates?.exercise_minutes ?? 0,
    career_minutes: existing?.career_minutes ?? summary.today_aggregates?.career_minutes ?? 0,
    did_right: existing?.did_right || '',
    avoid_tomorrow: existing?.avoid_tomorrow || '',
    tomorrow_tasks: existing?.tomorrow_tasks || '',
  });
  const [form, setForm] = useState(syncedForm);

  useEffect(() => {
    setForm(syncedForm());
  }, [summary.today, summary.today_checkin, summary.today_aggregates]);

  const save = async () => {
    await api.send('/api/daily-checkins', 'POST', form);
    notify('今日打卡已保存。');
    onSaved();
  };

  const syncSystems = () => {
    const aggregates = summary.today_aggregates;
    setForm({
      ...form,
      self_control_breach: Boolean(aggregates?.self_control_breach),
      masturbation: Boolean(aggregates?.masturbation),
      urge_score: aggregates?.urge_score || 0,
      trigger: aggregates?.trigger || form.trigger,
      replacement: aggregates?.replacement || form.replacement,
      expense_amount: aggregates?.expense_amount || 0,
      exercise_minutes: aggregates?.exercise_minutes || 0,
      career_minutes: aggregates?.career_minutes || 0,
    });
    notify('已同步四个系统的今日数据。');
  };

  return (
    <section className="panel wide">
      <div className="panel-head">
        <h3>今日六件事</h3>
        <div className="actions">
          <button className="ghost" onClick={syncSystems}>同步四系统数据</button>
          <button onClick={save}><Save size={16} /> 保存今日打卡</button>
        </div>
      </div>
      <div className="form-grid today-grid">
        <Field label="日期"><DateInput value={form.entry_date} onChange={entry_date => setForm({ ...form, entry_date })} /></Field>
        <Toggle label="观看色情/擦边内容" checked={form.self_control_breach} onChange={v => setForm({ ...form, self_control_breach: v })} />
        <Toggle label="手淫" checked={form.masturbation} onChange={v => setForm({ ...form, masturbation: v })} />
        <Field label="最大冲动 1-10"><NumberInput min={0} max={10} value={form.urge_score} onChange={value => setForm({ ...form, urge_score: value })} /></Field>
        <Field label="触发点"><input value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })} placeholder="深夜 / 压力 / 无聊 / 游戏后" /></Field>
        <Field label="替代行为"><input value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} placeholder="运动 / 学习 / 整理" /></Field>
        <Field label="今日支出"><NumberInput value={form.expense_amount} onChange={value => setForm({ ...form, expense_amount: value })} /></Field>
        <Field label="运动/拉伸分钟"><NumberInput value={form.exercise_minutes} onChange={value => setForm({ ...form, exercise_minutes: value })} /></Field>
        <Field label="事业学习分钟"><NumberInput value={form.career_minutes} onChange={value => setForm({ ...form, career_minutes: value })} /></Field>
        <Field label="今天做对的一件事" className="field-long"><textarea value={form.did_right} onChange={e => setForm({ ...form, did_right: e.target.value })} /></Field>
        <Field label="明天要避开的场景" className="field-long"><textarea value={form.avoid_tomorrow} onChange={e => setForm({ ...form, avoid_tomorrow: e.target.value })} /></Field>
        <Field label="明天三件事" className="field-long"><textarea value={form.tomorrow_tasks} onChange={e => setForm({ ...form, tomorrow_tasks: e.target.value })} placeholder={'1.\n2.\n3.'} /></Field>
      </div>
    </section>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`field ${className}`.trim()}><span>{label}</span>{children}</label>;
}

function DateInput({ value, onChange, withTime = false }: { value: string; onChange: (value: string) => void; withTime?: boolean }) {
  const placeholder = withTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD';
  const pattern = withTime ? '\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}' : '\\d{4}-\\d{2}-\\d{2}';
  return (
    <input
      className="date-text-input"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value.replace('T', ' ')}
      placeholder={placeholder}
      pattern={pattern}
      title={`请按 ${placeholder} 格式填写`}
      onChange={event => {
        const next = event.target.value;
        if (/^[\d\-: ]*$/.test(next)) onChange(next);
      }}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  value: number | string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === 0 ? '' : String(value ?? ''));

  useEffect(() => {
    setText(value === 0 ? '' : String(value ?? ''));
  }, [value]);

  const commit = (raw: string) => {
    if (raw === '') {
      onChange(0);
      return;
    }
    let next = Number(raw);
    if (Number.isNaN(next)) next = 0;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(next);
    setText(next === 0 ? '' : String(next));
  };

  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={placeholder ?? '0'}
      onChange={event => {
        const raw = event.target.value;
        if (/^\d*\.?\d*$/.test(raw)) {
          setText(raw);
          if (raw !== '') commit(raw);
        }
      }}
      onFocus={() => {
        if (text === '0') setText('');
      }}
      onBlur={() => commit(text)}
    />
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SelfControl({ summary, onSaved }: { summary: Summary; onSaved: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [form, setForm] = useState({ logged_at: new Date().toISOString().slice(0, 16).replace('T', ' '), urge_score: 5, location: '', before_urge: '', feeling: '', delay_action: '', result: '' });

  const load = async () => {
    setLogs(await api.get('/api/urge-logs'));
    setChecklist(await api.get('/api/checklist'));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    await api.send('/api/urge-logs', 'POST', form);
    setForm({ ...form, before_urge: '', feeling: '', delay_action: '', result: '' });
    await load();
    onSaved();
  };

  const toggleItem = async (item: ChecklistItem) => {
    await api.send(`/api/checklist/${item.id}`, 'PUT', { is_done: item.is_done ? 0 : 1 });
    await load();
  };

  return (
    <section className="stack">
      <div className="grid four">
        <Metric icon={<ShieldCheck />} label="30天打卡" value={`${summary.self_control.days_logged}/30天`} hint={`稳定 ${summary.self_control.clean_days} 天`} />
        <Metric icon={<Activity />} label="冲动记录" value={`${logs.length}条`} hint="来自下方冲动记录" />
        <Metric icon={<ClipboardCheck />} label="最高冲动分" value={`${maxUrgeScore(logs)}/10`} hint="用于识别高危场景" />
        <Metric icon={<BarChart3 />} label="本周冲动" value={`${weeklyUrgeCount(logs)}条`} hint="最近7天记录" />
      </div>
      <div className="grid two">
        <div className="panel">
          <div className="panel-head"><h3>冲动记录</h3><button onClick={save}><Plus size={16} /> 添加</button></div>
          <div className="form-grid compact urge-grid">
            <Field label="时间"><DateInput withTime value={form.logged_at} onChange={logged_at => setForm({ ...form, logged_at })} /></Field>
            <Field label="冲动 1-10"><NumberInput min={1} max={10} value={form.urge_score} onChange={value => setForm({ ...form, urge_score: value })} /></Field>
            <Field label="地点" className="field-wide"><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="卧室 / 客厅 / 公司 / 路上" /></Field>
            <Field label="冲动前发生了什么" className="field-long"><textarea value={form.before_urge} onChange={e => setForm({ ...form, before_urge: e.target.value })} placeholder="例如：熬夜、刷短视频、压力大、无聊独处" /></Field>
            <Field label="想获得或逃避什么" className="field-long"><textarea value={form.feeling} onChange={e => setForm({ ...form, feeling: e.target.value })} placeholder="例如：想放松、逃避压力、寻求刺激、缓解孤独" /></Field>
            <Field label="10分钟延迟动作" className="field-long"><textarea value={form.delay_action} onChange={e => setForm({ ...form, delay_action: e.target.value })} placeholder="例如：离开床、喝水、深蹲20个、冷水洗脸" /></Field>
            <Field label="结果" className="field-long"><textarea value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} placeholder="10分钟后冲动下降了吗？下一步是什么？" /></Field>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>强阻断清单</h3></div>
          <div className="checklist">
            {checklist.filter(i => i.system === '自控系统').length === 0 && (
              <div className="empty-state">暂无清单。系统会在数据库初始化时生成默认阻断项。</div>
            )}
            {checklist.filter(i => i.system === '自控系统').map(item => (
              <button key={item.id} className={item.is_done ? 'checked' : ''} onClick={() => toggleItem(item)}>
                <CheckCircle2 size={18} /> {item.title}
              </button>
            ))}
          </div>
        </div>
      </div>
      <DataTable title="最近冲动记录" rows={logs} columns={['logged_at', 'urge_score', 'location', 'before_urge', 'result']} endpoint="/api/urge-logs" onDeleted={load} />
    </section>
  );
}

function maxUrgeScore(logs: Array<{ urge_score?: number }>) {
  if (logs.length === 0) return 0;
  return Math.max(...logs.map(log => Number(log.urge_score || 0)));
}

function weeklyUrgeCount(logs: Array<{ logged_at?: string }>) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  cutoff.setHours(0, 0, 0, 0);
  return logs.filter(log => {
    if (!log.logged_at) return false;
    const date = new Date(log.logged_at);
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  }).length;
}

function Finance({ onSaved, notify }: { onSaved: () => void; notify: (message: string) => void }) {
  const [rows, setRows] = useState<FinanceEntry[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [form, setForm] = useState({ entry_date: today(), type: '支出', amount: 0, account_id: 0, category: '', note: '' });
  const [accountForm, setAccountForm] = useState({ name: '', account_type: '银行账户' as FinanceAccount['account_type'], opening_balance: 0 });
  const load = async () => {
    const [nextRows, nextAccounts] = await Promise.all([
      api.get<FinanceEntry[]>('/api/finance'),
      api.get<FinanceAccount[]>('/api/finance-accounts'),
    ]);
    setRows(nextRows);
    setAccounts(nextAccounts);
    setForm(current => current.account_id || !nextAccounts.length ? current : { ...current, account_id: nextAccounts[0].id });
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    await api.send('/api/finance', 'POST', form);
    setForm({ ...form, amount: 0, category: '', note: '' });
    await load(); onSaved();
  };
  const saveAccount = async () => {
    await api.send('/api/finance-accounts', 'POST', accountForm);
    setAccountForm({ ...accountForm, name: '', opening_balance: 0 });
    await load(); onSaved();
  };
  const removeAccount = async (id: number) => {
    try {
      await api.send(`/api/finance-accounts/${id}`, 'DELETE');
      await load(); onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : '账户删除失败');
    }
  };
  const totals = financeTypeTotals(accounts);
  return <section className="stack">
    <div className="grid four">
      <Metric icon={<PiggyBank />} label="目前存款" value={money(totals.total)} hint={`${accounts.length} 个资金账户`} />
      <Metric icon={<PiggyBank />} label="银行账户" value={money(totals['银行账户'])} hint="银行卡及储蓄账户" />
      <Metric icon={<PiggyBank />} label="现金" value={money(totals['现金'])} hint="随身及备用现金" />
      <Metric icon={<PiggyBank />} label="保险" value={money(totals['保险'])} hint="保险现金价值" />
    </div>
    <div className="finance-overview">
      <div className="panel">
        <div className="panel-head"><h3>存款分布</h3><span>{money(totals.total)}</span></div>
        <FinancePie totals={totals} />
      </div>
      <div className="panel">
        <div className="panel-head"><h3>资金账户</h3><span>{accounts.length} 个</span></div>
        <div className="finance-account-list">
          {accounts.map(account => <div className="finance-account" key={account.id}>
            <span className={`finance-dot finance-dot-${account.account_type}`} />
            <div><strong>{account.name}</strong><small>{account.account_type}</small></div>
            <b>{money(account.balance)}</b>
            <button className="icon danger" onClick={() => removeAccount(account.id)} title="删除账户"><Trash2 size={15} /></button>
          </div>)}
        </div>
      </div>
    </div>
    <RecordPage title="新增资金账户" button="添加账户" form={<>
      <Field label="账户名称"><input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="例如：招商银行工资卡" /></Field>
      <Field label="账户类型"><select value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value as FinanceAccount['account_type'] })}><option>银行账户</option><option>现金</option><option>保险</option></select></Field>
      <Field label="期初余额"><NumberInput value={accountForm.opening_balance} onChange={opening_balance => setAccountForm({ ...accountForm, opening_balance })} /></Field>
    </>} onSave={saveAccount} table={null} />
    <RecordPage title="新增财务记录" button="保存记录" form={<>
      <Field label="日期"><DateInput value={form.entry_date} onChange={entry_date => setForm({ ...form, entry_date })} /></Field>
      <Field label="类型"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>支出</option><option>收入</option><option>存款</option></select></Field>
      <Field label="资金账户"><select value={form.account_id} onChange={e => setForm({ ...form, account_id: Number(e.target.value) })}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
      <Field label="金额"><NumberInput value={form.amount} onChange={amount => setForm({ ...form, amount })} /></Field>
      <Field label="分类"><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></Field>
      <Field label="备注"><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
    </>} onSave={save} table={<DataTable title="财务记录" rows={rows} columns={['entry_date', 'type', 'amount', 'account_name', 'category', 'note']} endpoint="/api/finance" onDeleted={async () => { await load(); onSaved(); }} />} />
  </section>;
}

function financeTypeTotals(accounts: FinanceAccount[]) {
  const totals = { '银行账户': 0, '现金': 0, '保险': 0, total: 0 };
  accounts.forEach(account => {
    totals[account.account_type] += Number(account.balance || 0);
    totals.total += Number(account.balance || 0);
  });
  return totals;
}

function FinancePie({ totals }: { totals: ReturnType<typeof financeTypeTotals> }) {
  const types = ['银行账户', '现金', '保险'] as const;
  const colors = { '银行账户': '#207456', '现金': '#d4a54f', '保险': '#7193b5' };
  const chartTotal = types.reduce((sum, type) => sum + Math.max(totals[type], 0), 0);
  let cursor = 0;
  const stops = types.map(type => {
    const start = cursor;
    cursor += chartTotal > 0 ? Math.max(totals[type], 0) / chartTotal * 100 : 0;
    return `${colors[type]} ${start}% ${cursor}%`;
  });
  return <div className="finance-pie-layout">
    <div className="finance-pie" style={{ background: chartTotal > 0 ? `conic-gradient(${stops.join(', ')})` : '#e8eeea' }}><span>{money(totals.total)}</span></div>
    <div className="finance-legend">{types.map(type => <div key={type}><i style={{ background: colors[type] }} /><span>{type}</span><strong>{money(totals[type])}</strong></div>)}</div>
  </div>;
}

function Body({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<BodyLog[]>([]);
  const [form, setForm] = useState({ entry_date: today(), weight: '', exercise_type: '', exercise_minutes: 0, sleep_hours: '', stayed_up_late: false, posture_training: false, note: '' });
  const load = async () => setRows(await api.get('/api/body'));
  useEffect(() => { load(); }, []);
  const save = async () => {
    await api.send('/api/body', 'POST', form);
    setForm({ ...form, exercise_type: '', exercise_minutes: 0, note: '' });
    await load(); onSaved();
  };
  return <RecordPage title="新增身体记录" button="保存记录" className="body-record-form" form={<>
    <Field label="日期"><DateInput value={form.entry_date} onChange={entry_date => setForm({ ...form, entry_date })} /></Field>
    <Field label="体重"><input value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="例如 65.5" /></Field>
    <Field label="运动类型"><input value={form.exercise_type} onChange={e => setForm({ ...form, exercise_type: e.target.value })} placeholder="力量 / 快走 / 拉伸" /></Field>
    <Field label="运动分钟"><NumberInput value={form.exercise_minutes} onChange={value => setForm({ ...form, exercise_minutes: value })} /></Field>
    <Field label="睡眠小时"><input value={form.sleep_hours} onChange={e => setForm({ ...form, sleep_hours: e.target.value })} placeholder="例如 7.5" /></Field>
    <Toggle label="熬夜" checked={form.stayed_up_late} onChange={v => setForm({ ...form, stayed_up_late: v })} />
    <Toggle label="完成体态训练" checked={form.posture_training} onChange={v => setForm({ ...form, posture_training: v })} />
    <Field label="备注" className="field-wide"><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="今天身体状态、疼痛、疲劳、训练感受" /></Field>
  </>} onSave={save} table={<DataTable title="身体记录" rows={rows} columns={['entry_date', 'weight', 'exercise_type', 'exercise_minutes', 'sleep_hours', 'stayed_up_late', 'posture_training', 'note']} endpoint="/api/body" onDeleted={load} />} />;
}

function Career({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<CareerLog[]>([]);
  const [form, setForm] = useState({ entry_date: today(), topic: '', learning_minutes: 25, output: '', project_scene: '', next_step: '' });
  const [selectedRoute, setSelectedRoute] = useState<typeof careerRouteDetails[number] | null>(null);
  const load = async () => setRows(await api.get('/api/career'));
  useEffect(() => { load(); }, []);
  const save = async () => {
    await api.send('/api/career', 'POST', form);
    setForm({ ...form, topic: '', output: '', project_scene: '', next_step: '' });
    await load(); onSaved();
  };
  return <section className="stack">
    <div className="panel">
      <div className="panel-head"><h3>6个月路线重点</h3></div>
      <div className="route">
        {careerRouteDetails.map((item, index) => (
          <button key={item.title} onClick={() => setSelectedRoute(item)}>
            <span>{index + 1}. {item.title}</span>
            <small>{item.period}</small>
          </button>
        ))}
      </div>
    </div>
    <RecordPage title="新增事业记录" button="保存记录" form={<>
      <Field label="日期"><DateInput value={form.entry_date} onChange={entry_date => setForm({ ...form, entry_date })} /></Field>
      <Field label="学习主题"><input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} /></Field>
      <Field label="学习分钟"><NumberInput value={form.learning_minutes} onChange={value => setForm({ ...form, learning_minutes: value })} /></Field>
      <Field label="输出物"><textarea value={form.output} onChange={e => setForm({ ...form, output: e.target.value })} /></Field>
      <Field label="项目场景"><textarea value={form.project_scene} onChange={e => setForm({ ...form, project_scene: e.target.value })} /></Field>
      <Field label="下一步"><textarea value={form.next_step} onChange={e => setForm({ ...form, next_step: e.target.value })} /></Field>
    </>} onSave={save} table={<DataTable title="事业记录" rows={rows} columns={['entry_date', 'topic', 'learning_minutes', 'output', 'project_scene', 'next_step']} endpoint="/api/career" onDeleted={load} />} />
    {selectedRoute && <RouteModal route={selectedRoute} onClose={() => setSelectedRoute(null)} />}
  </section>;
}

function RouteModal({ route, onClose }: { route: typeof careerRouteDetails[number]; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span>{route.period}</span>
            <h3>{route.title}</h3>
          </div>
          <button className="ghost" onClick={onClose}>关闭</button>
        </div>
        <p className="modal-goal">{route.goal}</p>
        <div className="modal-grid">
          <div>
            <h4>要学习什么</h4>
            <ul>{route.learn.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h4>必须产出什么</h4>
            <ul>{route.outputs.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Reviews({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<Review[]>([]);
  const [draft, setDraft] = useState({ review_type: '周复盘', period_start: today(), period_end: today(), metrics: '', main_problem: '', next_bottom_line: '', next_actions: '' });
  const load = async () => setRows(await api.get('/api/reviews'));
  useEffect(() => { load(); }, []);
  const generate = async (type: 'week' | 'month') => setDraft(await api.get(`/api/review-draft?type=${type}`));
  const save = async () => {
    await api.send('/api/reviews', 'POST', draft);
    await load(); onSaved();
  };
  return <section className="stack">
    <div className="panel wide">
      <div className="panel-head"><h3>生成复盘</h3><div className="actions"><button className="ghost" onClick={() => generate('week')}>周复盘草稿</button><button className="ghost" onClick={() => generate('month')}>月复盘草稿</button><button onClick={save}><Save size={16} /> 保存复盘</button></div></div>
      <div className="form-grid">
        <Field label="类型"><input value={draft.review_type} onChange={e => setDraft({ ...draft, review_type: e.target.value })} /></Field>
        <Field label="开始"><DateInput value={draft.period_start} onChange={period_start => setDraft({ ...draft, period_start })} /></Field>
        <Field label="结束"><DateInput value={draft.period_end} onChange={period_end => setDraft({ ...draft, period_end })} /></Field>
        <Field label="数据摘要"><textarea value={draft.metrics} onChange={e => setDraft({ ...draft, metrics: e.target.value })} /></Field>
        <Field label="最大问题"><textarea value={draft.main_problem} onChange={e => setDraft({ ...draft, main_problem: e.target.value })} /></Field>
        <Field label="下周底线"><textarea value={draft.next_bottom_line} onChange={e => setDraft({ ...draft, next_bottom_line: e.target.value })} /></Field>
        <Field label="下周行动"><textarea value={draft.next_actions} onChange={e => setDraft({ ...draft, next_actions: e.target.value })} /></Field>
      </div>
    </div>
    <DataTable title="复盘记录" rows={rows} columns={['review_type', 'period_start', 'period_end', 'metrics', 'main_problem', 'next_actions']} endpoint="/api/reviews" onDeleted={load} />
  </section>;
}

function Notes() {
  const empty = { note_date: today(), title: '', content: '', tags: '' };
  const [notes, setNotes] = useState<Note[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const noteRefs = useRef<Record<number, HTMLElement | null>>({});

  const load = async (keyword = query) => {
    const suffix = keyword.trim() ? `?q=${encodeURIComponent(keyword.trim())}` : '';
    setNotes(await api.get(`/api/notes${suffix}`));
  };

  useEffect(() => {
    load('');
  }, []);

  const save = async () => {
    if (!form.title.trim()) return;
    if (editingId) {
      await api.send(`/api/notes/${editingId}`, 'PUT', form);
    } else {
      await api.send('/api/notes', 'POST', form);
    }
    setForm(empty);
    setEditingId(null);
    await load();
  };

  const edit = (note: Note) => {
    setEditingId(note.id);
    setForm({
      note_date: note.note_date,
      title: note.title,
      content: note.content,
      tags: note.tags,
    });
  };

  const remove = async (note: Note) => {
    await api.send(`/api/notes/${note.id}`, 'DELETE');
    if (editingId === note.id) {
      setEditingId(null);
      setForm(empty);
    }
    await load();
  };

  return (
    <section className="stack">
      <div className="panel wide note-editor">
        <div className="panel-head">
          <h3>{editingId ? '编辑人生感悟' : '新增人生感悟'}</h3>
          <div className="actions">
            {editingId && <button className="ghost" onClick={() => { setEditingId(null); setForm(empty); }}>取消编辑</button>}
            <button onClick={save}><Save size={16} /> 保存笔记</button>
          </div>
        </div>
        <div className="form-grid notes-grid">
          <Field label="日期"><DateInput value={form.note_date} onChange={note_date => setForm({ ...form, note_date })} /></Field>
          <Field label="标题" className="field-wide"><input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="这一刻我想明白了什么" /></Field>
          <Field label="标签" className="field-wide"><input value={form.tags} onChange={event => setForm({ ...form, tags: event.target.value })} placeholder="成长 / 关系 / 职业 / 自控" /></Field>
          <Field label="内容（Markdown）" className="note-content-field"><textarea value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder={'# 今天的感悟\n\n我意识到：\n\n- \n- \n\n**下一步行动：**'} /></Field>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>笔记列表</h3>
          <div className="note-search">
            <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') load(); }} placeholder="搜索标题、内容或标签" />
            <button className="ghost" onClick={() => load()}>搜索</button>
          </div>
        </div>
        <div className="notes-list">
          {notes.length === 0 && <div className="empty-state">还没有笔记。先写一条今天的感悟。</div>}
          {notes.map(note => (
            <article ref={element => { noteRefs.current[note.id] = element; }} className={expandedId === note.id ? 'note-card expanded' : 'note-card'} key={note.id}>
              <button className="note-summary" onClick={() => {
                const nextId = expandedId === note.id ? null : note.id;
                setExpandedId(nextId);
                if (nextId) {
                  window.setTimeout(() => {
                    noteRefs.current[note.id]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                  }, 0);
                }
              }}>
                <span>{note.note_date}</span>
                <h3>{note.title}</h3>
                {note.tags && <p className="note-tags">{note.tags}</p>}
                {!expandedId || expandedId !== note.id ? <p className="note-excerpt">{plainText(note.content).slice(0, 90) || '点击查看完整内容'}</p> : null}
              </button>
              <div className="note-actions">
                <button className="ghost" onClick={() => edit(note)}>编辑</button>
                <button className="icon danger" onClick={() => remove(note)} title="删除"><Trash2 size={15} /></button>
              </div>
              {expandedId === note.id && note.content && (
                <div className="note-full">
                  <MarkdownPreview content={note.content} />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function plainText(markdown: string) {
  return markdown
    .replace(/[#>*_`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function MarkdownPreview({ content }: { content: string }) {
  return <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
}

function renderMarkdown(markdown: string) {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = escaped.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  const inline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

  for (const line of lines) {
    if (/^-\s+/.test(line)) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(line.replace(/^-\s+/, ''))}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (/^###\s+/.test(line)) html.push(`<h4>${inline(line.replace(/^###\s+/, ''))}</h4>`);
    else if (/^##\s+/.test(line)) html.push(`<h3>${inline(line.replace(/^##\s+/, ''))}</h3>`);
    else if (/^#\s+/.test(line)) html.push(`<h2>${inline(line.replace(/^#\s+/, ''))}</h2>`);
    else if (line.trim()) html.push(`<p>${inline(line)}</p>`);
  }
  if (inList) html.push('</ul>');
  return html.join('');
}

function SettingsPage({ summary, onSaved, notify }: { summary: Summary; onSaved: () => void; notify: (message: string) => void }) {
  const [form, setForm] = useState(summary.settings);
  const save = async () => {
    await api.send('/api/settings', 'PUT', form);
    onSaved();
  };
  const reset = () => {
    if (!window.confirm('确定清除这台设备上的全部人生系统数据吗？此操作无法撤销。')) return;
    resetNativeData();
    onSaved();
    notify('本机数据已清除。');
  };
  return <section className="panel wide">
    <div className="panel-head"><h3>目标设置</h3><button onClick={save}><Save size={16} /> 保存设置</button></div>
    <div className="form-grid settings-grid">
      <Field label="目标存款"><input value={form.target_savings || ''} onChange={e => setForm({ ...form, target_savings: e.target.value })} /></Field>
      <Field label="30岁目标日期"><DateInput value={form.target_date || ''} onChange={target_date => setForm({ ...form, target_date })} /></Field>
      <Field label="每日运动目标分钟"><input value={form.daily_exercise_target || ''} onChange={e => setForm({ ...form, daily_exercise_target: e.target.value })} /></Field>
      <Field label="每日事业学习分钟"><input value={form.daily_career_target || ''} onChange={e => setForm({ ...form, daily_career_target: e.target.value })} /></Field>
      <SettingSwitch
        title="首页隐私模式"
        description="开启后首页使用中性文案，敏感内容只在详情页显示。"
        checked={form.privacy_mode === '1'}
        onChange={v => setForm({ ...form, privacy_mode: v ? '1' : '0' })}
      />
    </div>
    {useLocalStorage && <SyncSettings notify={notify} />}
    {useLocalStorage
      ? <div className="note settings-note">
          数据仅保存在这台设备上。
          {privacyPolicyUrl && <> <a href={privacyPolicyUrl} target="_blank" rel="noreferrer">隐私政策</a></>}
          {' '}<button className="ghost danger" onClick={reset}><Trash2 size={15} /> 清除本机数据</button>
        </div>
      : <div className="note settings-note">数据库在 <code>life-web\data\life_system.sqlite3</code>，定期复制这个文件即可备份。</div>}
  </section>;
}

function SyncSettings({ notify }: { notify: (message: string) => void }) {
  const [status, setStatus] = useState(getSyncStatus());
  const [loggedIn, setLoggedIn] = useState(isSyncLoggedIn());
  const [username, setUsername] = useState(getSyncUsername());
  const [password, setPassword] = useState('');

  useEffect(() => {
    const update = (event: Event) => setStatus((event as CustomEvent).detail);
    window.addEventListener(SYNC_STATUS_EVENT, update);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, update);
  }, []);

  const login = async () => {
    try {
      await loginSyncAccount(username, password);
      setUsername(getSyncUsername());
      setPassword('');
      setLoggedIn(true);
      notify('已登录同步账号。');
    } catch {
      // The sync status event presents the server validation error.
    }
  };

  const register = async () => {
    try {
      await registerSyncAccount(username, password);
      setUsername(getSyncUsername());
      setPassword('');
      setLoggedIn(true);
      notify('同步账号已创建。');
    } catch {
      // The sync status event presents the server validation error.
    }
  };

  const logout = async () => {
    await logoutSyncAccount();
    setLoggedIn(false);
    setPassword('');
    notify('已退出同步账号。');
  };

  return (
    <div className="sync-card">
      <div className="sync-card-head">
        <div className="sync-icon"><Cloud size={18} /></div>
        <div>
          <strong>Web 与 PWA 加密同步</strong>
          <p>在浏览器和安装版 PWA 中登录同一个账号即可同步。密码用于本机加密和登录校验，云端只保存密文。</p>
        </div>
      </div>
      {loggedIn
        ? <div className="sync-account-row"><strong>已登录：{getSyncUsername()}</strong></div>
        : <div className="sync-code-row">
            <input value={username} onChange={event => setUsername(event.target.value)} placeholder="账号：3-32 位字母、数字、下划线或短横线" autoCapitalize="none" />
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="密码：至少 8 位" />
            <button className="ghost" onClick={register} disabled={!username.trim() || password.length < 8}>注册</button>
            <button onClick={login} disabled={!username.trim() || password.length < 8}>登录</button>
          </div>}
      <div className={`sync-status ${status.state}`}>
        <span>{status.message}</span>
        <div>
          {loggedIn && <button className="ghost" onClick={() => syncNow()} disabled={status.state === 'syncing'}><RefreshCw size={14} /> 立即同步</button>}
          {loggedIn && <button className="ghost danger" onClick={logout}>退出账号</button>}
        </div>
      </div>
    </div>
  );
}

function SettingSwitch({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="setting-switch">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span className="switch-visual" />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

function RecordPage({ title, button, form, onSave, table, className = '' }: { title: string; button: string; form: React.ReactNode; onSave: () => void; table: React.ReactNode; className?: string }) {
  return <section className="stack">
    <div className="panel wide">
      <div className="panel-head"><h3>{title}</h3><button onClick={onSave}><Plus size={16} /> {button}</button></div>
      <div className={`form-grid ${className}`.trim()}>{form}</div>
    </div>
    {table}
  </section>;
}

function DataTable({ title, rows, columns, endpoint, onDeleted }: { title: string; rows: any[]; columns: string[]; endpoint: string; onDeleted: () => void }) {
  const remove = async (id: number) => {
    await api.send(`${endpoint}/${id}`, 'DELETE');
    onDeleted();
  };
  return <div className="panel">
    <div className="panel-head"><h3>{title}</h3><span>{rows.length} 条</span></div>
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(col => <th key={col}>{columnLabels[col] || col}</th>)}<th></th></tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.id}>
            {columns.map(col => <td key={col} data-label={columnLabels[col] || col}>{String(row[col] ?? '')}</td>)}
            <td className="table-actions"><button className="icon danger" onClick={() => remove(row.id)} title="删除"><Trash2 size={15} /></button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.MODE === 'pwa') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
