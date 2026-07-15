import React, { useState, useEffect } from 'react';
import { ALGORITHMS } from './config/algorithms';
import ProjectModal from './components/ProjectModal';
import Dashboard from './components/Dashboard';
import LinearRegressionWorkspace from './components/LinearRegressionWorkspace';
import CompareWorkspace from './components/CompareWorkspace';
import DataLabWorkspace from './components/DataLabWorkspace';
import { Terminal, Cpu, Loader2, Trash2, Folder, Database, ArrowLeft } from 'lucide-react';
import './App.css';



export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'dashboard' | 'lr-workspace' | 'compare-workspace' | 'data-lab'
  const [selectedModel, setSelectedModel] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [compareData, setCompareData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [preloadedParams, setPreloadedParams] = useState(null);
  const [preloadedState, setPreloadedState] = useState(null);
  const [dataLabSession, setDataLabSession] = useState(null);

  // Persistent Project Detection state
  const [projects, setProjects] = useState([]);
  const [hasDeraFolder, setHasDeraFolder] = useState(false);
  const [landingTab, setLandingTab] = useState('create'); // 'create' | 'continue'

  // Project deletion state variables
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  // Dismiss toast notification after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // On mount, check if it's a page refresh vs fresh launch
  useEffect(() => {
    const initApp = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/server-session');
        const data = await res.json();
        const serverSessionId = data.serverSessionId;
        
        await fetchProjects();
        
        const cachedProject = localStorage.getItem('dera_active_project');
        const localSessionId = sessionStorage.getItem('dera_server_session_id');
        const savedView = sessionStorage.getItem('dera_current_view');
        
        // Detect refresh:
        // 1. Session ID in sessionStorage matches server session ID
        // 2. The page navigation type is reload
        const isReload = performance.getEntriesByType('navigation')[0]?.type === 'reload' || performance.navigation?.type === 1;
        const isSameSession = localSessionId === serverSessionId;
        
        if (cachedProject && isReload && isSameSession) {
          // It's a refresh! Restore the project and the exact view
          await handleContinueProject(cachedProject, savedView);
        } else {
          // Fresh launch/reload, or server restarted!
          // Force view to landing (Home Dashboard)
          setView('landing');
          sessionStorage.setItem('dera_server_session_id', serverSessionId);
          sessionStorage.removeItem('dera_current_view');
        }
      } catch (err) {
        console.error('[DERA Client App] Failed to initialize app session:', err);
        setView('landing');
      }
    };
    initApp();
  }, []);

  const changeView = async (newView, proj = projectName) => {
    setView(newView);
    if (newView !== 'landing' && proj) {
      sessionStorage.setItem('dera_current_view', newView);
      try {
        await fetch('http://localhost:8000/api/sync-active-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: proj, activeView: newView })
        });
      } catch (err) {
        console.error('[DERA Client App] Failed to sync active view:', err);
      }
    } else {
      sessionStorage.removeItem('dera_current_view');
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch('http://localhost:8000/api/delete-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectName: projectToDelete }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setToast(`Project "${projectToDelete}" deleted successfully`);
        setIsDeleteModalOpen(false);
        setProjectToDelete(null);
        await fetchProjects();
      } else {
        alert(data.error || 'Failed to delete project.');
      }
    } catch (err) {
      console.error('[DERA Client App] Failed to delete project:', err);
      alert('Error connecting to DERA server.');
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/list-projects');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setHasDeraFolder(data.exists);
          setProjects(data.projects || []);
          if (data.exists && data.projects && data.projects.length > 0) {
            setLandingTab('continue');
          }
        }
      }
    } catch (err) {
      console.error('[DERA Client App] Failed to scan DERA folder:', err);
    }
  };

  // Trigger modal when card is selected
  const handleModelSelect = (algorithm) => {
    setSelectedModel(algorithm);
    setIsModalOpen(true);
  };

  // Create project folders and file via API
  const handleCreateProject = async (name, file) => {
    console.log('[DERA Client App] handleCreateProject triggered with project name:', name, 'and file:', file?.name);
    setIsCreating(true);
    try {
      console.log('[DERA Client App] Sending POST http://localhost:8000/api/projects/initialize request...');
      const formData = new FormData();
      formData.append('projectName', name);
      formData.append('file', file);

      const response = await fetch('http://localhost:8000/api/projects/initialize', {
        method: 'POST',
        body: formData
      });
      
      console.log('[DERA Client App] HTTP Response status:', response.status);
      const data = await response.json();
      console.log('[DERA Client App] Response JSON body:', data);
      
      if (response.ok && data.success) {
        setProjectName(name);
        localStorage.setItem('dera_active_project', name);
        setIsModalOpen(false);
        setPreloadedParams(null);
        setPreloadedState(null);
        await fetchProjects(); // Refresh local list
        
        console.log('[DERA Client App] Project created on FastAPI. Selected model:', selectedModel);
        
        // Sync active view to data-lab on Node server
        await fetch('http://localhost:8000/api/sync-active-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: name, activeView: 'data-lab', activeViewMode: 'data' })
        });

        // Initialize Data Lab Session state with uploaded dataset info
        const dataset = data.dataset;
        const newSession = {
          sessionId: dataset.datasetId,
          rawDatasetPath: dataset.rawDatasetPath,
          processedDatasetPath: '',
          columns: [],
          metadata: {
            totalRows: 0,
            totalCols: 0,
            missingCounts: {},
            dtypes: {},
            records: []
          },
          preprocessingSteps: [],
          createdAt: dataset.createdAt
        };

        setDataLabSession(newSession);
        changeView('data-lab', name);
      } else {
        console.error('[DERA Client App] Project creation failed:', data.error || data.detail);
        alert(data.error || data.detail || 'Failed to initialize project on FastAPI.');
      }
    } catch (err) {
      console.error('[DERA Client App] Network/Execution error:', err);
      alert('Error connecting to the local DERA FastAPI server on port 8000.');
    } finally {
      setIsCreating(false);
    }
  };

  // Continue Existing Project Flow
  const handleContinueProject = async (projName, targetView = null) => {
    try {
      console.log('[DERA Client App] Loading project state for:', projName);
      const response = await fetch(`http://localhost:8000/api/load-project?projectName=${encodeURIComponent(projName)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project details');
      }
      const data = await response.json();
      if (data.success) {
        setProjectName(data.projectName);
        localStorage.setItem('dera_active_project', data.projectName);
        
        const algoId = data.config.algorithmId || 'linear-regression';
        let algorithm = ALGORITHMS.find(a => a.id === algoId);
        if (algoId === 'datalab') {
          algorithm = { id: 'datalab', name: 'Data Lab', category: 'Preprocessing' };
        }
        setSelectedModel(algorithm);
        
        const state = data.state || {};
        if (state.parameters) {
          setPreloadedParams(state.parameters);
        }
        
        setPreloadedState({
          metrics: state.metrics || null,
          activeVersionFile: state.activeVersionFile || `${data.projectName}.py`,
          code: data.code || ''
        });

        const hasHistory = data.history && data.history.models && data.history.models.length > 0;
        const targetViewResolved = targetView || (state.activeView === 'data-lab' ? 'data-lab' : (((state.activeView === 'compare-workspace' && hasHistory) || (data.history && data.history.models && data.history.models.length > 1)) ? 'compare-workspace' : 'lr-workspace'));
        
        const loadedSession = state.dataLabSession || null;
        if (loadedSession && data.pipeline) {
          loadedSession.preprocessingSteps = data.pipeline.steps || [];
        }
        setDataLabSession(loadedSession);
        
        changeView(targetViewResolved, data.projectName);
      } else {
        alert(data.error || 'Unable to open selected project.');
        localStorage.removeItem('dera_active_project');
      }
    } catch (err) {
      console.error('[DERA Client App] Continue project error:', err);
      alert('Error connecting to DERA server to load project metadata.');
    }
  };

  const handleCloseModal = () => {
    if (isCreating) return;
    setIsModalOpen(false);
    setSelectedModel(null);
  };

  const handleBackToLanding = () => {
    changeView('landing', '');
    setSelectedModel(null);
    setProjectName('');
    setCompareData(null);
    setPreloadedParams(null);
    setPreloadedState(null);
    setDataLabSession(null);
    localStorage.removeItem('dera_active_project');
    fetchProjects();
  };

  const handleHome = () => {
    changeView('landing');
    fetchProjects();
  };

  const handleOpenCompare = (data) => {
    setCompareData(data);
    changeView('compare-workspace');
  };

  const handleBackToWorkspace = () => {
    changeView('lr-workspace');
  };

  // View routing
  if (view === 'data-lab') {
    return (
      <DataLabWorkspace
        projectName={projectName}
        onBack={handleBackToLanding}
        onHome={handleHome}
        existingProjectNames={projects.map(p => p.name)}
        initialSession={dataLabSession}
        onLaunchProject={async (projName, algo, sessionData) => {
          // Transition the project to the Model Workspace
          await fetch('http://localhost:8000/api/sync-active-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName: projName, activeView: 'model-workspace' })
          });
          
          const targetPath = sessionData.processedDatasetPath || sessionData.rawDatasetPath;
          const params = {
            algorithmId: algo.id,
            dataset: {
              filePath: targetPath,
              hasTarget: algo.category === 'Clustering' ? 'No' : 'Yes',
              targetColumn: 'target'
            },
            trainTestSplit: {
              testSize: 0.2,
              randomState: 48,
              shuffle: true,
              useAdvanced: false
            },
            modelParams: null
          };

          await fetch('http://localhost:8000/api/sync-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName: projName, params })
          });

          setDataLabSession(sessionData);
          setProjectName(projName);
          setSelectedModel(algo);
          setPreloadedParams(params);
          setPreloadedState(null);
          changeView('lr-workspace', projName);
        }}
      />
    );
  }

  if (view === 'compare-workspace' && selectedModel) {
    return (
      <CompareWorkspace
        projectName={projectName}
        compareData={compareData}
        onBack={handleBackToWorkspace}
        onEditAgain={(params) => {
          setPreloadedParams(params);
          changeView('lr-workspace');
        }}
      />
    );
  }

  if (view === 'lr-workspace' && selectedModel) {
    return (
      <LinearRegressionWorkspace 
        projectName={projectName} 
        algorithm={selectedModel} 
        onBack={handleBackToLanding} 
        onOpenCompare={(data) => {
          setPreloadedParams(null);
          handleOpenCompare(data);
        }}
        preloadedParams={preloadedParams}
        preloadedState={preloadedState}
        onOpenDataLab={() => {
          setSelectedModel({ id: 'datalab', name: 'Data Lab', category: 'Preprocessing' });
          changeView('data-lab');
        }}
      />
    );
  }

  if (view === 'dashboard' && selectedModel) {
    return (
      <Dashboard 
        projectName={projectName} 
        algorithm={selectedModel} 
        onBack={handleBackToLanding} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-zinc-800 selection:text-white relative">
      {/* Background grids/gradients (subtle) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))]" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-12 md:py-20 flex-grow flex flex-col justify-center">
        
        {/* Ambient Background Gradient Blobs */}
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-sky-500/[0.03] blur-[140px] pointer-events-none z-0" />
        <div className="absolute top-1/2 right-1/3 -translate-y-1/2 translate-x-1/2 w-96 h-96 rounded-full bg-purple-500/[0.03] blur-[140px] pointer-events-none z-0" />
        
        {/* Header Section */}
        <header className="text-center mb-16 md:mb-12 max-w-2xl mx-auto">
          {/* Project Title */}
          <div className="flex justify-center mb-4 select-none">
            <svg viewBox="0 0 320 80" className="w-full max-w-[280px] md:max-w-[340px] h-auto">
              <defs>
                <linearGradient id="deraSmokeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="5%" stopColor="#ffffff" />
                  <stop offset="35%" stopColor="#dedaff" />
                  <stop offset="70%" stopColor="#d0e7ff" />
                  <stop offset="95%" stopColor="#ffffff" />
                </linearGradient>
              </defs>
              <text
                x="50%"
                y="62"
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '68px',
                  fontWeight: '800',
                  letterSpacing: '-0.02em',
                  fill: 'url(#deraSmokeGradient)',
                  stroke: '#000000',
                  strokeWidth: '4px',
                  paintOrder: 'stroke fill',
                  strokeLinejoin: 'round'
                }}
              >
                DERA
              </text>
            </svg>
          </div>

          {/* Tagline */}
          <h2 className="text-base md:text-lg font-medium text-zinc-300 font-sans tracking-wide mb-4">
            Develop • Evaluate • Retrain • Analyze
          </h2>

          {/* Description */}
          <p className="text-sm md:text-base text-zinc-400 leading-relaxed max-w-lg mx-auto">
            A minimalist workspace to prototype machine learning pipelines. Select an option below to manage or initialize your project directories.
          </p>
        </header>



        {/* Tab/Options Switcher if DERA folder exists with projects */}
        {hasDeraFolder && (projects.length > 0 || landingTab === 'continue') && (
          <div className="flex justify-center mb-12 relative z-20">
            <div className="inline-flex rounded-xl bg-zinc-900/60 p-1 border border-zinc-800/80 backdrop-blur-md shadow-2xl">
              <button
                type="button"
                onClick={() => { setLandingTab('continue'); }}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                  landingTab === 'continue'
                    ? 'bg-zinc-100 text-zinc-950 shadow-md scale-[1.02]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Continue Existing Project</span>
                <span className="inline-flex items-center justify-center bg-zinc-800 text-zinc-400 rounded-full h-4 min-w-[16px] px-1 text-[9px] font-mono">
                  {projects.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setLandingTab('create'); }}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                  landingTab === 'create'
                    ? 'bg-zinc-100 text-zinc-950 shadow-md scale-[1.02]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Create New Project</span>
              </button>
            </div>
          </div>
        )}

        {/* Algorithm Card Grid OR Continue Project Flow */}
        {landingTab === 'continue' && hasDeraFolder ? (
          projects.length > 0 ? (
            <main className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
              {projects.map((project) => {
                const isDataLab = project.state?.activeView === 'data-lab';
                const algo = isDataLab ? {
                  name: 'Data Lab',
                  category: 'Preprocessing',
                  badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                } : (ALGORITHMS.find(a => a.id === project.algorithmId) || {
                  name: 'Unknown Algorithm',
                  category: 'Unknown',
                  badgeColor: 'text-zinc-400 bg-zinc-800'
                });
                
                const formattedDate = project.createdAt 
                  ? new Date(project.createdAt).toLocaleDateString(undefined, { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })
                  : 'Unknown Date';

                return (
                  <div
                    key={project.name}
                    onClick={() => handleContinueProject(project.name)}
                    className="group relative rounded-2xl border border-zinc-900 bg-zinc-900/25 p-6 hover:border-zinc-800 hover:bg-zinc-900/40 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <div className="absolute -inset-px rounded-2xl border border-transparent transition-all duration-300 group-hover:ring-1 group-hover:ring-sky-500/20" />
                    
                    {/* Trash Delete Action */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(project.name);
                        setIsDeleteModalOpen(true);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 cursor-pointer absolute top-4 right-4 z-30"
                      title="Delete Project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    <div>
                      {/* Top row */}
                      <div className="flex items-center justify-between mb-4 pr-7">
                        <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${algo.badgeColor}`}>
                          {algo.category}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">
                          {formattedDate}
                        </span>
                      </div>

                      {/* Project Name & details */}
                      <h3 className="text-lg font-bold text-zinc-100 group-hover:text-sky-400 transition-colors font-mono">
                        {project.name}
                      </h3>
                      <p className="text-sm text-zinc-400 mt-1 font-sans leading-normal">
                        Workspace for <strong className="text-zinc-300 font-semibold">{algo.name}</strong>.
                      </p>

                    <div className="mt-6 flex items-center justify-between pt-4 border-t border-zinc-900/60 text-sm font-semibold text-zinc-300">
                      <span className="group-hover:text-zinc-50 transition-colors">Continue Workspace</span>
                      <span className="text-zinc-500 group-hover:text-zinc-50 transition-all transform group-hover:translate-x-1 font-sans">→</span>
                    </div>
                  </div>
                </div>
              );
              })}
            </main>
          ) : (
            <main className="max-w-md mx-auto w-full border border-zinc-900 bg-zinc-900/10 rounded-2xl p-8 text-center space-y-4 relative z-10 flex flex-col items-center justify-center min-h-[220px]">
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-500">
                <Folder className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-100">No Existing Projects Found</h3>
                <p className="text-xs text-zinc-400">Create a new project to begin experimenting.</p>
              </div>
              <button
                type="button"
                onClick={() => setLandingTab('create')}
                className="mt-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-50 text-zinc-950 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Create Project
              </button>
            </main>
          )
        ) : (
          <div className="space-y-6 relative z-10">
            {/* Featured Data Lab Launcher Card */}
            <div
              onClick={() => {
                setSelectedModel({ id: 'datalab', name: 'Data Lab', category: 'Preprocessing' });
                setIsModalOpen(true);
              }}
              className="group relative rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/20 to-zinc-950/40 p-6 hover:border-indigo-500/40 hover:shadow-[0_0_25px_rgba(99,102,241,0.06),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all duration-300 cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 overflow-hidden"
            >
              {/* Top brand line */}
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-indigo-500/30 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 group-hover:text-indigo-300 transition-colors drop-shadow-[0_0_4px_rgba(99,102,241,0.4)]">
                  <Database className="h-6 w-6 stroke-[1.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      Featured Workspace
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-100 group-hover:text-white mt-1.5 font-mono">
                    DERA Data Lab
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-xl">
                    Prepare and format dataset files before training. Drop/rename columns, fill missing values, deduplicate records, and track transformation pipelines with full undo support.
                  </p>
                </div>
              </div>
              <div className="text-zinc-600 transition-colors duration-300 group-hover:text-white shrink-0 self-end sm:self-center">
                <span className="text-xs font-bold font-mono mr-1.5">Open Data Lab</span>
                <span className="inline-block transform group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Loading Overlay */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-6 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            <span className="text-sm font-medium text-zinc-200">Scaffolding workspace directories...</span>
          </div>
        </div>
      )}



      {/* Project Folder Modal */}
      {selectedModel && (
        <ProjectModal
          algorithm={selectedModel}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onCreate={handleCreateProject}
          existingProjectNames={projects.map(p => p.name)}
        />
      )}

      {/* Delete Project Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-zinc-100 font-heading">
                Delete Project "{projectToDelete}"?
              </h2>
              <p className="text-xs text-zinc-400 leading-normal">
                This will permanently remove:
              </p>
              <ul className="list-disc list-inside text-xs text-zinc-400 space-y-1 font-sans pl-1">
                <li>project configuration</li>
                <li>generated model files</li>
                <li>comparison history</li>
                <li>metrics history</li>
                <li>saved pipeline files</li>
              </ul>
              <p className="text-xs text-zinc-500 font-medium pt-1">
                This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setProjectToDelete(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all duration-200 shadow-sm hover:shadow-red-600/15 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Project</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-855 text-zinc-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
}
