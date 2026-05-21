import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import { Bot, X } from 'lucide-react';

export function AiAgentModal({ customer, user, updatePreference, onClose, onUpdate }: { customer: any, user: any, updatePreference: any, onClose: () => void, onUpdate: () => void }) {
  const defaultWorkflows = [
    { 
      id: 'w1', name: '新客户破冰', channel: 'email', prompt: '介绍我们的公司和产品优势，尝试预约一个15分钟的线上会议。注意语气专业、热情。', 
      steps: [
        { id: '1', channel: 'email', delayDays: 0, prompt: '介绍我们的公司和产品优势，尝试预约线上会议。' },
        { id: '2', channel: 'email', delayDays: 3, prompt: '询问是否收到上一封邮件，提供额外的客户成功案例。' },
        { id: '3', channel: 'email', delayDays: 3, prompt: '最后一次跟进，询问目前是否有合适的项目可以合作或保持联系。' }
      ]
    },
    { 
      id: 'w2', name: '展会后跟进', channel: 'email', prompt: '感谢客户参观我们的展位，附上我们的产品目录链接，询问他们目前的采购计划。', 
      steps: [
        { id: '1', channel: 'email', delayDays: 0, prompt: '感谢客户参观展位，附上产品目录链接。' },
        { id: '2', channel: 'email', delayDays: 2, prompt: '询问是否需要进一步的产品解答或报价。' },
        { id: '3', channel: 'email', delayDays: 2, prompt: '提供展会专属的折扣或免费样品体验。' },
        { id: '4', channel: 'email', delayDays: 2, prompt: '询问近期的采购计划是否已经确定。' }
      ] 
    },
    { 
      id: 'w3', name: '定期唤醒', channel: 'email', prompt: '分享我们最近的新产品或行业动态，询问客户最近是否有新的需求可以合作。', 
      steps: [
        { id: '1', channel: 'email', delayDays: 0, prompt: '分享最近的新产品更新和行业动态。' },
        { id: '2', channel: 'email', delayDays: 7, prompt: '询问客户目前团队是否有痛点，推荐相关解决方案。' }
      ] 
    },
    { 
      id: 'w4', name: 'WhatsApp 快速跟进', channel: 'whatsapp', prompt: '用简短的语言询问近况，并附上一张产品的最新图片/海报。', 
      steps: [
        { id: '1', channel: 'whatsapp', delayDays: 0, prompt: '简短打招呼问候，发送一张产品图片建立印象。' },
        { id: '2', channel: 'whatsapp', delayDays: 3, prompt: '询问是否有空安排一个快速语音通话。' }
      ] 
    }
  ];

  const prefs = typeof user?.preferences === 'string' ? JSON.parse(user.preferences) : (user?.preferences || {});
  const rawWorkflows = prefs.aiWorkflows || defaultWorkflows;
  const workflows = rawWorkflows.map((rw: any) => {
    if (!rw.steps || rw.steps.length === 0) {
      const dw = defaultWorkflows.find(d => d.id === rw.id);
      if (dw && dw.steps) {
        return { ...rw, steps: dw.steps };
      }
    }
    return rw;
  });

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('custom');
  
  const [prompt, setPrompt] = useState('');
  const [contactChannel, setContactChannel] = useState('email');
  const [steps, setSteps] = useState<{id: string, channel: string, delayDays: number, prompt: string}[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (customer.ai_agent_status === 'active' && customer.ai_agent_workflow) {
      let wf = typeof customer.ai_agent_workflow === 'string' ? JSON.parse(customer.ai_agent_workflow) : customer.ai_agent_workflow;
      setPrompt(wf.prompt || '');
      setContactChannel(wf.channel || 'email');
      if (wf.steps && wf.steps.length > 0) {
        setSteps(wf.steps);
      } else {
        setSteps(Array.from({ length: wf.max_steps || 3 }).map((_, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          channel: wf.channel || 'email',
          delayDays: i === 0 ? 0 : (wf.interval_days || 3),
          prompt: i === 0 ? '起草并发送首封破冰/跟进消息' : '如未收到回复，尝试尝试不同角度继续跟进'
        })));
      }
    } else if (workflows.length > 0) {
      setSelectedWorkflowId(workflows[0].id);
      setPrompt(workflows[0].prompt);
      setContactChannel('email');
      if (workflows[0].steps && workflows[0].steps.length > 0) {
        setSteps(workflows[0].steps);
      } else {
        setSteps(Array.from({ length: workflows[0].maxSteps || 3 }).map((_, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          channel: workflows[0].channel || 'email',
          delayDays: i === 0 ? 0 : (workflows[0].intervalDays || 3),
          prompt: i === 0 ? '起草并发送首封破冰/跟进消息' : '如未收到回复，尝试尝试不同角度继续跟进'
        })));
      }
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
        setContactChannel(w.channel || 'email');
        if (w.steps && w.steps.length > 0) {
          setSteps(w.steps);
        } else {
          setSteps(Array.from({ length: w.maxSteps || 3 }).map((_, i) => ({
            id: Math.random().toString(36).substr(2, 9),
            channel: w.channel || 'email',
            delayDays: i === 0 ? 0 : (w.intervalDays || 3),
            prompt: i === 0 ? '起草并发送首封破冰/跟进消息' : '如未收到回复，尝试不同角度继续跟进'
          })));
        }
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
          workflow: { prompt, current_step: 0, channel: contactChannel, steps }
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
                {editFlow === null && <button onClick={() => setEditFlow({ name: '', channel: 'email', prompt: '', steps: [{ id: Math.random().toString(36).substr(2, 9), channel: 'email', delayDays: 0, prompt: '起草并发送消息' }] })} className="text-blue-600 text-sm font-medium hover:underline">+ 新增预设</button>}
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">跟进目标 / 设定 (整体概念)</label>
                    <textarea rows={2} value={editFlow.prompt} onChange={e => setEditFlow({...editFlow, prompt: e.target.value})} className="w-full text-sm border-slate-300 rounded p-1.5 focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">预设跟进步骤</label>
                      <button 
                        onClick={() => {
                          const newSteps = [...(editFlow.steps || [])];
                          newSteps.push({ id: Math.random().toString(36).substr(2, 9), channel: editFlow.channel || 'email', delayDays: 3, prompt: '生成下一步跟进话术' });
                          setEditFlow({...editFlow, steps: newSteps});
                        }}
                        className="text-[10px] text-blue-600 font-medium hover:underline flex items-center gap-1"
                      >
                        + 新增预设步骤
                      </button>
                    </div>
                    {(editFlow.steps || []).map((step: any, index: number) => (
                      <div key={step.id || index} className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-2 relative group shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[10px] font-bold text-slate-600 bg-slate-100 flex items-center justify-center w-5 h-5 rounded-full">{index + 1}</div>
                          {index > 0 && (
                            <button onClick={() => {
                              const newSteps = [...editFlow.steps];
                              newSteps.splice(index, 1);
                              setEditFlow({...editFlow, steps: newSteps});
                            }} className="text-[10px] text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">删除</button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">联系渠道</label>
                            <select 
                              value={step.channel}
                              onChange={e => {
                                const newSteps = [...editFlow.steps];
                                newSteps[index].channel = e.target.value;
                                setEditFlow({...editFlow, steps: newSteps});
                              }}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-1"
                            >
                              <option value="email">邮件</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="linkedin">LinkedIn</option>
                              <option value="other">其他</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">跟进间隔 (天)</label>
                            <input 
                              type="number" min="0" disabled={index === 0}
                              value={step.delayDays}
                              onChange={e => {
                                const newSteps = [...editFlow.steps];
                                newSteps[index].delayDays = parseInt(e.target.value) || 0;
                                setEditFlow({...editFlow, steps: newSteps});
                              }}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-1 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">内容提示词</label>
                          <textarea 
                            rows={1}
                            value={step.prompt}
                            onChange={e => {
                              const newSteps = [...editFlow.steps];
                              newSteps[index].prompt = e.target.value;
                              setEditFlow({...editFlow, steps: newSteps});
                            }}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-1"
                          />
                        </div>
                      </div>
                    ))}
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
                        <button onClick={() => setEditFlow(w.steps ? w : { ...w, steps: Array.from({ length: w.maxSteps || 3 }).map((_, i) => ({ id: Math.random().toString(36).substr(2, 9), channel: w.channel || 'email', delayDays: i === 0 ? 0 : (w.intervalDays || 3), prompt: i === 0 ? w.prompt : '如未收到回复，准备继续跟进' })) })} className="text-xs text-blue-600 hover:underline">编辑</button>
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
                {steps.map((step, i) => (
                  <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-blue-500 text-slate-500 group-[.is-active]:text-blue-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                      {i + 1}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between space-x-2 mb-1">
                        <div className="font-bold text-slate-800 text-sm">
                          {i === 0 ? '第一步：破冰/初次跟进' : `第 ${i + 1} 步：跟进`}
                          <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                            {step.channel === 'whatsapp' ? 'WhatsApp' : step.channel === 'linkedin' ? 'LinkedIn' : step.channel === 'other' ? '其他' : '邮件'}
                          </span>
                        </div>
                        <time className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{i === 0 ? '立即执行' : `等待 ${step.delayDays} 天`}</time>
                      </div>
                      <div className="text-slate-500 text-xs">
                        {step.prompt}
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700">配置跟进步骤</label>
                    <button 
                      onClick={() => setSteps([...steps, { id: Math.random().toString(36).substr(2, 9), channel: contactChannel, delayDays: 3, prompt: '生成下一步跟进话术' }])}
                      className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
                    >
                      + 新增步骤
                    </button>
                  </div>
                  {steps.map((step, index) => (
                    <div key={step.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 relative group">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded">第 {index + 1} 步</div>
                        {index > 0 && (
                          <button onClick={() => setSteps(steps.filter((_, i) => i !== index))} className="text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">删除</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">联系方式</label>
                          <select 
                            value={step.channel}
                            onChange={e => setSteps(steps.map((s, i) => i === index ? { ...s, channel: e.target.value } : s))}
                            className="w-full text-xs bg-white border border-slate-200 rounded p-1.5"
                          >
                            <option value="email">邮件 (全自动代发)</option>
                            <option value="whatsapp">WhatsApp (需人工发送)</option>
                            <option value="linkedin">LinkedIn (需人工发送)</option>
                            <option value="other">其他 (需人工发送)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">跟进间隔 (天)</label>
                          <input 
                            type="number" 
                            min="0"
                            disabled={index === 0}
                            value={step.delayDays}
                            onChange={e => setSteps(steps.map((s, i) => i === index ? { ...s, delayDays: parseInt(e.target.value) || 0 } : s))}
                            className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">具体提示设定</label>
                        <textarea 
                          rows={2}
                          value={step.prompt}
                          onChange={e => setSteps(steps.map((s, i) => i === index ? { ...s, prompt: e.target.value } : s))}
                          className="w-full text-xs bg-white border border-slate-200 rounded p-1.5"
                        />
                      </div>
                    </div>
                  ))}
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
