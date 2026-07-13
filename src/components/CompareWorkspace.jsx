import React, { useState, useEffect } from 'react';
import { Sliders, Database, Settings2, BarChart4, RotateCcw, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { REGRESSION_SCHEMAS } from '../config/modelSchemas';
import { ALGORITHMS } from '../config/algorithms';

const algoNameMap = ALGORITHMS.reduce((acc, algo) => {
  acc[algo.id] = algo.name;
  return acc;
}, {});

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (value === null || value === undefined) return 'None';
  return String(value);
}

// Modular horizontal bar chart component for graphs comparisons
function MetricBarChart({ title, metricKey, activeModels, isHigherBetter }) {
  const data = activeModels.map(m => {
    const val = m.metrics?.[metricKey];
    const runLabel = m.file || (m.runId ? `Run ${m.runId}` : 'Unknown Run');
    return {
      file: runLabel,
      algo: algoNameMap[m.parameters?.algorithmId] || 'Linear Regression',
      value: typeof val === 'number' ? val : 0
    };
  });

  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 0.0001);
  const minVal = Math.min(...values, 0);

  // Find absolute maximum to scale the bar lengths correctly
  const absMax = Math.max(Math.abs(maxVal), Math.abs(minVal));

  return (
    <div className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-5 space-y-4 font-sans">
      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-heading">
        {title}
      </h4>
      
      <div className="space-y-3">
        {data.map((d) => {
          let pct = 0;
          if (absMax > 0) {
            pct = (d.value / absMax) * 100;
          }

          const isNegative = d.value < 0;
          const barWidth = Math.abs(pct);

          return (
            <div key={d.file} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono text-zinc-400 truncate max-w-[200px]" title={d.file}>
                  {d.file} <span className="text-[10px] text-zinc-500 font-sans">({d.algo})</span>
                </span>
                <span className={`font-mono font-bold ${isNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {d.value.toFixed(4)}
                </span>
              </div>
              <div className="h-3 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-900/60">
                <div 
                  className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                    isNegative 
                      ? 'from-rose-600 to-rose-400' 
                      : isHigherBetter 
                        ? 'from-emerald-600 to-teal-400' 
                        : 'from-sky-600 to-indigo-400'
                  }`}
                  style={{ width: `${Math.max(1, Math.min(100, barWidth))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CompareWorkspace({ projectName, compareData, onBack, onEditAgain }) {
  const [history, setHistory] = useState({ models: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('metrics'); // 'metrics' | 'parameters' | 'graphs'
  const [selectedFiles, setSelectedFiles] = useState([]); // array of file names participating in comparison
  const [modelToDelete, setModelToDelete] = useState(null); // filename string of model to delete
  const [toastMessage, setToastMessage] = useState(null); // toast notification message

  // Fetch comparison logs on mount or project name change
  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/get-comparison-history?projectName=${encodeURIComponent(projectName)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch comparison history');
        return res.json();
      })
      .then((data) => {
        if (data.success && data.history) {
          setHistory(data.history);
          if (data.history.models) {
            setSelectedFiles(data.history.models.map(m => m.file || `Run ${m.runId}`));
          }
        }
      })
      .catch((err) => {
        console.error(err);
        setError('Unable to fetch comparison model records.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectName]);

  // Auto-hide success toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const models = history.models || [];

  const handleEditAgainClick = () => {
    // Collect active (selected) or first model parameters to pre-populate workspace
    const selectedModelInfo = activeModels[0] || models[0];
    const params = selectedModelInfo?.parameters || null;
    if (typeof onEditAgain === 'function') {
      onEditAgain(params);
    }
  };

  const handleToggleSelect = (fileName) => {
    setSelectedFiles(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName) 
        : [...prev, fileName]
    );
  };

  const handleSelectAll = () => {
    setSelectedFiles(models.map(m => m.file || `Run ${m.runId}`));
  };

  const handleDeselectAll = () => {
    setSelectedFiles([]);
  };

  const handleDeleteModel = async () => {
    if (!modelToDelete) return;
    try {
      const response = await fetch('/api/delete-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          fileName: modelToDelete
        })
      });

      if (!response.ok) {
        throw new Error('Deletion failed');
      }

      const data = await response.json();
      if (data.success) {
        const updatedModels = data.history.models || [];
        setHistory(data.history);
        setSelectedFiles(prev => prev.filter(f => f !== modelToDelete));
        setModelToDelete(null);
        setToastMessage('Model deleted successfully');

        // If only one model remains, return to workspace gracefully
        if (updatedModels.length <= 1) {
          setTimeout(() => {
            onBack();
          }, 1500);
        }
      } else {
        alert(data.error || 'Failed to delete the model');
      }
    } catch (err) {
      console.error('[DERA Delete] Deletion error:', err);
      alert('Error connecting to server to delete the model.');
    }
  };

  // Filter models based on user checkbox selection
  const activeModels = models.filter(m => selectedFiles.includes(m.file || `Run ${m.runId}`));

  const getProjectCategory = () => {
    if (activeModels.length > 0) {
      const algoId = activeModels[0].parameters?.algorithmId;
      const algo = ALGORITHMS.find(a => a.id === algoId);
      if (algo) return algo.category;
    }
    return 'Regression';
  };

  const category = getProjectCategory();

  // Helper to extract values from nested properties
  const getVal = (model, section, pathKeys, isAlgoId) => {
    if (!model) return '—';
    if (isAlgoId) {
      const algoId = model.parameters?.algorithmId || 'linear-regression';
      return algoNameMap[algoId] || 'Linear Regression';
    }
    if (section === 'metrics') {
      const val = model.metrics?.[pathKeys[0]];
      if (val === undefined || val === null) return '—';
      return typeof val === 'number' ? val.toFixed(4) : String(val);
    } else {
      const algoId = model.parameters?.algorithmId || 'linear-regression';
      const schema = REGRESSION_SCHEMAS[algoId] || REGRESSION_SCHEMAS[
        algoId === 'linear-regression' ? 'linear' :
        algoId === 'ridge-regression' ? 'ridge' :
        algoId === 'lasso-regression' ? 'lasso' :
        'decisionTreeRegressor'
      ];
      
      const paramName = pathKeys[pathKeys.length - 1];
      if (pathKeys[0] === 'modelParams') {
        const isParamInSchema = schema?.parameters.some(p => p.name === paramName);
        if (!isParamInSchema) {
          return '—';
        }
      }

      let current = model.parameters;
      for (const key of pathKeys) {
        if (!current) return '—';
        current = current[key];
      }
      if (current === undefined || current === null) return 'None';
      if (typeof current === 'boolean') return current ? 'True' : 'False';
      return String(current);
    }
  };

  // Find the best value for a given metric key among active models to highlight it
  const getBestMetricValue = (metricKey, activeModelsList) => {
    if (activeModelsList.length === 0) return null;
    const values = activeModelsList
      .map(m => m.metrics?.[metricKey])
      .filter(v => v !== undefined && v !== null && typeof v === 'number');
    if (values.length === 0) return null;
    const higherIsBetter = ['r2', 'train_r2', 'accuracy', 'precision', 'recall', 'f1', 'silhouette'].includes(metricKey);
    if (higherIsBetter) {
      return Math.max(...values);
    } else {
      return Math.min(...values);
    }
  };

  const getDynamicParameterRows = () => {
    const rows = [{ key: 'algorithmId', label: 'Algorithm', path: ['algorithmId'], isAlgoId: true }];
    const seenKeys = new Set();
    
    activeModels.forEach(model => {
      const algoId = model.parameters?.algorithmId || 'linear-regression';
      const schema = REGRESSION_SCHEMAS[algoId] || REGRESSION_SCHEMAS[
        algoId === 'linear-regression' ? 'linear' :
        algoId === 'ridge-regression' ? 'ridge' :
        algoId === 'lasso-regression' ? 'lasso' :
        'decisionTreeRegressor'
      ];
      if (schema && schema.parameters) {
        schema.parameters.forEach(p => {
          if (!seenKeys.has(p.name)) {
            seenKeys.add(p.name);
            rows.push({
              key: p.name,
              label: p.label,
              path: ['modelParams', p.name]
            });
          }
        });
      }
    });
    return rows;
  };

  const filteredParameterRows = getDynamicParameterRows();

  const splitRows = [
    { key: 'testSize', label: 'test_size (ratio)', path: ['trainTestSplit', 'testSize'] },
    { key: 'trainSize', label: 'train_size (ratio)', path: ['trainTestSplit', 'trainSize'] },
    { key: 'shuffle', label: 'Shuffle', path: ['trainTestSplit', 'shuffle'] },
    { key: 'stratify', label: 'Stratify', path: ['trainTestSplit', 'stratify'] },
    { key: 'randomState', label: 'random_state', path: ['trainTestSplit', 'randomState'] }
  ];

  const renderMetricCell = (val, isBest, isHigherBetter) => {
    if (val === undefined || val === null || typeof val !== 'number') return '—';
    if (isBest) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-md">
          {val.toFixed(4)}
          <span className="text-[8px] uppercase tracking-wider font-sans font-semibold opacity-90">(Best)</span>
        </span>
      );
    }
    return <span className="text-zinc-400 font-mono">{val.toFixed(4)}</span>;
  };

  const renderMetricsTab = () => {
    if (activeModels.length === 0) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center text-zinc-500 font-sans">
          <AlertCircle className="h-8 w-8 mb-2 text-zinc-700 animate-pulse" />
          <p className="text-sm font-semibold text-zinc-400">No models selected</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-normal">
            Please check at least one model in the left selection panel.
          </p>
        </div>
      );
    }

    if (category === 'Regression') {
      const bestTrainR2 = getBestMetricValue('train_r2', activeModels);
      const bestTestR2 = getBestMetricValue('r2', activeModels);
      const bestRMSE = getBestMetricValue('rmse', activeModels);
      const bestMAE = getBestMetricValue('mae', activeModels);
      const bestMSE = getBestMetricValue('mse', activeModels);

      return (
        <div className="overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950/20">
          <table className="min-w-full border-collapse text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950/80 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="px-6 py-4">Model File</th>
                <th className="px-6 py-4">Algorithm</th>
                <th className="px-6 py-4">Train R²</th>
                <th className="px-6 py-4">Test R²</th>
                <th className="px-6 py-4">RMSE</th>
                <th className="px-6 py-4">MAE</th>
                <th className="px-6 py-4">MSE</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/60">
              {activeModels.map((model) => {
                const trainR2 = model.metrics?.train_r2;
                const testR2 = model.metrics?.r2;
                const rmseVal = model.metrics?.rmse;
                const maeVal = model.metrics?.mae;
                const mseVal = model.metrics?.mse;

                const isBestTrainR2 = bestTrainR2 !== null && trainR2 === bestTrainR2;
                const isBestTestR2 = bestTestR2 !== null && testR2 === bestTestR2;
                const isBestRMSE = bestRMSE !== null && rmseVal === bestRMSE;
                const isBestMAE = bestMAE !== null && maeVal === bestMAE;
                const isBestMSE = bestMSE !== null && mseVal === bestMSE;

                return (
                  <tr key={model.file} className="hover:bg-zinc-900/10 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-zinc-100 max-w-[200px] truncate" title={model.file}>
                      {model.file}
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-medium">
                      {algoNameMap[model.parameters?.algorithmId] || 'Linear Regression'}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(trainR2, isBestTrainR2, true)}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(testR2, isBestTestR2, true)}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(rmseVal, isBestRMSE, false)}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(maeVal, isBestMAE, false)}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(mseVal, isBestMSE, false)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setModelToDelete(model.file)}
                        className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete run version"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    } else if (category === 'Classification') {
      const bestAcc = getBestMetricValue('accuracy', activeModels);
      const bestPrec = getBestMetricValue('precision', activeModels);
      const bestRec = getBestMetricValue('recall', activeModels);
      const bestF1 = getBestMetricValue('f1', activeModels);

      return (
        <div className="overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950/20">
          <table className="min-w-full border-collapse text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950/80 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="px-6 py-4">Model File</th>
                <th className="px-6 py-4">Algorithm</th>
                <th className="px-6 py-4">Accuracy</th>
                <th className="px-6 py-4">Precision</th>
                <th className="px-6 py-4">Recall</th>
                <th className="px-6 py-4">F1 Score</th>
                <th className="px-6 py-4">Confusion Matrix</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/60">
              {activeModels.map((model) => {
                const accVal = model.metrics?.accuracy;
                const precVal = model.metrics?.precision;
                const recVal = model.metrics?.recall;
                const f1Val = model.metrics?.f1;
                const cm = model.metrics?.confusion_matrix;

                const isBestAcc = bestAcc !== null && accVal === bestAcc;
                const isBestPrec = bestPrec !== null && precVal === bestPrec;
                const isBestRec = bestRec !== null && recVal === bestRec;
                const isBestF1 = bestF1 !== null && f1Val === bestF1;

                let cmStr = '—';
                if (cm && Array.isArray(cm)) {
                  cmStr = JSON.stringify(cm);
                }

                return (
                  <tr key={model.file} className="hover:bg-zinc-900/10 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-zinc-100 max-w-[200px] truncate" title={model.file}>
                      {model.file}
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-medium">
                      {algoNameMap[model.parameters?.algorithmId] || 'Classifier'}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(accVal, isBestAcc, true)}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(precVal, isBestPrec, true)}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(recVal, isBestRec, true)}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(f1Val, isBestF1, true)}
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-zinc-400">
                      {cmStr}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setModelToDelete(model.file)}
                        className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete run version"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    } else { // Clustering
      const bestSil = getBestMetricValue('silhouette', activeModels);
      const bestInertia = getBestMetricValue('inertia', activeModels);

      return (
        <div className="overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950/20">
          <table className="min-w-full border-collapse text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950/80 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="px-6 py-4">Model File</th>
                <th className="px-6 py-4">Algorithm</th>
                <th className="px-6 py-4">Silhouette Score</th>
                <th className="px-6 py-4">Inertia</th>
                <th className="px-6 py-4">Cluster Count</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/60">
              {activeModels.map((model) => {
                const silVal = model.metrics?.silhouette;
                const inertiaVal = model.metrics?.inertia;
                const clusters = model.metrics?.cluster_count;

                const isBestSil = bestSil !== null && silVal === bestSil;
                const isBestInertia = bestInertia !== null && inertiaVal === bestInertia && model.parameters?.algorithmId === 'kmeans';

                return (
                  <tr key={model.file} className="hover:bg-zinc-900/10 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-zinc-100 max-w-[200px] truncate" title={model.file}>
                      {model.file}
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-medium">
                      {algoNameMap[model.parameters?.algorithmId] || 'Clustering'}
                    </td>
                    <td className="px-6 py-4">
                      {renderMetricCell(silVal, isBestSil, true)}
                    </td>
                    <td className="px-6 py-4">
                      {inertiaVal !== undefined && inertiaVal !== null && typeof inertiaVal === 'number'
                        ? renderMetricCell(inertiaVal, isBestInertia, false)
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 font-mono">
                      {clusters !== undefined && clusters !== null ? clusters : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setModelToDelete(model.file)}
                        className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete run version"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
  };

  const renderParametersTab = () => {
    if (activeModels.length === 0) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center text-zinc-500 font-sans">
          <AlertCircle className="h-8 w-8 mb-2 text-zinc-700 animate-pulse" />
          <p className="text-sm font-semibold text-zinc-400">No models selected</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-normal">
            Please check at least one model in the left selection panel.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* 1. Model Hyperparameters Cards Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-2">
            <Settings2 className="h-4 w-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-heading">
              Model Hyperparameters
            </h3>
          </div>

          <div className={`overflow-x-auto flex flex-row flex-nowrap gap-6 pb-3 ${activeModels.length > 3 ? 'justify-start' : 'justify-center'} scrollbar-thin scrollbar-thumb-zinc-800`}>
            {activeModels.map((model) => {
              const algoId = model.parameters?.algorithmId || 'linear-regression';
              const algoName = algoNameMap[algoId] || 'Linear Regression';
              const schema = REGRESSION_SCHEMAS[algoId] || REGRESSION_SCHEMAS[
                algoId === 'linear-regression' ? 'linear' :
                algoId === 'ridge-regression' ? 'ridge' :
                algoId === 'lasso-regression' ? 'lasso' :
                'decisionTreeRegressor'
              ];

              const paramsList = [];
              if (schema && schema.parameters) {
                schema.parameters.forEach(p => {
                  const val = model.parameters?.modelParams?.[p.name] !== undefined
                    ? model.parameters.modelParams[p.name]
                    : p.defaultValue;
                  paramsList.push({
                    name: p.name,
                    label: p.label,
                    value: formatValue(val)
                  });
                });
              }

              return (
                <div 
                  key={model.file}
                  className="min-w-[340px] max-w-[340px] shrink-0 rounded-xl border border-zinc-900 bg-zinc-900/10 p-6 space-y-5 shadow-sm"
                >
                  <div className="border-b border-zinc-900/60 pb-3">
                    <h4 className="text-base font-bold font-mono text-zinc-100 truncate" title={model.file}>
                      {model.file}
                    </h4>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-0.5 font-sans">
                      {algoName}
                    </p>
                  </div>

                  <div className="space-y-3 font-mono text-sm">
                    {paramsList.map((p) => (
                      <div key={p.name} className="flex justify-between items-start gap-4">
                        <span className="text-zinc-500 font-medium text-left">{p.name}</span>
                        <span className="text-zinc-350 text-right font-semibold break-all">{p.value}</span>
                      </div>
                    ))}
                    {paramsList.length === 0 && (
                      <div className="text-xs text-zinc-500 italic py-1">
                        No hyperparameters
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Train-Test Split & Dataset Comparison Table */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-2">
            <Sliders className="h-4 w-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-heading">
              Train-Test Split & Dataset Settings
            </h3>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950/20">
            <table className="min-w-full border-collapse text-xs font-sans">
              <thead>
                <tr className="border-b border-zinc-900 bg-zinc-950/80">
                  <th className="sticky left-0 bg-zinc-950 z-20 min-w-[200px] max-w-[200px] border-r border-zinc-900 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                    Attribute
                  </th>
                  {activeModels.map((model) => (
                    <th key={model.file} className="min-w-[240px] px-6 py-4 text-left border-r border-zinc-900/60 last:border-r-0">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold font-mono text-zinc-100 truncate max-w-[220px]" title={model.file}>
                          {model.file}
                        </span>
                        <span className="text-[10px] font-medium text-zinc-500 mt-1 uppercase tracking-wider">
                          Run {models.indexOf(model) + 1}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Train-Test Split Header */}
                <tr className="bg-zinc-950/45 border-b border-zinc-900">
                  <td className="sticky left-0 bg-zinc-950/90 border-r border-zinc-900 px-6 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-sky-400 flex items-center gap-1.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                    <span>Train-Test Split Settings</span>
                  </td>
                  {activeModels.map(m => (
                    <td key={m.file} className="border-r border-zinc-900/60 last:border-r-0" />
                  ))}
                </tr>
                {splitRows.map((row) => (
                  <tr key={row.key} className="border-b border-zinc-900/60 hover:bg-zinc-900/10">
                    <td className="sticky left-0 bg-zinc-950 border-r border-zinc-900 px-6 py-3.5 text-zinc-400 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                      {row.label}
                    </td>
                    {activeModels.map((model) => (
                      <td key={model.file} className="px-6 py-3.5 text-zinc-300 font-mono border-r border-zinc-900/60 last:border-r-0">
                        {getVal(model, 'parameters', row.path)}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Dataset Metadata Header */}
                <tr className="bg-zinc-950/45 border-b border-zinc-900">
                  <td className="sticky left-0 bg-zinc-950/90 border-r border-zinc-900 px-6 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-sky-400 flex items-center gap-1.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] border-t border-zinc-900">
                    <span>Dataset Metadata</span>
                  </td>
                  {activeModels.map(m => (
                    <td key={m.file} className="border-r border-zinc-900/60 last:border-r-0 border-t border-zinc-900" />
                  ))}
                </tr>
                <tr className="hover:bg-zinc-900/10 border-b border-zinc-900">
                  <td className="sticky left-0 bg-zinc-950 border-r border-zinc-900 px-6 py-3.5 text-zinc-400 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                    Dataset Path
                  </td>
                  {activeModels.map((model) => {
                    const path = model.parameters?.dataset?.filePath || 'Default mock dataset';
                    const fileName = path.split(/[/\\]/).pop();
                    return (
                      <td key={model.file} className="px-6 py-3.5 border-r border-zinc-900/60 last:border-r-0" title={path}>
                        <div className="flex flex-col">
                          <span className="text-zinc-200 font-semibold truncate max-w-[200px]">{fileName}</span>
                          <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[200px] mt-0.5">{path}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderGraphsTab = () => {
    if (activeModels.length === 0) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center text-zinc-500 font-sans">
          <AlertCircle className="h-8 w-8 mb-2 text-zinc-700 animate-pulse" />
          <p className="text-sm font-semibold text-zinc-400">No models selected</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-normal">
            Please check at least one model in the left selection panel.
          </p>
        </div>
      );
    }

    if (category === 'Regression') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricBarChart 
            title="Test R² Score (Higher is Better)" 
            metricKey="r2" 
            activeModels={activeModels} 
            isHigherBetter={true} 
          />
          <MetricBarChart 
            title="Train R² Score (Higher is Better)" 
            metricKey="train_r2" 
            activeModels={activeModels} 
            isHigherBetter={true} 
          />
          <MetricBarChart 
            title="RMSE (Lower is Better)" 
            metricKey="rmse" 
            activeModels={activeModels} 
            isHigherBetter={false} 
          />
          <MetricBarChart 
            title="MAE (Lower is Better)" 
            metricKey="mae" 
            activeModels={activeModels} 
            isHigherBetter={false} 
          />
        </div>
      );
    } else if (category === 'Classification') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricBarChart 
            title="Accuracy (Higher is Better)" 
            metricKey="accuracy" 
            activeModels={activeModels} 
            isHigherBetter={true} 
          />
          <MetricBarChart 
            title="Precision (Higher is Better)" 
            metricKey="precision" 
            activeModels={activeModels} 
            isHigherBetter={true} 
          />
          <MetricBarChart 
            title="Recall (Higher is Better)" 
            metricKey="recall" 
            activeModels={activeModels} 
            isHigherBetter={true} 
          />
          <MetricBarChart 
            title="F1 Score (Higher is Better)" 
            metricKey="f1" 
            activeModels={activeModels} 
            isHigherBetter={true} 
          />
        </div>
      );
    } else { // Clustering
      const hasInertia = activeModels.some(m => m.metrics?.inertia !== undefined && m.metrics?.inertia !== null);
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricBarChart 
            title="Silhouette Score (Higher is Better)" 
            metricKey="silhouette" 
            activeModels={activeModels} 
            isHigherBetter={true} 
          />
          {hasInertia && (
            <MetricBarChart 
              title="Inertia (Lower is Better)" 
              metricKey="inertia" 
              activeModels={activeModels} 
              isHigherBetter={false} 
            />
          )}
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col relative font-sans">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))]" />

      <header className="relative z-10 border-b border-zinc-900 bg-zinc-950 px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col text-left">
          <h1 className="text-xl font-extrabold font-heading text-zinc-100 tracking-tight">
            Model Comparison Workspace
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Inspect parameters, data split ratios, and performance metrics side-by-side for all versions.
          </p>
        </div>
        <button
          type="button"
          onClick={handleEditAgainClick}
          disabled={loading || models.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all duration-200 shadow-md shadow-sky-600/10 hover:shadow-sky-500/20 cursor-pointer shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Edit Parameters</span>
        </button>
      </header>

      <main className="relative z-10 flex-grow p-6 md:p-10 max-w-7xl mx-auto w-full flex flex-col">

        {/* Loading and Error states */}
        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            <span className="text-sm text-zinc-400">Loading model configurations...</span>
          </div>
        ) : error ? (
          <div className="flex-grow flex flex-col items-center justify-center py-20 gap-3 text-red-400">
            <AlertCircle className="h-8 w-8" />
            <span className="text-sm font-semibold">{error}</span>
          </div>
        ) : models.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-3xl p-8">
            <Settings2 className="h-10 w-10 text-zinc-700 animate-pulse mb-3" />
            <p className="text-sm font-semibold text-zinc-400">No model versions saved yet</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-normal">
              Go back to the Workspace, run models, and compare metrics.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 flex-grow w-full">
            
            {/* Model Selection - Full Width */}
            <div className="w-full bg-zinc-900/20 border border-zinc-900 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-heading">
                    Select Models ({activeModels.length} / {models.length})
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-sky-400 font-semibold">
                  <button type="button" onClick={handleSelectAll} className="hover:text-sky-300 transition-colors cursor-pointer">
                    Select All
                  </button>
                  <span className="text-zinc-800">|</span>
                  <button type="button" onClick={handleDeselectAll} className="hover:text-sky-300 transition-colors cursor-pointer">
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {models.map((model, idx) => {
                  const isChecked = selectedFiles.includes(model.file);
                  const algoName = algoNameMap[model.parameters?.algorithmId] || 'Linear Regression';
                  return (
                    <div 
                      key={model.file}
                      className="flex items-center gap-2"
                    >
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(model.file)}
                          className="h-3.5 w-3.5 rounded border-zinc-800 bg-zinc-950 text-sky-505 focus:ring-sky-500/20 focus:ring-1 cursor-pointer"
                        />
                        <span className="font-mono font-semibold text-zinc-100">
                          {model.file}
                        </span>
                        <span className="text-[10px] text-zinc-450">
                          — {algoName}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setModelToDelete(model.file)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
                        title="Delete run version"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Analysis Workspace (Tabs and Content) */}
            <div className="w-full space-y-6">
              
              {/* Tabs Navigation */}
              <div className="flex border-b border-zinc-900 pb-px">
                {[
                  { id: 'metrics', label: 'Metrics', icon: BarChart4 },
                  { id: 'parameters', label: 'Parameters', icon: Settings2 },
                  { id: 'graphs', label: 'Graphs', icon: Sliders }
                ].map((tab) => {
                  const TabIcon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-bold transition-all duration-200 cursor-pointer -mb-px ${
                        isActive 
                          ? 'border-sky-500 text-sky-400' 
                          : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-800'
                      }`}
                    >
                      <TabIcon className="h-3.5 w-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Display */}
              <div className="w-full">
                {activeTab === 'metrics' && renderMetricsTab()}
                {activeTab === 'parameters' && renderParametersTab()}
                {activeTab === 'graphs' && renderGraphsTab()}
              </div>

            </div>

          </div>
        )}
      </main>

      {/* Safety Confirmation Modal */}
      {modelToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setModelToDelete(null)}
          />
          <div className="relative w-full max-w-sm transform overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-left align-middle shadow-2xl transition-all duration-300 ease-out">
            <h3 className="text-base font-bold text-zinc-100 font-heading">
              Delete {modelToDelete}?
            </h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              This action cannot be undone. DERA will delete the physical Python script and completely remove the run from history and metrics tables.
            </p>
            <div className="flex justify-end gap-3 pt-5 border-t border-zinc-800 mt-5">
              <button
                type="button"
                onClick={() => setModelToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteModel}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-intrusive Success Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 transform transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-zinc-900 px-4 py-3 shadow-2xl text-xs font-semibold text-emerald-400">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
