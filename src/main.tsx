import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import {
  Activity,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudUpload,
  Dumbbell,
  Home,
  Menu,
  Play,
  PiggyBank,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  TimerReset,
  Trash2,
  Volume2,
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
const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus());
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
    const unsubscribe = initializeDataSync(refresh);
    const onStatus = (event: Event) => setSyncStatus((event as CustomEvent).detail);
    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    return () => {
      unsubscribe();
      window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
    };
  }, []);

  const handleTopbarAction = async () => {
    if (useLocalStorage) {
      if (isSyncLoggedIn()) {
        if (syncStatus.state === 'syncing') return;
        await syncNow();
      } else {
        notify('请先在设置中登录同步账号');
      }
    } else {
      await refresh();
    }
  };

  const topbarActionLabel = useLocalStorage && isSyncLoggedIn()
    ? (syncStatus.state === 'syncing' ? '同步中…' : '同步账号数据')
    : useLocalStorage
      ? '同步账号数据'
      : '刷新数据';
  const topbarActionIcon = useLocalStorage ? <CloudUpload size={18} /> : <RefreshCw size={18} />;

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    resetScroll();
    window.requestAnimationFrame(resetScroll);
  }, [page]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const nav = [
    ['dashboard', '总看板', Home],
    ['self-control', '自控系统', ShieldCheck],
    ['finance', '存钱系统', PiggyBank],
    ['body', '身体系统', Dumbbell],
    ['career', '事业系统', BriefcaseBusiness],
    ['notes', '笔记', BookOpen],
    ['reviews', '复盘', BarChart3],
    ['settings', '设置', Settings],
  ] as const;
  const bottomNav = nav.filter(([id]) => ['dashboard', 'self-control', 'finance', 'body', 'settings'].includes(id));

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
              <p className="topbar-page-kicker">{recordStartDate} 起持续记录</p>
              <h1><Cloud className="app-title-cloud" size={25} />{nav.find(([id]) => id === page)?.[1]}</h1>
            </div>
          </div>
          <button className="ghost topbar-action" onClick={handleTopbarAction} disabled={useLocalStorage && syncStatus.state === 'syncing'} aria-label={topbarActionLabel}>
            {topbarActionIcon}
            <span>{topbarActionLabel}</span>
          </button>
        </header>

        {error && <div className="error">后端连接异常：{error}</div>}
        {notice && <div className="toast">{notice}</div>}
        {!summary && !error && <div className="loading">正在读取本地数据库...</div>}

        {summary && page === 'dashboard' && <Dashboard summary={summary} onNavigate={setPage} onSaved={refresh} notify={notify} />}
        {summary && page === 'self-control' && <SelfControl summary={summary} onSaved={refresh} notify={notify} />}
        {summary && page === 'finance' && <Finance onSaved={refresh} notify={notify} />}
        {summary && page === 'body' && <Body onSaved={refresh} />}
        {summary && page === 'career' && <Career onSaved={refresh} />}
        {summary && page === 'notes' && <Notes />}
        {summary && page === 'reviews' && <Reviews onSaved={refresh} />}
        {summary && page === 'settings' && <SettingsPage summary={summary} onSaved={refresh} notify={notify} />}
      </main>
      <nav className="mobile-tabbar" aria-label="底部主导航">
        {bottomNav.map(([id, label, Icon]) => (
          <button className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)}>
            <Icon size={21} />
            <span>{label.replace('总看板', '首页').replace('自控系统', '自控').replace('存钱系统', '数据').replace('身体系统', '身体')}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Dashboard({ summary, onNavigate, onSaved, notify }: { summary: Summary; onNavigate: (page: string) => void; onSaved: () => void; notify: (message: string) => void }) {
  const progress = Math.min((summary.finance.total_savings / summary.finance.target) * 100, 100);

  return (
    <section className="stack">
      <EditableHero summary={summary} onSaved={onSaved} notify={notify} />

      <div className="grid four metric-grid">
        <MetricButton icon={<ShieldCheck />} label="30天自控记录" value={`${summary.self_control.days_logged}/30天`} hint={`中断 ${summary.self_control.breaches} 天`} onClick={() => onNavigate('self-control')} />
        <MetricButton icon={<PiggyBank />} label="存款进度" value={money(summary.finance.total_savings)} hint={`还差 ${money(summary.finance.remaining)}`} onClick={() => onNavigate('finance')} />
        <MetricButton icon={<Dumbbell />} label="近7天运动" value={`${summary.body.exercise_minutes || 0}分钟`} hint={`熬夜 ${summary.body.late_days || 0} 天`} onClick={() => onNavigate('body')} />
        <MetricButton icon={<BriefcaseBusiness />} label="近7天事业学习" value={`${summary.career.career_minutes || 0}分钟`} hint="目标每周至少175分钟" onClick={() => onNavigate('career')} />
      </div>

      <CalendarPage onSaved={onSaved} notify={notify} embedded />

      <div className="panel">
        <div className="panel-head">
          <h3>40万目标</h3>
          <span>{progress.toFixed(1)}%</span>
        </div>
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
      </div>

      <div className="life-pillars" aria-label="人生系统四个核心模块">
        <button onClick={() => onNavigate('self-control')}>
          <ShieldCheck size={28} />
          <span>自律打卡</span>
          <small>养成好习惯</small>
        </button>
        <button onClick={() => onNavigate('finance')}>
          <PiggyBank size={28} />
          <span>财务自由</span>
          <small>存钱更有目标</small>
        </button>
        <button onClick={() => onNavigate('body')}>
          <Activity size={28} />
          <span>健康生活</span>
          <small>运动饮食管理</small>
        </button>
        <button onClick={() => onNavigate('career')}>
          <BriefcaseBusiness size={28} />
          <span>事业成长</span>
          <small>学习与成长</small>
        </button>
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

function CalendarPage({ onSaved, notify, embedded = false }: { onSaved: () => void; notify: (message: string) => void; embedded?: boolean }) {
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

  const calendarPanel = (
    <div className={`panel calendar-panel ${embedded ? 'embedded' : ''}`}>
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
  );

  const detailPanel = (
    <div className="panel calendar-detail">
      <div className="panel-head">
        <div>
          <h3>{selectedDate} 待办</h3>
          <p>{selectedTodos.length ? `共 ${selectedTodos.length} 项，已完成 ${selectedTodos.filter(todo => todo.is_done).length} 项` : '当天还没有安排'}</p>
        </div>
      </div>
      <EditableTodos date={selectedDate} initialTodos={selectedTodos} onSaved={handleSaved} notify={notify} />
    </div>
  );

  if (embedded) {
    return (
      <div className="calendar-layout embedded">
        {calendarPanel}
        {detailPanel}
      </div>
    );
  }

  return (
    <section className="calendar-layout">
      {calendarPanel}
      {detailPanel}
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

function MetricButton({ icon, label, value, hint, onClick }: { icon: React.ReactNode; label: string; value: string; hint: string; onClick: () => void }) {
  return (
    <button className="metric metric-button" type="button" onClick={onClick} aria-label={`进入${label}`}>
      <div className="metric-button-top">
        <div className="metric-icon">{icon}</div>
        <ChevronRight size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </button>
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
  precision = 0,
}: {
  value: number | string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  precision?: number;
}) {
  const [text, setText] = useState(value === 0 ? '' : String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const pattern = precision > 0 ? new RegExp(`^\\d*\\.?\\d{0,${precision}}$`) : /^\d*$/;

  useEffect(() => {
    if (!focusedRef.current) setText(value === 0 ? '' : String(value ?? ''));
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

  const appendDecimalPoint = () => {
    if (precision === 0 || text.includes('.')) return;
    setText(`${text || '0'}.`);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const input = (
    <input
      ref={inputRef}
      type="text"
      inputMode={precision > 0 ? 'decimal' : 'numeric'}
      value={text}
      placeholder={placeholder ?? '0'}
      onChange={event => {
        const raw = event.target.value.replace(',', '.');
        if (pattern.test(raw)) {
          setText(raw);
          if (raw !== '' && raw !== '.') onChange(Number(raw));
        }
      }}
      onFocus={() => {
        focusedRef.current = true;
        if (text === '0') setText('');
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit(text);
      }}
    />
  );
  return precision > 0
    ? <div className="decimal-input">{input}<button type="button" className="decimal-key" onClick={appendDecimalPoint} aria-label="输入小数点">.</button></div>
    : input;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const motivationTracks = [
  { file: '1.mp3', text: '守住今天，不给冲动任何借口。' },
  { file: '2.mp3', text: '短暂的冲动会过去，清醒和自尊会留下。' },
  { file: '3.mp3', text: '现在立刻离开触发环境，把注意力交还给自己。' },
  { file: '4.mp3', text: '坚持不是等待感觉变好，而是在当下做正确的动作。' },
  { file: '5.mp3', text: '你只需要赢下眼前这十分钟。' },
];

function SelfControl({ summary, onSaved, notify }: { summary: Summary; onSaved: () => void; notify: (message: string) => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [form, setForm] = useState({ logged_at: new Date().toISOString().slice(0, 16).replace('T', ' '), urge_score: 5, location: '', before_urge: '', feeling: '', delay_action: '', result: '' });
  const [motivationIndex, setMotivationIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [emergencySeconds, setEmergencySeconds] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = async () => {
    setLogs(await api.get('/api/urge-logs'));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (emergencySeconds === null || emergencySeconds <= 0) return;
    const timer = window.setInterval(() => setEmergencySeconds(seconds => seconds === null ? null : Math.max(seconds - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [emergencySeconds]);

  const save = async () => {
    await api.send('/api/urge-logs', 'POST', form);
    setForm({ ...form, before_urge: '', feeling: '', delay_action: '', result: '' });
    await load();
    onSaved();
  };

  const playMotivation = async () => {
    const next = motivationTracks.length === 1 ? 0 : (motivationIndex + 1 + Math.floor(Math.random() * (motivationTracks.length - 1))) % motivationTracks.length;
    const audio = audioRef.current;
    if (!audio) return;
    setMotivationIndex(next);
    audio.src = `/audio/motivation/${motivationTracks[next].file}`;
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      notify('音频播放失败，请确认浏览器允许播放声音。');
    }
  };

  return (
    <section className="stack">
      <div className="grid four metric-grid">
        <Metric icon={<ShieldCheck />} label="30天打卡" value={`${summary.self_control.days_logged}/30天`} hint={`稳定 ${summary.self_control.clean_days} 天`} />
        <Metric icon={<Activity />} label="冲动记录" value={`${logs.length}条`} hint="来自下方冲动记录" />
        <Metric icon={<ShieldCheck />} label="最高冲动分" value={`${maxUrgeScore(logs)}/10`} hint="用于识别高危场景" />
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
        <div className="stack">
          <div className="panel motivation-panel">
            <div className="panel-head"><h3>守住当下</h3><span>随机激励语音</span></div>
            <p>{motivationTracks[motivationIndex].text}</p>
            <button className="motivation-play" onClick={playMotivation}><Volume2 size={18} /> {isPlaying ? '随机播放另一段' : '播放一段激励语音'}</button>
            <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
          </div>
          <div className={`panel emergency-panel ${emergencySeconds !== null ? 'active' : ''}`}>
            <div className="panel-head"><h3>10 分钟应急模式</h3><TimerReset size={19} /></div>
            {emergencySeconds === null
              ? <><p>冲动出现时立即启动。先离开触发环境，再完成一个替代动作。</p><button onClick={() => setEmergencySeconds(600)}><Play size={17} /> 启动应急模式</button></>
              : <><strong className="emergency-timer">{formatCountdown(emergencySeconds)}</strong><div className="emergency-actions"><span>1. 离开当前环境</span><span>2. 手机放到远处</span><span>3. 喝水、散步或深蹲</span></div><button className="ghost" onClick={() => setEmergencySeconds(null)}>结束应急模式</button></>}
          </div>
        </div>
      </div>
      <RiskInsights logs={logs} />
      <DataTable title="最近冲动记录" rows={logs} columns={['logged_at', 'urge_score', 'location', 'before_urge', 'result']} endpoint="/api/urge-logs" onDeleted={load} />
    </section>
  );
}

function formatCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function RiskInsights({ logs }: { logs: Array<{ logged_at?: string; location?: string; before_urge?: string; delay_action?: string }> }) {
  const recent = logs.slice(0, 30);
  const highRiskHour = mostCommon(recent.map(log => {
    const hour = Number(String(log.logged_at || '').slice(11, 13));
    return Number.isNaN(hour) ? '' : `${String(hour).padStart(2, '0')}:00 - ${String((hour + 1) % 24).padStart(2, '0')}:00`;
  }));
  const cards = [
    ['高危时段', highRiskHour],
    ['高频地点', mostCommon(recent.map(log => log.location || ''))],
    ['常见诱因', mostCommon(recent.map(log => log.before_urge || ''))],
    ['有效替代动作', mostCommon(recent.map(log => log.delay_action || ''))],
  ];
  return <div className="panel">
    <div className="panel-head"><h3>高危场景摘要</h3><span>最近 {recent.length} 条记录</span></div>
    <div className="risk-insights">{cards.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || '等待记录'}</strong></div>)}</div>
  </div>;
}

function mostCommon(values: string[]) {
  const counts = values.map(value => value.trim()).filter(Boolean).reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] || 0) + 1 }), {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
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
  const [form, setForm] = useState({ entry_date: today(), type: '支出', amount: 0, account_id: 0, category: financeCategories['支出'][0], note: '' });
  const [editingEntryId, setEditingEntryId] = useState(0);
  const [editingAccountId, setEditingAccountId] = useState(0);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [activePane, setActivePane] = useState(0);
  const activePaneRef = useRef(0);
  const [financeFilterDate, setFinanceFilterDate] = useState(today());
  const [accountForm, setAccountForm] = useState({ name: '', account_type: '银行账户' as FinanceAccount['account_type'], balance: 0 });
  const sectionRef = useRef<HTMLElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const panes = ['存款概览', '新增流水', '财务记录', '收支统计'];
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
    await api.send(editingEntryId ? `/api/finance/${editingEntryId}` : '/api/finance', editingEntryId ? 'PUT' : 'POST', form);
    setEditingEntryId(0);
    setForm({ ...form, amount: 0, category: financeCategories[form.type as keyof typeof financeCategories][0], note: '' });
    await load(); onSaved(); notify(editingEntryId ? '财务记录已更新。' : '财务记录已保存。');
  };
  const editEntry = (entry: FinanceEntry) => {
    setEditingEntryId(entry.id);
    setForm({ entry_date: entry.entry_date, type: entry.type, amount: entry.amount, account_id: entry.account_id, category: entry.category, note: entry.note });
    showPane(1);
  };
  const cancelEditEntry = () => {
    setEditingEntryId(0);
    setForm({ entry_date: today(), type: '支出', amount: 0, account_id: accounts[0]?.id || 0, category: financeCategories['支出'][0], note: '' });
  };
  const saveAccount = async () => {
    if (editingAccountId) {
      await api.send(`/api/finance-accounts/${editingAccountId}`, 'PUT', accountForm);
      notify('资金账户已更新。');
    } else {
      await api.send('/api/finance-accounts', 'POST', { ...accountForm, opening_balance: accountForm.balance });
      notify('资金账户已添加。');
    }
    setEditingAccountId(0);
    setAccountFormOpen(false);
    setAccountForm({ ...accountForm, name: '', balance: 0 });
    await load(); onSaved();
  };
  const editAccount = (account: FinanceAccount) => {
    setEditingAccountId(account.id);
    setAccountFormOpen(true);
    setAccountForm({ name: account.name, account_type: account.account_type, balance: account.balance });
  };
  const cancelEditAccount = () => {
    setEditingAccountId(0);
    setAccountFormOpen(false);
    setAccountForm({ name: '', account_type: '银行账户', balance: 0 });
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
  const filteredRows = useMemo(
    () => financeFilterDate ? rows.filter(row => row.entry_date === financeFilterDate) : rows,
    [financeFilterDate, rows],
  );
  const filteredExpenseTotal = useMemo(
    () => filteredRows.filter(row => row.type === '支出').reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [filteredRows],
  );
  const financeFilterSummary = financeFilterDate ? `${financeFilterDate} ${filteredRows.length} 条记录` : `全部 ${rows.length} 条记录`;
  const scrollFinanceTop = () => {
    if (!window.matchMedia('(max-width: 680px)').matches) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  };
  const showPane = (index: number) => {
    activePaneRef.current = index;
    setActivePane(index);
    scrollFinanceTop();
    const pager = pagerRef.current;
    if (pager && window.matchMedia('(max-width: 680px)').matches) {
      pager.scrollTo({ left: pager.clientWidth * index, behavior: 'smooth' });
    }
  };
  return <section className="finance-page" ref={sectionRef}>
    <div className="finance-tabs" role="tablist" aria-label="存钱系统页面">
      {panes.map((pane, index) => <button className={activePane === index ? 'active' : ''} key={pane} onClick={() => showPane(index)}>{pane}</button>)}
    </div>
    <div className="finance-pager" ref={pagerRef} onScroll={event => {
      const width = event.currentTarget.clientWidth;
      if (!width) return;
      const nextPane = Math.round(event.currentTarget.scrollLeft / width);
      if (nextPane !== activePaneRef.current) {
        activePaneRef.current = nextPane;
        setActivePane(nextPane);
        scrollFinanceTop();
      }
    }}>
      <div className="finance-pager-track">
        <div className={`finance-pane ${activePane === 0 ? 'active' : ''}`}>
          <div className="grid four metric-grid">
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
              <div className="panel-head"><h3>资金账户</h3><button className="ghost" onClick={() => { setEditingAccountId(0); setAccountFormOpen(true); setAccountForm({ name: '', account_type: '银行账户', balance: 0 }); }}><Plus size={15} /> 新增</button></div>
              <div className="finance-account-list">
                {accounts.map(account => <div className="finance-account" key={account.id}>
                  <span className={`finance-dot finance-dot-${account.account_type}`} />
                  <div><strong>{account.name}</strong><small>{account.account_type}</small></div>
                  <b>{money(account.balance)}</b>
                  <button className="icon" onClick={() => editAccount(account)} title="编辑账户"><Pencil size={15} /></button>
                  <button className="icon danger" onClick={() => removeAccount(account.id)} title="删除账户"><Trash2 size={15} /></button>
                </div>)}
              </div>
            </div>
          </div>
          {accountFormOpen && <RecordPage title={editingAccountId ? '修改资金账户' : '新增资金账户'} button={editingAccountId ? '保存修改' : '添加账户'} form={<>
            <Field label="账户名称"><input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="例如：招商银行工资卡" /></Field>
            <Field label="账户类型"><select value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value as FinanceAccount['account_type'] })}><option>银行账户</option><option>现金</option><option>保险</option></select></Field>
            <Field label={editingAccountId ? '当前余额' : '初始余额'}><NumberInput precision={2} value={accountForm.balance} onChange={balance => setAccountForm({ ...accountForm, balance })} /></Field>
            <button className="ghost" onClick={cancelEditAccount}>取消</button>
          </>} onSave={saveAccount} table={null} />}
        </div>
        <div className={`finance-pane ${activePane === 1 ? 'active' : ''}`}>
          <div className="panel wide">
            <div className="panel-head">
              <h3>{editingEntryId ? '修改财务记录' : '新增财务记录'}</h3>
              <span>{form.entry_date}</span>
            </div>
            <div className="form-grid finance-record-form">
              <Field label="日期"><DateInput value={form.entry_date} onChange={entry_date => setForm({ ...form, entry_date })} /></Field>
              <Field label="类型"><select value={form.type} onChange={e => {
                const type = e.target.value as keyof typeof financeCategories;
                setForm({ ...form, type, category: financeCategories[type][0] });
              }}><option>支出</option><option>收入</option><option>存款</option></select></Field>
              <Field label="资金账户"><select value={form.account_id} onChange={e => setForm({ ...form, account_id: Number(e.target.value) })}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
              <Field label="金额"><NumberInput precision={2} value={form.amount} onChange={amount => setForm({ ...form, amount })} /></Field>
              <Field label="分类"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{financeCategoryOptions(form.type, form.category).map(category => <option key={category}>{category}</option>)}</select></Field>
              <Field label="备注"><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
            </div>
            <div className="finance-record-actions">
              {editingEntryId > 0 && <button className="ghost" onClick={cancelEditEntry}>取消编辑</button>}
              <button onClick={save}><Save size={16} /> {editingEntryId ? '保存修改' : '保存记录'}</button>
            </div>
          </div>
        </div>
        <div className={`finance-pane ${activePane === 2 ? 'active' : ''}`}>
          <div className="panel finance-filter-panel">
            <div className="panel-head"><h3>日期筛选</h3><span>{financeFilterSummary}</span></div>
            <div className="finance-filter-grid">
              <Field label="筛选日期"><DateInput value={financeFilterDate} onChange={setFinanceFilterDate} /></Field>
              <Metric icon={<PiggyBank />} label="当日支出" value={money(filteredExpenseTotal)} hint={financeFilterDate || '未选择日期'} />
              <button className="ghost" onClick={() => setFinanceFilterDate('')}>查看全部</button>
              <button className="ghost" onClick={() => setFinanceFilterDate(today())}>回到今天</button>
            </div>
          </div>
          <DataTable title="财务记录" rows={filteredRows} columns={['entry_date', 'type', 'amount', 'account_name', 'category', 'note']} endpoint="/api/finance" onEdit={editEntry} onDeleted={async () => { await load(); onSaved(); }} />
        </div>
        <div className={`finance-pane ${activePane === 3 ? 'active' : ''}`}>
          <ExpenseStatistics rows={rows} />
        </div>
      </div>
    </div>
  </section>;
}

const financeCategories = {
  '支出': ['食品餐饮', '交通出行', '住房', '生活缴费', '医疗健康', '购物', '娱乐', '人情往来', '学习成长', '其他支出'],
  '收入': ['工资', '奖金', '副业收入', '投资收益', '退款', '其他收入'],
  '存款': ['储蓄转入', '定期存款', '基金', '保险', '其他存款'],
};

function financeCategoryOptions(type: string, category = '') {
  const options = financeCategories[type as keyof typeof financeCategories] || [];
  return category && !options.includes(category) ? [category, ...options] : options;
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

function ExpenseStatistics({ rows }: { rows: FinanceEntry[] }) {
  const expenses = rows.filter(row => row.type === '支出');
  const income = rows.filter(row => row.type === '收入').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const spending = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const topExpenses = [...expenses].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  const categoryTotals = expenseCategoryTotals(expenses);

  return <div className="stack">
    <div className="grid three finance-stat-metrics">
      <Metric icon={<BarChart3 />} label="总收入" value={money(income)} hint="全部收入记录合计" />
      <Metric icon={<BarChart3 />} label="总支出" value={money(spending)} hint="全部支出记录合计" />
      <Metric icon={<PiggyBank />} label="收支结余" value={money(income - spending)} hint="收入减去支出" />
    </div>
    <div className="panel">
      <div className="panel-head"><h3>金额前五的支出</h3><span>{topExpenses.length} 笔</span></div>
      <div className="expense-ranking">
        {topExpenses.map((row, index) => <div className="expense-ranking-row" key={row.id}>
          <b>{index + 1}</b>
          <div><strong>{row.category || '未分类'}</strong><small>{row.entry_date}{row.note ? ` · ${row.note}` : ''}</small></div>
          <span>{money(row.amount)}</span>
        </div>)}
        {!topExpenses.length && <p className="empty-copy">暂无支出记录</p>}
      </div>
    </div>
    <div className="panel">
      <div className="panel-head"><h3>支出占比</h3><span>{money(spending)}</span></div>
      <ExpensePie totals={categoryTotals} />
    </div>
  </div>;
}

function expenseCategoryTotals(rows: FinanceEntry[]) {
  return rows.reduce<Record<string, number>>((totals, row) => {
    const category = row.category || '未分类';
    totals[category] = (totals[category] || 0) + Number(row.amount || 0);
    return totals;
  }, {});
}

function ExpensePie({ totals }: { totals: Record<string, number> }) {
  const colors = ['#207456', '#d4a54f', '#7193b5', '#c47f65', '#7f79ad', '#6e9b86', '#c59cbd', '#a1a864', '#b7895f', '#78939a'];
  const categories = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = categories.reduce((sum, [, amount]) => sum + Math.max(amount, 0), 0);
  let cursor = 0;
  const stops = categories.map(([, amount], index) => {
    const start = cursor;
    cursor += total > 0 ? Math.max(amount, 0) / total * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return <div className="finance-pie-layout">
    <div className="finance-pie" style={{ background: total > 0 ? `conic-gradient(${stops.join(', ')})` : '#e8eeea' }}><span>{money(total)}</span></div>
    <div className="finance-legend">{categories.map(([category, amount], index) => <div key={category}><i style={{ background: colors[index % colors.length] }} /><span>{category}</span><strong>{money(amount)}</strong></div>)}</div>
  </div>;
}

function Body({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<BodyLog[]>([]);
  const [form, setForm] = useState<{
    entry_date: string;
    weight: number | string;
    exercise_type: string;
    exercise_minutes: number;
    sleep_hours: number | string;
    stayed_up_late: boolean;
    posture_training: boolean;
    note: string;
  }>({ entry_date: today(), weight: '', exercise_type: '', exercise_minutes: 0, sleep_hours: '', stayed_up_late: false, posture_training: false, note: '' });
  const load = async () => setRows(await api.get('/api/body'));
  useEffect(() => { load(); }, []);
  const save = async () => {
    await api.send('/api/body', 'POST', form);
    setForm({ ...form, exercise_type: '', exercise_minutes: 0, note: '' });
    await load(); onSaved();
  };
  return <section className="stack">
    <WeightTrend rows={rows} />
    <RecordPage title="新增身体记录" button="保存记录" className="body-record-form" form={<>
      <Field label="日期"><DateInput value={form.entry_date} onChange={entry_date => setForm({ ...form, entry_date })} /></Field>
      <Field label="体重"><NumberInput precision={2} value={form.weight} onChange={weight => setForm({ ...form, weight })} placeholder="例如 65.50" /></Field>
      <Field label="运动类型"><input value={form.exercise_type} onChange={e => setForm({ ...form, exercise_type: e.target.value })} placeholder="力量 / 快走 / 拉伸" /></Field>
      <Field label="运动分钟"><NumberInput value={form.exercise_minutes} onChange={value => setForm({ ...form, exercise_minutes: value })} /></Field>
      <Field label="睡眠小时"><NumberInput precision={2} value={form.sleep_hours} onChange={sleep_hours => setForm({ ...form, sleep_hours })} placeholder="例如 7.50" /></Field>
      <Toggle label="熬夜" checked={form.stayed_up_late} onChange={v => setForm({ ...form, stayed_up_late: v })} />
      <Toggle label="完成体态训练" checked={form.posture_training} onChange={v => setForm({ ...form, posture_training: v })} />
      <Field label="备注" className="field-wide"><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="今天身体状态、疼痛、疲劳、训练感受" /></Field>
    </>} onSave={save} table={<DataTable title="身体记录" rows={rows} columns={['entry_date', 'weight', 'exercise_type', 'exercise_minutes', 'sleep_hours', 'stayed_up_late', 'posture_training', 'note']} endpoint="/api/body" onDeleted={load} />} />
  </section>;
}

function WeightTrend({ rows }: { rows: BodyLog[] }) {
  const values = rows.filter(row => row.weight !== null && row.weight !== undefined).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id - b.id).slice(-14);
  if (!values.length) return <div className="panel weight-panel"><div className="panel-head"><h3>体重趋势</h3><span>等待记录</span></div><p className="empty-chart">添加体重记录后，这里会展示变化趋势。</p></div>;
  const weights = values.map(row => Number(row.weight));
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = Math.max(max - min, 1);
  const points = values.map((row, index) => {
    const x = values.length === 1 ? 360 : 46 + index * (628 / (values.length - 1));
    const y = 194 - ((Number(row.weight) - min) / range) * 132;
    return { ...row, x, y };
  });
  return <div className="panel weight-panel">
    <div className="panel-head"><h3>体重趋势</h3><span>最近 {values.length} 条</span></div>
    <div className="weight-chart-wrap">
      <svg className="weight-chart" viewBox="0 0 720 240" role="img" aria-label="体重变化折线图">
        {[62, 106, 150, 194].map(y => <line key={y} x1="46" x2="674" y1={y} y2={y} />)}
        <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} />
        {points.map(point => <circle key={`${point.id}-${point.entry_date}`} cx={point.x} cy={point.y} r="5"><title>{point.entry_date}: {Number(point.weight).toFixed(2)} kg</title></circle>)}
        <text x="46" y="224">{values[0].entry_date}</text>
        <text x="674" y="224" textAnchor="end">{values[values.length - 1].entry_date}</text>
        <text x="46" y="48">{max.toFixed(2)} kg</text>
        <text x="674" y="48" textAnchor="end">最新 {weights[weights.length - 1].toFixed(2)} kg</text>
      </svg>
    </div>
  </div>;
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

function DataTable({ title, rows, columns, endpoint, onDeleted, onEdit }: { title: string; rows: any[]; columns: string[]; endpoint: string; onDeleted: () => void; onEdit?: (row: any) => void }) {
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
            {columns.map(col => <td key={col} data-label={columnLabels[col] || col}>{formatCell(col, row[col])}</td>)}
            <td className="table-actions">
              {onEdit && <button className="icon" onClick={() => onEdit(row)} title="编辑"><Pencil size={15} /></button>}
              <button className="icon danger" onClick={() => remove(row.id)} title="删除"><Trash2 size={15} /></button>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function formatCell(column: string, value: unknown) {
  if (column === 'amount' && value !== null && value !== undefined && value !== '') return Number(value).toFixed(2);
  return String(value ?? '');
}

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.MODE === 'pwa') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
