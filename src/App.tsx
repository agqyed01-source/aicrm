import React, { useEffect, useState } from 'react';
import { Database, UserSearch, Users, Activity, Settings2, DownloadCloud, ShieldCheck, LogOut, Mail } from 'lucide-react';
import PublicPool from './components/PublicPool';
import PrivatePool from './components/PrivatePool';
import EmailSystem from './components/EmailSystem';
import SettingsModal from './components/SettingsModal';
import AuthScreen from './components/AuthScreen';
import AdminUsers from './components/AdminUsers';
import UserProfile from './components/UserProfile';
import { apiFetch, removeToken } from './lib/api';

export default function App() {
  const [config, setConfig] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<'public' | 'private' | 'admin' | 'email' | 'profile'>('public');
  const [showSettings, setShowSettings] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const updatePreference = (key: string, value: any) => {
    if (!user) return;
    const prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : (user.preferences || {});
    const newPrefs = { ...prefs, [key]: value };
    setUser({ ...user, preferences: newPrefs });
    apiFetch('/api/auth/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: newPrefs })
    }).catch(console.error);
  };

  const handleSetView = (v: any) => {
    setView(v);
    updatePreference('lastView', v);
  };

  const fetchConfigAndUser = () => {
    fetch('/api/config')
      .then(async (r) => {
        const ct = r.headers.get("content-type");
        if (ct && ct.includes("text/html")) {
          const text = await r.text();
          throw new Error("API /api/config returned HTML: " + text.substring(0, 100));
        }
        return r.json();
      })
      .then(data => {
        setConfig(data);
        if (data.hasDb) {
          apiFetch('/api/auth/me')
            .then(async (r) => {
                const ct = r.headers.get("content-type");
                if (ct && ct.includes("text/html")) throw new Error("API /api/auth/me returned HTML");
                return r.json();
            })
            .then(u => {
              if (u && !u.error) {
                if (typeof u.preferences === 'string') {
                  try { u.preferences = JSON.parse(u.preferences); } catch (e) { u.preferences = {}; }
                }
                setUser(u);
                if (u.preferences?.lastView) {
                  setView(u.preferences.lastView);
                }
              } else {
                removeToken();
              }
              setAuthChecked(true);
            })
            .catch(() => {
              removeToken();
              setAuthChecked(true);
            });
        } else {
          setAuthChecked(true);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchConfigAndUser();
  }, []);

  const handleLogout = () => {
    removeToken();
    setUser(null);
  };

  if (!config || !authChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
          <div className="h-4 w-48 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (config.hasDb && !user) {
    return <AuthScreen onLogged={fetchConfigAndUser} />;
  }

  if (!config.hasDb) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-6">
          <div className="mx-auto bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center text-blue-600 mb-4">
            <Database size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">需要配置数据库</h1>
          <p className="text-slate-600 text-sm">
            此 CRM 需要 PostgreSQL 数据库才能运行。请在 AI Studio 环境变量设置中配置 Postgres 连接。
          </p>
          {config.error && (
            <div className="bg-red-50 text-red-700 p-3 rounded text-sm text-left border border-red-200">
              <strong>连接错误:</strong> <span className="font-mono text-xs">{config.error}</span>
              <div className="mt-2 text-xs text-red-600">
                如果遇到超时，请确保您的数据库防火墙允许外部网络连接。
              </div>
            </div>
          )}
          <div className="text-left bg-slate-50 p-4 rounded text-xs font-mono text-slate-800 break-all overflow-hidden border border-slate-200">
            DATABASE_URL="postgresql://user:pass@host:5432/db"
          </div>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-sm w-full shadow-sm transition-colors" onClick={() => window.location.reload()}>
            我已添加变量，重新加载页面
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <aside className="w-56 bg-slate-900 flex flex-col border-r border-slate-200 hidden sm:flex shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shrink-0">
            <span className="text-white font-bold">P</span>
          </div>
          <h1 className="text-white font-bold tracking-tight text-lg truncate">PostgresCRM</h1>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          <button 
            onClick={() => handleSetView('public')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${view === 'public' ? 'text-white bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <UserSearch className="w-4 h-4 mr-3" />
            公域客户池
          </button>
          <button 
            onClick={() => handleSetView('private')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${view === 'private' ? 'text-white bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <Users className="w-4 h-4 mr-3" />
            我的私域池
          </button>
          
          <div className="pt-4 pb-2 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">系统及工具</div>
          <button 
            onClick={() => handleSetView('email')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${view === 'email' ? 'text-white bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <Mail className="w-4 h-4 mr-3" />
            邮件营销
          </button>
          
          {user?.role === 'super_admin' && (
            <button 
              onClick={() => handleSetView('admin')}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${view === 'admin' ? 'text-white bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              <ShieldCheck className="w-4 h-4 mr-3" />
              用户管理
            </button>
          )}
          {user && (
            <button 
              onClick={() => handleSetView('profile')}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${view === 'profile' ? 'text-white bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              <Settings2 className="w-4 h-4 mr-3" />
              个人资料
            </button>
          )}
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-800 transition-colors mt-2"
          >
            <Settings2 className="w-4 h-4 mr-3" />
            系统设置 (AI 配置)
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-red-400 hover:bg-slate-800 transition-colors mt-2"
          >
            <LogOut className="w-4 h-4 mr-3" />
            登出
          </button>
        </nav>
        
        <div className="p-4 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center font-medium text-sm shrink-0 uppercase">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex flex-col text-left min-w-0">
              <span className="text-xs text-slate-100 font-medium truncate">{user?.name || '加载中...'} ({user?.role})</span>
              <span className="text-xs text-slate-400 truncate">{user?.email || ''}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {view === 'admin' && user?.role === 'super_admin' ? (
          <AdminUsers />
        ) : view === 'email' ? (
          <EmailSystem user={user} updatePreference={updatePreference} />
        ) : view === 'profile' ? (
          <UserProfile user={user} onUserUpdate={setUser} />
        ) : view === 'public' ? (
          <PublicPool user={user} hasOutscraper={config.hasOutscraper} updatePreference={updatePreference} />
        ) : (
          <PrivatePool user={user} hasOutscraper={config.hasOutscraper} updatePreference={updatePreference} />
        )}
      </main>
      
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
