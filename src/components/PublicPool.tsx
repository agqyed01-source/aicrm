import React, { useState, useEffect } from 'react';
import { Search, Pin, Tag, DownloadCloud, AlertCircle, RefreshCw, X, Map, List, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch } from '../lib/api';
import MapChart from './MapChart';
import CountrySelect from './CountrySelect';
import { isMatchingSearch } from '../lib/utils';

export default function PublicPool({ user, hasOutscraper }: { user: any; hasOutscraper: boolean }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importQuery, setImportQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
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
        loadCustomers();
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
        let msg = `Successfully imported ${data.imported} leads!`;
        if (data.optimizedQuery && data.optimizedQuery !== importQuery) {
          msg += `\n\nAI Optimized Search: "${data.optimizedQuery}"`;
        }
        alert(msg);
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
      setSearchTags([...searchTags, country]);
    }
    setViewMode('list');
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
        setEditingCustomer(null);
        loadCustomers();
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
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4 hover:border-slate-800">
          <h2 className="text-lg font-bold">公域客户池</h2>
          <div className="flex gap-2">
            <span className="bg-orange-50 text-orange-700 text-xs px-2.5 py-1 rounded-full border border-orange-100 font-medium">回收机制: 14天未跟进</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 mr-2">
            <button 
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <List className="w-3.5 h-3.5" />
              列表
            </button>
            <button 
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded ${viewMode === 'map' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Map className="w-3.5 h-3.5" />
              地图
            </button>
          </div>
          <button 
            onClick={() => setShowImport(true)}
            disabled={!hasOutscraper}
            className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            title={!hasOutscraper ? "OUTSCRAPER_API_KEY required in .env" : "Import from Google Maps"}
          >
            <DownloadCloud className="w-4 h-4" />
            从 Outscraper 导入
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
                onClick={() => setSearchTags(searchTags.filter(t => t !== tag))} 
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
                  setSearchTags([...searchTags, text]);
                  setSearchInput('');
                }
              } else if (e.key === 'Backspace' && !searchInput && searchTags.length > 0) {
                setSearchTags(searchTags.slice(0, -1));
              }
            }}
          />
        </div>
      </section>

      {/* Outscraper import block */}
      {showImport && (
        <div className="mx-6 mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4 relative shadow-sm shrink-0">
          <button onClick={() => setShowImport(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={16}/></button>
          <h3 className="text-slate-800 font-semibold text-sm flex items-center gap-2 mb-3"><DownloadCloud size={16}/> Outscraper 客户信息导入</h3>
          <div className="flex gap-3">
            <input 
              value={importQuery}
              onChange={e => setImportQuery(e.target.value)}
              placeholder="例如: 北京的科技公司" 
              className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
