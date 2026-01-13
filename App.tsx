
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { WorkoutPlan, Tracker, AppView, TrackerRepetition, WorkoutDay, Exercise, WorkoutWeek } from './types';
import { loadPlans, loadTrackers, savePlans, saveTrackers } from './utils/storage';
import { parseWorkoutPlan, ImportPayload } from './services/geminiService';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, DumbbellIcon, TrashIcon, CalendarIcon, EditIcon, FileIcon } from './components/Icons';

const App: React.FC = () => {
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [view, setView] = useState<AppView>('plans');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<{ data: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentWeek, setCurrentWeek] = useState(0);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [viewingRepetitionIndex, setViewingRepetitionIndex] = useState(0);

  // Exercise Editing State
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ name: string; sets: string; reps: string }>({ name: '', sets: '', reps: '' });
  
  // Pending update state for Scope Modal
  const [pendingUpdate, setPendingUpdate] = useState<{ 
    type: 'edit' | 'add' | 'remove' | 'reorder',
    newExercises: Exercise[],
    affectedIndex?: number 
  } | null>(null);

  // Repetition Renaming State
  const [isRenamingRep, setIsRenamingRep] = useState(false);
  const [tempRepName, setTempRepName] = useState('');

  useEffect(() => {
    const loadedPlans = loadPlans();
    const loadedTrackers = loadTrackers();
    
    // Migration logic for old data structure
    const migratedTrackers = loadedTrackers.map(t => {
      const plan = loadedPlans.find(p => p.id === t.planId);
      if (!plan) return t;
      const updatedReps = t.repetitions.map(rep => {
        if (!rep.weeks) {
          return { ...rep, weeks: JSON.parse(JSON.stringify(plan.weeks || [])) };
        }
        return rep;
      });
      return { ...t, repetitions: updatedReps };
    });

    setPlans(loadedPlans);
    setTrackers(migratedTrackers);
    
    if (migratedTrackers.length > 0) {
      const lastTracker = migratedTrackers[migratedTrackers.length - 1];
      const plan = loadedPlans.find(p => p.id === lastTracker.planId);
      if (plan) {
        setSelectedPlanId(plan.id);
        setViewingRepetitionIndex(lastTracker.currentRepetitionIndex);
        setView('workout');
      }
    }
  }, []);

  const handleImport = async () => {
    if (!importText.trim() && !importFile) return;
    setIsImporting(true);
    try {
      const parsed = await parseWorkoutPlan({ text: importText, file: importFile });
      const newPlan = parsed as WorkoutPlan;
      const updatedPlans = [...plans, newPlan];
      
      const newTracker: Tracker = {
        id: crypto.randomUUID(),
        planId: newPlan.id,
        currentRepetitionIndex: 0,
        repetitions: [{ 
          id: crypto.randomUUID(), 
          startedAt: Date.now(), 
          logs: {},
          weeks: JSON.parse(JSON.stringify(newPlan.weeks))
        }]
      };
      
      const updatedTrackers = [...trackers, newTracker];
      setPlans(updatedPlans);
      setTrackers(updatedTrackers);
      savePlans(updatedPlans);
      saveTrackers(updatedTrackers);
      setSelectedPlanId(newPlan.id);
      setViewingRepetitionIndex(0);
      setView('workout');
      setImportText('');
      setImportFile(null);
    } catch (err) {
      alert("Error: Failed to process plan.");
    } finally { setIsImporting(false); }
  };

  const startNewRepetition = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    
    const updatedTrackers = trackers.map(t => {
      if (t.planId === planId) {
        const newRep: TrackerRepetition = {
          id: crypto.randomUUID(),
          startedAt: Date.now(),
          logs: {},
          weeks: JSON.parse(JSON.stringify(plan.weeks))
        };
        const newIdx = t.repetitions.length;
        setViewingRepetitionIndex(newIdx);
        return { ...t, repetitions: [...t.repetitions, newRep], currentRepetitionIndex: newIdx };
      }
      return t;
    });
    setTrackers(updatedTrackers);
    saveTrackers(updatedTrackers);
    setCurrentWeek(0);
  };

  const selectedPlan = useMemo(() => plans.find(p => p.id === selectedPlanId), [plans, selectedPlanId]);
  const activeTracker = useMemo(() => trackers.find(t => t.planId === selectedPlanId), [trackers, selectedPlanId]);
  const safeRepIndex = useMemo(() => activeTracker ? Math.min(viewingRepetitionIndex, activeTracker.repetitions.length - 1) : 0, [activeTracker, viewingRepetitionIndex]);
  const activeRep = activeTracker?.repetitions[safeRepIndex];
  
  const currentWeekObj = activeRep?.weeks[currentWeek];
  const currentDay = currentWeekObj?.days[currentDayIndex];

  const updateLog = (trackerId: string, repIndex: number, week: number, dayId: string, exId: string, setIdx: number, field: 'weight' | 'reps', value: string) => {
    const updatedTrackers = trackers.map(t => {
      if (t.id === trackerId) {
        const reps = [...t.repetitions];
        const rep = { ...reps[repIndex] };
        const logs = { ...rep.logs };
        const weekKey = `week_${week}`;
        if (!logs[weekKey]) logs[weekKey] = {};
        if (!logs[weekKey][dayId]) logs[weekKey][dayId] = {};
        if (!logs[weekKey][dayId][exId]) logs[weekKey][dayId][exId] = { sets: [] };
        const exLog = { ...logs[weekKey][dayId][exId] };
        const sets = [...exLog.sets];
        if (!sets[setIdx]) sets[setIdx] = { weight: '', reps: '' };
        sets[setIdx] = { ...sets[setIdx], [field]: value };
        exLog.sets = sets;
        logs[weekKey][dayId][exId] = exLog;
        rep.logs = logs;
        reps[repIndex] = rep;
        return { ...t, repetitions: reps };
      }
      return t;
    });
    setTrackers(updatedTrackers);
    saveTrackers(updatedTrackers);
  };

  const handleSaveRepName = () => {
    if (!activeTracker || !tempRepName.trim()) { setIsRenamingRep(false); return; }
    const updatedTrackers = trackers.map(t => {
      if (t.id === activeTracker.id) {
        const reps = [...t.repetitions];
        reps[safeRepIndex] = { ...reps[safeRepIndex], name: tempRepName.trim() };
        return { ...t, repetitions: reps };
      }
      return t;
    });
    setTrackers(updatedTrackers);
    saveTrackers(updatedTrackers);
    setIsRenamingRep(false);
  };

  /**
   * Performs surgical updates on a day's exercises to avoid overwriting unrelated local changes.
   */
  const performSurgicalUpdate = (targetExercises: Exercise[]) => {
    const cloned = JSON.parse(JSON.stringify(targetExercises));
    if (!pendingUpdate) return cloned;

    switch(pendingUpdate.type) {
      case 'edit':
        if (pendingUpdate.affectedIndex !== undefined && cloned[pendingUpdate.affectedIndex]) {
          const source = pendingUpdate.newExercises[pendingUpdate.affectedIndex];
          cloned[pendingUpdate.affectedIndex] = { ...cloned[pendingUpdate.affectedIndex], name: source.name, sets: source.sets, reps: source.reps };
        }
        break;
      case 'add':
        const newEx = pendingUpdate.newExercises[pendingUpdate.newExercises.length - 1];
        cloned.push({ ...newEx, id: crypto.randomUUID() });
        break;
      case 'remove':
        if (pendingUpdate.affectedIndex !== undefined) {
          cloned.splice(pendingUpdate.affectedIndex, 1);
        }
        break;
      case 'reorder':
        return JSON.parse(JSON.stringify(pendingUpdate.newExercises));
    }
    return cloned;
  };

  const applyPendingUpdate = (scope: 'one-day' | 'this-day-plan' | 'all-weeks') => {
    if (!selectedPlanId || !activeTracker || !pendingUpdate) return;
    
    // 1. Update the Template Plan
    const updatedPlans = plans.map(p => {
      if (p.id === selectedPlanId) {
        const newWeeks = p.weeks.map((week, wIdx) => {
          // 'one-day' doesn't update template.
          if (scope === 'one-day') return week;
          // 'this-day-plan' only updates current week index.
          if (scope === 'this-day-plan' && wIdx !== currentWeek) return week;
          
          return {
            ...week,
            days: week.days.map((day, dIdx) => {
              if (dIdx !== currentDayIndex) return day;
              return { ...day, exercises: performSurgicalUpdate(day.exercises) };
            })
          };
        });
        return { ...p, weeks: newWeeks };
      }
      return p;
    });

    // 2. Update existing repetitions
    const updatedTrackers = trackers.map(t => {
      if (t.planId === selectedPlanId) {
        const reps = t.repetitions.map((rep, rIdx) => {
          // 'one-day' only affects current viewing rep.
          if (scope === 'one-day' && rIdx !== safeRepIndex) return rep;
          
          const newWeeks = rep.weeks.map((week, wIdx) => {
            if ((scope === 'one-day' || scope === 'this-day-plan') && wIdx !== currentWeek) return week;
            
            return {
              ...week,
              days: week.days.map((day, dIdx) => {
                if (dIdx !== currentDayIndex) return day;
                
                // If it's the exact session the user adjusted, use the user's manual result directly
                if (rIdx === safeRepIndex && wIdx === currentWeek) {
                  return { ...day, exercises: JSON.parse(JSON.stringify(pendingUpdate.newExercises)) };
                }
                
                // Otherwise surgically apply the specific change
                return { ...day, exercises: performSurgicalUpdate(day.exercises) };
              })
            };
          });
          return { ...rep, weeks: newWeeks };
        });
        return { ...t, repetitions: reps };
      }
      return t;
    });

    setPlans(updatedPlans);
    setTrackers(updatedTrackers);
    savePlans(updatedPlans);
    saveTrackers(updatedTrackers);
    setPendingUpdate(null);
    setEditingExerciseId(null);
  };

  const handleEditSave = () => {
    if (!currentDay || !editingExerciseId) return;
    const index = currentDay.exercises.findIndex(ex => ex.id === editingExerciseId);
    if (index === -1) return;

    const newExercises = currentDay.exercises.map(ex => {
      if (ex.id === editingExerciseId) {
        return { ...ex, name: editValues.name, sets: parseInt(editValues.sets) || 1, reps: editValues.reps };
      }
      return ex;
    });
    setPendingUpdate({ type: 'edit', newExercises, affectedIndex: index });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => { e.dataTransfer.setData('exIdx', index.toString()); };
  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (!currentDay) return;
    const dragIdx = parseInt(e.dataTransfer.getData('exIdx'));
    if (dragIdx === dropIdx) return;
    const newExercises = [...currentDay.exercises];
    const [removed] = newExercises.splice(dragIdx, 1);
    newExercises.splice(dropIdx, 0, removed);
    setPendingUpdate({ type: 'reorder', newExercises });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24 min-h-screen text-slate-900">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200"><DumbbellIcon /></div>
          Lifter Pro
        </h1>
        {view !== 'plans' && (
          <button onClick={() => setView('plans')} className="text-slate-600 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"><ChevronLeftIcon /> Plans</button>
        )}
      </header>

      {view === 'plans' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Workout Library</h2>
            <button onClick={() => setView('import')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all"><PlusIcon /> Import</button>
          </div>
          <div className="grid gap-5">
            {plans.map(plan => (
              <div key={plan.id} className="group bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all">
                <div className="flex-1">
                  <h3 className="text-xl font-bold group-hover:text-blue-600">{plan.name}</h3>
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-400 mt-1">
                    <span className="flex items-center gap-1.5"><CalendarIcon /> {plan.durationWeeks} Weeks</span>
                  </div>
                </div>
                <button onClick={() => { setSelectedPlanId(plan.id); setView('workout'); }} className="bg-slate-900 hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-md transition-all">Start Tracking</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'import' && (
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-2xl mx-auto">
          <h2 className="text-2xl font-black mb-6">Import Plan</h2>
          <div className="space-y-6">
            <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${importFile ? 'bg-blue-50 border-blue-400' : 'hover:bg-slate-50 border-slate-200'}`}>
              <input type="file" ref={fileInputRef} onChange={(e) => {
                const f = e.target.files?.[0]; if(!f) return;
                const r = new FileReader(); r.onload = () => setImportFile({ data: (r.result as string).split(',')[1], mimeType: f.type }); r.readAsDataURL(f);
              }} className="hidden" accept="application/pdf" />
              <div className="flex flex-col items-center gap-2">
                <div className={`p-4 rounded-full ${importFile ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><FileIcon /></div>
                <span className="font-bold">{importFile ? "PDF Selected" : "Upload Plan PDF"}</span>
              </div>
            </div>
            <textarea className="w-full h-40 p-5 border border-slate-200 rounded-2xl bg-slate-50 outline-none text-sm font-medium" placeholder="Or paste plan text here..." value={importText} onChange={e => setImportText(e.target.value)}></textarea>
            <button disabled={isImporting || (!importText.trim() && !importFile)} onClick={handleImport} className="w-full py-4 rounded-2xl font-black text-white bg-blue-600 shadow-lg shadow-blue-200 disabled:bg-slate-300">{isImporting ? 'Processing AI...' : 'Generate Plan'}</button>
          </div>
        </div>
      )}

      {view === 'workout' && selectedPlan && activeTracker && (
        <div className="space-y-6">
          <div className="sticky top-0 bg-slate-50/95 backdrop-blur-md py-4 z-20 border-b border-slate-200 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-black text-slate-900 truncate">{selectedPlan.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {isRenamingRep ? (
                    <input className="bg-white border border-blue-400 px-2 py-0.5 rounded text-xs font-bold outline-none text-blue-600" value={tempRepName} onChange={e => setTempRepName(e.target.value)} autoFocus onBlur={handleSaveRepName} onKeyDown={e => e.key==='Enter' && handleSaveRepName()} />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <select className="bg-blue-50 text-blue-600 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase border border-blue-100 outline-none" value={safeRepIndex} onChange={e => setViewingRepetitionIndex(parseInt(e.target.value))}>
                        {activeTracker.repetitions.map((rep, idx) => <option key={idx} value={idx}>{rep.name || `Repetition ${idx+1}`}</option>)}
                      </select>
                      <button onClick={() => { setIsRenamingRep(true); setTempRepName(activeRep?.name || `Repetition ${safeRepIndex+1}`); }} className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-lg"><EditIcon /></button>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => startNewRepetition(selectedPlan.id)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 transition-colors">Restart New</button>
            </div>

            <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex-1 flex items-center justify-between bg-slate-50/50 rounded-xl px-2 py-1.5">
                <button onClick={() => setCurrentWeek(Math.max(0, currentWeek - 1))} disabled={currentWeek === 0} className="p-1 disabled:opacity-20"><ChevronLeftIcon /></button>
                <div className="text-center"><span className="block text-[8px] font-black uppercase text-slate-400">Week</span><span className="font-bold text-sm">{currentWeek + 1}</span></div>
                <button onClick={() => setCurrentWeek(Math.min(selectedPlan.durationWeeks - 1, currentWeek + 1))} disabled={currentWeek === selectedPlan.durationWeeks - 1} className="p-1 disabled:opacity-20"><ChevronRightIcon /></button>
              </div>
              <div className="flex-1 flex items-center justify-between bg-slate-50/50 rounded-xl px-2 py-1.5">
                <button onClick={() => setCurrentDayIndex(Math.max(0, currentDayIndex - 1))} disabled={currentDayIndex === 0} className="p-1 disabled:opacity-20"><ChevronLeftIcon /></button>
                <div className="text-center"><span className="block text-[8px] font-black uppercase text-slate-400">Day</span><span className="font-bold text-sm truncate max-w-[70px]">{currentDay?.dayName}</span></div>
                <button onClick={() => setCurrentDayIndex(Math.min(activeRep!.weeks[currentWeek].days.length - 1, currentDayIndex + 1))} disabled={currentDayIndex === activeRep!.weeks[currentWeek].days.length - 1} className="p-1 disabled:opacity-20"><ChevronRightIcon /></button>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-blue-500/10 rounded-2xl p-3 shadow-sm text-center">
            <p className="text-blue-600 font-black text-sm uppercase tracking-widest">{currentDay?.focus}</p>
          </div>

          <div className="space-y-6">
            {currentDay?.exercises.map((exercise, idx) => (
              <div key={exercise.id} draggable={!editingExerciseId} onDragStart={e => handleDragStart(e, idx)} onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, idx)} className={`bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden transition-all ${!editingExerciseId ? 'hover:border-slate-300' : ''}`}>
                <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex justify-between items-start">
                  <div className="flex-1">
                    {editingExerciseId === exercise.id ? (
                      <div className="space-y-3">
                        <input className="text-lg font-black bg-white border border-blue-300 px-3 py-1 rounded-lg w-full" value={editValues.name} onChange={e => setEditValues({...editValues, name: e.target.value})} />
                        <div className="flex items-center gap-4 bg-blue-50 p-3 rounded-2xl">
                          <span className="text-[10px] font-black uppercase text-blue-600">Sets</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditValues(v => ({...v, sets: Math.max(1, parseInt(v.sets)-1).toString()}))} className="w-6 h-6 rounded-full bg-white border border-blue-200 flex items-center justify-center font-bold text-blue-600 shadow-sm">-</button>
                            <span className="font-bold text-blue-800">{editValues.sets}</span>
                            <button onClick={() => setEditValues(v => ({...v, sets: (parseInt(v.sets)+1).toString()}))} className="w-6 h-6 rounded-full bg-white border border-blue-200 flex items-center justify-center font-bold text-blue-600 shadow-sm">+</button>
                          </div>
                          <input className="flex-1 text-xs font-bold bg-white border border-blue-200 rounded px-2 py-1" placeholder="Reps" value={editValues.reps} onChange={e => setEditValues({...editValues, reps: e.target.value})} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-lg font-black text-slate-800">{exercise.name}</h3>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{exercise.sets} Sets • {exercise.reps} Reps</span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editingExerciseId === exercise.id ? (
                      <>
                        <button onClick={handleEditSave} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-md">Save</button>
                        <button onClick={() => setEditingExerciseId(null)} className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-black">Cancel</button>
                      </>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingExerciseId(exercise.id); setEditValues({name: exercise.name, sets: exercise.sets.toString(), reps: exercise.reps}); }} className="p-2 text-slate-300 hover:text-blue-500 rounded-xl transition-colors"><EditIcon /></button>
                        <button onClick={() => { if(confirm('Remove move?')) setPendingUpdate({ type:'remove', newExercises: currentDay.exercises.filter(ex=>ex.id!==exercise.id), affectedIndex: idx }); }} className="p-2 text-slate-300 hover:text-red-500 rounded-xl transition-colors"><TrashIcon /></button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {Array.from({ length: exercise.sets }).map((_, setIdx) => {
                    const log = activeRep!.logs[`week_${currentWeek}`]?.[currentDay.id]?.[exercise.id]?.sets[setIdx] || { weight:'', reps:'' };
                    const tRArr = exercise.reps.split(/[,/x]/);
                    const targetReps = (tRArr[setIdx] || tRArr[0] || exercise.reps).trim();
                    return (
                      <div key={setIdx} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">{setIdx+1}</div>
                        <input type="text" inputMode="decimal" placeholder="Weight" value={log.weight} onChange={e => updateLog(activeTracker.id, safeRepIndex, currentWeek, currentDay.id, exercise.id, setIdx, 'weight', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all" />
                        <input type="text" inputMode="numeric" placeholder={targetReps} value={log.reps} onChange={e => updateLog(activeTracker.id, safeRepIndex, currentWeek, currentDay.id, exercise.id, setIdx, 'reps', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={() => setPendingUpdate({ type:'add', newExercises: [...currentDay!.exercises, {id: crypto.randomUUID(), name:'New Move', sets:3, reps:'10'}] })} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center gap-3 text-slate-400 font-black hover:bg-white hover:text-blue-600 hover:border-blue-400 transition-all">
              <PlusIcon /> Add New Exercise
            </button>
          </div>

          {pendingUpdate && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full border border-slate-100 transform animate-in fade-in zoom-in duration-200">
                <h3 className="text-2xl font-black mb-1 text-slate-900">Update Scope</h3>
                <p className="text-slate-500 text-sm font-medium mb-8">Apply this change to:</p>
                <div className="space-y-4">
                  <button onClick={() => applyPendingUpdate('one-day')} className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black shadow-lg shadow-blue-200 active:scale-95 transition-all">
                    One day only (W{currentWeek+1})
                  </button>
                  <button onClick={() => applyPendingUpdate('this-day-plan')} className="w-full py-4 rounded-2xl bg-[#f0f4f8] text-[#3d5167] font-black active:scale-95 transition-all">
                    Just this session
                  </button>
                  <button onClick={() => applyPendingUpdate('all-weeks')} className="w-full py-4 rounded-2xl bg-[#f0f4f8] text-[#3d5167] font-black active:scale-95 transition-all">
                    This day in ALL weeks
                  </button>
                  <div className="pt-2 text-center">
                    <button onClick={() => setPendingUpdate(null)} className="text-[#a0acc0] font-bold text-sm hover:text-slate-600">Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
