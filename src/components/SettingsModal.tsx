import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AIProfile {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<AIProfile[]>([]);
  const [moduleOutscraper, setModuleOutscraper] = useState<string>('');
  const [moduleEmailAI, setModuleEmailAI] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiFetch('/api/db/settings')
      .then(r => r.json())
      .then(data => {
        if (data.ai_profiles) {
          try {
            setProfiles(JSON.parse(data.ai_profiles));
          } catch (e) {}
        }
        if (data.module_outscraper_ai) {
          setModuleOutscraper(data.module_outscraper_ai);
        }
        if (data.module_email_ai) {
          setModuleEmailAI(data.module_email_ai);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const r = await apiFetch('/api/db/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_profiles: JSON.stringify(profiles),
          module_outscraper_ai: moduleOutscraper,
          module_email_ai: moduleEmailAI
        })
      });
      if (r.ok) {
        setMessage('设置保存成功！');
      } else {
        setMessage('保存失败。');
      }
    } catch (e) {
      setMessage('保存时发生错误。');
    } finally {
      setSaving(false);
    }
  };

  const addProfile = () => {
    setProfiles([...profiles, {
      id: Date.now().toString(),
      name: 'New Profile',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-3.5-turbo'
    }]);
  };

  const updateProfile = (id: string, field: keyof AIProfile, value: string) => {
    setProfiles(profiles.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const deleteProfile = (id: string) => {
    setProfiles(profiles.filter(p => p.id !== id));
    if (moduleOutscraper === id) {
      setModuleOutscraper('');
    }
    if (moduleEmailAI === id) {
      setModuleEmailAI('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">系统设置 (AI Provider / 模块分配)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/50">
          {loading ? (
            <div className="py-10 text-center text-slate-500 text-sm">加载中...</div>
          ) : (
            <div className="space-y-6">
              
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm">AI 提供商配置 (Profiles)</h3>
                  <button onClick={addProfile} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded font-semibold hover:bg-blue-100 flex items-center gap-1">
                    <Plus size={14} /> 添加 Profile
                  </button>
                </div>
                
                {profiles.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded">
                    暂无配置，请添加 AI Provider
                  </div>
                ) : (
                  <div className="space-y-4">
                    {profiles.map((profile, i) => (
                      <div key={profile.id} className="border border-slate-200 rounded p-4 bg-slate-50 relative group">
                        <button 
                          onClick={() => deleteProfile(profile.id)}
                          className="absolute top-3 right-3 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                        
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">配置名称 / 标识</label>
                            <input 
                              type="text" 
                              className="w-full text-sm bg-white border border-slate-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={profile.name}
                              onChange={e => updateProfile(profile.id, 'name', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Base URL</label>
                            <input 
                              type="text" 
                              className="w-full text-sm bg-white border border-slate-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={profile.baseURL}
                              onChange={e => updateProfile(profile.id, 'baseURL', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">API Key</label>
                            <div className="relative">
                              <input 
                                type={showPasswords[profile.id] ? "text" : "password"} 
                                className="w-full text-sm bg-white border border-slate-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-8"
                                placeholder="sk-..."
                                value={profile.apiKey}
                                onChange={e => updateProfile(profile.id, 'apiKey', e.target.value)}
                              />
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                onClick={() => setShowPasswords(prev => ({ ...prev, [profile.id]: !prev[profile.id] }))}
                              >
                                {showPasswords[profile.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Default Model</label>
                            <input 
                              type="text" 
                              className="w-full text-sm bg-white border border-slate-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={profile.model}
                              onChange={e => updateProfile(profile.id, 'model', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">功能模块 AI 分配</h3>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">Outscraper 搜索词优化</div>
                    <div className="text-xs text-slate-500 mt-0.5">自动将用户的中文搜索词转化为适合 Google Maps 的英文 Query。</div>
                  </div>
                  <div>
                    <select 
                      className="text-sm bg-white border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[150px]"
                      value={moduleOutscraper}
                      onChange={e => setModuleOutscraper(e.target.value)}
                    >
                      <option value="">-- 不使用 AI --</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">Email 生成及回复</div>
                    <div className="text-xs text-slate-500 mt-0.5">提供客户跟进邮件和开发信的 AI 生成功能。</div>
                  </div>
                  <div>
                    <select 
                      className="text-sm bg-white border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[150px]"
                      value={moduleEmailAI}
                      onChange={e => setModuleEmailAI(e.target.value)}
                    >
                      <option value="">-- 不使用 AI --</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {message && (
                <div className={`text-sm font-medium p-3 rounded ${message.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {message}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded shadow-sm"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? '保存中...' : <React.Fragment><Save size={16} /> 保存设置</React.Fragment>}
          </button>
        </div>
      </div>
    </div>
  );
}
