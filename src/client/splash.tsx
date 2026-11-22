import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SigilApp } from './SigilApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SigilApp isExpanded={false} />
  </StrictMode>
);
