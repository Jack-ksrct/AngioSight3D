import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

const AnatomyCanvas = lazy(() => import('./AnatomyViewer.jsx'));
const BodyFigure = lazy(() => import('./BodyFigure.jsx'));

export default function DeferredAnatomyViewer({ probabilities, onSelect, onHover, sex }) {
  const containerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);

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

  return <>
    <div ref={containerRef} className="viewer-canvas-shell" aria-busy={!shouldLoad}>
      {shouldLoad
        ? <Suspense fallback={<div className="viewer-loading" role="status">Loading anatomical reference…</div>}><AnatomyCanvas probabilities={probabilities} onSelect={onSelect} onHover={onHover}/></Suspense>
        : <div className="viewer-loading" role="status">Interactive heart model</div>}
    </div>
    {shouldLoad&&<Suspense fallback={<div className="body-reference body-reference-loading" role="status">Loading body map…</div>}><BodyFigure sex={sex}/></Suspense>}
  </>;
}
