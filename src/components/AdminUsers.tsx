import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { CheckCircle, XCircle } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdate = async (id: number, field: string, value: string) => {
    setUpdatingId(id);
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value })
      });
      setUsers(users.map(u => u.id === id ? { ...u, [field]: value } : u));
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse"></div>
      </h2>
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden text-sm">
         <div className="h-10 bg-slate-50 border-b border-slate-200"></div>
         {[1,2,3,4].map(i => (
           <div key={i} className="flex p-4 gap-4 border-b border-slate-100 items-center">
             <div className="h-4 w-4 bg-slate-200 rounded animate-pulse"></div>
             <div className="h-4 w-32 bg-slate-200 rounded animate-pulse"></div>
             <div className="h-4 w-48 bg-slate-100 rounded animate-pulse block"></div>
             <div className="h-4 w-20 bg-slate-100 rounded animate-pulse"></div>
             <div className="h-6 w-16 bg-slate-200 rounded-full animate-pulse"></div>
           </div>
         ))}
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">用户管理</h2>
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden text-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3 font-semibold text-slate-600">ID</th>
              <th className="p-3 font-semibold text-slate-600">姓名</th>
              <th className="p-3 font-semibold text-slate-600">邮箱</th>
              <th className="p-3 font-semibold text-slate-600">角色</th>
              <th className="p-3 font-semibold text-slate-600">状态</th>
              <th className="p-3 font-semibold text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="p-3 text-slate-500">{u.id}</td>
                <td className="p-3 font-medium text-slate-800">{u.name}</td>
                <td className="p-3 text-slate-600">{u.email}</td>
                <td className="p-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleUpdate(u.id, 'role', e.target.value)}
                    disabled={updatingId === u.id}
                    className="border border-slate-300 rounded p-1 text-slate-700 bg-white disabled:opacity-50"
                  >
                    <option value="sales">销售 (Sales)</option>
                    <option value="super_admin">超级管理员</option>
                  </select>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    u.status === 'approved' ? 'bg-green-100 text-green-700' : 
                    u.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {u.status === 'approved' ? '已批准' : u.status === 'rejected' ? '已拒绝' : '待处理'}
                  </span>
                </td>
                <td className="p-3 flex gap-2">
                  {u.status !== 'approved' && (
                    <button 
                      onClick={() => handleUpdate(u.id, 'status', 'approved')}
                      disabled={updatingId === u.id}
                      className="text-green-600 hover:text-green-800 font-medium flex items-center gap-1 disabled:opacity-50"
                      title="批准"
                    >
                      <CheckCircle size={16} /> <span className="hidden lg:inline">批准</span>
                    </button>
                  )}
                  {u.status !== 'rejected' && (
                    <button 
                      onClick={() => handleUpdate(u.id, 'status', 'rejected')}
                      disabled={updatingId === u.id}
                      className="text-red-500 hover:text-red-700 font-medium flex items-center gap-1 disabled:opacity-50"
                      title="拒绝"
                    >
                      <XCircle size={16} /> <span className="hidden lg:inline">拒绝</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
