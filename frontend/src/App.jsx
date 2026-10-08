import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, ClipboardList, HeartPulse, Info, Layers, Monitor, Moon, RotateCcw, ScanLine, Search, ShieldCheck, Sparkles, Stethoscope, Sun, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import DeferredAnatomyViewer from './DeferredAnatomyViewer.jsx';
import { NAMED_REGION_COUNT, PART_GROUP_COLORS, PART_GROUP_LABELS } from './anatomyLabels.js';
import { RISK_GRADIENT, RISK_PENDING, riskColor } from './riskColor.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const vessels = ['LAD', 'LCX', 'RCA'];
const anatomyGroups = ['myocardium', 'cavity', 'valve', 'artery', 'vein'];

// Plausible ranges for the numeric clinical fields. Used to reject impossible
// input before it reaches the model, so a typo never renders a confident-looking
// estimate. Fields not listed still reject negative values.
const NUMBER_RANGES = {
  Age: [0, 120], Weight: [15, 400], Length: [100, 230], BMI: [10, 80],
  BP: [40, 300], PR: [20, 250], FBS: [20, 600], CR: [0.1, 25], TG: [20, 3000],
  LDL: [10, 600], HDL: [5, 160], BUN: [1, 200], ESR: [0, 200], HB: [3, 25],
  K: [1.5, 9], Na: [90, 190], WBC: [0.2, 60], Lymph: [0, 100], Neut: [0, 100],
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
      <div className="home-anatomy-card"><div className="home-anatomy-heading"><span><b>Heart anatomy</b><small>BodyParts3D reference model</small></span><span className="reference-label">ANTERIOR VIEW</span></div><div className="home-anatomy-view"><DeferredAnatomyViewer probabilities={{ LAD: null, LCX: null, RCA: null }} onSelect={() => {}} onHover={() => {}} view="anterior" interactive={false}/></div><div className="home-anatomy-footer"><span>Reference anatomy · not patient-specific</span></div></div>
    </section>

    <section className="home-section home-capabilities"><div className="home-section-heading"><span>WORKSPACE CAPABILITIES</span><h2>Designed around the review workflow</h2><p>Start with the information available, then review outputs with their data sources and limitations in view.</p></div><div className="capability-grid">
      <article className="capability-card"><span className="capability-icon"><HeartPulse size={20}/></span><h3>Explore heart anatomy</h3><p>Rotate a BodyParts3D reference model and inspect labeled chambers, valves, vessels, and coronary structures.</p><button type="button" onClick={() => onNavigate('workspace')}>Open anatomy viewer <ArrowRight size={14}/></button></article>
      <article className="capability-card"><span className="capability-icon"><Activity size={20}/></span><h3>Review research estimates</h3><p>Enter available clinical features and inspect CAD and vessel-level model estimates with performance context.</p><button type="button" onClick={() => onNavigate('workspace')}>Open assessment <ArrowRight size={14}/></button></article>
      <article className="capability-card"><span className="capability-icon"><ScanLine size={20}/></span><h3>Review medical images</h3><p>Open X-ray images and browse exported CT or MRI image sequences in the imaging workspace.</p><button type="button" onClick={() => onNavigate('workspace')}>Open image review <ArrowRight size={14}/></button></article>
    </div></section>

    <section className="home-workflow"><div><span className="home-kicker">A SIMPLE REVIEW FLOW</span><h2>From available information to a transparent estimate.</h2></div><ol><li><b>Enter known details</b><span>Unknown clinical fields can be left blank.</span></li><li><b>Calculate an estimate</b><span>Outputs use the current research model and its training data.</span></li><li><b>Review the context</b><span>Use the anatomy reference and read the model limitations.</span></li></ol></section>

    <section className="home-status-strip"><div className="home-status-icon"><Layers size={19}/></div><div><b>Current project status</b><p>{metrics?.trained ? `Clinical model available · ${featureCount} input features · ${datasetSize} reference records.` : 'The clinical model is unavailable. Start the API service to load model information.'} Angiography analysis is separate; X-ray and exported CT/MRI slices can be reviewed locally without scan analysis.</p></div><button type="button" onClick={() => onNavigate('about')}>Read model notes <ArrowRight size={15}/></button></section>
  </div>;
}

function AboutPage({ metrics, datasetSize, imagingMetrics }) {
  return <div className="site-page about-page">
    <div className="breadcrumbs"><button type="button" onClick={() => { window.location.hash = '#home'; }}>Home</button><span>/</span><b>About AngioSight</b></div>
    <header className="about-heading"><span className="home-kicker">PROJECT OVERVIEW</span><h1>About AngioSight</h1><p>AngioSight is a cardiovascular research prototype combining a clinical feature model with an interactive anatomical reference.</p></header>
    <div className="about-grid">
      <section className="about-card"><span className="about-icon"><HeartPulse size={19}/></span><h2>What is available</h2><ul><li>Interactive BodyParts3D heart reference with named anatomical regions.</li><li>Clinical feature input and research estimates for CAD and named vessels.</li><li>Optional angiography frame preview and a separately reported research score when that model is available.</li></ul></section>
      <section className="about-card"><span className="about-icon"><BookOpen size={19}/></span><h2>Data and anatomy</h2><ul><li>Heart meshes are adapted from BodyParts3D 4.0 by The Database Center for Life Science.</li><li>Clinical estimates are dataset-derived; the current cohort contains {datasetSize} records.</li><li>Angiography research data and clinical inputs are analyzed separately.</li></ul><a href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">BodyParts3D source and license</a><div className="dataset-links"><b>Research datasets</b><a href="https://nihcc.app.box.com/v/ChestXray-NIHCC" target="_blank" rel="noreferrer">NIH ChestX-ray14 · chest radiographs</a><a href="https://www.creatis.insa-lyon.fr/Challenge/acdc/" target="_blank" rel="noreferrer">ACDC · cardiac MRI</a><a href="https://zmiclab.github.io/zxh/0/mmwhs/" target="_blank" rel="noreferrer">MM-WHS · cardiac CT and MRI</a><a href="https://github.com/XiaoweiXu/ImageCAS-A-Large-Scale-Dataset-and-Benchmark-for-Coronary-Artery-Segmentation-based-on-CT" target="_blank" rel="noreferrer">ImageCAS · coronary CT angiography</a><small>Dataset access and reuse terms vary. Obtain data from the source and follow its registration, agreement, and citation requirements. AngioSight does not bundle these datasets.</small></div></section>
      <section className="about-card"><span className="about-icon"><ScanLine size={19}/></span><h2>Image review</h2><p>Workspace supports PNG/JPEG X-ray images and image sequences exported as PNG/JPEG for CT or MRI, with slice navigation. DICOM and NIfTI volumes are not supported yet.</p><p>These are local viewing tools only. No X-ray, CT, or MRI disease analysis is performed. Viewing a scan does not produce a diagnosis or an estimate.</p></section>
      <section className="about-card about-limitations"><span className="about-icon"><ShieldCheck size={19}/></span><h2>Use and limitations</h2><p>For research and education only. The application does not diagnose disease, recommend treatment, or localize a lesion. The 3D heart is a reference model, not patient-specific anatomy.</p><p>Model performance metrics describe held-out data and are not evidence of clinical validation.</p></section>
    </div>
    <ModelPerformanceSection metrics={metrics} imagingMetrics={imagingMetrics}/>
  </div>;
}

function ModelPerformanceSection({ metrics, imagingMetrics }) {
  const targets = ['CAD', 'LAD', 'LCX', 'RCA'].map(name => [name, metrics?.targets?.[name]]).filter(([, result]) => result);
  const percent = value => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—';
  return <section className="about-performance model-performance">
    <header className="performance-heading"><span className="home-kicker">MODEL PERFORMANCE</span><h2>Evaluation results</h2><p>Held-out results for the clinical models. These are research metrics, not clinical validation.</p></header>
    <div className="performance-content">
      <h3>Clinical classification · stratified holdout</h3>
      {targets.length ? <div className="performance-table-wrap"><table className="performance-table"><thead><tr><th>Target</th><th>Test records</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>ROC-AUC</th></tr></thead><tbody>{targets.map(([name, result]) => <tr key={name}><th scope="row">{name}</th><td>{result.test_n ?? '—'}</td><td>{percent(result.accuracy)}</td><td>{percent(result.precision)}</td><td>{percent(result.recall)}</td><td>{percent(result.f1)}</td><td>{percent(result.roc_auc)}</td></tr>)}</tbody></table></div> : <p className="about-no-metrics">Model metrics will be available when the API is connected.</p>}
      {imagingMetrics && <div className="performance-imaging"><h3>CADICA angiography branch · separate evaluation</h3><div className="about-metrics">{[['Frame ROC-AUC', imagingMetrics.frame_level?.roc_auc], ['Frame accuracy', imagingMetrics.frame_level?.accuracy], ['Frames', imagingMetrics.frame_level?.n], ['Patient ranking AUC', imagingMetrics.patient_level_vessels_affected?.roc_auc]].map(([label, value]) => <div key={label}><span>{label}</span><b>{typeof value === 'number' ? (value <= 1.01 ? percent(value) : Math.round(value)) : '—'}</b></div>)}</div><p>Patient-grouped cross-validation; frame discrimination is near chance in this build. The frame score is not fused with clinical estimates.</p></div>}
      <p className="performance-caveat">Metrics come from the saved evaluation reports. A single holdout does not establish calibration, external validity, subgroup fairness, or clinical utility.</p>
    </div>
  </section>;
}

export default function App() {
  const [activePage, setActivePage] = useState(pageFromHash);
  const [features, setFeatures] = useState({});
  const [predictions, setPredictions] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [selected, setSelected] = useState('LAD');
  const [part, setPart] = useState(null);
  const [anatomyView, setAnatomyView] = useState('anterior');
  const [viewerMode, setViewerMode] = useState('anatomy');
  const [imageScale, setImageScale] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [status, setStatus] = useState('Enter the information you have, then calculate an estimate.');
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [activeGroup, setActiveGroup] = useState('profile');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  // Optional angiography upload. It is scored independently until the application
  // can verify that it belongs to the same patient as the clinical inputs.
  const [imagePreview, setImagePreview] = useState(null);
  const [imagePayload, setImagePayload] = useState(null);
  const [imageError, setImageError] = useState('');
  const [scanSeries, setScanSeries] = useState({ xray: [], ct: [], mri: [] });
  const [activeSlice, setActiveSlice] = useState(0);
  const scanUrls = useRef([]);
  const [imaging, setImaging] = useState(null);
  // Monotonic request id: a slow response from an earlier click can never
  // overwrite the estimate produced by a later one.
  const predictRequest = useRef(0);
  const activeRequest = useRef(null);
  useEffect(() => () => {
    predictRequest.current += 1;
    activeRequest.current?.abort();
    scanUrls.current.forEach(url => URL.revokeObjectURL(url));
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
    setExplanation(null);
    setImaging(null);
  }
  function update(key,value) {
    invalidateEstimate();
    setFeatures(prev=>({...prev,[key]:value}));
    setStatus('Inputs changed. Calculate again to update the estimate and heart map.');
  }
  function handleImageFile(file) {
    invalidateEstimate();
    setImageError('');
    if (!file) return;
    const accepted = /^image\/(png|jpe?g)$/i.test(file.type) || /\.(png|jpe?g)$/i.test(file.name || '');
    if (!accepted) { setImageError('Only PNG and JPEG images are accepted.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImageError('The image exceeds the 5 MB limit.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setImagePreview(dataUrl);
      setImagePayload(dataUrl.slice(dataUrl.indexOf(',') + 1));
      setImaging(null); setPredictions(null);
      setViewerMode('angiography'); setImageScale(1); setImageRotation(0);
      setStatus('Angiography frame attached. Its research score is reported separately from the clinical estimate.');
    };
    reader.onerror = () => setImageError('The selected image could not be read.');
    reader.readAsDataURL(file);
  }
  function handleScanFiles(fileList, modality) {
    setImageError('');
    const files = [...(fileList || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (!files.length) return;
    const maxCount = modality === 'xray' ? 1 : 300;
    if (files.length > maxCount) { setImageError(`Select no more than ${maxCount} ${modality === 'xray' ? 'image' : 'slices'} at a time.`); return; }
    const valid = files.every(file => /^image\/(png|jpe?g)$/i.test(file.type) || /\.(png|jpe?g)$/i.test(file.name || ''));
    if (!valid) { setImageError('Choose PNG or JPEG images. DICOM and NIfTI files are not supported yet.'); return; }
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (files.some(file => file.size > 20 * 1024 * 1024) || totalBytes > 500 * 1024 * 1024) { setImageError('Each image must be under 20 MB and the selected series under 500 MB.'); return; }
    const urls = files.map(file => URL.createObjectURL(file));
    scanUrls.current.push(...urls);
    setScanSeries(current => {
      current[modality].forEach(item => URL.revokeObjectURL(item.url));
      scanUrls.current = scanUrls.current.filter(url => !current[modality].some(item => item.url === url));
      return { ...current, [modality]: files.map((file, index) => ({ url: urls[index], name: file.name })) };
    });
    setActiveSlice(0); setImageScale(1); setImageRotation(0);
  }
  function clearScan(modality) {
    setScanSeries(current => {
      current[modality].forEach(item => URL.revokeObjectURL(item.url));
      const removed = new Set(current[modality].map(item => item.url));
      scanUrls.current = scanUrls.current.filter(url => !removed.has(url));
      return { ...current, [modality]: [] };
    });
    setActiveSlice(0); setImageError('');
  }
  function clearImage() {
    invalidateEstimate();
    setImagePreview(null); setImagePayload(null); setImageError(''); setImageScale(1); setImageRotation(0);
    setImaging(null); setPredictions(null);
  }
  async function predict() {
    const problems = validateFeatures();
    if (problems.length) {
      setStatus(`Fix ${problems.length} value${problems.length>1?'s':''} before calculating: ${problems.slice(0,3).join('; ')}${problems.length>3?`; +${problems.length-3} more`:''}.`);
      return;
    }
    const requestId = ++predictRequest.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPredictions(null); setExplanation(null); setImaging(null);
    setBusy(true); setStatus('Calculating with the current input values…');
    try {
      const modelFeatures = { ...features };
      // The model was trained with Female/Male only. Treat Other as unknown so
      // the backend applies its documented training-set imputation.
      if (modelFeatures.Sex === 'Other') modelFeatures.Sex = null;
      const body = { features: modelFeatures };
      if (imagePayload) body.image = imagePayload;
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
      setExplanation(data.explanation ?? null);
      setImaging(data.imaging ?? null);
      setStatus(imagePayload && data.imaging?.applied ? 'Clinical estimate updated; the angiography frame is scored separately because no verified same-patient link is available.' : 'Estimate updated. This is educational decision support only.');
    } catch(e) {
      if (requestId !== predictRequest.current) return;
      setImaging(null);
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
  const imagingMetrics = metrics?.imaging?.trained ? metrics.imaging : null;
  function resetInputs() { invalidateEstimate(); const initial={};for(const [key,schema] of Object.entries(metrics?.feature_schema||{})){initial[key]=schema.type==='number'?null:'';}setFeatures(initial);setExplanation(null);setImagePreview(null);setImagePayload(null);setViewerMode('anatomy');setImageScale(1);setImageRotation(0);setStatus('Enter the information you have, then calculate an estimate.'); }
  const seriesMode = ['xray','ct','mri'].includes(viewerMode);
  const activeSeries = seriesMode ? scanSeries[viewerMode] : [];
  const displayedSlice = activeSeries[Math.min(activeSlice, Math.max(0, activeSeries.length - 1))];
  const modalityLabel = ({ anatomy:'3D anatomy', angiography:'Angiography', xray:'X-ray', ct:'CT', mri:'MRI' })[viewerMode];
  return <main className="shell">
    {showSplash&&<div className="splash-screen" role="status" aria-label="Loading AngioSight"><div className="splash-content"><div className="splash-logo"><img src="/logo.png" alt="AngioSight"/></div><span className="splash-caption">CARDIOVASCULAR RESEARCH</span><span className="splash-loader"/></div></div>}
    <header className="topbar"><a className="brand" href="#home" aria-label="AngioSight home" onClick={event=>{event.preventDefault();navigateTo('home');}}><div className="brand-mark"><img src="/logo.png" alt="AngioSight"/></div></a><nav className="app-nav" aria-label="Main navigation"><a className={activePage==='home'?'nav-current':''} aria-current={activePage==='home'?'page':undefined} href="#home" onClick={event=>{event.preventDefault();navigateTo('home');}}>Home</a><a className={activePage==='workspace'?'nav-current':''} aria-current={activePage==='workspace'?'page':undefined} href="#workspace" onClick={event=>{event.preventDefault();navigateTo('workspace');}}>Workspace</a><a className={activePage==='about'?'nav-current':''} aria-current={activePage==='about'?'page':undefined} href="#about" onClick={event=>{event.preventDefault();navigateTo('about');}}>About</a></nav><div className="top-actions"><span className="top-status"><i className={metrics?.trained?'status-dot':'status-dot offline'}/>{metrics?.trained?'Model ready':'Model offline'}</span><span className="mode-tag"><ShieldCheck size={14}/> Research use</span><button className="theme-toggle" type="button" onClick={() => setTheme(current => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system')} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme} · activate to change`}>{theme==='dark'?<Moon size={16}/>:theme==='light'?<Sun size={16}/>:<Monitor size={16}/>}<span>{theme==='system'?'System':theme==='light'?'Light':'Dark'}</span></button><button className="icon-button" type="button" title="Start a new assessment" aria-label="Start a new assessment" onClick={()=>{resetInputs();navigateTo('workspace');}}><RotateCcw size={16}/><span>New assessment</span></button></div></header>
    {activePage==='home'?<HomePage onNavigate={navigateTo} metrics={metrics} datasetSize={datasetSize} featureCount={featureKeys.length}/>:activePage==='about'?<AboutPage metrics={metrics} datasetSize={datasetSize} imagingMetrics={imagingMetrics}/>:<div className="workspace-page" id="workspace">
    <div className="safety"><Info size={16}/><span><b>Research and education use</b><i/> This application provides research estimates only. It is not intended for diagnosis or treatment decisions.</span></div>
    <section className="workspace-heading" id="workspace-heading"><div className="breadcrumbs"><button type="button" onClick={()=>navigateTo('home')}>Home</button><span>/</span><b>New assessment</b></div><div className="workspace-title-row"><div><h1>Cardiovascular assessment</h1><p className="lede">Enter available clinical information and review the heart reference alongside model estimates.</p></div><div className="workspace-state"><i className={metrics?.trained?'status-dot':'status-dot offline'}/><span><b>{metrics?.trained?'Clinical model available':'Clinical model unavailable'}</b><small>Research environment</small></span></div></div></section>
    <section className="dashboard" id="assessment">
      <aside className="panel input-panel"><div className="panel-head"><div><span className="step">01</span><div><h2>Clinical inputs</h2><span className="panel-subtitle">PATIENT ASSESSMENT</span></div></div><span className="completion-tag"><Check size={12}/>{completedCount} of {featureKeys.length||'—'} entered</span></div>
        <div className="input-summary"><span className="summary-icon"><ClipboardList size={16}/></span><span><b>Clinical profile</b><small>Enter known values. Leave unknown fields blank for model imputation.</small></span><span className="summary-count">{missingCount}<small>BLANK</small></span></div>
        <div className="imaging-upload">
          <div className="imaging-upload-head"><Upload size={14}/><span><b>{seriesMode?`${modalityLabel} image${viewerMode==='xray'?'':' sequence'}`:'Angiography frame'} <em>optional</em></b><small>{seriesMode?'Local preview only · PNG/JPEG export required · no analysis is run':metrics?.imaging?.trained ? 'Separate CADICA research score · does not change the clinical estimate' : 'Image analysis is unavailable; the clinical estimate uses structured inputs only.'}</small></span></div>
          {viewerMode==='angiography'&&imagePreview
            ? <div className="imaging-preview"><img src={imagePreview} alt="Attached angiography frame"/><span><b>Frame attached</b><small>Sent to the imaging branch as-is. No image is stored.</small><button type="button" onClick={clearImage}><X size={12}/>Remove</button></span></div>
            : seriesMode&&activeSeries.length>0
              ? <div className="imaging-preview"><img src={displayedSlice.url} alt={`${modalityLabel} ${viewerMode==='xray'?'image':'slice'} preview`}/><span><b>{activeSeries.length} {viewerMode==='xray'?'image':'slices'} ready</b><small>Files stay in this browser session.</small><button type="button" onClick={()=>clearScan(viewerMode)}><X size={12}/>Remove series</button></span></div>
              : <label className="imaging-drop"><input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple={seriesMode&&viewerMode!=='xray'} onChange={e=>{if(seriesMode)handleScanFiles(e.target.files,viewerMode);else if(e.target.files?.[0])handleImageFile(e.target.files[0]);e.target.value='';}}/><Upload size={15}/><span>{seriesMode?viewerMode==='xray'?'Upload a PNG or JPEG X-ray':'Upload exported PNG/JPEG slices (select multiple files)':'Upload a PNG or JPEG angiography frame'}</span></label>}
          {imageError&&<p className="imaging-error" role="alert">{imageError}</p>}
        </div>
        <label className="field-search"><Search size={15}/><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Find a clinical feature" aria-label="Search clinical features"/>{searchTerm&&<button type="button" onClick={()=>setSearchTerm('')} aria-label="Clear search"><X size={14}/></button>}</label>
        {!searchTerm&&<div className="group-tabs" role="group" aria-label="Clinical feature groups">{featureGroups.filter(group=>group.keys.length).map(group=>{const Icon=group.icon;return <button type="button" aria-pressed={activeGroup===group.id} key={group.id} className={activeGroup===group.id?'active':''} onClick={()=>setActiveGroup(group.id)}><Icon size={14}/><span>{group.label}</span><small>{group.keys.length}</small></button>})}</div>}
        <div className="fields-head"><span>{searchTerm?`Matching fields · ${activeFields.length}`:featureGroups.find(group=>group.id===activeGroup)?.label}</span><span>Value</span></div>
        <div className="fields-scroll"><div className="fields">{activeFields.map(k=>{const schema=metrics?.feature_schema?.[k];const numeric=schema?.type==='number';return <label key={k}><span>{k}</span>{numeric?<input type="number" value={features[k] ?? ''} onChange={e=>{const v=e.target.value;if(v===''){update(k,null);}else{const n=Number(v);update(k,Number.isNaN(n)?null:n);}}}/>:<><select value={features[k] ?? ''} onChange={e=>update(k,e.target.value)}><option value="">Select value</option>{(schema?.options ?? []).map(value=><option key={value}>{value}</option>)}{k==='Sex'&&<option value="Other">Other</option>}</select>{k==='Sex'&&features.Sex==='Other'&&<small className="field-hint">The clinical model treats this as an unknown category and applies its training-data imputation.</small>}</>}</label>})}{!activeFields.length&&<p className="no-fields">{featureKeys.length?'No fields match that search.':'Train a model to load the clinical feature form.'}</p>}</div></div>
        <div className="input-footer"><p className="microcopy" role="status" aria-live="polite">{status}</p><button className="primary-button" type="button" onClick={predict} disabled={busy||featureKeys.length===0}><span><Sparkles size={16}/>{busy?'Calculating estimate…':'Calculate estimate'}</span><ArrowUpRight size={17}/></button><p className="privacy-note"><ShieldCheck size={12}/> Your details are used for this estimate and aren’t stored by this app.</p></div>
      </aside>
      <section className="panel viz-panel"><div className="panel-head"><div><span className="step">02</span><div><h2>Imaging workspace</h2><span className="panel-subtitle">ANATOMY REFERENCE &amp; IMAGE REVIEW</span></div></div><span className="drag-hint">{viewerMode==='anatomy'||viewerMode==='angiography'?'Drag to rotate · scroll or pinch to zoom':seriesMode?'Local image review · not analyzed':'Image preview · research use'}</span></div>
        <div className="modality-bar" role="group" aria-label="Imaging modality">{[['anatomy','3D anatomy'],['angiography','Angiography'],['xray','X-ray'],['ct','CT'],['mri','MRI']].map(([id,label])=><button type="button" key={id} aria-pressed={viewerMode===id} className={viewerMode===id?'active':''} onClick={()=>{setViewerMode(id);setActiveSlice(0);setImageScale(1);setImageRotation(0);}}>{label}</button>)}</div>
        {viewerMode==='angiography'&&<p className="microcopy imaging-boundary">Simulated angiography-style rendering of reference anatomy. It is not a patient scan, and form inputs cannot generate a patient-specific angiogram or lesion location.</p>}
        {(viewerMode==='anatomy'||viewerMode==='angiography')&&<div className="view-controls" role="group" aria-label="Anatomical view"><span>View</span>{[['anterior','Anterior'],['posterior','Posterior'],['left','Left'],['right','Right'],['superior','Superior']].map(([id,label])=><button type="button" key={id} aria-pressed={anatomyView===id} onClick={()=>setAnatomyView(id)}>{label}</button>)}</div>}
        <div className={`viewer ${viewerMode!=='anatomy'?'image-viewer':''}`}>
          {viewerMode==='anatomy'?<DeferredAnatomyViewer probabilities={probabilities} onSelect={setSelected} onHover={setPart} view={anatomyView}/>:viewerMode==='angiography'?<div className={`angiography-composite${imagePreview?' has-frame':''}`}><section className="angiography-heart-pane" aria-label="Simulated angiography-style reference heart"><DeferredAnatomyViewer probabilities={probabilities} onSelect={setSelected} onHover={setPart} view={anatomyView} appearance="angiography"/><span className="angiography-pane-label">Simulated contrast view · {anatomyView}</span></section>{imagePreview&&<section className="angiography-frame-pane" aria-label="Uploaded angiography frame"><span className="angiography-pane-label">Uploaded frame · review only</span><img className="scan-preview" src={imagePreview} alt="Uploaded angiography frame preview" style={{transform:`scale(${imageScale}) rotate(${imageRotation}deg)`}}/><div className="scan-tools"><button type="button" aria-label="Zoom out" onClick={()=>setImageScale(value=>Math.max(.5,value-.15))}><ZoomOut size={15}/></button><button type="button" aria-label="Zoom in" onClick={()=>setImageScale(value=>Math.min(3,value+.15))}><ZoomIn size={15}/></button><button type="button" onClick={()=>{setImageScale(1);setImageRotation(value=>(value+90)%360);}}>Rotate 90°</button><button type="button" onClick={()=>{setImageScale(1);setImageRotation(0);}}>Fit</button></div></section>}</div>:seriesMode&&displayedSlice?<><img className="scan-preview" src={displayedSlice.url} alt={`${modalityLabel} ${viewerMode==='xray'?'image':`slice ${activeSlice+1}`}`} style={{transform:`scale(${imageScale}) rotate(${imageRotation}deg)`}}/><div className="scan-tools"><button type="button" aria-label="Zoom out" onClick={()=>setImageScale(value=>Math.max(.5,value-.15))}><ZoomOut size={15}/></button><button type="button" aria-label="Zoom in" onClick={()=>setImageScale(value=>Math.min(3,value+.15))}><ZoomIn size={15}/></button><button type="button" onClick={()=>{setImageScale(1);setImageRotation(value=>(value+90)%360);}}>Rotate 90°</button><button type="button" onClick={()=>{setImageScale(1);setImageRotation(0);}}>Fit</button></div></>:<div className="modality-empty"><div><strong>{`${modalityLabel} image review`}</strong><span>{viewerMode==='xray'?'Upload a chest X-ray as a PNG or JPEG in Clinical inputs.':'Upload a set of exported PNG/JPEG slices in Clinical inputs to browse the series.'}</span><small>Local preview only. No scan analysis is available for this modality.</small></div></div>}
          <div className="viewer-label"><span>{viewerMode==='anatomy'?`${anatomyView[0].toUpperCase()}${anatomyView.slice(1)} view`:viewerMode==='angiography'?`Angiography · ${anatomyView} coronary reference`:seriesMode&&displayedSlice?`${modalityLabel} · ${viewerMode==='xray'?'image':`slice ${activeSlice+1} of ${activeSeries.length}`}`:`${modalityLabel} preview`}</span><span>{viewerMode==='anatomy'||viewerMode==='angiography'?'BodyParts3D · Ref. 4.0':seriesMode?'Local file · not analyzed':'Image attached by user'}</span></div><div className="viewer-corner viewer-corner-tl"/><div className="viewer-corner viewer-corner-br"/></div>
        {seriesMode&&activeSeries.length>1&&<div className="slice-controls"><button type="button" onClick={()=>setActiveSlice(value=>Math.max(0,value-1))} disabled={activeSlice===0}>Previous slice</button><input type="range" min="0" max={activeSeries.length-1} value={activeSlice} onChange={event=>setActiveSlice(Number(event.target.value))} aria-label="CT or MRI slice"/><button type="button" onClick={()=>setActiveSlice(value=>Math.min(activeSeries.length-1,value+1))} disabled={activeSlice===activeSeries.length-1}>Next slice</button><span>{activeSlice+1} / {activeSeries.length}</span></div>}
        {viewerMode==='anatomy'?<><div className="legend"><span className="legend-head">Estimate</span><span className="legend-ramp" style={{background:RISK_GRADIENT}} aria-hidden="true"/><span><i style={{background:riskColor(0)}}/>Lower</span><span><i style={{background:riskColor(0.5)}}/>Mid</span><span><i style={{background:riskColor(1)}}/>Higher</span><span><i style={{background:RISK_PENDING}}/>Pending</span></div><div className="legend"><span className="legend-head">Anatomy</span>{anatomyGroups.map(group=><span key={group}><i style={{background:PART_GROUP_COLORS[group]}}/>{PART_GROUP_LABELS[group]}</span>)}</div><p className="structure-readout">{part?<><i style={{background:part.color}}/><b>{part.name}</b><span>{PART_GROUP_LABELS[part.group]}{part.vessel?` · ${part.vessel}`:''}{part.selectable?' · click to select':''}</span></>:<span>Hover the model to name a structure · {NAMED_REGION_COUNT} labelled regions</span>}</p><p className="attribution">BodyParts3D, © The Database Center for Life Science, CC BY 4.0. Named artery colors show research estimates, not lesion locations. <a href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">Source and attribution</a></p></>:seriesMode&&activeSeries.length>1?<p className="attribution">Image sequence only · {activeSeries.length} slices · ordered by filename · no diagnostic analysis. <button type="button" className="text-action" onClick={()=>document.querySelector('.imaging-upload input[type=file]')?.click()}>Choose another series</button></p>:<p className="attribution">Image preview controls do not modify the uploaded file. <button type="button" className="text-action" onClick={()=>document.querySelector('.imaging-upload input[type=file]')?.click()}>Choose another image</button></p>}</section>
      <aside className="panel results-panel"><div className="panel-head"><div><span className="step">03</span><div><h2>Research estimates</h2><span className="panel-subtitle">CLINICAL MODEL OUTPUT</span></div></div><span className="result-state"><i className={predictions?'status-dot':'status-dot idle'}/>{predictions?'UPDATED':'AWAITING INPUTS'}</span></div>
        <div className="cad-card"><div className="cad-card-head"><span>CAD MODEL PROBABILITY</span><span>POSITIVE CLASS <Info size={12}/></span></div><div className="cad-score"><div className="risk-ring" style={{'--risk-color':cadProbability==null?'#516171':riskColor(cadProbability)}}><svg viewBox="0 0 72 72" aria-hidden="true"><circle className="ring-track" cx="36" cy="36" r="30"/><circle className="ring-value" cx="36" cy="36" r="30" style={{strokeDashoffset:cadRingOffset}}/></svg><strong>{cadProbability==null?'—':Math.round(cadProbability*100)}<small>{cadProbability==null?'':'%'}</small></strong></div><div className="cad-copy"><b>{predictions?.CAD?.prediction??'No estimate yet'}</b><span>{predictions?.CAD?`Model class · ${predictions.CAD.positive_class}`:'Enter inputs and calculate an estimate'}</span><small><i className={cadProbability==null?'score-dot idle':'score-dot'} style={{'--risk-color':cadProbability==null?'#516171':riskColor(cadProbability)}}/>{cadProbability==null?'MODEL OUTPUT':'ESTIMATE GENERATED'}</small></div></div><div className="score-scale"><span>0.00</span><i><b style={{width:`${(cadProbability??0)*100}%`,'--risk-color':cadProbability==null?'#516171':riskColor(cadProbability)}}/></i><span>1.00</span></div>
        <div className="fusion-note"><Info size={12}/><span>Clinical estimates use structured clinical inputs only. Angiography scores, when available, are reported independently and do not change the clinical estimate.</span></div></div>
        <div className="vessel-section-head"><span>VESSEL BREAKDOWN</span><span>PROBABILITY</span></div><div className="vessel-list">{vessels.map(v=><button type="button" key={v} aria-pressed={selected===v} className={`vessel-row ${selected===v?'selected':''}`} onClick={()=>setSelected(v)}><span className="vessel-dot" style={{'--risk-color':riskColor(probabilities[v])}}/><span className="vessel-row-info"><b>{v}</b><small>{v==='LAD'?'Anterior descending':v==='LCX'?'Circumflex':'Right coronary'}</small><i><b style={{width:`${(probabilities[v]??0)*100}%`,'--risk-color':riskColor(probabilities[v])}}/></i></span><strong>{probabilities[v]==null?'—':`${Math.round(probabilities[v]*100)}%`}</strong><ChevronRight size={14}/></button>)}</div>{imaging?.applied && <div className="imaging-result"><Info size={13}/><span><b>Imaging branch</b> · stand-alone frame lesion score {Math.round((imaging.lesion_probability??0)*100)}% ({imaging.windows} window(s) scanned). This score is not linked to the clinical inputs and does not alter CAD. Hotspot-based, not lesion localization.</span></div>}<div className="insight"><span className="insight-icon"><Info size={15}/></span><p><b>{selected} · model interpretation</b><br/>{predictions?.[selected] ? `${Math.round(probabilities[selected]*100)}% model probability for the positive class (${predictions[selected].positive_class}). This does not locate or size a lesion.` : 'Choose a vessel or run an analysis to inspect its model estimate.'}</p></div>
      </aside>
    </section>
    <section className="lower-grid" id="model-context"><div className="panel explainer"><div className="panel-head"><div><span className="step">04</span><div><h2>What influenced the model?</h2><span className="panel-subtitle">PATIENT INPUT SENSITIVITY</span></div></div><span className="muted">CAD ESTIMATE</span></div>{explanation?.features?.length?<><p className="explanation-intro">Each entered value is substituted into a typical training-profile reference one at a time. Change is shown in CAD model probability points.</p><div className="local-explanations">{explanation.features.map(item=><div className="local-explanation-row" key={item.name}><span className="local-feature-name">{item.name}</span><span className="local-feature-value">{typeof item.value==='number'?item.value:String(item.value)}</span><div className="bar"><i className={item.delta<0?'negative':''} style={{width:`${Math.max(2,Math.min(100,Math.abs(item.delta)*200))}%`}}/></div><strong className={item.delta<0?'negative':''}>{item.delta>=0?'+':''}{(item.delta*100).toFixed(1)} pp</strong></div>)}</div></>:<div className="empty-state"><Activity size={20}/><p>{predictions?'Enter one or more clinical values to see how they shift the CAD estimate from a typical training profile.':'Patient-specific feature sensitivity will appear after you calculate an estimate.'}</p></div>}<p className="microcopy">One-feature reference substitution is a sensitivity comparison, not SHAP, a causal effect, or a clinical explanation. Global held-out feature importance follows.</p>{cadImportance.length?<details className="global-importance"><summary>Global feature importance · held-out data</summary><div className="importance">{cadImportance.slice(0,6).map((x,index)=><div className="importance-row" key={x.feature}><span className="importance-index">0{index+1}</span><span>{x.feature}</span><div className="bar"><i style={{width:`${maxImportance>0?Math.max(0,x.mean)/maxImportance*100:0}%`}}/></div><small>{x.mean.toFixed(3)}</small></div>)}</div></details>:null}</div></section>
    </div>}
    <footer className="app-footer"><span><b>AngioSight</b> · Research prototype</span><span>BodyParts3D anatomy · Dataset-derived estimates · No lesion localization</span></footer>
  </main>;
}
