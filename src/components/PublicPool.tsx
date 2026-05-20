import React, { useState, useEffect } from 'react';
import { Search, Pin, Tag, DownloadCloud, AlertCircle, RefreshCw, X, Map, List, Pencil, Wand2, Plus, UploadCloud } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch } from '../lib/api';
import MapChart from './MapChart';
import CountrySelect from './CountrySelect';
import { isMatchingSearch } from '../lib/utils';

export default function PublicPool({ user, hasOutscraper, updatePreference }: { user: any; hasOutscraper: boolean; updatePreference?: (k: string, v: any) => void }) {
  const prefs = typeof user?.preferences === 'string' ? JSON.parse(user.preferences) : (user?.preferences || {});

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTags, setSearchTags] = useState<string[]>(prefs.publicSearchTags || []);
  const [searchInput, setSearchInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState<any>({});
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [importQuery, setImportQuery] = useState(prefs.publicImportQuery || '');
  const [viewMode, setViewMode] = useState<'list' | 'map'>(prefs.publicViewMode || 'list');
  const [tooltipContent, setTooltipContent] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [savingField, setSavingField] = useState(false);

  const loadCustomers = () => {
    setLoading(true);
    apiFetch('/api/db/customers?filter=public')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setCustomers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const claimCustomer = async (id: number) => {
    if (!user) return;
    try {
      const r = await apiFetch(`/api/db/customers/${id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (r.ok) {
        setCustomers(customers.filter(c => c.id !== id));
      } else {
        const errorData = await r.json();
        alert(errorData.error || "认领失败");
      }
    } catch(e) {
      console.error(e);
      alert("认领失败，请重试");
    }
  };

  const togglePin = async (id: number, currentPin: boolean) => {
    try {
      const r = await apiFetch(`/api/db/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !currentPin })
      });
      if (r.ok) {
        setCustomers(customers.map(c => c.id === id ? { ...c, is_pinned: !currentPin } : c));
      }
    } catch(e) {
      console.error(e);
    }
  };

  const importFromOutscraper = async () => {
    if (!importQuery) return;
    setImporting(true);
    try {
      const r = await apiFetch('/api/outscraper/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: importQuery, limit: 10 })
      });
      const data = await r.json();
      if (data.success) {
        alert(`Successfully imported ${data.imported} leads!`);
        setShowImport(false);
        loadCustomers();
      } else {
        alert(data.error || 'Failed to import');
      }
    } catch(e) {
      alert('Error connecting to backend API');
    } finally {
      setImporting(false);
    }
  };

  const [translating, setTranslating] = useState(false);
  const handleTranslateQuery = async () => {
    if (!importQuery) return;
    setTranslating(true);
    try {
      const r = await apiFetch('/api/outscraper/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: importQuery })
      });
      const data = await r.json();
      if (data.translated) {
        setImportQuery(data.translated);
      } else if (data.error) {
        alert(data.error);
      }
    } catch(e) {
      alert('Error connecting to backend API');
    } finally {
      setTranslating(false);
    }
  };

  const handleAddManualCustomer = async () => {
    setAddingCustomer(true);
    try {
      const r = await apiFetch(`/api/db/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCustomerForm, owner_id: null, source: 'manual' })
      });
      if (r.ok) {
        setShowAddModal(false);
        setNewCustomerForm({});
        loadCustomers();
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
      formData.append('owner_id', 'null'); // Indicate public pool
      
      const r = await fetch('/api/db/customers/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      const data = await r.json();
      if (r.ok && data.success) {
        alert(`Successfully imported ${data.imported} records!`);
        setShowCsvModal(false);
        setCsvFile(null);
        loadCustomers();
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

  const handleCountryClick = (country: string) => {
    if (!searchTags.includes(country)) {
      handleSetSearchTags([...searchTags, country]);
    }
    handleSetViewMode('list');
  };

  const handleSetSearchTags = (tags: string[]) => {
    setSearchTags(tags);
    updatePreference('publicSearchTags', tags);
  };

  const handleSetViewMode = (mode: 'list' | 'map') => {
    setViewMode(mode);
    updatePreference('publicViewMode', mode);
  };

  const handleSaveEdit = async () => {
    if (!editingCustomer) return;
    setSavingField(true);
    try {
      const r = await apiFetch(`/api/db/customers/${editingCustomer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingCustomer.name,
          website: editingCustomer.website,
          phone: editingCustomer.phone,
          address: editingCustomer.address,
          country: editingCustomer.country,
          province: editingCustomer.province,
          city: editingCustomer.city,
          industry: editingCustomer.industry
        })
      });
      if (r.ok) {
        setCustomers(customers.map(c => c.id === editingCustomer.id ? { ...c, ...editingCustomer } : c));
        setEditingCustomer(null);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setSavingField(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="min-h-[4rem] h-auto py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between px-4 sm:px-6 shrink-0 gap-4">
        <div className="flex items-center gap-4 hover:border-slate-800">
          <h2 className="text-lg font-bold">公域客户池</h2>
          <div className="flex gap-2">
            <span className="bg-orange-50 text-orange-700 text-xs px-2.5 py-1 rounded-full border border-orange-100 font-medium">回收机制: 14天未跟进</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 mr-2">
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
              <h3 className="text-xl font-bold text-slate-800 mb-2">批量导入CSV</h3>
              <p className="text-sm text-slate-500 mb-6">上传CSV文件，自动解析并导入公海池。字段映射将自动进行 (如 Name, Phone, Address, Country, City, Industry)。</p>
              
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors relative cursor-pointer" onClick={() => document.getElementById('csv-upload')?.click()}>
                <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">{csvFile ? csvFile.name : '点击选择CSV文件'}</p>
                <input 
                  id="csv-upload"
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
              <p className="text-sm text-slate-500">添加客户到公域池</p>
            </div>
            
            <div className="p-6 overflow-y-auto w-full grid gap-4 grid-cols-2">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Company Name / 客户名称 *</label>
                <input 
                  type="text" 
                  value={newCustomerForm.name || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, name: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm font-medium" 
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Website</label>
                <input 
                  type="text" 
                  value={newCustomerForm.website || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, website: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
                <input 
                  type="text" 
                  value={newCustomerForm.phone || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, phone: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Country</label>
                <input 
                  type="text" 
                  value={newCustomerForm.country || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, country: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Industry</label>
                <input 
                  type="text" 
                  value={newCustomerForm.industry || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, industry: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Address</label>
                <input 
                  type="text" 
                  value={newCustomerForm.address || ''}
                  onChange={e => setNewCustomerForm({...newCustomerForm, address: e.target.value})}
                  className="w-full border-slate-300 rounded p-2 text-sm" 
                />
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
                {addingCustomer ? '保存中...' : '保存至公海'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outscraper import block */}
      {showImport && (
        <div className="mx-6 mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4 relative shadow-sm shrink-0">
          <button onClick={() => setShowImport(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={16}/></button>
          <h3 className="text-slate-800 font-semibold text-sm flex items-center gap-2 mb-3"><DownloadCloud size={16}/> Outscraper 客户信息导入</h3>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input 
                value={importQuery}
                onChange={e => {
                  setImportQuery(e.target.value);
                  updatePreference('publicImportQuery', e.target.value);
                }}
                placeholder="例如: 北京的科技公司" 
                className="w-full px-3 py-1.5 pr-8 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleTranslateQuery}
                disabled={translating || !importQuery}
                title="翻译为当地语言 (AI)"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-500 hover:text-purple-700 disabled:opacity-50"
              >
                {translating ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />}
              </button>
            </div>
            <button 
              onClick={importFromOutscraper}
              disabled={importing || !importQuery}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "获取并导入 10 条"}
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 overflow-hidden p-6 flex flex-col">
        {loading ? (
             <div className="py-20 text-center text-slate-500 text-sm">加载中...</div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 h-full flex flex-col overflow-hidden shadow-sm relative">
            {viewMode === 'map' ? (
              <div className="flex-1">
                <MapChart setTooltipContent={setTooltipContent} onCountryClick={handleCountryClick} customers={customers} />
                {tooltipContent && (
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur border border-slate-200 px-3 py-1.5 rounded text-sm shadow-sm font-semibold text-slate-800">
                    {tooltipContent}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-auto flex-1">
                  <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="w-12 px-4 py-3 text-center">📌</th>
                    <th className="px-4 py-3 font-semibold text-nowrap">客户名称</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">行业/分类</th>
                    <th className="px-4 py-3 font-semibold hidden sm:table-cell">联系方式</th>
                    <th className="px-4 py-3 font-semibold text-right text-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map(c => (
                     <tr key={c.id} className={c.is_pinned ? 'hover:bg-blue-50/50 bg-amber-50/20' : 'hover:bg-slate-50'}>
                       <td className="px-4 py-3 text-center">
                         <button 
                           onClick={() => togglePin(c.id, c.is_pinned)}
                           className={c.is_pinned ? 'text-amber-500' : 'text-slate-300 hover:text-slate-400'}
                         >
                           {c.is_pinned ? '⭐' : '☆'}
                         </button>
                       </td>
                       <td className="px-4 py-3 font-medium text-slate-900">
                         {c.name}
                         <div className="text-xs text-slate-500 mt-1 font-normal flex flex-wrap gap-2 items-center">
                           {c.source && (
                             <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] uppercase border border-slate-200">
                               {c.source === 'outscraper' ? 'Outscraper' : c.source === 'csv_import' ? 'CSV Import' : 'Manual'}
                             </span>
                           )}
                           {c.source === 'outscraper' && c.source_keyword && (
                             <span className="text-blue-600 text-[10px] truncate max-w-[120px]" title={c.source_keyword}>"{c.source_keyword}"</span>
                           )}
                           {c.source === 'csv_import' && c.source_keyword && (
                             <span className="text-slate-500 text-[10px] truncate max-w-[120px]" title={c.source_keyword}>{c.source_keyword}</span>
                           )}
                         </div>
                         {c.last_contacted_at && (
                           <div className="text-xs text-slate-500 mt-0.5 font-normal">
                             上次联系: {formatDistanceToNow(new Date(c.last_contacted_at))} 前
                           </div>
                         )}
                       </td>
                       <td className="px-4 py-3 hidden md:table-cell">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase mr-1">
                            {c.industry || '综合'}
                          </span>
                          {(Array.isArray(c.tags) ? c.tags : (typeof c.tags === 'string' ? (c.tags.startsWith('[') ? JSON.parse(c.tags) : c.tags.split(',')) : [])).slice(0, 2).map((t: string) => (
                            <span key={t} className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase mr-1 inline-block mt-1">
                              {t}
                            </span>
                          ))}
                       </td>
                       <td className="px-4 py-3 text-slate-600 hidden sm:table-cell tabular-nums text-xs">
                          <div>{c.phone || '-'}</div>
                          {c.website && <a href={c.website} target="_blank" className="text-blue-600 hover:underline">{c.website.replace('https://', '').replace('http://', '')}</a>}
                       </td>
                       <td className="px-4 py-3 text-right">
                         <div className="flex justify-end gap-3">
                           {user?.role === 'super_admin' && (
                             <button
                               onClick={() => setEditingCustomer(c)}
                               className="text-slate-400 hover:text-slate-600 font-semibold"
                               title="编辑"
                             >
                               <Pencil className="w-4 h-4" />
                             </button>
                           )}
                           <button 
                             onClick={() => claimCustomer(c.id)}
                             className="text-blue-600 hover:underline font-semibold text-xs text-nowrap"
                           >
                             立即认领
                           </button>
                         </div>
                       </td>
                     </tr>
                  ))}
                  {filtered.length === 0 && (
                     <tr>
                       <td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-sm">
                         没有找到客户。试试从 Outscraper 导入！
                       </td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="h-10 bg-slate-50 border-t border-slate-200 px-6 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
               <div>显示 {filtered.length} 条客户记录</div>
            </div>
            </>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal for Super Admin */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-slate-500" />
                编辑客户 (超级管理员)
              </h3>
              <button onClick={() => setEditingCustomer(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto python custom-scrollbar">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">客户名称</label>
                  <input 
                    type="text" 
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editingCustomer.name || ''}
                    onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">国家</label>
                    <CountrySelect 
                      value={editingCustomer.country || ''} 
                      onChange={val => setEditingCustomer({ ...editingCustomer, country: val })} 
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">省份 / 州</label>
                    <input 
                      type="text" 
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editingCustomer.province || ''}
                      onChange={e => setEditingCustomer({ ...editingCustomer, province: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">城市</label>
                    <input 
                      type="text" 
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editingCustomer.city || ''}
                      onChange={e => setEditingCustomer({ ...editingCustomer, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">详细地址</label>
                    <input 
                      type="text" 
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editingCustomer.address || ''}
                      onChange={e => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">行业 / 类型</label>
                    <input 
                      type="text" 
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editingCustomer.industry || ''}
                      onChange={e => setEditingCustomer({ ...editingCustomer, industry: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">联系电话</label>
                    <input 
                      type="text" 
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editingCustomer.phone || ''}
                      onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">网站</label>
                    <input 
                      type="text" 
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editingCustomer.website || ''}
                      onChange={e => setEditingCustomer({ ...editingCustomer, website: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
                disabled={savingField}
              >
                取消
              </button>
              <button 
                onClick={handleSaveEdit}
                disabled={savingField}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2 rounded shadow-sm transition-colors disabled:opacity-50"
              >
                {savingField ? '保存中...' : '保存更改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer System Log */}
      <footer className="px-6 py-2 bg-slate-50 border-t border-slate-200 flex gap-6 text-[10px] text-slate-500 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
          Postgres DB Connected (Primary)
        </div>
        <div className="ml-auto italic uppercase tracking-widest text-slate-400">
          Recycle Engine: 14d Inactivity Threshold
        </div>
      </footer>
    </>
  );
}
