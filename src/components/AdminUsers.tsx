import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { CheckCircle, XCircle } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value })
      });
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading users...</div>;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">User Management</h2>
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden text-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3 font-semibold text-slate-600">ID</th>
              <th className="p-3 font-semibold text-slate-600">Name</th>
              <th className="p-3 font-semibold text-slate-600">Email</th>
              <th className="p-3 font-semibold text-slate-600">Role</th>
              <th className="p-3 font-semibold text-slate-600">Status</th>
              <th className="p-3 font-semibold text-slate-600">Actions</th>
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
                    className="border border-slate-300 rounded p-1 text-slate-700 bg-white"
                  >
                    <option value="sales">Sales</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    u.status === 'approved' ? 'bg-green-100 text-green-700' : 
                    u.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {u.status.toUpperCase()}
                  </span>
                </td>
                <td className="p-3 flex gap-2">
                  {u.status !== 'approved' && (
                    <button 
                      onClick={() => handleUpdate(u.id, 'status', 'approved')}
                      className="text-green-600 hover:text-green-800 font-medium flex items-center gap-1"
                      title="Approve"
                    >
                      <CheckCircle size={16} /> <span className="hidden lg:inline">Approve</span>
                    </button>
                  )}
                  {u.status !== 'rejected' && (
                    <button 
                      onClick={() => handleUpdate(u.id, 'status', 'rejected')}
                      className="text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                      title="Reject"
                    >
                      <XCircle size={16} /> <span className="hidden lg:inline">Reject</span>
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
