import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings2, 
  Sliders, 
  Database, 
  Play, 
  Check, 
  Copy, 
  Code,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileSpreadsheet,
  FileCode,
  Terminal,
  BarChart4,
  Download,
  X,
  Home
} from 'lucide-react';
import { ALGORITHMS } from '../config/algorithms';
import { REGRESSION_SCHEMAS } from '../config/modelSchemas';

// A premium, lightweight, regex-based Python syntax highlighter for the DERA generator
function highlightPython(code) {
  if (!code) return '';
  
  // First escape HTML tags
  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Regex patterns
  const tokenRegex = /(#[^\n]*)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|\b(import|from|as|def|class|return|if|else|try|except|raise|with|for|in|and|or|not|is|lambda|pass)\b|\b(True|False|None)\b|\b(read_csv|read_excel|train_test_split|LinearRegression|fit|score|DataFrame|drop|iloc|fillna|isnull|any|mode|mean|tolist|select_dtypes|columns)\b|\b(\d+(?:\.\d+)?)\b/g;

  return escaped.replace(tokenRegex, (match, comment, dstr, sstr, keyword, boolVal, func, num) => {
    if (comment) return `<span class="text-zinc-500 italic select-none font-sans">${match}</span>`;
    if (dstr || sstr) return `<span class="text-emerald-400">${match}</span>`;
    if (keyword) return `<span class="text-purple-400 font-medium">${match}</span>`;
    if (boolVal) return `<span class="text-amber-500 font-medium">${match}</span>`;
    if (func) return `<span class="text-sky-400 font-medium">${match}</span>`;
    if (num) return `<span class="text-indigo-400">${match}</span>`;
    return match;
  });
}

export default function LinearRegressionWorkspace({ 
  projectName, 
  algorithm, 
  onBack, 
  onOpenCompare,
  preloadedParams,
  preloadedState,
  onOpenDataLab
}) {
  // Code and Console drawers visibility state
  const [isCodeDrawerOpen, setIsCodeDrawerOpen] = useState(false);
  const [isConsoleDrawerOpen, setIsConsoleDrawerOpen] = useState(false);
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

  // Active Algorithm state (supports multiple regression algorithms)
  const [activeAlgo, setActiveAlgo] = useState(algorithm);

  // Retrain actions dropdown state
  const [isRetrainDropdownOpen, setIsRetrainDropdownOpen] = useState(false);
  const [dropdownRetrainMode, setDropdownRetrainMode] = useState(null); // null | 'switch'
  const dropdownRetrainRef = useRef(null);

  // Change Model actions dropdown state for Header
  const [isChangeModelDropdownOpen, setIsChangeModelDropdownOpen] = useState(false);
  const changeModelDropdownRef = useRef(null);

  // Session execution state to dynamically control execution panel visibility
  const [runExecuted, setRunExecuted] = useState(false);

  // Dataset Selection State
  const [dataset, setDataset] = useState({
    hasTarget: 'Yes', // 'Yes' | 'No'
    targetColumn: 'target',
    filePath: '', // Absolute file path chosen by native picker
    excludedColumns: [] // Columns excluded from model training
  });

  // Dataset row & column counts
  const [totalRows, setTotalRows] = useState(null);
  const [totalCols, setTotalCols] = useState(null);
  const [isDatasetInfoExpanded, setIsDatasetInfoExpanded] = useState(true);

  // Columns Extraction State
  const [columns, setColumns] = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Train-Test Split State
  const [trainTestSplit, setTrainTestSplit] = useState({
    testSize: 0.2,
    randomState: 48, // defaulted to 48 as requested in user examples
    shuffle: true,
    trainSize: '',
    stratify: false,
    useAdvanced: false // Track if accordion was expanded and advanced settings are active
  });

  // Model parameters
  const [modelParams, setModelParams] = useState(() => {
    const schema = REGRESSION_SCHEMAS[algorithm?.id || 'linear-regression'];
    const defaults = {};
    if (schema && schema.parameters) {
      schema.parameters.forEach(p => {
        defaults[p.name] = p.defaultValue;
      });
    } else {
      defaults.fitIntercept = true;
      defaults.copyX = true;
      defaults.nJobs = 'None';
      defaults.positive = false;
    }
    return defaults;
  });

  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Synced');
  const [isTraining, setIsTraining] = useState(false);
  const [trainingLogs, setTrainingLogs] = useState('');
  const [trainingStatus, setTrainingStatus] = useState('Idle');
  const [trainingMetrics, setTrainingMetrics] = useState(null);
  const [rightTab, setRightTab] = useState('code'); // 'code' | 'console'
  const [activeVersionFile, setActiveVersionFile] = useState(`${projectName}.py`);
  const [hasComparisons, setHasComparisons] = useState(false);
  const [history, setHistory] = useState({ models: [] });
 
  const checkComparisons = () => {
    if (!projectName) return;
    fetch(`http://localhost:8000/api/get-comparison-history?projectName=${encodeURIComponent(projectName)}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data.success && data.history) {
          setHistory(data.history);
          if (data.history.models && data.history.models.length > 1) {
            setHasComparisons(true);
          } else {
            setHasComparisons(false);
          }
        } else {
          setHistory({ models: [] });
          setHasComparisons(false);
        }
      })
      .catch((err) => {
        console.error('[DERA Workspace] Failed to check comparison history:', err);
        setHistory({ models: [] });
        setHasComparisons(false);
      });
  };

  // Fetch comparison history on mount / projectName change to determine if "Compare Workspace" button should be displayed
  useEffect(() => {
    checkComparisons();
  }, [projectName]);

  // Preload parameters from the latest version when returning to the workspace
  useEffect(() => {
    if (preloadedParams) {
      if (preloadedParams.dataset) {
        setDataset({
          hasTarget: 'Yes',
          targetColumn: 'target',
          filePath: '',
          ...preloadedParams.dataset,
          excludedColumns: preloadedParams.dataset.excludedColumns || []
        });
      }
      if (preloadedParams.trainTestSplit) {
        setTrainTestSplit({
          ...preloadedParams.trainTestSplit,
          testSize: preloadedParams.trainTestSplit.testSize ?? 0.2,
          randomState: preloadedParams.trainTestSplit.randomState ?? 48
        });
      }
      if (preloadedParams.modelParams) {
        setModelParams(preloadedParams.modelParams);
      }
      if (preloadedParams.algorithmId) {
        const algo = ALGORITHMS.find(a => a.id === preloadedParams.algorithmId);
        if (algo) setActiveAlgo(algo);
      }
    }
  }, [preloadedParams]);

  // Keep activeAlgo synchronized if algorithm prop changes
  useEffect(() => {
    if (algorithm) {
      setActiveAlgo(algorithm);
    }
  }, [algorithm]);

  // Preload state details like metrics, active version, code preview
  useEffect(() => {
    if (preloadedState) {
      if (preloadedState.metrics) {
        setTrainingMetrics(preloadedState.metrics);
        setTrainingStatus('Completed');
        setTrainingLogs('Restored workspace state from disk. Model evaluation metrics are loaded.');
      }
      if (preloadedState.code) {
        setGeneratedCode(preloadedState.code);
        setSyncStatus('Synced');
      }
      if (preloadedState.activeRunId) {
        setActiveVersionFile(`Run ${preloadedState.activeRunId}`);
      } else if (preloadedState.activeVersionFile) {
        setActiveVersionFile(preloadedState.activeVersionFile);
      }
    }
  }, [preloadedState]);

  // Handle click outside of all dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRetrainRef.current && !dropdownRetrainRef.current.contains(event.target)) {
        setIsRetrainDropdownOpen(false);
        setDropdownRetrainMode(null);
      }
      if (changeModelDropdownRef.current && !changeModelDropdownRef.current.contains(event.target)) {
        setIsChangeModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced API call to sync changes to the local filesystem
  useEffect(() => {
    const params = {
      algorithmId: activeAlgo.id,
      dataset,
      trainTestSplit: {
        ...trainTestSplit,
        testSize: parseFloat(trainTestSplit.testSize) || 0.2,
        trainSize: trainTestSplit.trainSize !== '' && trainTestSplit.useAdvanced
          ? parseFloat(trainTestSplit.trainSize) 
          : null,
        randomState: trainTestSplit.randomState === '' || trainTestSplit.randomState === 'None'
          ? null 
          : parseInt(trainTestSplit.randomState, 10)
      },
      modelParams
    };

    setSyncStatus('Syncing');

    const delayDebounceFn = setTimeout(() => {
      fetch('http://localhost:8000/api/sync-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName,
          params
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Sync failed');
          return res.json();
        })
        .then((data) => {
          if (data.success) {
            setGeneratedCode(data.code);
            setSyncStatus('Synced');
          }
        })
        .catch((err) => {
          console.error(err);
          setSyncStatus('Error');
        });
    }, 250); // 250ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [dataset, trainTestSplit, modelParams, projectName, activeAlgo]);

  // Fetch dataset columns and shape on filePath change
  useEffect(() => {
    if (!dataset.filePath) {
      setColumns([]);
      setTotalRows(null);
      setTotalCols(null);
      setColumnsError('');
      return;
    }

    setColumnsLoading(true);
    setColumnsError('');
    
    const url = `http://localhost:8000/api/datalab/preview-dataset?projectName=${encodeURIComponent(projectName)}&filePath=${encodeURIComponent(dataset.filePath)}&limit=1`;
    
    fetch(url)
      .then((res) => {
        if (!res.ok) {
          return res.json().then((data) => {
            throw new Error(data.error || data.detail || 'Failed to read dataset preview.');
          });
        }
        return res.json();
      })
      .then((data) => {
        if (data.success && data.columns) {
          setColumns(data.columns);
          setTotalRows(data.totalRows ?? null);
          setTotalCols(data.totalCols ?? null);
          setColumnsError('');
          if (data.columns.length > 0 && !data.columns.includes(dataset.targetColumn)) {
            const defaultTarget = data.columns[0];
            setDataset(prev => ({
              ...prev,
              targetColumn: defaultTarget,
              excludedColumns: (prev.excludedColumns || []).filter(c => c !== defaultTarget)
            }));
          }
          setSearchQuery('');
        }
      })
      .catch((err) => {
        console.error('Error fetching columns:', err);
        setColumnsError(err.message);
        setColumns([]);
        setTotalRows(null);
        setTotalCols(null);
      })
      .finally(() => {
        setColumnsLoading(false);
      });
  }, [dataset.filePath, projectName]);

  // Handle click outside of dropdown to close it
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCode = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/export-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          params: {
            algorithmId: activeAlgo.id,
            dataset,
            trainTestSplit: {
              ...trainTestSplit,
              testSize: parseFloat(trainTestSplit.testSize) || 0.2,
              trainSize: trainTestSplit.trainSize !== '' && trainTestSplit.useAdvanced
                ? parseFloat(trainTestSplit.trainSize) 
                : null,
              randomState: trainTestSplit.randomState === '' || trainTestSplit.randomState === 'None'
                ? null 
                : parseInt(trainTestSplit.randomState, 10)
            },
            modelParams
          }
        })
      });
      if (!response.ok) throw new Error('Failed to export code');
      const data = await response.json();
      if (data.success && data.code) {
        const blob = new Blob([data.code], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName}_export.py`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      alert('Error exporting code: ' + err.message);
    }
  };

  const handleRunModel = async () => {
    setIsTraining(true);
    setRunExecuted(true);
    setTrainingStatus('Running');
    setTrainingLogs('');
    setIsConsoleDrawerOpen(true);
    setIsCodeDrawerOpen(false);

    const params = {
      algorithmId: activeAlgo.id,
      dataset,
      trainTestSplit: {
        ...trainTestSplit,
        testSize: parseFloat(trainTestSplit.testSize) || 0.2,
        trainSize: trainTestSplit.trainSize !== '' && trainTestSplit.useAdvanced
          ? parseFloat(trainTestSplit.trainSize) 
          : null,
        randomState: trainTestSplit.randomState === '' || trainTestSplit.randomState === 'None'
          ? null 
          : parseInt(trainTestSplit.randomState, 10)
      },
      modelParams
    };

    try {
      const response = await fetch('http://localhost:8000/api/run-pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          projectName, 
          params
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        const text = await response.text();
        throw new Error(text || 'Training response was not valid JSON.');
      }

      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Pipeline execution failed.');
      }

      if (data.success) {
        setTrainingStatus('Completed');
        let logs = data.stdout || '';
        if (data.stderr) {
          logs += `\n[ERRORS / WARNINGS]\n${data.stderr}`;
        }
        setTrainingLogs(logs || 'Pipeline executed successfully with no output.');
        setTrainingMetrics(data.metrics || null);
        if (data.code) {
          setGeneratedCode(data.code);
          setSyncStatus('Synced');
        }
        if (data.file) {
          setActiveVersionFile(data.file);
        }

        // Fetch updated comparison history to see if multiple versions now exist
        const historyRes = await fetch(`http://localhost:8000/api/get-comparison-history?projectName=${encodeURIComponent(projectName)}`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData.success && historyData.history) {
            setHistory(historyData.history);
            const modelsCount = historyData.history.models?.length || 0;
            if (modelsCount > 1) {
              setHasComparisons(true);
              // Redirect to Compare Workspace after a short delay so user can see it completed
              setTimeout(() => {
                if (typeof onOpenCompare === 'function') {
                  onOpenCompare(null);
                }
              }, 1500);
            } else if (modelsCount === 1) {
              setHasComparisons(false);
            }
          }
        }
      } else {
        setTrainingMetrics(data.metrics || null);
        setTrainingStatus('Failed');
        let logs = '';
        if (data.error) {
          logs += `Execution Error:\n${data.error}\n\n`;
        }
        if (data.stdout) {
          logs += `Standard Output:\n${data.stdout}\n\n`;
        }
        if (data.stderr) {
          logs += `Standard Error:\n${data.stderr}`;
        }
        setTrainingLogs(logs || 'Pipeline failed to execute.');
        if (data.code) {
          setGeneratedCode(data.code);
          setSyncStatus('Synced');
        }
      }
    } catch (err) {
      setTrainingStatus('Failed');
      setTrainingLogs(err.message || 'Pipeline execution request failed.');
    } finally {
      setIsTraining(false);
    }
  };

  // Parameters modification is treated as normal workspace editing, so handleMainTweak is removed.

  const handleChangeModel = (newAlgoId) => {
    const schema = REGRESSION_SCHEMAS[newAlgoId] ||
                   REGRESSION_SCHEMAS[newAlgoId === 'linear-regression' ? 'linear' :
                                      newAlgoId === 'ridge-regression' ? 'ridge' :
                                      newAlgoId === 'lasso-regression' ? 'lasso' :
                                      'decisionTreeRegressor'];
    if (schema) {
      const defaultParams = {};
      schema.parameters.forEach(p => {
        defaultParams[p.name] = p.defaultValue;
      });
      const newAlgo = ALGORITHMS.find(a => a.id === newAlgoId);
      if (newAlgo) {
        setActiveAlgo(newAlgo);
        setModelParams(defaultParams);
      }
    }
  };

  const renderHyperparameters = () => {
    const schema = REGRESSION_SCHEMAS[activeAlgo.id] ||
                   REGRESSION_SCHEMAS[activeAlgo.id === 'linear-regression' ? 'linear' :
                                      activeAlgo.id === 'ridge-regression' ? 'ridge' :
                                      activeAlgo.id === 'lasso-regression' ? 'lasso' :
                                      'decisionTreeRegressor'];
    if (!schema) return null;

    const renderParamInput = (param) => {
      const value = modelParams[param.name] !== undefined ? modelParams[param.name] : param.defaultValue;
      
      if (param.type === 'boolean') {
        const isTrue = !!value;
        const borderClass = isTrue
          ? 'border-cyan-500/30 hover:border-cyan-400/60 focus:border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)] focus:shadow-[0_0_12px_rgba(34,211,238,0.2)]'
          : 'border-rose-500/30 hover:border-rose-400/60 focus:border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.1)] focus:shadow-[0_0_12px_rgba(244,63,94,0.2)]';
        return (
          <div key={param.name} className="space-y-1.5" title={param.description}>
            <span className="block text-xs text-zinc-400 font-medium">{param.label}</span>
            <div className="relative">
              <select
                value={isTrue ? 'true' : 'false'}
                onChange={(e) => setModelParams(prev => ({ ...prev, [param.name]: e.target.value === 'true' }))}
                className={`w-full appearance-none text-xs rounded-lg border bg-zinc-950 px-3 py-2 text-zinc-100 outline-none transition-all duration-300 font-sans cursor-pointer ${borderClass}`}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-zinc-400">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        );
      }

      if (param.type === 'select') {
        return (
          <div key={param.name} className="space-y-1.5" title={param.description}>
            <label className="block text-xs text-zinc-400 font-medium">
              {param.label}
            </label>
            <select
              value={value}
              onChange={(e) => setModelParams(prev => ({ ...prev, [param.name]: e.target.value }))}
              className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-700 transition-colors font-sans"
            >
              {param.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        );
      }

      if (param.type === 'number') {
        return (
          <div key={param.name} className="space-y-1.5" title={param.description}>
            <label className="block text-xs text-zinc-400 font-medium">
              {param.label}
            </label>
            <input
              type="number"
              step={param.step || 'any'}
              min={param.min !== undefined ? param.min : 'any'}
              max={param.max !== undefined ? param.max : 'any'}
              value={value}
              onChange={(e) => setModelParams(prev => ({ ...prev, [param.name]: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
              className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-700 transition-colors"
            />
          </div>
        );
      }

      return (
        <div key={param.name} className="space-y-1.5" title={param.description}>
          <label className="block text-xs text-zinc-400 font-medium">
            {param.label}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setModelParams(prev => ({ ...prev, [param.name]: e.target.value }))}
            className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-700 transition-colors font-mono"
          />
        </div>
      );
    };

    const basicParams = schema.parameters.filter(p => !p.advanced);
    const advancedParams = schema.parameters.filter(p => p.advanced);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {basicParams.map(renderParamInput)}
        </div>

        {advancedParams.length > 0 && (
          <div className="pt-3 border-t border-zinc-900/60">
            <button
              type="button"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer select-none"
            >
              {showAdvancedParams ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span>Show Advanced Parameters</span>
            </button>

            {showAdvancedParams && (
              <div className="grid grid-cols-1 gap-4 mt-4 animate-in fade-in duration-200">
                {advancedParams.map(renderParamInput)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };



  // Extract file name from absolute path for simple UI display
  const getDisplayFileName = (fullPath) => {
    if (!fullPath) return 'No dataset selected';
    const parts = fullPath.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  const isSuggestedExclusion = (colName) => {
    if (!colName) return false;
    const lower = colName.toLowerCase();
    return (
      lower === 'id' ||
      lower.endsWith('_id') ||
      lower === 'uuid' ||
      lower.endsWith('_uuid') ||
      lower.startsWith('id_')
    );
  };

  const hasBeenRun = runExecuted || isTraining;
  const hasRuns = history.models && history.models.length > 0;

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden relative">
      
      {/* Header bar */}
      <header className="border-b border-zinc-900 bg-zinc-950 px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Home Button */}
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 hover:text-white hover:bg-zinc-850 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 shadow-sm"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </button>

          {/* Data Lab Navigation Button */}
          <button
            type="button"
            onClick={onOpenDataLab}
            className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-indigo-500/10"
          >
            <Database className="h-3.5 w-3.5" />
            <span>Data Lab</span>
          </button>
        </div>

        {/* Sync Status Badge & Primary Action Area (Run + Tweak Toolbar) */}
        <div className="flex items-center gap-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
            syncStatus === 'Synced' 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : syncStatus === 'Syncing'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              syncStatus === 'Synced' 
                ? 'bg-emerald-400' 
                : syncStatus === 'Syncing'
                ? 'bg-amber-400'
                : 'bg-red-400'
            }`} />
            {syncStatus === 'Synced' ? 'Saved to Disk' : syncStatus === 'Syncing' ? 'Syncing...' : 'Sync Error'}
          </span>

          <div className="flex items-center gap-2">
            {/* Compare Button */}
            <button
              type="button"
              onClick={() => onOpenCompare && onOpenCompare(null)}
              disabled={!hasRuns}
              title={!hasRuns ? "Run a model first to enable comparison." : "Compare model runs"}
              className={`px-3.5 py-2 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 shadow-sm ${
                hasRuns 
                  ? 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-500/10 cursor-pointer' 
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'
              }`}
            >
              <BarChart4 className="h-3.5 w-3.5" />
              <span>Compare</span>
            </button>

            {/* Run Button */}
            <button
              type="button"
              onClick={handleRunModel}
              disabled={isTraining}
              className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm hover:shadow-sky-500/10 min-w-[75px]"
            >
              <Play className="h-3.5 w-3.5 fill-current text-white" />
              <span>{isTraining ? 'Running...' : 'Run'}</span>
            </button>

            {/* Change Model Button & Dropdown */}
            <div className="relative flex" ref={changeModelDropdownRef}>
              <button
                type="button"
                onClick={() => setIsChangeModelDropdownOpen(!isChangeModelDropdownOpen)}
                disabled={isTraining}
                className="px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 hover:text-white hover:bg-zinc-850 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 disabled:opacity-60"
              >
                <span>Change Model</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isChangeModelDropdownOpen ? 'transform rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isChangeModelDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl z-50 p-1.5 space-y-0.5 backdrop-blur-md">
                  <div className="px-2 py-1 text-[9px] text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-800 mb-1">
                    Select Algorithm
                  </div>
                  {ALGORITHMS.filter(a => a.category === activeAlgo.category).map(algo => (
                    <button
                      key={algo.id}
                      type="button"
                      onClick={() => {
                        handleChangeModel(algo.id);
                        setIsChangeModelDropdownOpen(false);
                      }}
                      className={`w-full text-left text-xs rounded-md px-2.5 py-1.5 transition-colors cursor-pointer ${
                        activeAlgo.id === algo.id 
                          ? 'bg-sky-600/10 text-sky-400 font-semibold' 
                          : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                      }`}
                    >
                      {algo.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Workspace Layout */}
      <main className="flex-grow flex flex-row overflow-hidden relative">
        
        {/* LEFT PANEL: Dataset & Split configuration (independent scroll) */}
        <div className="h-full w-full lg:w-[40%] xl:w-[35%] overflow-y-auto border-r border-zinc-900 bg-zinc-950 p-4 md:p-6 scrollbar-thin scrollbar-thumb-zinc-800 flex flex-col gap-5 flex-shrink-0">
          
          {/* Dataset Section */}
          <section className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4 space-y-3.5">
              <button
                type="button"
                onClick={() => setIsDatasetInfoExpanded(!isDatasetInfoExpanded)}
                className="w-full flex items-center justify-between pb-2 border-b border-zinc-900/40 text-left cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-sky-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                    Dataset Information
                  </h3>
                </div>
                {isDatasetInfoExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                )}
              </button>

              {isDatasetInfoExpanded ? (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 gap-2.5">
                    <div className="bg-zinc-950/60 border border-zinc-900 rounded-lg p-2.5 flex flex-col gap-1 min-w-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-550">File Name</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="text-xs font-semibold text-zinc-350 truncate" title={getDisplayFileName(dataset.filePath)}>
                          {getDisplayFileName(dataset.filePath)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-zinc-950/60 border border-zinc-900 rounded-lg p-2.5 flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-550">Rows</span>
                        <span className="text-xs font-mono font-bold text-zinc-300">
                          {totalRows !== null ? totalRows.toLocaleString() : (
                            <Loader2 className="h-3 w-3 animate-spin text-sky-400 inline" />
                          )}
                        </span>
                      </div>
                      <div className="bg-zinc-950/60 border border-zinc-900 rounded-lg p-2.5 flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-550">Columns</span>
                        <span className="text-xs font-mono font-bold text-zinc-300">
                          {totalCols !== null ? totalCols.toLocaleString() : (
                            <Loader2 className="h-3 w-3 animate-spin text-sky-400 inline" />
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-zinc-400 flex items-center justify-between px-1 py-0.5">
                  <span className="truncate font-medium">{getDisplayFileName(dataset.filePath)}</span>
                  <span className="shrink-0 font-mono text-zinc-500 ml-2">
                    {totalRows !== null ? `${totalRows.toLocaleString()} rows` : ''}
                  </span>
                </div>
              )}

              {activeAlgo.category !== 'Clustering' ? (
                <div className="space-y-3 pt-2.5 border-t border-zinc-900/40">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">
                      Does your dataset contain the target/output variable already?
                    </label>
                    <div className="flex gap-4">
                      {['Yes', 'No'].map((option) => (
                        <label key={option} className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="hasTarget"
                            value={option}
                            checked={dataset.hasTarget === option}
                            onChange={() => setDataset(prev => ({ ...prev, hasTarget: option }))}
                            className="h-3.5 w-3.5 border-zinc-800 bg-zinc-950 text-sky-505 focus:ring-sky-500/20 focus:ring-1 cursor-pointer"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {dataset.hasTarget === 'Yes' && (
                    <div className="space-y-1.5 relative" ref={dropdownRef}>
                      <label className="block text-[11px] text-zinc-400 font-medium">
                        Target Column
                      </label>
                      {columnsLoading ? (
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 bg-zinc-950/20 border border-zinc-900/45 rounded-lg p-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                          <span>Reading columns...</span>
                        </div>
                      ) : columnsError ? (
                        <div className="space-y-2">
                          <div className="text-[10px] text-red-400 bg-red-950/10 border border-red-900/30 rounded-lg p-2 font-medium leading-normal">
                            {columnsError}
                          </div>
                          <input
                            type="text"
                            value={dataset.targetColumn}
                            onChange={(e) => setDataset(prev => ({ ...prev, targetColumn: e.target.value }))}
                            placeholder="e.g. price"
                            className="w-full text-sm rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-zinc-100 outline-none focus:border-zinc-700 transition-colors"
                          />
                        </div>
                      ) : (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsDropdownOpen(prev => !prev)}
                            className="w-full text-sm rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-zinc-100 outline-none focus:border-zinc-700 transition-colors flex items-center justify-between hover:border-zinc-700 cursor-pointer"
                          >
                            <span className="font-mono text-zinc-200 truncate">{dataset.targetColumn || 'Select target column'}</span>
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          </button>

                          {isDropdownOpen && (
                            <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800">
                              <div className="relative p-1">
                                <input
                                  type="text"
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  placeholder="Search columns..."
                                  className="w-full text-sm rounded-md border border-zinc-900 bg-zinc-900/50 px-2 py-1 text-zinc-100 outline-none focus:border-zinc-800 font-sans"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              <div className="max-h-32 overflow-y-auto space-y-0.5">
                                {columns.filter(col =>
                                  searchQuery.trim() === '' || col.toLowerCase().includes(searchQuery.toLowerCase())
                                ).length === 0 ? (
                                  <div className="text-[10px] text-zinc-500 text-center py-1.5">
                                    No columns
                                  </div>
                                ) : (
                                  columns.filter(col =>
                                    searchQuery.trim() === '' || col.toLowerCase().includes(searchQuery.toLowerCase())
                                  ).map((col) => (
                                    <button
                                      key={col}
                                      type="button"
                                      onClick={() => {
                                        setDataset(prev => {
                                          const currentExclusions = prev.excludedColumns || [];
                                          const nextExclusions = currentExclusions.filter(c => c !== col);
                                          return {
                                            ...prev,
                                            targetColumn: col,
                                            excludedColumns: nextExclusions
                                          };
                                        });
                                        setSearchQuery('');
                                        setIsDropdownOpen(false);
                                      }}
                                      className={`w-full text-left font-mono text-xs rounded px-2 py-1 flex items-center justify-between cursor-pointer transition-colors ${
                                        dataset.targetColumn === col
                                          ? 'bg-sky-600/10 text-sky-400'
                                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                                      }`}
                                    >
                                      <span className="truncate">{col}</span>
                                      {dataset.targetColumn === col && (
                                        <Check className="h-3 w-3 text-sky-400" />
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Exclude Columns from Training Multi-Select Checkboxes */}
                  {dataset.hasTarget === 'Yes' && columns.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-zinc-900/40 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-zinc-400 font-medium">
                          Exclude Columns From Training
                        </label>
                        <span className="text-[9px] text-zinc-550 font-mono">
                          Optional
                        </span>
                      </div>
                      
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-900 bg-zinc-950/40 p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
                        {columns
                          .filter(col => col !== dataset.targetColumn)
                          .map(col => {
                            const isExcluded = (dataset.excludedColumns || []).includes(col);
                            const isSuggested = isSuggestedExclusion(col);
                            return (
                              <div
                                key={col}
                                className="flex items-center justify-between gap-2 text-xs font-mono text-zinc-300 hover:text-white group select-none py-0.5"
                              >
                                <label className="flex items-center gap-2 cursor-pointer flex-grow min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isExcluded}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setDataset(prev => {
                                        const currentExclusions = prev.excludedColumns || [];
                                        const nextExclusions = checked
                                          ? [...currentExclusions.filter(c => c !== col), col]
                                          : currentExclusions.filter(c => c !== col);
                                        return {
                                          ...prev,
                                          excludedColumns: nextExclusions
                                        };
                                      });
                                    }}
                                    className="h-3.5 w-3.5 rounded border-zinc-850 bg-zinc-950 text-sky-505 focus:ring-sky-500/20 focus:ring-1 cursor-pointer transition-colors"
                                  />
                                  <span className="truncate">{col}</span>
                                </label>
                                
                                {isSuggested && (
                                  <span className="text-[8px] font-sans font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.5 rounded shrink-0 select-none">
                                    Suggested
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        {columns.filter(col => col !== dataset.targetColumn).length === 0 && (
                          <div className="text-[10px] text-zinc-550 text-center py-2">
                            No other columns available
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500 bg-zinc-950/20 border border-zinc-900/40 rounded-lg p-3 font-sans leading-normal pt-1.5 border-t border-zinc-900/40">
                  Unsupervised Clustering does not use a target column. All variables in the dataset will be treated as features (unsupervised learning).
                </div>
              )}
          </section>

          {/* Train-Test Split Section */}
          {activeAlgo.category !== 'Clustering' && (
            <section className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-900/40">
                <Sliders className="h-4 w-4 text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Train-Test Split Settings
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="testSize" className="block text-[11px] text-zinc-400 font-medium">
                    test_size (ratio)
                  </label>
                  <input
                    type="number"
                    id="testSize"
                    step="0.05"
                    min="0.05"
                    max="0.95"
                    value={trainTestSplit.testSize}
                    onChange={(e) => setTrainTestSplit(prev => ({ ...prev, testSize: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-zinc-100 outline-none focus:border-zinc-700 transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="randomState" className="block text-[11px] text-zinc-400 font-medium">
                    random_state
                  </label>
                  <input
                    type="text"
                    id="randomState"
                    value={trainTestSplit.randomState}
                    onChange={(e) => setTrainTestSplit(prev => ({ ...prev, randomState: e.target.value }))}
                    placeholder="None"
                    className="w-full text-sm rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-zinc-100 outline-none focus:border-zinc-700 transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setTrainTestSplit(prev => ({ ...prev, useAdvanced: !prev.useAdvanced }))}
                  className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                >
                  {trainTestSplit.useAdvanced ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      <span>Fewer Options</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      <span>More Options</span>
                    </>
                  )}
                </button>
              </div>

              {trainTestSplit.useAdvanced && (
                <div className="space-y-2.5 pt-2.5 border-t border-zinc-900/60 transition-all duration-200">
                  <div className="space-y-1">
                    <label htmlFor="trainSize" className="block text-[10px] text-zinc-400 font-medium">
                      train_size (ratio)
                    </label>
                    <input
                      type="number"
                      id="trainSize"
                      step="0.05"
                      min="0.05"
                      max="0.95"
                      value={trainTestSplit.trainSize}
                      onChange={(e) => setTrainTestSplit(prev => ({ ...prev, trainSize: e.target.value }))}
                      placeholder="e.g. 0.8"
                      className="w-full text-sm rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-zinc-100 outline-none focus:border-zinc-700 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-zinc-400 font-medium">Shuffle dataset</label>
                    <div className="relative">
                      <select
                        value={trainTestSplit.shuffle ? 'true' : 'false'}
                        onChange={(e) => setTrainTestSplit(prev => ({ ...prev, shuffle: e.target.value === 'true' }))}
                        className={`w-full appearance-none text-sm rounded-lg border bg-zinc-950 px-2.5 py-1.5 text-zinc-100 outline-none transition-all duration-350 font-sans cursor-pointer ${
                          trainTestSplit.shuffle 
                            ? 'border-cyan-500/30 hover:border-cyan-400/60 focus:border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)] focus:shadow-[0_0_12px_rgba(34,211,238,0.2)]' 
                            : 'border-rose-500/30 hover:border-rose-400/60 focus:border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.1)] focus:shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                        }`}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-zinc-400">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-zinc-400 font-medium">Stratify split</label>
                    <div className="relative">
                      <select
                        value={trainTestSplit.stratify ? 'true' : 'false'}
                        onChange={(e) => setTrainTestSplit(prev => ({ ...prev, stratify: e.target.value === 'true' }))}
                        className={`w-full appearance-none text-sm rounded-lg border bg-zinc-950 px-2.5 py-1.5 text-zinc-100 outline-none transition-all duration-350 font-sans cursor-pointer ${
                          trainTestSplit.stratify 
                            ? 'border-cyan-500/30 hover:border-cyan-400/60 focus:border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)] focus:shadow-[0_0_12px_rgba(34,211,238,0.2)]' 
                            : 'border-rose-500/30 hover:border-rose-400/60 focus:border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.1)] focus:shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                        }`}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-zinc-400">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* RIGHT PANEL: Model Parameters & Run Results (independent scroll) */}
        <div className="flex-grow h-full overflow-y-auto bg-zinc-950 p-4 md:p-6 scrollbar-thin scrollbar-thumb-zinc-800 flex flex-col gap-5">
          
          {/* Model Parameters Card */}
          <div className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-900/40">
              <Settings2 className="h-4 w-4 text-sky-400" />
              <div className="flex items-center justify-between w-full">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  {activeAlgo.name} Parameters
                </h3>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {activeAlgo.category}
                </span>
              </div>
            </div>

            {renderHyperparameters()}
          </div>

          {/* DYNAMIC RESULTS (rendered only after run) */}
          {hasBeenRun && (
            <>
              {/* Evaluation Metrics Card */}
              <div className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-6 space-y-5 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-900/40">
                  <BarChart4 className="h-4 w-4 text-sky-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                    Evaluation Metrics
                  </h3>
                </div>

                <div className="w-full">
                  {activeAlgo.category === 'Regression' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                      {/* Train Metrics Card */}
                      <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 space-y-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block pb-1 border-b border-zinc-900/60 font-sans">
                          Train Metrics
                        </span>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">R² Score</span>
                            <span className="text-sm font-bold font-mono text-sky-400 mt-1">
                              {trainingMetrics && trainingMetrics.train_r2 !== undefined ? trainingMetrics.train_r2.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">RMSE</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.train_rmse !== undefined ? trainingMetrics.train_rmse.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">MAE</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.train_mae !== undefined ? trainingMetrics.train_mae.toFixed(4) : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Test Metrics Card */}
                      <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 space-y-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block pb-1 border-b border-zinc-900/60 font-sans">
                          Test Metrics
                        </span>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">R² Score</span>
                            <span className={`text-sm font-bold font-mono mt-1 ${
                              trainingMetrics && trainingMetrics.r2 !== undefined
                                ? trainingMetrics.r2 >= 0.7
                                  ? 'text-emerald-400'
                                  : trainingMetrics.r2 >= 0.4
                                  ? 'text-sky-400'
                                  : 'text-zinc-300'
                                : 'text-zinc-500'
                            }`}>
                              {trainingMetrics && trainingMetrics.r2 !== undefined ? trainingMetrics.r2.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">RMSE</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.rmse !== undefined ? trainingMetrics.rmse.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">MAE</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.mae !== undefined ? trainingMetrics.mae.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">MSE</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.mse !== undefined ? trainingMetrics.mse.toFixed(4) : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeAlgo.category === 'Classification' && (
                    <div className="flex flex-col gap-6 w-full">
                      {/* Performance Metrics Card */}
                      <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 space-y-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block pb-1 border-b border-zinc-900/60 font-sans">
                          Performance Metrics
                        </span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">Accuracy</span>
                            <span className="text-sm font-bold font-mono text-emerald-400 mt-1">
                              {trainingMetrics && trainingMetrics.accuracy !== undefined ? trainingMetrics.accuracy.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">Precision</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.precision !== undefined ? trainingMetrics.precision.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">Recall</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.recall !== undefined ? trainingMetrics.recall.toFixed(4) : '—'}
                            </span>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">F1 Score</span>
                            <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                              {trainingMetrics && trainingMetrics.f1 !== undefined ? trainingMetrics.f1.toFixed(4) : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Confusion Matrix Card */}
                      {trainingMetrics && trainingMetrics.confusion_matrix && (
                        <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 space-y-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block pb-1 border-b border-zinc-900/60 font-sans">
                            Confusion Matrix
                          </span>
                          <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-4 font-mono text-xs text-zinc-300 space-y-2 overflow-x-auto">
                            {trainingMetrics.confusion_matrix.map((row, rIdx) => (
                              <div key={rIdx} className="flex gap-4">
                                {row.map((val, cIdx) => (
                                  <div key={cIdx} className="w-16 bg-zinc-900 border border-zinc-800/80 px-2 py-1.5 rounded text-center font-bold font-mono">
                                    {val}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAlgo.category === 'Clustering' && (
                    <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 space-y-3 w-full">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block pb-1 border-b border-zinc-900/60 font-sans">
                        Clustering Results
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">Silhouette Score</span>
                          <span className="text-sm font-bold font-mono text-emerald-400 mt-1">
                            {trainingMetrics && trainingMetrics.silhouette !== undefined && trainingMetrics.silhouette !== null ? trainingMetrics.silhouette.toFixed(4) : '—'}
                          </span>
                        </div>
                        <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">Inertia</span>
                          <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                            {trainingMetrics && trainingMetrics.inertia !== undefined && trainingMetrics.inertia !== null ? trainingMetrics.inertia.toFixed(2) : 'N/A'}
                          </span>
                        </div>
                        <div className="bg-zinc-950 border border-zinc-900/80 rounded-lg p-3 flex flex-col justify-between min-h-[64px] hover:border-zinc-800 transition-colors">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">Cluster Count</span>
                          <span className="text-sm font-bold font-mono text-zinc-300 mt-1">
                            {trainingMetrics && trainingMetrics.cluster_count !== undefined ? trainingMetrics.cluster_count : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM: Execution Status / Log Summary Card */}
              <div className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4 flex items-center justify-between animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-300">Execution Status:</span>
                  <span className={`text-xs font-mono font-medium ${
                    trainingStatus === 'Completed' ? 'text-emerald-400' :
                    trainingStatus === 'Running' ? 'text-amber-400 animate-pulse' :
                    trainingStatus === 'Failed' ? 'text-rose-400' : 'text-zinc-500'
                  }`}>
                    {trainingStatus === 'Completed' ? 'Training completed successfully.' :
                     trainingStatus === 'Running' ? 'Training pipeline is running...' :
                     trainingStatus === 'Failed' ? 'Training pipeline failed.' :
                     'Idle'}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  {activeVersionFile}
                </div>
              </div>
            </>
          )}
        </div>

      </main>

      {/* Code Drawer Overlay */}
      {isCodeDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300"
          onClick={() => setIsCodeDrawerOpen(false)}
        />
      )}

      {/* Code Drawer Panel */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[600px] lg:w-[700px] bg-zinc-950 border-l border-zinc-900 z-50 shadow-2xl shadow-black/80 flex flex-col transition-transform duration-300 ease-in-out transform ${
        isCodeDrawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="border-b border-zinc-900 bg-zinc-950 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-bold text-zinc-100 font-heading">Pipeline Code</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
            <button
              onClick={handleExportCode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Code</span>
            </button>
            <button
              onClick={() => setIsCodeDrawerOpen(false)}
              className="text-zinc-500 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-grow p-6 overflow-y-auto bg-zinc-900/15 font-mono text-xs leading-relaxed selection:bg-zinc-800 selection:text-white">
          <pre className="text-zinc-300 select-text whitespace-pre-wrap font-mono">
            <code>{generatedCode}</code>
          </pre>
        </div>
      </div>

      {/* Console Drawer Overlay */}
      {isConsoleDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300"
          onClick={() => setIsConsoleDrawerOpen(false)}
        />
      )}

      {/* Console Drawer Panel */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[600px] lg:w-[700px] bg-zinc-950 border-l border-zinc-900 z-50 shadow-2xl shadow-black/80 flex flex-col transition-transform duration-300 ease-in-out transform ${
        isConsoleDrawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="border-b border-zinc-900 bg-zinc-950 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-bold text-zinc-100 font-heading">Execution Console</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-zinc-500 font-semibold px-2">
              python {activeVersionFile}
            </span>
            <button
              onClick={() => setIsConsoleDrawerOpen(false)}
              className="text-zinc-500 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-grow p-6 overflow-y-auto bg-zinc-900/15 font-mono text-xs leading-relaxed selection:bg-zinc-800 selection:text-white flex flex-col justify-between">
          <div className="space-y-4 h-full">
            {/* Status Ribbon */}
            <div className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between font-sans ${
              trainingStatus === 'Completed'
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                : trainingStatus === 'Running'
                ? 'bg-amber-500/5 border-amber-500/20 text-amber-400 animate-pulse'
                : trainingStatus === 'Failed'
                ? 'bg-red-500/5 border-red-500/20 text-red-400'
                : 'bg-zinc-900/40 border-zinc-800 text-zinc-400'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${
                  trainingStatus === 'Completed' ? 'bg-emerald-400' :
                  trainingStatus === 'Running' ? 'bg-amber-400' :
                  trainingStatus === 'Failed' ? 'bg-red-400' : 'bg-zinc-500'
                }`} />
                <span className="font-semibold">Pipeline Execution {trainingStatus}</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-500">Exit Status Check</span>
            </div>

            {/* Console Print Out */}
            {trainingLogs ? (
              <pre className="text-zinc-200 select-text whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-zinc-950 border border-zinc-900 rounded-xl p-4 overflow-x-auto">
                <code>{trainingLogs}</code>
              </pre>
            ) : (
              <div className="text-[11px] text-zinc-500 italic bg-zinc-950/20 border border-zinc-900/45 rounded-lg p-4 text-center font-sans">
                No execution logs. Run model to see live console output.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Utility Buttons */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        {/* Console Button */}
        <button
          type="button"
          onClick={() => {
            setIsConsoleDrawerOpen(!isConsoleDrawerOpen);
            setIsCodeDrawerOpen(false);
          }}
          className={`h-11 px-4 rounded-full flex items-center justify-center gap-2 shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer border text-xs font-bold ${
            isConsoleDrawerOpen
              ? 'bg-sky-600 border-sky-500/30 text-white shadow-sky-950/40 hover:shadow-sky-500/20'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 shadow-black/50 hover:border-zinc-700'
          }`}
          title="Toggle Execution Console"
        >
          <Terminal className="h-4 w-4" />
          <span>Console</span>
        </button>

        {/* Code Button */}
        <button
          type="button"
          onClick={() => {
            setIsCodeDrawerOpen(!isCodeDrawerOpen);
            setIsConsoleDrawerOpen(false);
          }}
          className={`h-11 px-4 rounded-full flex items-center justify-center gap-2 shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer border text-xs font-bold ${
            isCodeDrawerOpen
              ? 'bg-sky-600 border-sky-500/30 text-white shadow-sky-950/40 hover:shadow-sky-500/20'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 shadow-black/50 hover:border-zinc-700'
          }`}
          title="Toggle Pipeline Code"
        >
          <Code className="h-4 w-4" />
          <span>Code</span>
        </button>
      </div>
    </div>
  );
}
