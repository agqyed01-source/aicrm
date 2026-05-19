import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { apiFetch, setToken } from '../lib/api';

export default function AuthScreen({ onLogged }: { onLogged: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      if (isLogin) {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch(e) {
          throw new Error('Server returned an invalid response (might be starting up). Please try again.');
        }
        if (!res.ok) throw new Error(data.error || 'Login failed');
        setToken(data.token);
        onLogged();
      } else {
        const res = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password })
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch(e) {
          throw new Error('Server returned an invalid response. Please try again.');
        }
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        setMsg('Successfully registered! Please wait for an admin to approve your account before logging in.');
        setIsLogin(true);
      }
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center text-slate-800">
          {isLogin ? 'Login' : 'Register'}
        </h2>
        {msg && <div className={`text-sm mb-4 p-2 rounded ${msg.includes('wait') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{msg}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                required
                type="text"
                className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              required
              type="email"
              className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none pr-10"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded font-medium disabled:opacity-50 hover:bg-blue-700"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>
        <div className="mt-4 text-center text-sm">
          <button 
            onClick={() => { setIsLogin(!isLogin); setMsg(''); }}
            className="text-blue-600 hover:underline"
          >
            {isLogin ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    </div>
  );
}
