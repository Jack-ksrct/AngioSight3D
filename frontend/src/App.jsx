import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Check, ChevronRight, ClipboardList, HeartPulse, Info, Monitor, Moon, RotateCcw, Search, ShieldCheck, Sparkles, Stethoscope, Sun, Upload, X } from 'lucide-react';
import DeferredAnatomyViewer from './DeferredAnatomyViewer.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const vessels = ['LAD', 'LCX', 'RCA'];

function color(probability) {
  if (probability == null) return '#617080';
  if (probability >= 0.7) return '#d95163';
  if (probability >= 0.4) return '#bf8a35';
  return '#008f91';
}

export default function App() {
  const [features, setFeatures] = useState({});
  const [predictions, setPredictions] = useState(null);
  const [selected, setSelected] = useState('LAD');
  const [status, setStatus] = useState('Enter the information you have, then calculate an estimate.');
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [activeGroup, setActiveGroup] = useState('profile');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  const [theme, setTheme] = useState(() => {
    try { const saved = localStorage.getItem('cardiomap-theme'); return ['system', 'light', 'dark'].includes(saved) ? saved : 'system'; }
    catch { return 'system'; }
  });
  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolved = theme === 'system' ? (preference.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#081a2b' : '#f3f8fb');
    };
    applyTheme();
    if (theme === 'system') preference.addEventListener('change', applyTheme);
    return () => preference.removeEventListener('change', applyTheme);
  }, [theme]);
  useEffect(() => { try { localStorage.setItem('cardiomap-theme', theme); } catch { /* Theme preference is optional. */ } }, [theme]);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1550);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/metadata`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Unable to load model information.');
        return data;
      })
      .then(data => {
        setMetrics(data);
        if (data.feature_schema) {
          const initial = {};
          for (const [key, schema] of Object.entries(data.feature_schema)) initial[key] = schema.type === 'number' ? null : '';
          setFeatures(initial);
        } else {
          setStatus(data.message || 'No trained model is available. Train a model and restart the API.');
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setMetrics({ trained: false });
          setStatus('Cannot reach the CardioMap API. Start the API service, then reload this page.');
        }
      });
    return () => controller.abort();
  }, []);
  const probabilities = Object.fromEntries(vessels.map(v=>[v,predictions?.[v]?.probability ?? null]));
  function update(key,value) { setFeatures(prev=>({...prev,[key]:value})); }
  async function predict() {
    setBusy(true); setStatus('');
    try {
      const res = await fetch(`${API_URL}/predict`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({features}),signal:AbortSignal.timeout(15000)});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || data.detail?.message || (typeof data.detail==='string'?data.detail:undefined) || `The estimate could not be calculated (request ${res.status}).`);
      setPredictions(data.predictions); setStatus('Estimate updated. This is educational decision support only.');
    } catch(e) { setStatus(e.name === 'TimeoutError' ? 'The request took too long. Check the API service and try again.' : e.message || 'The API is unavailable. Check the service and try again.'); }
    finally { setBusy(false); }
  }
  const featureKeys = metrics?.feature_schema ? Object.keys(metrics.feature_schema) : [];
  const featureGroups = [
    { id:'profile', label:'Profile', icon:ClipboardList, keys:['Age','Weight','Length','Sex','BMI'] },
    { id:'history', label:'History', icon:ShieldCheck, keys:['DM','HTN','Current Smoker','EX-Smoker','FH','Obesity','CRF','CVA','Airway disease','Thyroid Disease','CHF','DLP'] },
    { id:'exam', label:'Vitals & exam', icon:Stethoscope, keys:['BP','PR','Edema','Weak Peripheral Pulse','Lung rales','Systolic Murmur','Diastolic Murmur'] },
    { id:'symptoms', label:'Symptoms', icon:HeartPulse, keys:['Typical Chest Pain','Dyspnea','Function Class','Atypical','Nonanginal','LowTH Ang'] },
    { id:'labs', label:'Lab panel', icon:Activity, keys:['FBS','CR','TG','LDL','HDL','BUN','ESR','HB','K','Na','WBC','Lymph','Neut','PLT'] },
    { id:'tests', label:'Cardiac tests', icon:Sparkles, keys:['Q Wave','St Elevation','St Depression','Tinversion','LVH','Poor R Progression','BBB','EF-TTE','Region RWMA','VHD'] },
  ].map(group => ({ ...group, keys:group.keys.filter(key => featureKeys.includes(key)) }));
  const activeFields = searchTerm.trim()
    ? featureKeys.filter(key => key.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : (featureGroups.find(group => group.id===activeGroup)?.keys ?? []);
  const cadImportance = metrics?.targets?.CAD?.permutation_importance ?? [];
  const maxImportance = Math.max(0, ...cadImportance.map(item => item.mean));
  const missingCount = featureKeys.filter(key=>features[key]===null||features[key]==='').length;
  const completedCount = featureKeys.length - missingCount;
  const cadProbability = predictions?.CAD?.probability ?? null;
  const cadRingOffset = 188 - (cadProbability ?? 0) * 188;
  const datasetSize = metrics?.targets?.CAD?.n ?? '—';
  function resetInputs() { const initial={};for(const [key,schema] of Object.entries(metrics?.feature_schema||{})){initial[key]=schema.type==='number'?null:'';}setFeatures(initial);setPredictions(null); }
  return <main className="shell">
    {showSplash&&<div className="splash-screen" role="status" aria-label="Loading AngioSight"><div className="splash-content"><div className="splash-logo"><img src="/logo.jpeg" alt="AngioSight"/></div><span className="splash-caption">CARDIOVASCULAR RESEARCH</span><span className="splash-loader"/></div></div>}
    <header className="topbar"><a className="brand" href="#home" aria-label="AngioSight home"><div className="brand-mark"><img src="/logo.jpeg" alt="AngioSight logo"/></div><div className="brand-name"><strong>AngioSight</strong><small>Vascular research</small></div></a><nav className="app-nav" aria-label="Main navigation"><a className="nav-current" href="#assessment">Assessment</a><a href="#about">About</a></nav><div className="top-actions"><span className="top-status"><i className={metrics?.trained?'status-dot':'status-dot offline'}/>{metrics?.trained?'Model ready':'Model offline'}</span><span className="mode-tag"><ShieldCheck size={14}/> Research use</span><button className="theme-toggle" type="button" onClick={() => setTheme(current => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system')} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme} · activate to change`}>{theme==='dark'?<Moon size={16}/>:theme==='light'?<Sun size={16}/>:<Monitor size={16}/>}<span>{theme==='system'?'System':theme==='light'?'Light':'Dark'}</span></button><button className="icon-button" title="Start a new assessment" aria-label="Clear all inputs" onClick={resetInputs}><RotateCcw size={16}/><span>New assessment</span></button></div></header>
    <div className="safety"><Info size={16}/><span><b>For research and education</b><i/> This tool does not provide a diagnosis or treatment recommendation. Review findings with a qualified clinician.</span></div>
    <section className="intro" id="home"><div className="intro-copy"><p className="eyebrow">CARDIOVASCULAR RISK EXPLORER</p><h1>Explore a cardiovascular profile.</h1><p className="lede">Enter available clinical information, then explore the model estimate alongside a 3D heart reference.</p></div><div className="system-stats"><div><span>Model</span><b><i className={metrics?.trained?'status-dot':'status-dot offline'}/>{metrics?.trained?'Ready':'Offline'}</b></div><div><span>Available inputs</span><b>{featureKeys.length||'—'}</b></div><div><span>Reference records</span><b>{datasetSize}</b></div></div></section>
    <section className="dashboard" id="assessment">
      <aside className="panel input-panel"><div className="panel-head"><div><span className="step">01</span><div><h2>Patient information</h2><span className="panel-subtitle">ENTER THE DETAILS YOU HAVE</span></div></div><span className="completion-tag"><Check size={12}/>{completedCount} of {featureKeys.length||'—'}</span></div>
        <div className="input-summary"><span className="summary-icon"><ClipboardList size={16}/></span><span><b>Assessment details</b><small>Leave unknown fields blank; the model will fill them from training data.</small></span><span className="summary-count">{missingCount}<small>BLANK</small></span></div>
        <label className="field-search"><Search size={15}/><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Find a clinical feature" aria-label="Search clinical features"/>{searchTerm&&<button type="button" onClick={()=>setSearchTerm('')} aria-label="Clear search"><X size={14}/></button>}</label>
        {!searchTerm&&<div className="group-tabs" role="group" aria-label="Clinical feature groups">{featureGroups.filter(group=>group.keys.length).map(group=>{const Icon=group.icon;return <button type="button" aria-pressed={activeGroup===group.id} key={group.id} className={activeGroup===group.id?'active':''} onClick={()=>setActiveGroup(group.id)}><Icon size={14}/><span>{group.label}</span><small>{group.keys.length}</small></button>})}</div>}
        <div className="fields-head"><span>{searchTerm?`Matching fields · ${activeFields.length}`:featureGroups.find(group=>group.id===activeGroup)?.label}</span><span>Value</span></div>
        <div className="fields-scroll"><div className="fields">{activeFields.map(k=>{const schema=metrics?.feature_schema?.[k];const numeric=schema?.type==='number';return <label key={k}><span>{k}</span>{numeric?<input type="number" value={features[k] ?? ''} onChange={e=>update(k,e.target.value===''?null:Number(e.target.value))}/>:<select value={features[k] ?? ''} onChange={e=>update(k,e.target.value)}><option value="">Select value</option>{(schema?.options ?? []).map(value=><option key={value}>{value}</option>)}</select>}</label>})}{!activeFields.length&&<p className="no-fields">{featureKeys.length?'No fields match that search.':'Train a model to load the clinical feature form.'}</p>}</div></div>
        <div className="input-footer"><p className="microcopy" role="status" aria-live="polite">{status}</p><button className="primary-button" onClick={predict} disabled={busy||featureKeys.length===0}><span><Sparkles size={16}/>{busy?'Calculating estimate…':'Calculate estimate'}</span><ArrowUpRight size={17}/></button><p className="privacy-note"><ShieldCheck size={12}/> Your details are used for this estimate and aren’t stored by this app.</p></div>
      </aside>
      <section className="panel viz-panel"><div className="panel-head"><div><span className="step">02</span><div><h2>Explore the heart</h2><span className="panel-subtitle">INTERACTIVE ANATOMICAL REFERENCE</span></div></div><span className="drag-hint">Drag to rotate · pinch or scroll to zoom</span></div><div className="viewer"><DeferredAnatomyViewer probabilities={probabilities} onSelect={setSelected} sex={features.Sex || undefined}/><div className="viewer-label"><span>Anterior view</span><span>BodyParts3D · Ref. 4.0</span></div><div className="viewer-corner viewer-corner-tl"/><div className="viewer-corner viewer-corner-br"/></div><div className="legend"><span><i style={{background:'#45d6b0'}}/>Lower estimate</span><span><i style={{background:'#ffb547'}}/>Mid estimate</span><span><i style={{background:'#ff5267'}}/>Higher estimate</span><span><i style={{background:'#4e91b8'}}/>Coronary veins</span><span><i style={{background:'#617080'}}/>Pending</span></div><p className="attribution">Named artery colors show model estimates, not lesion locations; coronary veins are shown in blue. <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">BodyParts3D · CC BY 4.0</a></p></section>
      <aside className="panel results-panel"><div className="panel-head"><div><span className="step">03</span><div><h2>Model estimates</h2><span className="panel-subtitle">PATIENT-LEVEL ESTIMATES</span></div></div><span className="result-state"><i className={predictions?'status-dot':'status-dot idle'}/>{predictions?'UPDATED':'AWAITING'}</span></div>
        <div className="cad-card"><div className="cad-card-head"><span>OVERALL CAD</span><span>MODEL SCORE <Info size={12}/></span></div><div className="cad-score"><div className="risk-ring" style={{'--risk-color':cadProbability==null?'#516171':color(cadProbability)}}><svg viewBox="0 0 72 72" aria-hidden="true"><circle className="ring-track" cx="36" cy="36" r="30"/><circle className="ring-value" cx="36" cy="36" r="30" style={{strokeDashoffset:cadRingOffset}}/></svg><strong>{cadProbability==null?'—':Math.round(cadProbability*100)}<small>{cadProbability==null?'':'%'}</small></strong></div><div className="cad-copy"><b>{predictions?.CAD?.prediction??'No analysis yet'}</b><span>{predictions?.CAD?`Positive class · ${predictions.CAD.positive_class}`:'Run analysis to calculate a score'}</span><small><i className={cadProbability==null?'score-dot idle':'score-dot'} style={{'--risk-color':cadProbability==null?'#516171':color(cadProbability)}}/>{cadProbability==null?'MODEL OUTPUT':'ESTIMATE GENERATED'}</small></div></div><div className="score-scale"><span>0.00</span><i><b style={{width:`${(cadProbability??0)*100}%`,'--risk-color':cadProbability==null?'#516171':color(cadProbability)}}/></i><span>1.00</span></div></div>
        <div className="vessel-section-head"><span>VESSEL BREAKDOWN</span><span>PROBABILITY</span></div><div className="vessel-list">{vessels.map(v=><button key={v} className={`vessel-row ${selected===v?'selected':''}`} onClick={()=>setSelected(v)}><span className="vessel-dot" style={{'--risk-color':color(probabilities[v])}}/><span className="vessel-row-info"><b>{v}</b><small>{v==='LAD'?'Anterior descending':v==='LCX'?'Circumflex':'Right coronary'}</small><i><b style={{width:`${(probabilities[v]??0)*100}%`,'--risk-color':color(probabilities[v])}}/></i></span><strong>{probabilities[v]==null?'—':`${Math.round(probabilities[v]*100)}%`}</strong><ChevronRight size={14}/></button>)}</div><div className="insight"><span className="insight-icon"><Info size={15}/></span><p><b>{selected} · model interpretation</b><br/>{predictions?.[selected] ? `${Math.round(probabilities[selected]*100)}% model probability for the positive class (${predictions[selected].positive_class}). This does not locate or size a lesion.` : 'Choose a vessel or run an analysis to inspect its model estimate.'}</p></div>
      </aside>
    </section>
    <section className="lower-grid" id="about"><div className="panel explainer"><div className="panel-head"><div><span className="step">04</span><div><h2>What influenced the model?</h2><span className="panel-subtitle">GLOBAL FEATURE IMPORTANCE</span></div></div><span className="muted">HELD-OUT DATA</span></div>{cadImportance.length?<div className="importance">{cadImportance.slice(0,6).map((x,index)=><div className="importance-row" key={x.feature}><span className="importance-index">0{index+1}</span><span>{x.feature}</span><div className="bar"><i style={{width:`${maxImportance>0?Math.max(0,x.mean)/maxImportance*100:0}%`}}/></div><small>{x.mean.toFixed(3)}</small></div>)}</div>:<div className="empty-state"><Upload size={20}/><p>Model feature importance will appear here when available.</p></div>}<p className="microcopy">Global model behavior; not a patient-specific or causal explanation.</p></div><div className="panel metrics"><div className="panel-head"><div><span className="step">05</span><div><h2>Model performance</h2><span className="panel-subtitle">CAD · HELD-OUT RECORDS</span></div></div><span className="muted">N = {metrics?.targets?.CAD?.test_n??'—'}</span></div>{metrics?.targets?.CAD?<div className="metric-grid">{[['Accuracy',metrics.targets.CAD.accuracy],['Precision',metrics.targets.CAD.precision],['Recall',metrics.targets.CAD.recall],['F1 score',metrics.targets.CAD.f1],['ROC-AUC',metrics.targets.CAD.roc_auc]].map(([k,v])=><div key={k}><span>{k}</span><b>{(v*100).toFixed(1)}<small>%</small></b></div>)}</div>:<p className="panel-copy">Evaluation metrics appear after model training.</p>}<p className="microcopy">Holdout metrics are not clinical validation.</p></div></section>
    <footer><span><b>AngioSight</b> <i/> RESEARCH PROTOTYPE</span><span>BodyParts3D anatomy · Dataset-derived estimates · No lesion localization</span></footer>
  </main>;
}
