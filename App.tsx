
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

  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

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

  // Native Install Logic
  useEffect(() => {
    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      // Store the event so it can be triggered later.
      setInstallPrompt(e);
    };

    const installedHandler = () => {
      console.log('App was installed');
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  useEffect(() => {
    const loadedPlans = loadPlans();
    const loadedTrackers = loadTrackers();
    
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
    
    // Auto-navigate to last workout if it exists
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

  const handleInstallClick = async () => {
    if (installPrompt) {
      try {
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        if (outcome === 'accepted') {
          setIsInstalled(true);
        }
        setInstallPrompt(null);
      } catch (err) {
        console.error("Installation prompt failed:", err);
      }
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        alert("To install Lifter Pro on iOS: Tap the 'Share' icon (square with arrow) and select 'Add to Home Screen'.");
      } else {
        alert("To install Lifter Pro: Tap the browser menu (usually three dots) and select 'Install app' or 'Add to Home Screen'.");
      }
    }
  };

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
      alert("Error: Failed to process plan. Please try again with clearer text or PDF.");
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
    setCurrentDayIndex(0);
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

  const applyPendingUpdate = (scope: 'one-day' | 'this-day-plan' | 'all-weeks') => {
    if (!selectedPlanId || !activeTracker || !pendingUpdate) return;
    
    const surgical = (targetExercises: Exercise[]) => {
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

    const updatedPlans = plans.map(p => {
      if (p.id === selectedPlanId) {
        const newWeeks = p.weeks.map((week, wIdx) => {
          if (scope === 'one-day') return week;
          if (scope === 'this-day-plan' && wIdx !== currentWeek) return week;
          return { ...week, days: week.days.map((day, dIdx) => dIdx !== currentDayIndex ? day : { ...day, exercises: surgical(day.exercises) }) };
        });
        return { ...p, weeks: newWeeks };
      }
      return p;
    });

    const updatedTrackers = trackers.map(t => {
      if (t.planId === selectedPlanId) {
        const reps = t.repetitions.map((rep, rIdx) => {
          if (scope === 'one-day' && rIdx !== safeRepIndex) return rep;
          const newWeeks = rep.weeks.map((week, wIdx) => {
            if ((scope === 'one-day' || scope === 'this-day-plan') && wIdx !== currentWeek) return week;
            return { ...week, days: week.days.map((day, dIdx) => {
              if (dIdx !== currentDayIndex) return day;
              if (rIdx === safeRepIndex && wIdx === currentWeek) return { ...day, exercises: JSON.parse(JSON.stringify(pendingUpdate.newExercises)) };
              return { ...day, exercises: surgical(day.exercises) };
            })};
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-32 min-h-screen text-slate-900 safe-top">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black flex items-center gap-3 cursor-pointer" onClick={() => setView('plans')}>
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
            <img src="https://cdn-icons-png.flaticon.com/512/10520/10520593.png" alt="Icon" className="w-6 h-6 invert brightness-0" />
          </div>
          Lifter Pro
        </h1>
        {view !== 'plans' && (
          <button onClick={() => setView('plans')} className="text-slate-600 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100"><ChevronLeftIcon /> Library</button>
        )}
      </header>

      {view === 'plans' && (
        <div className="space-y-6 view-transition">
          {!isInstalled && (
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl overflow-hidden relative group border border-slate-800">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/30 blur-[80px] rounded-full group-hover:bg-blue-600/40 transition-all duration-500"></div>
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className="bg-white/10 p-6 rounded-[2rem] backdrop-blur-xl border border-white/10 shadow-inner">
                  <img src="https://cdn-icons-png.flaticon.com/512/10520/10520593.png" alt="Lifter Pro" className="w-16 h-16 invert brightness-0" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-2xl font-black mb-2 tracking-tight">Install Lifter Pro</h2>
                  <p className="text-slate-400 font-medium text-sm mb-6 leading-relaxed">Access your workouts instantly from your home screen. Experience the app in full screen with offline support.</p>
                  <button onClick={handleInstallClick} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-blue-600/40 active:scale-95 transition-all flex items-center justify-center gap-3 ring-4 ring-blue-600/20">
                    <PlusIcon /> Install Now
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-4">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest text-[10px]">Your Programs</h2>
            <button onClick={() => setView('import')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all shadow-md shadow-blue-200"><PlusIcon /> Import Plan</button>
          </div>

          <div className="grid gap-5">
            {plans.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
                <div className="inline-block p-6 bg-slate-50 rounded-full text-slate-300 mb-4">
                  <img src="https://cdn-icons-png.flaticon.com/512/10520/10520593.png" alt="Empty" className="w-12 h-12 grayscale opacity-20" />
                </div>
                <p className="text-slate-500 font-black text-lg">Your library is empty</p>
                <p className="text-slate-400 font-medium text-sm mb-6">Import a PDF or paste a workout text to start tracking.</p>
                <button onClick={() => setView('import')} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black active:scale-95 transition-all">Get Started</button>
              </div>
            ) : plans.map(plan => (
              <div key={plan.id} className="group bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-xl hover:border-blue-100 transition-all duration-300">
                <div className="flex-1">
                  <h3 className="text-xl font-bold group-hover:text-blue-600 transition-colors">{plan.name}</h3>
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 mt-2">
                    <span className="flex items-center gap-1.5 py-1 px-3 bg-slate-50 rounded-lg text-slate-500"><CalendarIcon /> {plan.durationWeeks} Weeks</span>
                    <span className="flex items-center gap-1.5 py-1 px-3 bg-blue-50 text-blue-500 rounded-lg">Created {new Date(plan.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button onClick={() => { if(confirm('Are you sure you want to delete this plan?')){ const p = plans.filter(x=>x.id!==plan.id); setPlans(p); savePlans(p); } }} className="p-4 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"><TrashIcon /></button>
                   <button onClick={() => { setSelectedPlanId(plan.id); setView('workout'); }} className="bg-slate-900 hover:bg-blue-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg transition-all active:scale-95">Track Workout</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'import' && (
        <div className="view-transition bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-2xl mx-auto border border-slate-50">
          <h2 className="text-2xl font-black mb-6">Import Program</h2>
          <div className="space-y-6">
            <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-[2rem] p-10 text-center cursor-pointer transition-all ${importFile ? 'bg-blue-50 border-blue-400' : 'hover:bg-slate-50 border-slate-200'}`}>
              <input type="file" ref={fileInputRef} onChange={(e) => {
                const f = e.target.files?.[0]; if(!f) return;
                const r = new FileReader(); r.onload = () => setImportFile({ data: (r.result as string).split(',')[1], mimeType: f.type }); r.readAsDataURL(f);
              }} className="hidden" accept="application/pdf" />
              <div className="flex flex-col items-center gap-3">
                <div className={`p-6 rounded-[1.5rem] shadow-lg transition-all ${importFile ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                   <FileIcon />
                </div>
                <span className="font-black text-lg">{importFile ? "PDF Loaded Successfully!" : "Upload Workout PDF"}</span>
                <p className="text-slate-400 text-xs font-medium">AI will parse your exercises, sets, and reps.</p>
              </div>
            </div>
            <div className="relative">
              <textarea className="w-full h-40 p-6 border border-slate-200 rounded-[1.5rem] bg-slate-50 outline-none text-sm font-medium focus:ring-4 focus:ring-blue-100 transition-all resize-none" placeholder="Or paste plan text here (e.g. 'Monday: Bench Press 3x10...')" value={importText} onChange={e => setImportText(e.target.value)}></textarea>
            </div>
            <button disabled={isImporting || (!importText.trim() && !importFile)} onClick={handleImport} className="w-full py-5 rounded-[1.5rem] font-black text-white bg-blue-600 shadow-xl shadow-blue-600/20 disabled:bg-slate-300 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3">
              {isImporting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Analyzing Program...
                </>
              ) : 'Generate My Schedule'}
            </button>
          </div>
        </div>
      )}

      {view === 'workout' && selectedPlan && activeTracker && (
        <div className="view-transition space-y-6">
          <div className="sticky top-0 bg-slate-50/95 backdrop-blur-md py-4 z-20 border-b border-slate-200 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-black text-slate-900 truncate tracking-tight">{selectedPlan.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {isRenamingRep ? (
                    <input className="bg-white border-2 border-blue-400 px-3 py-1 rounded-xl text-xs font-black outline-none text-blue-600" value={tempRepName} onChange={e => setTempRepName(e.target.value)} autoFocus onBlur={handleSaveRepName} onKeyDown={e => e.key==='Enter' && handleSaveRepName()} />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="relative inline-block">
                        <select className="bg-blue-50 text-blue-600 font-black pl-3 pr-8 py-1.5 rounded-xl text-[10px] uppercase border border-blue-100 outline-none appearance-none cursor-pointer" value={safeRepIndex} onChange={e => setViewingRepetitionIndex(parseInt(e.target.value))}>
                          {activeTracker.repetitions.map((rep, idx) => <option key={idx} value={idx}>{rep.name || `Session ${idx+1}`}</option>)}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none scale-75 text-blue-600 opacity-50"><ChevronRightIcon /></div>
                      </div>
                      <button onClick={() => { setIsRenamingRep(true); setTempRepName(activeRep?.name || `Session ${safeRepIndex+1}`); }} className="p-2 text-blue-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"><EditIcon /></button>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => startNewRepetition(selectedPlan.id)} className="bg-slate-900 text-white px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase hover:bg-blue-600 transition-all shadow-md active:scale-95">New Session</button>
            </div>

            <div className="flex gap-2 bg-white p-1.5 rounded-[1.5rem] shadow-sm border border-slate-100">
              <div className="flex-1 flex items-center justify-between bg-slate-50/70 rounded-2xl px-3 py-2">
                <button onClick={() => setCurrentWeek(Math.max(0, currentWeek - 1))} disabled={currentWeek === 0} className="p-1.5 disabled:opacity-20 hover:bg-white rounded-lg transition-all"><ChevronLeftIcon /></button>
                <div className="text-center"><span className="block text-[8px] font-black uppercase text-slate-400">Week</span><span className="font-black text-sm">{currentWeek + 1}</span></div>
                <button onClick={() => setCurrentWeek(Math.min(selectedPlan.durationWeeks - 1, currentWeek + 1))} disabled={currentWeek === selectedPlan.durationWeeks - 1} className="p-1.5 disabled:opacity-20 hover:bg-white rounded-lg transition-all"><ChevronRightIcon /></button>
              </div>
              <div className="flex-1 flex items-center justify-between bg-slate-50/70 rounded-2xl px-3 py-2">
                <button onClick={() => setCurrentDayIndex(Math.max(0, currentDayIndex - 1))} disabled={currentDayIndex === 0} className="p-1.5 disabled:opacity-20 hover:bg-white rounded-lg transition-all"><ChevronLeftIcon /></button>
                <div className="text-center"><span className="block text-[8px] font-black uppercase text-slate-400">Day</span><span className="font-black text-sm truncate max-w-[80px]">{currentDay?.dayName}</span></div>
                <button onClick={() => setCurrentDayIndex(Math.min(activeRep!.weeks[currentWeek].days.length - 1, currentDayIndex + 1))} disabled={currentDayIndex === activeRep!.weeks[currentWeek].days.length - 1} className="p-1.5 disabled:opacity-20 hover:bg-white rounded-lg transition-all"><ChevronRightIcon /></button>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-blue-600/10 rounded-[1.5rem] p-5 shadow-sm text-center">
            <h3 className="text-blue-600 font-black text-sm uppercase tracking-[0.2em]">{currentDay?.focus}</h3>
            <p className="text-slate-400 text-xs font-bold mt-1">{currentDay?.exercises.length} Exercises Today</p>
          </div>

          <div className="space-y-6">
            {currentDay?.exercises.map((exercise, idx) => (
              <div key={exercise.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300">
                <div className="p-6 bg-slate-50/30 border-b border-slate-100 flex justify-between items-start">
                  <div className="flex-1">
                    {editingExerciseId === exercise.id ? (
                      <div className="space-y-4">
                        <input className="text-lg font-black bg-white border-2 border-blue-200 px-4 py-2 rounded-2xl w-full outline-none focus:border-blue-500 transition-all" value={editValues.name} onChange={e => setEditValues({...editValues, name: e.target.value})} />
                        <div className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-[1.5rem] border border-blue-100">
                          <span className="text-[10px] font-black uppercase text-blue-600">Sets</span>
                          <div className="flex items-center gap-3">
                            <button onClick={() => setEditValues(v => ({...v, sets: Math.max(1, parseInt(v.sets)-1).toString()}))} className="w-8 h-8 rounded-xl bg-white border border-blue-200 flex items-center justify-center font-black text-blue-600 shadow-sm hover:bg-blue-600 hover:text-white transition-all text-sm">-</button>
                            <span className="font-black text-blue-800 text-lg w-4 text-center">{editValues.sets}</span>
                            <button onClick={() => setEditValues(v => ({...v, sets: (parseInt(v.sets)+1).toString()}))} className="w-8 h-8 rounded-xl bg-white border border-blue-200 flex items-center justify-center font-black text-blue-600 shadow-sm hover:bg-blue-600 hover:text-white transition-all text-sm">+</button>
                          </div>
                          <div className="flex-1 ml-2">
                             <input className="w-full text-sm font-black bg-white border border-blue-200 rounded-xl px-4 py-2 outline-none" placeholder="Reps (e.g. 10 or 10,8,6)" value={editValues.reps} onChange={e => setEditValues({...editValues, reps: e.target.value})} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">{exercise.name}</h3>
                        <div className="mt-2 inline-flex items-center gap-2 py-1 px-3 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                           {exercise.sets} Sets • {exercise.reps} Reps
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editingExerciseId === exercise.id ? (
                      <>
                        <button onClick={() => {
                          const newExs = currentDay.exercises.map(ex => ex.id === editingExerciseId ? { ...ex, name: editValues.name, sets: parseInt(editValues.sets) || 1, reps: editValues.reps } : ex);
                          setPendingUpdate({ type: 'edit', newExercises: newExs, affectedIndex: idx });
                        }} className="bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-black shadow-lg shadow-blue-200 active:scale-95 transition-all">Save</button>
                        <button onClick={() => setEditingExerciseId(null)} className="bg-slate-200 text-slate-600 px-5 py-2 rounded-xl text-xs font-black hover:bg-slate-300">Exit</button>
                      </>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingExerciseId(exercise.id); setEditValues({name: exercise.name, sets: exercise.sets.toString(), reps: exercise.reps}); }} className="p-3 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-2xl transition-all"><EditIcon /></button>
                        <button onClick={() => { if(confirm('Remove this exercise?')) setPendingUpdate({ type:'remove', newExercises: currentDay.exercises.filter(ex=>ex.id!==exercise.id), affectedIndex: idx }); }} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"><TrashIcon /></button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-6 space-y-5">
                   <div className="flex items-center gap-4 px-2 mb-1">
                     <div className="w-10"></div>
                     <div className="flex-1 text-[10px] font-black uppercase text-slate-400">Weight (kg)</div>
                     <div className="flex-1 text-[10px] font-black uppercase text-slate-400">Reps</div>
                   </div>
                  {Array.from({ length: exercise.sets }).map((_, setIdx) => {
                    const log = activeRep!.logs[`week_${currentWeek}`]?.[currentDay.id]?.[exercise.id]?.sets[setIdx] || { weight:'', reps:'' };
                    const tRArr = exercise.reps.split(/[,/x]/);
                    const targetReps = (tRArr[setIdx] || tRArr[0] || exercise.reps).trim();
                    return (
                      <div key={setIdx} className="flex items-center gap-4 group/set">
                        <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xs font-black text-slate-400 group-hover/set:bg-blue-50 group-hover/set:text-blue-400 transition-all">{setIdx+1}</div>
                        <div className="flex-1 relative">
                          <input type="text" inputMode="decimal" placeholder="Weight" value={log.weight} onChange={e => updateLog(activeTracker.id, safeRepIndex, currentWeek, currentDay.id, exercise.id, setIdx, 'weight', e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-[1.25rem] text-sm font-black focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all" />
                        </div>
                        <div className="flex-1 relative">
                          <input type="text" inputMode="numeric" placeholder={targetReps} value={log.reps} onChange={e => updateLog(activeTracker.id, safeRepIndex, currentWeek, currentDay.id, exercise.id, setIdx, 'reps', e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-[1.25rem] text-sm font-black focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={() => setPendingUpdate({ type:'add', newExercises: [...currentDay!.exercises, {id: crypto.randomUUID(), name:'New Exercise', sets:3, reps:'10'}] })} className="w-full py-10 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex items-center justify-center gap-3 text-slate-400 font-black hover:bg-white hover:text-blue-600 hover:border-blue-400 transition-all group">
              <div className="p-3 rounded-2xl bg-slate-50 group-hover:bg-blue-50 transition-all"><PlusIcon /></div>
              Add Another Exercise
            </button>
          </div>

          {pendingUpdate && (
            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[3rem] shadow-2xl p-10 max-w-sm w-full border border-slate-100 transform animate-in fade-in zoom-in duration-300">
                <div className="bg-blue-50 w-20 h-20 rounded-[2rem] flex items-center justify-center text-blue-600 mb-8 mx-auto shadow-inner">
                   <CalendarIcon />
                </div>
                <h3 className="text-2xl font-black mb-3 text-slate-900 text-center">Save Structure?</h3>
                <p className="text-slate-500 text-sm font-medium mb-10 text-center leading-relaxed">Changes to exercises can be applied locally or globally.</p>
                <div className="space-y-4">
                  <button onClick={() => applyPendingUpdate('one-day')} className="w-full py-5 rounded-2xl bg-blue-600 text-white font-black shadow-xl shadow-blue-600/20 active:scale-95 transition-all text-sm">
                    Only W{currentWeek+1} {currentDay?.dayName}
                  </button>
                  <button onClick={() => applyPendingUpdate('this-day-plan')} className="w-full py-5 rounded-2xl bg-slate-100 text-slate-700 font-black hover:bg-slate-200 active:scale-95 transition-all text-sm">
                    Update current session
                  </button>
                  <button onClick={() => applyPendingUpdate('all-weeks')} className="w-full py-5 rounded-2xl bg-slate-900 text-white font-black hover:bg-black active:scale-95 transition-all text-sm">
                    Apply to all future weeks
                  </button>
                  <div className="pt-6 text-center border-t border-slate-100 mt-2">
                    <button onClick={() => setPendingUpdate(null)} className="text-slate-400 font-black text-xs uppercase tracking-widest hover:text-red-500 transition-colors">Discard changes</button>
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
