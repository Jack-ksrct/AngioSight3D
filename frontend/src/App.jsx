import { Component, useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, ClipboardList, HeartPulse, Info, Layers, Monitor, Moon, RotateCcw, Search, ShieldCheck, Sparkles, Stethoscope, Sun, X } from 'lucide-react';
import DeferredAnatomyViewer from './DeferredAnatomyViewer.jsx';
import { RISK_LEGEND, riskColor } from './riskColor.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const vessels = ['LAD', 'LCX', 'RCA'];

class PageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('AngioSight page failed to render:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <section className="panel page-error" role="alert">
        <h1>This page could not be opened</h1>
        <p>{this.state.error.message || 'An unexpected rendering error occurred.'}</p>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>Reload page</button>
      </section>;
    }
    return this.props.children;
  }
}

// Plausible ranges for the numeric clinical fields. Used to reject impossible
// input before it reaches the model, so a typo never renders a confident-looking
// estimate. Fields not listed still reject negative values.
const NUMBER_RANGES = {
  Age: [0, 120], Weight: [15, 400], Length: [100, 230], BMI: [10, 80],
  BP: [40, 300], PR: [20, 250], FBS: [20, 600], CR: [0.1, 25], TG: [20, 3000],
  LDL: [10, 600], HDL: [5, 160], BUN: [1, 200], ESR: [0, 200], HB: [3, 25],
  K: [1.5, 9], Na: [90, 190], WBC: [200, 60000], Lymph: [0, 100], Neut: [0, 100],
  PLT: [5, 1200], 'EF-TTE': [5, 95], 'Function Class': [0, 4],
};

function pageFromHash() {
  if (typeof window === 'undefined') return 'home';
  if (window.location.hash === '#workspace' || window.location.hash === '#assessment') return 'workspace';
  if (window.location.hash === '#about') return 'about';
  return 'home';
}

function HomePage({ onNavigate, metrics, datasetSize, featureCount }) {
  return <div className="site-page home-page">
    <section className="home-hero">
      <div className="home-hero-copy">
        <span className="home-kicker">ANGIOSIGHT · CARDIOVASCULAR RESEARCH</span>
        <h1>A clearer view of cardiovascular research.</h1>
        <p>Explore a detailed heart reference, enter clinical features, and review model estimates in one focused workspace.</p>
        <div className="home-actions"><button className="primary-button" type="button" onClick={() => onNavigate('workspace')}><span>Open assessment workspace</span><ArrowRight size={17}/></button><button className="home-secondary" type="button" onClick={() => onNavigate('about')}>About this project</button></div>
        <div className="home-disclaimer"><ShieldCheck size={15}/><span>Research and education use only. Not a diagnostic tool.</span></div>
      </div>
      <div className="home-anatomy-card"><div className="home-anatomy-heading"><span><b>Heart anatomy</b><small>Realistic human heart · labeled reference</small></span><span className="reference-label">3D REFERENCE</span></div><div className="home-anatomy-view home-realistic-view"><DeferredAnatomyViewer probabilities={{ LAD: null, LCX: null, RCA: null }} onSelect={() => {}} view="anterior" asset="realistic"/></div><div className="home-anatomy-footer"><span>Drag to rotate · labels follow the heart</span><span>Reference anatomy · not patient-specific</span></div></div>
    </section>

    <section className="home-section home-capabilities"><div className="home-section-heading"><span>WORKSPACE CAPABILITIES</span><h2>Designed around the review workflow</h2><p>Start with the information available, then review outputs with their data sources and limitations in view.</p></div><div className="capability-grid">
      <article className="capability-card"><span className="capability-icon"><HeartPulse size={20}/></span><h3>Explore heart anatomy</h3><p>Rotate the local 3D coronary heart reference in the assessment workspace.</p><button type="button" onClick={() => onNavigate('workspace')}>Open anatomy viewer <ArrowRight size={14}/></button></article>
      <article className="capability-card"><span className="capability-icon"><Activity size={20}/></span><h3>Review research estimates</h3><p>Enter available clinical features and inspect CAD and vessel-level model estimates with performance context.</p><button type="button" onClick={() => onNavigate('workspace')}>Open assessment <ArrowRight size={14}/></button></article>
      <article className="capability-card"><span className="capability-icon"><BookOpen size={20}/></span><h3>Inspect model context</h3><p>Review held-out performance, feature sensitivity, and the limitations of the research estimates.</p><button type="button" onClick={() => onNavigate('about')}>Read model notes <ArrowRight size={14}/></button></article>
    </div></section>

    <section className="home-workflow"><div><span className="home-kicker">A SIMPLE REVIEW FLOW</span><h2>From available information to a transparent estimate.</h2></div><ol><li><b>Enter known details</b><span>Unknown clinical fields can be left blank.</span></li><li><b>Calculate an estimate</b><span>Outputs use the current research model and its training data.</span></li><li><b>Review the context</b><span>Use the anatomy reference and read the model limitations.</span></li></ol></section>

    <section className="home-status-strip"><div className="home-status-icon"><Layers size={19}/></div><div><b>Current project status</b><p>{metrics?.trained ? `Clinical model available · ${featureCount} input features · ${datasetSize} reference records.` : 'The clinical model is unavailable. Start the API service to load model information.'}</p></div><button type="button" onClick={() => onNavigate('about')}>Read model notes <ArrowRight size={15}/></button></section>
  </div>;
}

function AboutPage({ metrics, datasetSize }) {
  return <div className="site-page about-page">
    <div className="breadcrumbs"><button type="button" onClick={() => { window.location.hash = '#home'; }}>Home</button><span>/</span><b>About AngioSight</b></div>
    <header className="about-heading"><span className="home-kicker">PROJECT OVERVIEW</span><h1>About AngioSight</h1><p>AngioSight is a cardiovascular research prototype combining a clinical feature model with an interactive anatomical reference.</p></header>
    <div className="about-grid">
      <section className="about-card"><span className="about-icon"><HeartPulse size={19}/></span><h2>What is available</h2><ul><li>The selected 3D coronary model in the assessment workspace and an optional labeled anatomy view with hover names.</li><li>The existing 54-field clinical form and research estimates for CAD and named vessels.</li><li>After calculation, switch to the labeled anatomy view to see separate LAD, LCX, and RCA estimate colors. These colors do not locate patient-specific disease.</li></ul></section>
      <section className="about-card"><span className="about-icon"><BookOpen size={19}/></span><h2>Data and anatomy</h2><ul><li>The home page shows the realistic-human-heart model with fixed part labels. The workspace keeps the selected coronary model and offers a labeled BodyParts3D view after calculation, where branches can be identified on hover.</li><li>Clinical estimates are dataset-derived; the current cohort contains {datasetSize} records.</li><li>The selected coronary model's mesh objects are not named by vessel, so its vessel meshes share an aggregate estimate color. The alternate named anatomy view colors LAD, LCX, and RCA separately; neither view shows patient-specific lesion locations.</li></ul></section>
      <section className="about-card about-limitations"><span className="about-icon"><ShieldCheck size={19}/></span><h2>Use and limitations</h2><p>For research and education only. The application does not diagnose disease, recommend treatment, or localize a lesion. The 3D heart is a reference model, not patient-specific anatomy.</p><p>Model performance metrics describe cross-validation estimates and are not evidence of clinical validation.</p></section>
    </div>
    <ModelPerformanceSection metrics={metrics}/>
  </div>;
}

function ModelPerformanceSection({ metrics }) {
  const targets = ['CAD', 'LAD', 'LCX', 'RCA'].map(name => [name, metrics?.targets?.[name]]).filter(([, result]) => result);
  const crossValidated = metrics?.evaluation_method?.includes('cross-validation');
  const percent = value => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—';
  return <section className="about-performance model-performance">
    <header className="performance-heading"><span className="home-kicker">MODEL PERFORMANCE</span><h2>Evaluation results</h2><p>{crossValidated ? 'Stratified cross-validation estimates from the available cohort.' : 'Results from the saved held-out evaluation split.'} These are research metrics, not clinical validation.</p></header>
    <div className="performance-content">
      <h3>Clinical classification · {crossValidated ? `${metrics?.requested_folds ?? 5}-fold stratified cross-validation` : 'stratified holdout'}</h3>
      {targets.length ? <div className="performance-table-wrap"><table className="performance-table"><thead><tr><th>Target</th><th>{crossValidated ? 'Evaluated records' : 'Test records'}</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>ROC-AUC</th></tr></thead><tbody>{targets.map(([name, result]) => <tr key={name}><th scope="row">{name}</th><td>{crossValidated ? result.n ?? '—' : result.test_n ?? '—'}</td><td>{percent(result.accuracy)}</td><td>{percent(result.precision)}</td><td>{percent(result.recall)}</td><td>{percent(result.f1)}</td><td>{percent(result.roc_auc)}</td></tr>)}</tbody></table></div> : <p className="about-no-metrics">Model metrics will be available when the API is connected.</p>}
      <p className="performance-caveat">{crossValidated ? 'Cross-validation estimates reuse the available cohort across folds and can be uncertain on a small dataset.' : 'A single held-out split gives an uncertain estimate on a small dataset.'} Neither establishes calibration, external validity, subgroup fairness, or clinical utility.</p>
    </div>
  </section>;
}

export default function App() {
  const [activePage, setActivePage] = useState(pageFromHash);
  const [features, setFeatures] = useState({});
  const [predictions, setPredictions] = useState(null);
  const [colorVessels, setColorVessels] = useState(false);
  const [showLabeledVesselView, setShowLabeledVesselView] = useState(false);
  const [hoveredPart, setHoveredPart] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [selected, setSelected] = useState('LAD');
  const [status, setStatus] = useState('Enter the information you have, then calculate an estimate.');
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [activeGroup, setActiveGroup] = useState('profile');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  // Monotonic request id: a slow response from an earlier click can never
  // overwrite the estimate produced by a later one.
  const predictRequest = useRef(0);
  const activeRequest = useRef(null);
  useEffect(() => () => {
    predictRequest.current += 1;
    activeRequest.current?.abort();
  }, []);
  useEffect(() => {
    const syncPage = () => setActivePage(pageFromHash());
    window.addEventListener('popstate', syncPage);
    window.addEventListener('hashchange', syncPage);
    return () => { window.removeEventListener('popstate', syncPage); window.removeEventListener('hashchange', syncPage); };
  }, []);
  function navigateTo(page) {
    const hash = page === 'workspace' ? '#workspace' : page === 'about' ? '#about' : '#home';
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const [theme, setTheme] = useState(() => {
    try { const saved = localStorage.getItem('angiosight-theme-v2'); return ['system', 'light', 'dark'].includes(saved) ? saved : 'light'; }
    catch { return 'light'; }
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
  useEffect(() => { try { localStorage.setItem('angiosight-theme-v2', theme); } catch { /* Theme preference is optional. */ } }, [theme]);
  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setShowSplash(false), prefersReducedMotion ? 50 : 1550);
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
          setStatus('Cannot reach the AngioSight API. Start the API service, then reload this page.');
        }
      });
    return () => controller.abort();
  }, []);
  const probabilities = Object.fromEntries(vessels.map(v=>[v,predictions?.[v]?.probability ?? null]));
  // Client-side guard so impossible or malformed entries never reach the model
  // and are never drawn as if they were a meaningful result.
  function validateFeatures() {
    const problems = [];
    for (const [key, schema] of Object.entries(metrics?.feature_schema || {})) {
      const value = features[key];
      if (value === null || value === '' || value === undefined) continue;
      if (schema.type === 'number') {
        const n = Number(value);
        if (Number.isNaN(n)) { problems.push(`${key} must be a number`); continue; }
        const range = NUMBER_RANGES[key];
        if (range && (n < range[0] || n > range[1])) problems.push(`${key} = ${n} is outside ${range[0]}\u2013${range[1]}`);
        else if (!range && n < 0) problems.push(`${key} cannot be negative`);
      } else if (Array.isArray(schema.options) && schema.options.length && !schema.options.includes(value) && !(key === 'Sex' && value === 'Other')) {
        problems.push(`${key} has an unrecognised value`);
      }
    }
    return problems;
  }
  function invalidateEstimate() {
    predictRequest.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
    setPredictions(null);
    setColorVessels(false);
    setShowLabeledVesselView(false);
    setHoveredPart(null);
    setExplanation(null);
  }
  function update(key,value) {
    invalidateEstimate();
    setFeatures(prev=>({...prev,[key]:value}));
    setStatus('Inputs changed. Calculate again to update the estimate and heart map.');
  }
  async function predict() {
    const enteredCount = Object.values(features).filter(value => value !== null && value !== undefined && value !== '').length;
    if (enteredCount === 0) {
      invalidateEstimate();
      setStatus('Enter at least one clinical value before calculating an estimate.');
      return;
    }
    const problems = validateFeatures();
    if (problems.length) {
      setStatus(`Fix ${problems.length} value${problems.length>1?'s':''} before calculating: ${problems.slice(0,3).join('; ')}${problems.length>3?`; +${problems.length-3} more`:''}.`);
      return;
    }
    const requestId = ++predictRequest.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPredictions(null); setExplanation(null);
    setBusy(true); setStatus('Calculating with the current input values…');
    try {
      const modelFeatures = { ...features };
      // The model was trained with Female/Male only. Treat Other as unknown so
      // the backend applies its documented training-set imputation.
      if (modelFeatures.Sex === 'Other') modelFeatures.Sex = null;
      const body = { features: modelFeatures };
      const timeout = window.setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 15000);
      let res;
      try {
        res = await fetch(`${API_URL}/predict`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      } finally {
        window.clearTimeout(timeout);
      }
      const data = await res.json().catch(() => ({}));
      if (requestId !== predictRequest.current || controller.signal.aborted) return;
      if (!res.ok) throw new Error(data.error?.message || data.detail?.message || (typeof data.detail==='string'?data.detail:undefined) || `The estimate could not be calculated (request ${res.status}).`);
      setPredictions(data.predictions);
      setColorVessels(true);
      setExplanation(data.explanation ?? null);
       setStatus('Estimate updated. This is educational decision support only.');
    } catch(e) {
      if (requestId !== predictRequest.current) return;
      setPredictions(null);
      setExplanation(null);
      setStatus(controller.signal.reason?.name === 'TimeoutError' || e.name === 'TimeoutError' ? 'The request took too long. Check the API service and try again.' : e.name === 'AbortError' ? 'Calculation cancelled because the inputs changed.' : e.message || 'The API is unavailable. Check the service and try again.');
    }
    finally {
      if (requestId === predictRequest.current) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }
  const featureKeys = metrics?.feature_schema ? Object.keys(metrics.feature_schema) : [];
  const crossValidated = metrics?.evaluation_method?.includes('cross-validation');
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
  function resetInputs() { invalidateEstimate(); const initial={};for(const [key,schema] of Object.entries(metrics?.feature_schema||{})){initial[key]=schema.type==='number'?null:'';}setFeatures(initial);setExplanation(null);setStatus('Enter the information you have, then calculate an estimate.'); }
  return <main className="shell">
    {showSplash&&<div className="splash-screen" role="status" aria-label="Loading AngioSight"><div className="splash-content"><div className="splash-logo"><img src="/logo.png" alt="AngioSight"/></div><span className="splash-caption">CARDIOVASCULAR RESEARCH</span><span className="splash-loader"/></div></div>}
    <header className="topbar"><a className="brand" href="#home" aria-label="AngioSight home" onClick={event=>{event.preventDefault();navigateTo('home');}}><div className="brand-mark"><img src="/logo.png" alt="AngioSight"/></div></a><nav className="app-nav" aria-label="Main navigation"><a className={activePage==='home'?'nav-current':''} aria-current={activePage==='home'?'page':undefined} href="#home" onClick={event=>{event.preventDefault();navigateTo('home');}}>Home</a><a className={activePage==='workspace'?'nav-current':''} aria-current={activePage==='workspace'?'page':undefined} href="#workspace" onClick={event=>{event.preventDefault();navigateTo('workspace');}}>Workspace</a><a className={activePage==='about'?'nav-current':''} aria-current={activePage==='about'?'page':undefined} href="#about" onClick={event=>{event.preventDefault();navigateTo('about');}}>About</a></nav><div className="top-actions"><span className="top-status"><i className={metrics?.trained?'status-dot':'status-dot offline'}/>{metrics?.trained?'Model ready':'Model offline'}</span><span className="mode-tag"><ShieldCheck size={14}/> Research use</span><button className="theme-toggle" type="button" onClick={() => setTheme(current => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system')} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme} · activate to change`}>{theme==='dark'?<Moon size={16}/>:theme==='light'?<Sun size={16}/>:<Monitor size={16}/>}<span>{theme==='system'?'System':theme==='light'?'Light':'Dark'}</span></button><button className="icon-button" type="button" title="Start a new assessment" aria-label="Start a new assessment" onClick={()=>{resetInputs();navigateTo('workspace');}}><RotateCcw size={16}/><span>New assessment</span></button></div></header>
    <PageErrorBoundary key={activePage}>{activePage==='home'?<HomePage onNavigate={navigateTo} metrics={metrics} datasetSize={datasetSize} featureCount={featureKeys.length}/>:activePage==='about'?<AboutPage metrics={metrics} datasetSize={datasetSize}/>:<div className="workspace-page" id="workspace">
    <div className="safety"><Info size={16}/><span><b>Research and education use</b><i/> This application provides research estimates only. It is not intended for diagnosis or treatment decisions.</span></div>
    <section className="workspace-heading" id="workspace-heading"><div className="breadcrumbs"><button type="button" onClick={()=>navigateTo('home')}>Home</button><span>/</span><b>New assessment</b></div><div className="workspace-title-row"><div><h1>Cardiovascular assessment</h1><p className="lede">Enter available clinical information and review the heart reference alongside model estimates.</p></div><div className="workspace-state"><i className={metrics?.trained?'status-dot':'status-dot offline'}/><span><b>{metrics?.trained?'Clinical model available':'Clinical model unavailable'}</b><small>Research environment</small></span></div></div></section>
    <section className="dashboard" id="assessment">
      <aside className="panel input-panel"><div className="panel-head"><div><span className="step">01</span><div><h2>Clinical inputs</h2><span className="panel-subtitle">PATIENT ASSESSMENT</span></div></div><span className="completion-tag"><Check size={12}/>{completedCount} of {featureKeys.length||'—'} entered</span></div>
        <div className="input-summary"><span className="summary-icon"><ClipboardList size={16}/></span><span><b>Clinical profile</b><small>Enter known values. Leave unknown fields blank for model imputation.</small></span><span className="summary-count">{missingCount}<small>BLANK</small></span></div>
        <label className="field-search"><Search size={15}/><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Find a clinical feature" aria-label="Search clinical features"/>{searchTerm&&<button type="button" onClick={()=>setSearchTerm('')} aria-label="Clear search"><X size={14}/></button>}</label>
        {!searchTerm&&<div className="group-tabs" role="group" aria-label="Clinical feature groups">{featureGroups.filter(group=>group.keys.length).map(group=>{const Icon=group.icon;return <button type="button" aria-pressed={activeGroup===group.id} key={group.id} className={activeGroup===group.id?'active':''} onClick={()=>setActiveGroup(group.id)}><Icon size={14}/><span>{group.label}</span><small>{group.keys.length}</small></button>})}</div>}
        <div className="fields-head"><span>{searchTerm?`Matching fields · ${activeFields.length}`:featureGroups.find(group=>group.id===activeGroup)?.label}</span><span>Value</span></div>
        <div className="fields-scroll"><div className="fields">{activeFields.map(k=>{const schema=metrics?.feature_schema?.[k];const numeric=schema?.type==='number';return <label key={k}><span>{k==='WBC'?'WBC (cells/µL)':k}</span>{numeric?<input type="number" value={features[k] ?? ''} onChange={e=>{const v=e.target.value;if(v===''){update(k,null);}else{const n=Number(v);update(k,Number.isNaN(n)?null:n);}}}/>:<><select value={features[k] ?? ''} onChange={e=>update(k,e.target.value)}><option value="">Select value</option>{(schema?.options ?? []).map(value=><option key={value}>{value}</option>)}{k==='Sex'&&<option value="Other">Other</option>}</select>{k==='Sex'&&features.Sex==='Other'&&<small className="field-hint">The clinical model treats this as an unknown category and applies its training-data imputation.</small>}</>}</label>})}{!activeFields.length&&<p className="no-fields">{featureKeys.length?'No fields match that search.':'Train a model to load the clinical feature form.'}</p>}</div></div>
        <div className="input-footer"><p className="microcopy" role="status" aria-live="polite">{status}</p><button className="primary-button" type="button" onClick={predict} disabled={busy||featureKeys.length===0}><span><Sparkles size={16}/>{busy?'Calculating estimate…':'Calculate estimate'}</span><ArrowUpRight size={17}/></button><p className="privacy-note"><ShieldCheck size={12}/> Your details are used for this estimate and aren’t stored by this app.</p></div>
      </aside>
      <section className="panel viz-panel"><div className="panel-head"><div><span className="step">02</span><div><h2>Heart anatomy</h2><span className="panel-subtitle">{colorVessels && showLabeledVesselView ? 'NAMED CORONARY ANATOMY · PER-VESSEL ESTIMATES' : colorVessels ? 'CORONARY ANATOMY · AGGREGATE ESTIMATE' : 'CARDIAC ANATOMY · CORONARY ARTERIES'}</span></div></div><span className="drag-hint">Drag to rotate · scroll or pinch to zoom</span></div>
        <div className="anatomy-view-tools"><div className="anatomy-view-name">{showLabeledVesselView && colorVessels ? 'BodyParts3D · named coronary branches' : 'Cardiac Anatomy: Coronary arteries of the heart'}</div>{colorVessels&&<button type="button" className="anatomy-view-toggle" aria-pressed={showLabeledVesselView} onClick={()=>{setShowLabeledVesselView(value=>!value);setHoveredPart(null);}}>{showLabeledVesselView?'Show selected coronary model':'Show separate vessel colors'}</button>}</div>
        <div className="viewer"><DeferredAnatomyViewer probabilities={probabilities} onSelect={setSelected} onHover={setHoveredPart} view="anterior" asset={showLabeledVesselView && colorVessels ? 'bodyparts' : 'coronary'}/><div className="viewer-label"><span>Anterior view</span><span>{showLabeledVesselView && colorVessels ? 'Named coronary anatomy' : 'Cardiac Anatomy: Coronary arteries of the heart'}</span></div>{hoveredPart&&<div className="anatomy-hover-label" aria-live="polite"><b>{hoveredPart.name}</b><span>{hoveredPart.group}</span></div>}<div className="viewer-corner viewer-corner-tl"/><div className="viewer-corner viewer-corner-br"/></div>
        <div className="structure-readout legend estimate-legend" aria-label="Coronary vessel estimates">
          <span className="legend-title">Coronary estimates</span>
          {vessels.map(v => {
            const p = probabilities[v];
            const color = riskColor(p);
            const hasValue = typeof p === 'number' && !Number.isNaN(p);
            return (
              <span key={v} className="legend-item" style={{ '--vessel-color': color }}>
                <span className="legend-swatch" />
                <span className="legend-label">{v === 'LAD' ? 'LAD · Ant. desc.' : v === 'LCX' ? 'LCX · Circumflex' : 'RCA · Right coron.'}</span>
                <span className="legend-value">{hasValue ? `${Math.round(p * 100)}%` : '—'}</span>
              </span>
            );
          })}
        </div>
        <div className="estimate-color-key" aria-label="Estimate probability colors">{RISK_LEGEND.map(({ label, color }) => <span key={label}><i style={{ backgroundColor: color }} />{label === 'Intermediate' ? 'Mid' : label}</span>)}</div>
        {colorVessels && <p className="microcopy anatomy-estimate-note">{showLabeledVesselView ? 'Each named coronary artery is colored by its own model estimate. These are reference anatomy colors, not patient-specific lesion locations.' : 'The selected coronary model has unnamed vessel meshes, so it uses the mean LAD, LCX, and RCA estimate. Use “Show separate vessel colors” to inspect the named branches individually.'}</p>}
        <p className="model-credit">{showLabeledVesselView && colorVessels ? <>BodyParts3D, © The Database Center for Life Science, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</> : <>Coronary model by <a href="https://sketchfab.com/HannahNewey" target="_blank" rel="noreferrer">HannahNewey</a>, licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>.</>}</p>
      </section>
      <aside className="panel results-panel"><div className="panel-head"><div><span className="step">03</span><div><h2>Research estimates</h2><span className="panel-subtitle">CLINICAL MODEL OUTPUT</span></div></div><span className="result-state"><i className={predictions?'status-dot':'status-dot idle'}/>{predictions?'UPDATED':'AWAITING INPUTS'}</span></div>
        <div className="cad-card"><div className="cad-card-head"><span>CAD MODEL PROBABILITY</span><span>POSITIVE CLASS <Info size={12}/></span></div><div className="cad-score"><div className="risk-ring" style={{'--risk-color':cadProbability==null?'#516171':riskColor(cadProbability)}}><svg viewBox="0 0 72 72" aria-hidden="true"><circle className="ring-track" cx="36" cy="36" r="30"/><circle className="ring-value" cx="36" cy="36" r="30" style={{strokeDashoffset:cadRingOffset}}/></svg><strong>{cadProbability==null?'—':Math.round(cadProbability*100)}<small>{cadProbability==null?'':'%'}</small></strong></div><div className="cad-copy"><b>{predictions?.CAD?.prediction??'No estimate yet'}</b><span>{predictions?.CAD?`Model class · ${predictions.CAD.positive_class}`:'Enter inputs and calculate an estimate'}</span><small><i className={cadProbability==null?'score-dot idle':'score-dot'} style={{'--risk-color':cadProbability==null?'#516171':riskColor(cadProbability)}}/>{cadProbability==null?'MODEL OUTPUT':'ESTIMATE GENERATED'}</small></div></div><div className="score-scale"><span>0.00</span><i><b style={{width:`${(cadProbability??0)*100}%`,'--risk-color':cadProbability==null?'#516171':riskColor(cadProbability)}}/></i><span>1.00</span></div>
        <div className="fusion-note"><Info size={12}/><span>Clinical estimates use structured clinical inputs only. The 3D heart is a reference model and does not visualize a patient-specific lesion.</span></div></div>
        <div className="vessel-section-head"><span>VESSEL BREAKDOWN</span><span>PROBABILITY</span></div><div className="vessel-list">{vessels.map(v=><button type="button" key={v} aria-pressed={selected===v} className={`vessel-row ${selected===v?'selected':''}`} onClick={()=>setSelected(v)}><span className="vessel-dot" style={{'--risk-color':riskColor(probabilities[v])}}/><span className="vessel-row-info"><b>{v}</b><small>{v==='LAD'?'Anterior descending':v==='LCX'?'Circumflex':'Right coronary'}</small><i><b style={{width:`${(probabilities[v]??0)*100}%`,'--risk-color':riskColor(probabilities[v])}}/></i></span><strong>{probabilities[v]==null?'—':`${Math.round(probabilities[v]*100)}%`}</strong><ChevronRight size={14}/></button>)}</div><div className="insight"><span className="insight-icon"><Info size={15}/></span><p><b>{selected} · model interpretation</b><br/>{predictions?.[selected] ? `${Math.round(probabilities[selected]*100)}% model probability for the positive class (${predictions[selected].positive_class}). This does not locate or size a lesion.` : 'Choose a vessel or run an analysis to inspect its model estimate.'}</p></div>
        {selected==='LCX'&&predictions?.LCX&&<p className="microcopy model-limit-note">LCX performance is limited: {Math.round((metrics?.targets?.LCX?.accuracy??0)*100)}% accuracy, {((metrics?.targets?.LCX?.roc_auc??0)*100).toFixed(1)}% ROC-AUC on {crossValidated ? metrics?.targets?.LCX?.n ?? '—' : metrics?.targets?.LCX?.test_n ?? '—'} {crossValidated ? 'cross-validated records' : 'held-out records'}.</p>}
      </aside>
    </section>
    <section className="lower-grid" id="model-context"><div className="panel explainer"><div className="panel-head"><div><span className="step">04</span><div><h2>What influenced the model?</h2><span className="panel-subtitle">PATIENT INPUT SENSITIVITY</span></div></div><span className="muted">CAD ESTIMATE</span></div>{explanation?.features?.length?<><p className="explanation-intro">Each entered value is substituted into a typical training-profile reference one at a time. Change is shown in CAD model probability points.</p><div className="local-explanations">{explanation.features.map(item=><div className="local-explanation-row" key={item.name}><span className="local-feature-name">{item.name}</span><span className="local-feature-value">{typeof item.value==='number'?item.value:String(item.value)}</span><div className="bar"><i className={item.delta<0?'negative':''} style={{width:`${Math.max(2,Math.min(100,Math.abs(item.delta)*200))}%`}}/></div><strong className={item.delta<0?'negative':''}>{item.delta>=0?'+':''}{(item.delta*100).toFixed(1)} pp</strong></div>)}</div></>:<div className="empty-state"><Activity size={20}/><p>{predictions?'Enter one or more clinical values to see how they shift the CAD estimate from a typical training profile.':'Patient-specific feature sensitivity will appear after you calculate an estimate.'}</p></div>}<p className="microcopy">One-feature reference substitution is a sensitivity comparison, not SHAP, a causal effect, or a clinical explanation. Global feature importance is evaluated on validation folds.</p>{cadImportance.length?<details className="global-importance"><summary>Global feature importance · {crossValidated ? 'cross-validation' : 'held-out data'}</summary><div className="importance">{cadImportance.slice(0,6).map((x,index)=><div className="importance-row" key={x.feature}><span className="importance-index">0{index+1}</span><span>{x.feature}</span><div className="bar"><i style={{width:`${maxImportance>0?Math.max(0,x.mean)/maxImportance*100:0}%`}}/></div><small>{x.mean.toFixed(3)}</small></div>)}</div></details>:null}</div></section>
    </div>}</PageErrorBoundary>
    <footer className="app-footer"><span><b>AngioSight</b> · Research prototype</span><span>Local 3D heart references · Dataset-derived estimates · No lesion localization</span></footer>
  </main>;
}
