import React, { useState, useEffect } from 'react';
import { Clock, Phone, AlertTriangle, ArrowUpRight, MessageSquare, Plus, Search, Map, List, Trash2, Wand2, X, UploadCloud, DownloadCloud, RefreshCw, Bot } from 'lucide-react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { apiFetch } from '../lib/api';
import MapChart from './MapChart';
import CountrySelect from './CountrySelect';
import { isMatchingSearch } from '../lib/utils';
import { AiAgentModal } from './AiAgentModal';

export default function PrivatePool({ user, hasOutscraper, updatePreference }: { user: any; hasOutscraper: boolean; updatePreference?: (k: string, v: any) => void }) {
  const prefs = typeof user?.preferences === 'string' ? JSON.parse(user.preferences) : (user?.preferences || {});

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>(prefs.privateViewMode || 'list');
  const [tooltipContent, setTooltipContent] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>(prefs.privateSearchTags || []);
  const [searchInput, setSearchInput] = useState('');

  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importQuery, setImportQuery] = useState(prefs.privateImportQuery || '');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState<any>({ contact_methods: [{ type: 'email', value: '' }] });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const loadMyCustomers = () => {
    if (!user) return;
    setLoading(true);
    apiFetch(`/api/db/customers?filter=private&userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (!data.error) setCustomers(data);
        setLoading(false);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadMyCustomers();
  }, [user]);

  const handleOutscraperImport = async () => {
    if (!importQuery.trim()) return;
    setImporting(true);
    if (updatePreference) updatePreference('privateImportQuery', importQuery);
    try {
      const r = await apiFetch(`/api/outscraper/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: importQuery, limit: 10, owner_id: user.id })
      });
      const data = await r.json();
      if (data.success) {
        alert(`Successfully imported ${data.imported} leads to your private pool!`);
        setShowImport(false);
        loadMyCustomers();
      } else {
        alert(data.error || 'Failed to import');
      }
    } catch(e) {
      alert('Error connecting to backend API');
    } finally {
      setImporting(false);
    }
  };

  const handleAddManualCustomer = async () => {
    setAddingCustomer(true);
    try {
      const r = await apiFetch(`/api/db/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCustomerForm, owner_id: user.id, source: 'manual' })
      });
      if (r.ok) {
        setShowAddModal(false);
        setNewCustomerForm({ contact_methods: [{ type: 'email', value: '' }] });
        loadMyCustomers();
      } else {
        const err = await r.json();
        alert(err.error || 'Failed to add customer');
      }
    } catch(e) {
      console.error(e);
      alert('Error connecting to backend');
    } finally {
      setAddingCustomer(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setUploadingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('owner_id', user.id.toString()); // Indicate private pool
      
      const r = await fetch('/api/db/customers/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      const ct = r.headers.get('content-type');
      if (ct && ct.includes('text/html')) {
          const text = await r.text();
          throw new Error('API returned HTML unexpectedly: ' + text.substring(0, 100));
      }
      const data = await r.json();
      if (r.ok && data.success) {
        alert(`Successfully imported ${data.imported} records to your private pool!`);
        setShowCsvModal(false);
        setCsvFile(null);
        loadMyCustomers();
      } else {
        alert(data.error || 'Failed to import CSV');
      }
    } catch(e) {
      console.error(e);
      alert('Error connecting to backend');
    } finally {
      setUploadingCsv(false);
    }
  };

  const releaseCustomer = async (id: number) => {
    if (!confirm("确定要将此客户释放回公海池吗？")) return;
    setActionLoadingId(id);
    try {
      const r = await apiFetch(`/api/db/customers/${id}/release`, { method: 'POST' });
      if (r.ok) {
        setCustomers(customers.filter(c => c.id !== id));
        if (selectedId === id) setSelectedId(null);
      } else {
        const errorData = await r.json();
        alert(errorData.error || "释放失败");
      }
    } catch(e) {
      console.error(e);
      alert("释放失败，请重试");
    } finally {
      setActionLoadingId(null);
    }
  };

  const getRiskStatus = (lastContact: string | null) => {
    if (!lastContact) return { color: 'bg-red-50 text-red-700 border-red-200', text: '从未跟进', icon: AlertTriangle, risk: 'high' };
    const days = differenceInDays(new Date(), new Date(lastContact));
    if (days >= 10) return { color: 'bg-red-50 text-red-700 border-red-200', text: `闲置 ${days} 天`, icon: AlertTriangle, risk: 'high' };
    if (days >= 5) return { color: 'bg-orange-50 text-orange-700 border-orange-200', text: `已过 ${days} 天`, icon: Clock, risk: 'medium' };
    return { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: '活跃中', icon: Phone, risk: 'low' };
  };

  const filtered = customers.filter(c => {
    const termMatches = (term: string) => 
      isMatchingSearch(term, c.name) || 
      (c.industry && isMatchingSearch(term, c.industry)) ||
      (c.address && isMatchingSearch(term, c.address)) ||
      (c.country && isMatchingSearch(term, c.country)) ||
      (c.province && isMatchingSearch(term, c.province)) ||
      (c.city && isMatchingSearch(term, c.city));

    const tagsMatch = searchTags.every(tag => termMatches(tag));
    const inputMatch = !searchInput || termMatches(searchInput);
    return tagsMatch && inputMatch;
  });

  const handleSetSearchTags = (tags: string[]) => {
    setSearchTags(tags);
    updatePreference?.('privateSearchTags', tags);
  };

  const handleSetViewMode = (mode: 'list' | 'map') => {
    setViewMode(mode);
    updatePreference?.('privateViewMode', mode);
  };

  const handleCountryClick = (country: string) => {
    if (!searchTags.includes(country)) {
      handleSetSearchTags([...searchTags, country]);
    }
    handleSetViewMode('list');
  };

  return (
    <>
      {/* Header */}
      <header className="min-h-[4rem] h-auto py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between px-4 sm:px-6 shrink-0 gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold">我的私域池</h2>
          <div className="flex gap-2">
             <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-100 font-medium">已认领: {filtered.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200">
            <button 
              onClick={() => handleSetViewMode('list')}
              className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <List className="w-3.5 h-3.5" />
              列表
            </button>
            <button 
              onClick={() => handleSetViewMode('map')}
              className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded ${viewMode === 'map' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Map className="w-3.5 h-3.5" />
              地图
            </button>
          </div>

          <button 
            onClick={() => setShowImport(true)}
            disabled={!hasOutscraper}
            className="relative z-10 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            title={!hasOutscraper ? "OUTSCRAPER_API_KEY required in .env" : "Import from Google Maps via Outscraper"}
          >
            <DownloadCloud className="w-4 h-4" />
            <span className="hidden sm:inline">地图抓取</span>
          </button>
          
          <button 
            onClick={() => setShowCsvModal(true)}
            className="relative z-10 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 text-sm font-semibold px-4 py-2 rounded shadow-sm transition-colors flex items-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            <span className="hidden sm:inline">导入CSV</span>
          </button>

          <button 
            onClick={() => setShowAddModal(true)}
            className="relative z-10 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">新建客户</span>
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border-b border-slate-200 px-6 py-3 flex gap-4 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px] flex items-center bg-slate-50 border border-slate-200 rounded focus-within:ring-1 focus-within:ring-blue-500 overflow-hidden px-2 py-1 flex-wrap gap-1 min-h-[36px]">
          <Search className="w-4 h-4 text-slate-400 ml-1 mr-1 shrink-0" />
          {searchTags.map(tag => (
            <span key={tag} className="flex items-center bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">
              {tag}
              <button 
                onClick={() => handleSetSearchTags(searchTags.filter(t => t !== tag))} 
                className="ml-1 hover:text-blue-900 focus:outline-none"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input 
            type="text" 
            placeholder={searchTags.length === 0 ? "支持多条件，按Tab生成标..." : ""} 
            className="flex-1 bg-transparent border-none focus:outline-none text-sm min-w-[120px] py-0.5"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const text = searchInput.trim();
                if (text && !searchTags.includes(text)) {
                  handleSetSearchTags([...searchTags, text]);
                  setSearchInput('');
                }
              } else if (e.key === 'Backspace' && !searchInput && searchTags.length > 0) {
                handleSetSearchTags(searchTags.slice(0, -1));
              }
            }}
          />
        </div>
      </section>

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative">
            <div className="p-6">
              <button onClick={() => setShowCsvModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
              <h3 className="text-xl font-bold text-slate-800 mb-2">批量导入CSV (私域池)</h3>
              <p className="text-sm text-slate-500 mb-6">上传CSV文件，自动解析并导入您的私域池。字段映射将自动进行。</p>
              
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors relative cursor-pointer" onClick={() => document.getElementById('csv-upload-private')?.click()}>
                <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">{csvFile ? csvFile.name : '点击选择CSV文件'}</p>
                <input 
                  id="csv-upload-private"
                  type="file" 
                  accept=".csv" 
                  className="hidden"
                  onChange={e => setCsvFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  onClick={() => setShowCsvModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleCsvUpload}
                  disabled={!csvFile || uploadingCsv}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {uploadingCsv ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  {uploadingCsv ? '导入中...' : '开始导入'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex pl-[240px] items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden relative max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex-shrink-0">
              <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
              <h3 className="text-xl font-bold text-slate-800">新建客户</h3>
              <p className="text-sm text-slate-500">添加客户到私域池</p>
            </div>
            
            <div className="p-6 overflow-y-auto w-full grid gap-4 grid-cols-2">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Company Name / 客户名称 *</label>
                <input 
                  type="text" 
                  value={newCustomerForm.name || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, name: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm font-medium" 
                  placeholder="项目/客户名称"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Website / 网站</label>
                <input 
                  type="text" 
                  value={newCustomerForm.website || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, website: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Phone / 电话</label>
                <input 
                  type="text" 
                  value={newCustomerForm.phone || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, phone: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Country / 国家</label>
                <input 
                  type="text" 
                  value={newCustomerForm.country || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, country: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Industry / 行业</label>
                <input 
                  type="text" 
                  value={newCustomerForm.industry || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, industry: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Address / 地址</label>
                <input 
                  type="text" 
                  value={newCustomerForm.address || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, address: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Source / 客户来源</label>
                <div className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 text-slate-500">
                  手动录入 (Manual)
                </div>
              </div>
              <div className="col-span-2 border-t border-slate-100 pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-500">Contact Methods / 联系方式</label>
                  <button 
                    onClick={() => {
                      const methods = newCustomerForm.contact_methods || [];
                      setNewCustomerForm({
                        ...newCustomerForm,
                        contact_methods: [...methods, { type: 'email', value: '' }]
                      });
                    }}
                    className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> 添加联系方式
                  </button>
                </div>
                {(newCustomerForm.contact_methods || []).map((method: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <select
                      value={method.type}
                      onChange={(e) => {
                        const methods = [...(newCustomerForm.contact_methods || [])];
                        methods[index].type = e.target.value;
                        setNewCustomerForm({ ...newCustomerForm, contact_methods: methods });
                      }}
                      className="border border-slate-300 rounded p-2 text-sm bg-slate-50 w-32"
                    >
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="wechat">WeChat</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      type="text"
                      value={method.value}
                      onChange={(e) => {
                        const methods = [...(newCustomerForm.contact_methods || [])];
                        methods[index].value = e.target.value;
                        setNewCustomerForm({ ...newCustomerForm, contact_methods: methods });
                      }}
                      placeholder="Value"
                      className="flex-1 border border-slate-300 rounded p-2 text-sm"
                    />
                    <button
                      onClick={() => {
                        const methods = [...(newCustomerForm.contact_methods || [])];
                        methods.splice(index, 1);
                        setNewCustomerForm({ ...newCustomerForm, contact_methods: methods });
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 rounded transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex-shrink-0 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleAddManualCustomer}
                disabled={!newCustomerForm.name || addingCustomer}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {addingCustomer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addingCustomer ? '保存中...' : '保存至私域池'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outscraper import block */}
      {showImport && (
        <div className="mx-6 mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4 relative shadow-sm shrink-0">
          <button onClick={() => setShowImport(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={16}/></button>
          <h3 className="text-slate-800 font-semibold text-sm flex items-center gap-2 mb-3"><DownloadCloud size={16}/> Outscraper 私域池导入</h3>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input 
                value={importQuery}
                onChange={e => {
                  setImportQuery(e.target.value);
                }}
                placeholder="例如: 北京的科技公司" 
                className="w-full px-3 py-1.5 pr-8 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button 
              onClick={handleOutscraperImport}
              disabled={importing || !importQuery}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "获取并导入 10 条"}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-6 flex flex-col md:flex-row gap-6 relative">
        {viewMode === 'map' ? (
          <div className="w-full h-full bg-white rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
            <MapChart setTooltipContent={setTooltipContent} onCountryClick={handleCountryClick} customers={customers} />
            {tooltipContent && (
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur border border-slate-200 px-3 py-1.5 rounded text-sm shadow-sm font-semibold text-slate-800">
                {tooltipContent}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Left List */}
            <div className="w-full md:w-80 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col shrink-0 overflow-hidden h-full">
               <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 font-semibold text-xs text-slate-500 uppercase tracking-wider shrink-0">
                 待跟进列表
               </div>
               <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                 {filtered.map(c => {
                const status = getRiskStatus(c.last_contacted_at);
                const StatusIcon = status.icon;
                return (
                  <div 
                    key={c.id} 
                    onClick={() => setSelectedId(c.id)}
                    className={`p-4 cursor-pointer transition-colors ${selectedId === c.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium text-sm text-slate-800">{c.name}</h4>
                        <div className="text-xs text-slate-500 mt-1 font-normal flex flex-wrap gap-2 items-center">
                          {c.source && (
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] uppercase border border-slate-200" style={{ transform: 'scale(0.85)', transformOrigin: 'left' }}>
                              {c.source === 'outscraper' ? 'Outscraper' : c.source === 'csv_import' ? 'CSV' : 'Manual'}
                            </span>
                          )}
                          {c.source === 'outscraper' && c.source_keyword && (
                            <span className="text-blue-600 text-[10px] truncate max-w-[100px]" style={{ transform: 'scale(0.85)', transformOrigin: 'left' }} title={c.source_keyword}>"{c.source_keyword}"</span>
                          )}
                          {c.source === 'csv_import' && c.source_keyword && (
                            <span className="text-slate-500 text-[10px] truncate max-w-[100px]" style={{ transform: 'scale(0.85)', transformOrigin: 'left' }} title={c.source_keyword}>{c.source_keyword}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                       <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${status.color}`}>
                         {status.text}
                       </span>
                       {c.ai_agent_status === 'active' && (
                         <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-blue-200">
                           <Bot size={10} className="w-2.5 h-2.5" />
                           AI 托管中
                         </span>
                       )}
                    </div>
                    {selectedId === c.id && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); releaseCustomer(c.id); }}
                        disabled={actionLoadingId === c.id}
                        className="text-[11px] text-blue-600 font-semibold hover:underline mt-1 disabled:opacity-50 disabled:no-underline"
                      >
                        {actionLoadingId === c.id ? '释放中...' : '释放回公域'}
                      </button>
                    )}
                  </div>
                )
             })}
             {!loading && filtered.length === 0 && (
               <div className="p-6 text-center text-slate-500 text-sm">
                 空空如也，试试换个地区？或者去公域池认领吧！
               </div>
             )}
             {loading && (
               <div className="divide-y divide-slate-50 text-left">
                 {[1,2,3,4,5].map(i => (
                   <div key={i} className="p-4 flex flex-col gap-3">
                     <div className="h-4 w-1/2 bg-slate-200 rounded animate-pulse"></div>
                     <div className="flex gap-2 mb-1">
                       <div className="h-4 w-12 bg-slate-100 rounded animate-pulse"></div>
                       <div className="h-4 w-16 bg-slate-100 rounded animate-pulse"></div>
                     </div>
                     <div className="h-3 w-1/4 bg-slate-200 rounded animate-pulse mt-1"></div>
                   </div>
                 ))}
               </div>
             )}
           </div>
        </div>

        {/* Right Details */}
        <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden h-full">
           {selectedId ? (
              <CustomerDetailView 
                customerId={selectedId} 
                user={user} 
                updatePreference={updatePreference}
                onInteractionLogged={(updatedFields) => {
                  if (updatedFields) {
                    setCustomers(customers.map(c => c.id === selectedId ? { ...c, ...updatedFields } : c));
                  } else {
                    setCustomers(customers.map(c => c.id === selectedId ? { ...c, last_contacted_at: new Date().toISOString() } : c));
                  }
                }}
              />
           ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                 选择左侧客户查看详情与跟进
              </div>
           )}
        </div>
          </>
        )}
      </div>
    </>
  );
}

function CustomerDetailView({ customerId, user, updatePreference, onInteractionLogged }: { customerId: number, user: any, updatePreference?: any, onInteractionLogged: (updatedFields?: any) => void }) {
  const [customer, setCustomer] = useState<any>(null);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [tab, setTab] = useState<'details' | 'log' | 'info'>('details');
  const [note, setNote] = useState('');
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  
  // AI Generate Message
  const [showAiModal, setShowAiModal] = useState(false);
  const [showAiAgentModal, setShowAiAgentModal] = useState(false);
  const [aiContactMethod, setAiContactMethod] = useState<any>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDraft, setAiDraft] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isSavingAiMsg, setIsSavingAiMsg] = useState(false);
  const [isLoggingInteraction, setIsLoggingInteraction] = useState(false);

  useEffect(() => {
    apiFetch(`/api/db/customers/${customerId}`).then(r => r.json()).then(data => {
      setCustomer(data);
      setEditForm({ ...data, contact_methods: data.contact_methods || [] });
    });
    apiFetch(`/api/db/customers/${customerId}/interactions`).then(r => r.json()).then(setInteractions);
    setTab('details');
    setNote('');
  }, [customerId]);

  const handleSaveInfo = async () => {
    setSaving(true);
    try {
      const r = await apiFetch(`/api/db/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          website: editForm.website,
          phone: editForm.phone,
          address: editForm.address,
          country: editForm.country,
          province: editForm.province,
          city: editForm.city,
          industry: editForm.industry,
          contact_methods: editForm.contact_methods
        })
      });
      if (r.ok) {
        setCustomer({ ...customer, ...editForm });
        onInteractionLogged({ ...editForm }); // Pass the edit form back to update listing
      }
    } catch(e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAiMsg = async () => {
    if (!aiPrompt) return;
    setIsGeneratingAi(true);
    try {
      const type = aiContactMethod.type;
      const r = await apiFetch("/api/ai/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          method_type: type,
          customer_info: customer
        })
      });
      const data = await r.json();
      if (data.message) {
        setAiDraft(data.message);
      } else {
        alert(data.error || "生成失败");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSendAiMsg = async () => {
    if (!aiDraft) return;
    setIsSavingAiMsg(true);
    try {
      const notes = `(${aiContactMethod.type}) AI 生成跟进: ${aiDraft}`;
      const r = await apiFetch(`/api/db/customers/${customerId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, type: aiContactMethod.type, notes })
      });
      if (r.ok) {
        const i = await r.json();
        setInteractions([i, ...interactions]);
        onInteractionLogged();

        // Generate Link and open
        let sendLink = '';
        const encoded = encodeURIComponent(aiDraft);
        const val = aiContactMethod.value;
        if (aiContactMethod.type === 'whatsapp') {
          sendLink = `https://wa.me/${val.replace(/[^0-9]/g, '')}?text=${encoded}`;
        } else if (aiContactMethod.type === 'email') {
          sendLink = `mailto:${val}?body=${encoded}`;
        } else if (aiContactMethod.type === 'telegram') {
          sendLink = `https://t.me/${val.replace('@', '')}?text=${encoded}`;
        } else if (aiContactMethod.type === 'messenger') {
          sendLink = `https://m.me/${val}`; // messenger can't easily prefill text
          alert("Messenger 不能直接填入文本，文本已复制到剪贴板，请手动粘贴。");
          try { navigator.clipboard.writeText(aiDraft); } catch(e){}
        } else {
          try { navigator.clipboard.writeText(aiDraft); } catch(e){}
          alert("消息已复制到剪贴板。");
        }
        
        if (sendLink) {
          window.open(sendLink, '_blank');
        }

        setShowAiModal(false);
        setAiPrompt('');
        setAiDraft('');
        setAiContactMethod(null);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsSavingAiMsg(false);
    }
  };

  const handleLogInteraction = async () => {
    if (!note) return;
    setIsLoggingInteraction(true);
    try {
      const r = await apiFetch(`/api/db/customers/${customerId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, type: 'Note', notes: note })
      });
      if (r.ok) {
        const i = await r.json();
        setInteractions([i, ...interactions]);
        setNote('');
        setTab('details');
        onInteractionLogged(); // Refresh listing parent to update "days idle"
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsLoggingInteraction(false);
    }
  };

  if (!customer) return (
    <div className="flex-1 p-8 space-y-6 flex flex-col">
      <div className="h-8 w-1/3 bg-slate-200 rounded animate-pulse mb-2"></div>
      <div className="flex gap-6">
        <div className="h-32 flex-[2] bg-slate-100 rounded-lg animate-pulse"></div>
        <div className="h-32 flex-[1] bg-slate-100 rounded-lg animate-pulse"></div>
      </div>
      <div className="h-64 bg-slate-50 border border-slate-100 rounded-lg animate-pulse flex-1 mt-4"></div>
    </div>
  );

  return (
    <>
      <div className="p-6 border-b border-slate-200 flex-shrink-0 bg-slate-50 relative">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {customer.name}
              {customer.ai_agent_status === 'active' && (
                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                  AI 托管中
                </span>
              )}
            </h3>
            <div className="text-xs text-slate-500 mt-1 flex gap-4 tabular-nums">
              {customer.phone && <span>{customer.phone}</span>}
              {customer.website && <a href={customer.website} target="_blank" className="text-blue-600 hover:underline">{customer.website.replace(/^https?:\/\//, '')}</a>}
            </div>
          </div>
          <button 
            onClick={() => setShowAiAgentModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold ${customer.ai_agent_status === 'active' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
          >
            <Bot size={14} />
            {customer.ai_agent_status === 'active' ? 'AI Agent 设置' : '托管给 AI'}
          </button>
        </div>
      </div>
      
      <div className="flex border-b border-slate-200 px-4 flex-shrink-0 bg-white">
        <button 
          onClick={() => setTab('details')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${tab === 'details' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          跟进记录
        </button>
        <button 
          onClick={() => setTab('log')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${tab === 'log' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          新增跟进
        </button>
        <button 
          onClick={() => setTab('info')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${tab === 'info' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          客户信息
        </button>
      </div>

      <div className="p-6 overflow-y-auto flex-1 bg-white">
        {tab === 'info' && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">客户名称</label>
              <input 
                type="text" 
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={editForm.name || ''}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">国家</label>
                <CountrySelect 
                  value={editForm.country || ''} 
                  onChange={val => setEditForm({ ...editForm, country: val })} 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">省份 / 州</label>
                <input 
                  type="text" 
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={editForm.province || ''}
                  onChange={e => setEditForm({ ...editForm, province: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">城市</label>
                <input 
                  type="text" 
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={editForm.city || ''}
                  onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">详细地址</label>
                <input 
                  type="text" 
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={editForm.address || ''}
                  onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">行业 / 类型</label>
                <input 
                  type="text" 
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={editForm.industry || ''}
                  onChange={e => setEditForm({ ...editForm, industry: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">联系电话</label>
                <input 
                  type="text" 
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={editForm.phone || ''}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">网站</label>
                <input 
                  type="text" 
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={editForm.website || ''}
                  onChange={e => setEditForm({ ...editForm, website: e.target.value })}
                />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">客户来源 / 关键词</label>
                <div className="w-full text-sm bg-slate-100/70 border border-slate-200 rounded p-2 text-slate-600">
                  {customer.source === 'outscraper' ? 'Outscraper 采集' : customer.source === 'csv_import' ? 'CSV 导入' : '手动录入'}
                  {customer.source_keyword && <span className="text-slate-500 ml-1">({customer.source_keyword})</span>}
                </div>
              </div>
            </div>
            
            <div className="border-t border-slate-200 pt-4 mt-2">
               <div className="flex items-center justify-between mb-2">
                 <label className="block text-sm font-semibold text-slate-700">其他联系方式</label>
                 <button 
                   onClick={() => setEditForm((prev: any) => ({ 
                     ...prev, 
                     contact_methods: [...(prev.contact_methods || []), { type: 'phone', value: '' }] 
                   }))}
                   className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                 >
                   <Plus className="w-3.5 h-3.5" />
                   添加联系方式
                 </button>
               </div>
               
               <div className="space-y-3">
                 {(editForm.contact_methods || []).map((contact: any, index: number) => (
                   <div key={index} className="flex items-center gap-2">
                     <select 
                       className="text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 shrink-0"
                       value={contact.type}
                       onChange={e => {
                         const methods = [...editForm.contact_methods];
                         methods[index].type = e.target.value;
                         setEditForm({ ...editForm, contact_methods: methods });
                       }}
                     >
                       <option value="phone">电话</option>
                       <option value="email">Email</option>
                       <option value="whatsapp">WhatsApp</option>
                       <option value="messenger">Messenger</option>
                       <option value="telegram">Telegram</option>
                       <option value="other">其他</option>
                     </select>
                     <input 
                       type="text" 
                       placeholder="请输入账号或号码..."
                       className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                       value={contact.value}
                       onChange={e => {
                         const methods = [...editForm.contact_methods];
                         methods[index].value = e.target.value;
                         setEditForm({ ...editForm, contact_methods: methods });
                       }}
                     />
                     {contact.value && ['whatsapp', 'email', 'messenger', 'telegram'].includes(contact.type) && (
                       <button
                         onClick={() => {
                           setAiContactMethod(contact);
                           setShowAiModal(true);
                         }}
                         className="text-purple-500 hover:text-purple-700 shrink-0 p-1"
                         title="AI 辅写并跟进"
                       >
                         <Wand2 className="w-4 h-4" />
                       </button>
                     )}
                     <button
                       onClick={() => {
                         const methods = editForm.contact_methods.filter((_: any, i: number) => i !== index);
                         setEditForm({ ...editForm, contact_methods: methods });
                       }}
                       className="text-slate-400 hover:text-red-500 shrink-0 p-1"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                 ))}
                 {(editForm.contact_methods || []).length === 0 && (
                   <div className="text-sm text-slate-500 italic py-2">暂无其他联系方式，点击右上角添加。</div>
                 )}
               </div>
            </div>

            <div className="pt-4">
              <button 
                disabled={saving}
                onClick={handleSaveInfo}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded shadow-sm transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存更改'}
              </button>
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div className="space-y-4 max-w-2xl">
            <label className="block text-sm font-semibold text-slate-700">跟进内容</label>
            <textarea 
              rows={4}
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入沟通详情..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <button 
              onClick={handleLogInteraction}
              disabled={isLoggingInteraction}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoggingInteraction ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              保存记录并刷新时间
            </button>
          </div>
        )}

        {tab === 'details' && (
          <div className="space-y-6">
            <div className="border-l-2 border-slate-200 ml-2 space-y-6">
              {interactions.length === 0 ? (
                <div className="pl-6 text-sm text-slate-500 italic">暂无联系记录。</div>
              ) : interactions.map(i => (
                <div key={i.id} className="relative pl-6">
                  <div className="absolute top-1.5 -left-[5px] w-2 h-2 rounded-full bg-blue-400 border-2 border-white"></div>
                  <div className="text-xs text-slate-400 mb-1 font-medium">
                    {new Date(i.created_at).toLocaleString()} • {i.user_name || 'User'}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 text-sm text-slate-700">
                    {i.notes}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAiModal && aiContactMethod && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800">
                <Wand2 className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold">撰写 {aiContactMethod.type} 消息</h3>
              </div>
              <button onClick={() => setShowAiModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">跟进提示词</label>
                <textarea 
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-3 focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[80px]"
                  placeholder="你想说什么？例如：问候客户，询问产品是否有更新需求..."
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                />
                <button 
                  onClick={handleGenerateAiMsg}
                  disabled={isGeneratingAi || !aiPrompt}
                  className="mt-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 text-sm font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
                >
                  {isGeneratingAi ? '正在生成...' : '生成消息'}
                </button>
              </div>

              {aiDraft && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">消息草稿 (可编辑)</label>
                  <textarea 
                    className="w-full text-sm bg-white border border-slate-200 rounded p-3 min-h-[100px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={aiDraft}
                    onChange={e => setAiDraft(e.target.value)}
                  />
                  <div className="mt-4 flex gap-3">
                    <button 
                      onClick={() => setShowAiModal(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded transition-colors"
                    >
                      取消
                    </button>
                    <button 
                      onClick={handleSendAiMsg}
                      disabled={isSavingAiMsg}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isSavingAiMsg ? '保存中...' : '保存记录并打开'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAiAgentModal && (
        <AiAgentModal 
          customer={customer} 
          user={user}
          updatePreference={updatePreference}
          onClose={() => setShowAiAgentModal(false)} 
          onUpdate={() => {
            apiFetch(`/api/db/customers/${customerId}`).then(r => r.json()).then(data => {
               setCustomer(data);
               setEditForm({ ...data, contact_methods: data.contact_methods || [] });
               onInteractionLogged({ ai_agent_status: data.ai_agent_status, ai_agent_workflow: data.ai_agent_workflow });
            });
          }} 
        />
      )}
    </>
  );
}
