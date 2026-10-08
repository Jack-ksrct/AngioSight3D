import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

const AnatomyCanvas = lazy(() => import('./AnatomyViewer.jsx'));

export default function DeferredAnatomyViewer({ probabilities, onSelect, onHover, view, interactive = true, appearance = 'anatomy' }) {
  const containerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  // The 3D runtime is ~700 KB, so it is only fetched once the viewer scrolls
  // into view. Once loaded it stays mounted so later estimates only swap
  // materials rather than re-creating the scene.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '180px' });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className="viewer-canvas-shell" aria-busy={!shouldLoad}>
    {shouldLoad
      ? <Suspense fallback={<div className="viewer-loading" role="status">Loading anatomical reference…</div>}><AnatomyCanvas probabilities={probabilities} onSelect={onSelect} onHover={onHover} view={view} interactive={interactive} appearance={appearance}/></Suspense>
      : <div className="viewer-loading" role="status">Interactive heart model</div>}
  </div>;
}
