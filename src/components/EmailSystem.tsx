import React, { useState, useEffect } from 'react';
import { 
  Mail, Plus, Trash2, Send, Wand2, RefreshCw, 
  Inbox, Settings, Send as SendIcon, Pencil, X, 
  Search, ArrowLeft, MoreVertical, CheckSquare, Square, Star, Archive, Eye, EyeOff
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function EmailSystem({ user }: { user: any }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [view, setView] = useState<'inbox' | 'sent' | 'settings'>('inbox');
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  
  // Compose Modal
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAccount, setComposeAccount] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Settings
  const [newAccount, setNewAccount] = useState({ provider: 'smtp', from_name: '', from_email: '' });
  const [credHost, setCredHost] = useState('');
  const [credPort, setCredPort] = useState(465);
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');
  const [showCredPass, setShowCredPass] = useState(false);
  const [credApi, setCredApi] = useState('');
  
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const syncEmails = async () => {
    setIsSyncing(true);
    try {
      await apiFetch('/api/db/emails/sync', { method: 'POST' });
      await loadData();
    } catch (e) {
      console.error(e);
      alert('同步失败');
    } finally {
      setIsSyncing(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [accRes, mailRes] = await Promise.all([
        apiFetch('/api/db/email-accounts'),
        apiFetch('/api/db/emails')
      ]);
      const accData = await accRes.json();
      const mailData = await mailRes.json();
      setAccounts(accData);
      setEmails(mailData);
      if (accData.length > 0 && !composeAccount) {
        setComposeAccount(accData[0].id.toString());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveAccount = async () => {
    try {
      let cred = {};
      
      if (newAccount.provider === 'resend' || newAccount.provider === 'outscraper') {
        cred = { apiKey: credApi };
      } else {
        cred = { host: credHost, port: Number(credPort), user: credUser, pass: credPass };
      }

      const url = editingAccountId ? `/api/db/email-accounts/${editingAccountId}` : '/api/db/email-accounts';
      const method = editingAccountId ? 'PUT' : 'POST';

      await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAccount, credential_data: cred })
      });
      loadData();
      setNewAccount({ provider: 'smtp', from_name: '', from_email: '' });
      setCredHost('');
      setCredPort(465);
      setCredUser('');
      setCredPass('');
      setCredApi('');
      setEditingAccountId(null);
    } catch (e) {
      console.error(e);
      alert('保存失败!');
    }
  };

  const handleEditAccount = (acc: any) => {
    setEditingAccountId(acc.id);
    setNewAccount({
      provider: acc.provider || 'smtp',
      from_name: acc.from_name || '',
      from_email: acc.from_email || ''
    });
    
    // Parse credential data
    let cred: any = {};
    try {
      if (typeof acc.credential_data === 'string') {
        cred = JSON.parse(acc.credential_data);
      } else if (acc.credential_data) {
        cred = acc.credential_data;
      }
    } catch (e) {}
    
    if (acc.provider === 'resend' || acc.provider === 'outscraper') {
      setCredApi(cred.apiKey || '');
    } else {
      setCredHost(cred.host || '');
      setCredPort(cred.port || 465);
      setCredUser(cred.user || '');
      setCredPass(cred.pass || '');
    }
    
    // reset delete confirm just in case
    setConfirmDeleteId(null);
  };

  const handleDeleteAccount = async (id: number) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    try {
      await apiFetch(`/api/db/email-accounts/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      if (editingAccountId === id) {
        setEditingAccountId(null);
        setNewAccount({ provider: 'smtp', from_name: '', from_email: '' });
      }
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateDraft = async () => {
    if (!composeTo) return alert('请输入收件人帮助 AI 匹配客户信息');
    setGenerating(true);
    try {
      const custRes = await apiFetch(`/api/db/customers?pool=private`);
      const customers = await custRes.json();
      const matchedCustomer = customers.find((c: any) => 
        (c.contact_methods || []).some((cm: any) => cm.type === 'email' && cm.value === composeTo)
      );

      const r = await apiFetch('/api/email/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: "Please draft a professional outreach email for this client.",
          customer_info: matchedCustomer || { email: composeTo },
          email_history: []
        })
      });
      const data = await r.json();
      if (data.draft) {
        setComposeBody(data.draft);
      } else {
        alert(data.error || '生成失败');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!composeTo || !composeAccount || !composeSubject) return alert('必填项不完整');
    setSending(true);
    try {
      const custRes = await apiFetch(`/api/db/customers?pool=private`);
      const customers = await custRes.json();
      const matchedCustomer = customers.find((c: any) => 
        (c.contact_methods || []).some((cm: any) => cm.type === 'email' && cm.value === composeTo)
      );
      
      const r = await apiFetch('/api/db/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: parseInt(composeAccount),
          customer_id: matchedCustomer?.id || null,
          direction: 'outbound',
          to_address: composeTo,
          subject: composeSubject,
          body_text: composeBody
        })
      });
      
      if (r.ok) {
        setShowCompose(false);
        loadData();
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
      } else {
        const err = await r.json();
        alert(err.error || '发送失败');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const displayedEmails = view === 'sent' 
    ? emails.filter(e => e.direction === 'outbound')
    : emails; // For inbox, show all for now

  return (
    <div className="flex-1 flex h-full bg-slate-50 overflow-hidden text-slate-800 relative">
      
      {/* Sidebar */}
      <div className="w-56 flex flex-col pt-6 px-4 shrink-0 bg-white border-r border-slate-200">
        <button 
          onClick={() => setShowCompose(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded shadow-sm transition-colors text-sm font-semibold w-full mb-6"
        >
          <Pencil className="w-4 h-4" />
          写邮件
        </button>
        
        <nav className="flex-1 overflow-y-auto space-y-1">
          <button
            onClick={() => { setView('inbox'); setSelectedEmail(null); }}
            className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
              view === 'inbox' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 font-medium'
            }`}
          >
            <div className="flex items-center gap-3">
              <Inbox className="w-4 h-4" /> 收件箱
            </div>
          </button>
          
          <button
            onClick={() => { setView('sent'); setSelectedEmail(null); }}
            className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
              view === 'sent' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 font-medium'
            }`}
          >
            <div className="flex items-center gap-3">
              <SendIcon className="w-4 h-4" /> 已发送
            </div>
          </button>
          
          <button
            onClick={() => { setView('settings'); setSelectedEmail(null); }}
            className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
              view === 'settings' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 font-medium'
            }`}
          >
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4" /> 账号管理
            </div>
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white">
          {view === 'settings' ? (
            <h2 className="text-lg font-bold text-slate-800">邮箱账号管理</h2>
          ) : selectedEmail ? (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedEmail(null)}
                className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-500 border border-transparent hover:border-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 border-l border-slate-200 pl-4">
                <button className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 border border-transparent hover:border-slate-200"><Trash2 className="w-4 h-4" /></button>
                <button className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 border border-transparent hover:border-slate-200"><Mail className="w-4 h-4" /></button>
                <button className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 border border-transparent hover:border-slate-200"><MoreVertical className="w-4 h-4" /></button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button onClick={loadData} title="刷新" className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 border border-transparent hover:border-slate-200">
                  <RefreshCw className={`w-4 h-4 ${loading && !isSyncing ? 'animate-spin' : ''}`} />
                </button>
                <button 
                  onClick={syncEmails} 
                  disabled={isSyncing}
                  className="px-3 py-1.5 hover:bg-slate-100 rounded-md text-slate-600 text-xs font-semibold border border-transparent hover:border-slate-200 disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? '同步中...' : '同步收件'}
                </button>
                <button className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 border border-transparent hover:border-slate-200 ml-2">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                1-{displayedEmails.length} 共 {displayedEmails.length}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          {view === 'settings' ? (
            <div className="p-8 max-w-3xl">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-800">{editingAccountId ? '编辑邮箱账号' : '添加新邮箱账号'}</h3>
                  {editingAccountId && (
                    <button 
                      onClick={() => {
                        setEditingAccountId(null);
                        setNewAccount({ provider: 'smtp', from_name: '', from_email: '' });
                        setCredHost(''); setCredPort(465); setCredUser(''); setCredPass(''); setCredApi('');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
                    >
                      取消编辑
                    </button>
                  )}
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">服务商</label>
                      <select 
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        value={newAccount.provider}
                        onChange={e => setNewAccount({...newAccount, provider: e.target.value})}
                      >
                        <option value="smtp">SMTP</option>
                        <option value="imap">IMAP (收件)</option>
                        <option value="resend">Resend / API</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">发件人姓名</label>
                      <input 
                        type="text" 
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={newAccount.from_name}
                        onChange={e => setNewAccount({...newAccount, from_name: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">发件邮箱</label>
                      <input 
                        type="email" 
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={newAccount.from_email}
                        onChange={e => setNewAccount({...newAccount, from_email: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <h4 className="border-b border-slate-100 pb-2 mb-4 text-xs font-bold text-slate-800">凭证信息</h4>
                      {newAccount.provider === 'resend' ? (
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">API Key</label>
                          <input 
                            type="text" 
                            className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2"
                            placeholder="re_..."
                            value={credApi}
                            onChange={e => setCredApi(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">主机名 (Host)</label>
                            <input 
                              type="text" 
                              className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder={newAccount.provider === 'imap' ? 'imap.example.com' : 'smtp.example.com'}
                              value={credHost}
                              onChange={e => setCredHost(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">端口 (Port)</label>
                            <input 
                              type="number" 
                              className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder={newAccount.provider === 'imap' ? '993' : '465'}
                              value={credPort}
                              onChange={e => setCredPort(parseInt(e.target.value, 10))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">用户名/邮箱 (User)</label>
                            <input 
                              type="text" 
                              className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="youremail@example.com"
                              value={credUser}
                              onChange={e => setCredUser(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">密码/授权码 (Password)</label>
                            <div className="relative">
                              <input 
                                type={showCredPass ? "text" : "password"} 
                                className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-10"
                                placeholder="********"
                                value={credPass}
                                onChange={e => setCredPass(e.target.value)}
                              />
                              <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                onClick={() => setShowCredPass(!showCredPass)}
                              >
                                {showCredPass ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={handleSaveAccount}
                    className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-semibold shadow-sm transition-colors"
                  >
                    {editingAccountId ? '保存修改' : '添加账号'}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-bold text-slate-800">已绑定的邮箱账号</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {accounts.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">暂无绑定的邮箱</div>
                  ) : accounts.map((acc) => (
                    <div key={acc.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">{acc.from_email}</div>
                        <div className="text-xs text-slate-500 mt-1">{acc.provider.toUpperCase()} · {acc.from_name}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditAccount(acc)} className="text-slate-400 hover:text-blue-600 p-2 rounded-md hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100">
                          <Pencil size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteAccount(acc.id)} 
                          className={`p-2 rounded-md transition-colors border border-transparent ${confirmDeleteId === acc.id ? 'bg-red-50 text-red-600 border-red-100 px-3' : 'text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100'}`}
                        >
                          {confirmDeleteId === acc.id ? <span className="text-xs font-bold">确认删除?</span> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : selectedEmail ? (
            <div className="p-8 max-w-4xl bg-white min-h-full">
              <h1 className="text-xl font-bold text-slate-800 mb-6">{selectedEmail.subject || '(无主题)'}</h1>
              
              <div className="flex items-start gap-4 mb-8 pb-6 border-b border-slate-100">
                <div className="w-10 h-10 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0 border border-blue-200">
                  {(selectedEmail.from_address || selectedEmail.to_address)?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="truncate">
                      <span className="font-bold text-sm text-slate-900 mr-2">
                        {selectedEmail.direction === 'outbound' ? selectedEmail.to_address : selectedEmail.from_address}
                      </span>
                      <span className="text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {selectedEmail.direction === 'outbound' ? 'To' : 'From'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">
                      {new Date(selectedEmail.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedEmail.direction === 'outbound' ? `发件账号: ${selectedEmail.from_address}` : `收件人: ${selectedEmail.to_address}`}
                  </div>
                </div>
              </div>
              
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {selectedEmail.body_text}
              </div>
            </div>
          ) : (
            <div className="flex flex-col bg-white min-h-full">
              {displayedEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Inbox className="w-12 h-12 mb-4 opacity-30" />
                  <p className="text-sm font-medium">空空如也</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border-b border-slate-100">
                  {displayedEmails.map((mail) => (
                    <div 
                      key={mail.id} 
                      onClick={() => setSelectedEmail(mail)}
                      className="flex items-center gap-4 px-6 py-3 hover:bg-blue-50/50 cursor-pointer transition-colors group"
                    >
                      <div className="w-48 shrink-0 font-semibold text-sm text-slate-800 truncate">
                        {mail.direction === 'outbound' ? `To: ${mail.to_address}` : mail.from_address}
                      </div>
                      
                      <div className="flex-1 flex items-center gap-2 min-w-0 pr-4">
                        {mail.customer_id && (
                          <span className="shrink-0 text-[10px] font-bold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-200">
                            已关联
                          </span>
                        )}
                        <span className="font-semibold text-sm text-slate-800 shrink-0">{mail.subject || '(无主题)'}</span>
                        <span className="text-slate-300 text-sm shrink-0">-</span>
                        <span className="text-sm text-slate-500 truncate">{mail.body_text?.replace(/\n/g, ' ')}</span>
                      </div>
                      
                      <div className="w-auto shrink-0 text-right text-xs font-medium text-slate-500">
                        {new Date(mail.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modern Compose Modal */}
      {showCompose && (
        <div className="absolute bottom-6 right-6 w-[560px] bg-white rounded-xl shadow-2xl flex flex-col border border-slate-200 z-50 overflow-hidden ring-1 ring-slate-900/5">
          <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between cursor-pointer">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Pencil className="w-4 h-4 text-slate-400" />
              新邮件
            </h3>
            <button onClick={() => setShowCompose(false)} className="hover:bg-slate-700 p-1 rounded transition-colors text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full custom-scrollbar max-h-[60vh]">
            <div className="border-b border-slate-100 px-5 py-2.5 flex items-center">
              <span className="text-xs font-semibold text-slate-400 w-16 shrink-0">发件人</span>
              <select 
                className="flex-1 bg-transparent border-none focus:outline-none text-sm text-slate-800 font-medium"
                value={composeAccount}
                onChange={e => setComposeAccount(e.target.value)}
              >
                <option value="">-- 选择发件账号 --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.from_name} &lt;{a.from_email}&gt;</option>)}
              </select>
            </div>
            
            <div className="border-b border-slate-100 px-5 py-2.5 flex items-center">
              <span className="text-xs font-semibold text-slate-400 w-16 shrink-0">收件人</span>
              <input 
                type="text" 
                className="flex-1 bg-transparent border-none focus:outline-none text-sm text-slate-800 font-medium placeholder-slate-300"
                value={composeTo}
                onChange={e => setComposeTo(e.target.value)}
              />
            </div>
            
            <div className="border-b border-slate-100 px-5 py-2.5 flex items-center">
              <span className="text-xs font-semibold text-slate-400 w-16 shrink-0">主 题</span>
              <input 
                type="text" 
                placeholder="邮件主题..."
                className="flex-1 bg-transparent border-none focus:outline-none text-sm font-semibold text-slate-800 placeholder-slate-300"
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
              />
            </div>
            
            <div className="p-5 min-h-[300px]">
              <textarea 
                className="w-full h-full min-h-[260px] resize-none border-none focus:outline-none text-sm text-slate-700 leading-relaxed placeholder-slate-300"
                placeholder="撰写邮件正文..."
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
              />
            </div>
          </div>
          
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
            <div className="flex items-center gap-3">
              <button 
                onClick={handleSend}
                disabled={sending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2 rounded shadow-sm transition-colors disabled:opacity-70 flex items-center gap-2"
              >
                {sending ? '发送中...' : '发送邮件'}
              </button>
              
              <button 
                onClick={handleGenerateDraft}
                disabled={generating}
                className="text-blue-600 border border-blue-200 hover:bg-blue-50 font-semibold text-sm px-4 py-2 rounded shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" />
                {generating ? '生成中...' : 'AI 辅写'}
              </button>
            </div>
            
            <button 
              onClick={() => {
                setComposeTo('');
                setComposeSubject('');
                setComposeBody('');
              }}
              className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors"
              title="清空内容"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

