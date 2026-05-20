import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import { Bot, X } from 'lucide-react';

export function AiAgentModal({ customer, user, updatePreference, onClose, onUpdate }: { customer: any, user: any, updatePreference: any, onClose: () => void, onUpdate: () => void }) {
  const defaultWorkflows = [
    { id: 'w1', name: '新客户破冰', channel: 'email', prompt: '介绍我们的公司和产品优势，尝试预约一个15分钟的线上会议。注意语气专业、热情。', maxSteps: 3, intervalDays: 3 },
    { id: 'w2', name: '展会后跟进', channel: 'email', prompt: '感谢客户参观我们的展位，附上我们的产品目录链接，询问他们目前的采购计划。', maxSteps: 4, intervalDays: 2 },
    { id: 'w3', name: '定期唤醒', channel: 'email', prompt: '分享我们最近的新产品或行业动态，询问客户最近是否有新的需求可以合作。', maxSteps: 2, intervalDays: 7 },
    { id: 'w4', name: 'WhatsApp 快速跟进', channel: 'whatsapp', prompt: '用简短的语言询问近况，并附上一张产品的最新图片/海报。', maxSteps: 2, intervalDays: 3 }
  ];

  const prefs = typeof user?.preferences === 'string' ? JSON.parse(user.preferences) : (user?.preferences || {});
  const workflows = prefs.aiWorkflows || defaultWorkflows;

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('custom');
  
  const [prompt, setPrompt] = useState('');
  const [maxSteps, setMaxSteps] = useState(3);
  const [intervalDays, setIntervalDays] = useState(3);
  const [contactChannel, setContactChannel] = useState('email');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (customer.ai_agent_status === 'active' && customer.ai_agent_workflow) {
      let wf = typeof customer.ai_agent_workflow === 'string' ? JSON.parse(customer.ai_agent_workflow) : customer.ai_agent_workflow;
      setPrompt(wf.prompt || '');
      setMaxSteps(wf.max_steps || 3);
      setIntervalDays(wf.interval_days || 3);
      setContactChannel(wf.channel || 'email');
    } else if (workflows.length > 0) {
      setSelectedWorkflowId(workflows[0].id);
      setPrompt(workflows[0].prompt);
      setMaxSteps(workflows[0].maxSteps);
      setIntervalDays(workflows[0].intervalDays);
      setContactChannel('email');
    }
  }, [customer.id]);

  // Manage preset state
  const [manageMode, setManageMode] = useState(false);
  const [editFlow, setEditFlow] = useState<any>(null);

  const handleSelectWorkflow = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const wId = e.target.value;
    setSelectedWorkflowId(wId);
    if (wId !== 'custom' && wId !== 'manage') {
      const w = workflows.find((x: any) => x.id === wId);
      if (w) {
        setPrompt(w.prompt);
        setMaxSteps(w.maxSteps);
        setIntervalDays(w.intervalDays);
        setContactChannel(w.channel || 'email');
      }
    } else if (wId === 'manage') {
      setManageMode(true);
      setSelectedWorkflowId('custom'); // revert dropdown
    }
  };

  const saveWorkflows = (newWorkflows: any[]) => {
    if (updatePreference) updatePreference('aiWorkflows', newWorkflows);
  };

  const saveEditFlow = () => {
    if (!editFlow?.name || !editFlow?.prompt) return;
    let newWorkflows = [...workflows];
    if (editFlow.id) {
      newWorkflows = newWorkflows.map(w => w.id === editFlow.id ? editFlow : w);
    } else {
      newWorkflows.push({ ...editFlow, id: 'w-' + Date.now() });
    }
    saveWorkflows(newWorkflows);
    setEditFlow(null);
  };

  const deleteFlow = (id: string) => {
    saveWorkflows(workflows.filter((w: any) => w.id !== id));
  };


  const [planMode, setPlanMode] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/db/customers/${customer.id}/ai-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: { prompt, max_steps: maxSteps, interval_days: intervalDays, current_step: 0, channel: contactChannel }
        })
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        const data = await res.json();
        alert(data.error || '设置失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanPreview = () => {
    if (!prompt.trim()) {
      alert('请输入跟进目标 / 设定');
      return;
    }
    setPlanMode(true);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
       await apiFetch(`/api/db/customers/${customer.id}/ai-agent/stop`, { method: 'POST' });
       onUpdate();
       onClose();
    } catch (e) { }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bot size={20} className="text-blue-600" />
            为 {customer.name} 设置 AI Agent
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {manageMode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-800">管理工作流预设</h3>
                {editFlow === null && <button onClick={() => setEditFlow({ name: '', channel: 'email', prompt: '', maxSteps: 3, intervalDays: 3 })} className="text-blue-600 text-sm font-medium hover:underline">+ 新增预设</button>}
              </div>
              
              {editFlow ? (
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">模板名称</label>
                    <input type="text" value={editFlow.name} onChange={e => setEditFlow({...editFlow, name: e.target.value})} className="w-full text-sm border-slate-300 rounded p-1.5 focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">联系方式</label>
                    <select value={editFlow.channel || 'email'} onChange={e => setEditFlow({...editFlow, channel: e.target.value})} className="w-full text-sm border-slate-300 rounded p-1.5 focus:ring-1 focus:ring-blue-500">
                      <option value="email">邮件 (全自动代发)</option>
                      <option value="whatsapp">WhatsApp (生成草稿需人工发送)</option>
                      <option value="linkedin">LinkedIn (生成草稿需人工发送)</option>
                      <option value="other">其他 (生成草稿需人工发送)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">跟进目标 / 设定</label>
                    <textarea rows={2} value={editFlow.prompt} onChange={e => setEditFlow({...editFlow, prompt: e.target.value})} className="w-full text-sm border-slate-300 rounded p-1.5 focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">最大跟进次数</label>
                      <input type="number" value={editFlow.maxSteps} onChange={e => setEditFlow({...editFlow, maxSteps: parseInt(e.target.value) || 3})} className="w-full text-sm border-slate-300 rounded p-1.5" />
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">跟进间隔 (天)</label>
                      <input type="number" value={editFlow.intervalDays} onChange={e => setEditFlow({...editFlow, intervalDays: parseInt(e.target.value) || 3})} className="w-full text-sm border-slate-300 rounded p-1.5" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setEditFlow(null)} className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1">取消</button>
                    <button onClick={saveEditFlow} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">保存</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {workflows.map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between p-3 border border-slate-100 bg-slate-50 rounded-lg">
                      <div className="truncate pr-4 flex-1">
                        <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                          {w.name}
                          <span className="text-[10px] font-normal px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
                            {w.channel === 'whatsapp' ? 'WhatsApp' : w.channel === 'linkedin' ? 'LinkedIn' : w.channel === 'other' ? '其他' : '邮件'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate">{w.prompt}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setEditFlow(w)} className="text-xs text-blue-600 hover:underline">编辑</button>
                        <button onClick={() => deleteFlow(w.id)} className="text-xs text-red-600 hover:underline">删除</button>
                      </div>
                    </div>
                  ))}
                  {workflows.length === 0 && <div className="text-sm text-slate-500 text-center py-4">暂无自定义预设</div>}
                </div>
              )}
            </div>
          ) : planMode ? (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 text-sm mb-2 border-b border-slate-100 pb-2">工作流规划预览</h3>
              <div className="text-sm text-slate-600 mb-4 bg-blue-50 p-3 rounded border border-blue-100">
                <p className="font-medium text-blue-800 mb-1">跟进目标：</p>
                <div className="whitespace-pre-wrap">{prompt}</div>
              </div>
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                {Array.from({ length: maxSteps }).map((_, i) => (
                  <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-blue-500 text-slate-500 group-[.is-active]:text-blue-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                      {i + 1}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between space-x-2 mb-1">
                        <div className="font-bold text-slate-800 text-sm">{i === 0 ? '第一步：破冰/初次跟进' : `第 ${i + 1} 步：进一步跟进`}</div>
                        <time className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{i === 0 ? '立即执行' : `等待 ${i * intervalDays} 天`}</time>
                      </div>
                      <div className="text-slate-500 text-xs">
                        {i === 0 
                          ? (contactChannel === 'email' ? 'AI将分析客户资料与设定目标，起草并自动发送首封邮件。' : `AI将分析客户资料与设定目标，生成 ${contactChannel} 的跟进话术，等待您手动发送。`)
                          : (contactChannel === 'email' ? '如未收到回复，AI将总结之前的沟通，尝试不同角度继续自动发送跟进邮件。' : `如未收到进展，AI将生成下一步跟进话术，再次提醒您进行手动沟通。`)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {customer.ai_agent_status === 'active' && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700 font-semibold mb-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
                    AI Agent 当前处理中
                  </div>
                  <p className="text-sm text-blue-600">AI正准备在后台根据设定跟进此客户。</p>
                  <button 
                    onClick={handleStop}
                    disabled={loading}
                    className="mt-3 bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded text-sm hover:bg-red-50"
                  >
                    停止跟进
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">选择工作流预设</label>
                  <select 
                    value={selectedWorkflowId}
                    onChange={handleSelectWorkflow}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="custom">-- 自定义 --</option>
                    {workflows.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                    <option disabled>──────────</option>
                    <option value="manage">⚙️ 管理预设模板...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">选择联系方式</label>
                  <select 
                    value={contactChannel}
                    onChange={e => setContactChannel(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="email">邮件 (全自动代发)</option>
                    <option value="whatsapp">WhatsApp (生成草稿需人工发送)</option>
                    <option value="linkedin">LinkedIn (生成草稿需人工发送)</option>
                    <option value="other">其他 (生成草稿需人工发送)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">跟进目标 / 设定</label>
                  <textarea 
                    rows={3} 
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-blue-500"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="例如：介绍我们的服务并试图约一个15分钟的演示..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">最大跟进次数</label>
                    <input 
                      type="number" 
                      min="1" max="10"
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2"
                      value={maxSteps}
                      onChange={e => setMaxSteps(parseInt(e.target.value) || 3)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">跟进间隔 (天)</label>
                    <input 
                      type="number" 
                      min="1" max="30"
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2"
                      value={intervalDays}
                      onChange={e => setIntervalDays(parseInt(e.target.value) || 3)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={manageMode ? () => setManageMode(false) : planMode ? () => setPlanMode(false) : onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border border-transparent">
            {manageMode || planMode ? '返回修改' : '取消'}
          </button>
          {!manageMode && !planMode && (
            <button 
              onClick={handlePlanPreview}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-50"
            >
              <Bot size={16} />
              规划工作流
            </button>
          )}
          {planMode && (
            <button 
              onClick={handleStart}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-50"
            >
              <Bot size={16} />
              确定并开始托管
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
