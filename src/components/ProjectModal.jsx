import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, AlertCircle, X } from 'lucide-react';

/**
 * Modern modal component to collect project/folder name.
 * Performs rigorous frontend input validation.
 */
export default function ProjectModal({ algorithm, isOpen, onClose, onCreate, existingProjectNames }) {
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const inputRef = useRef(null);

  // Focus input automatically on open
  useEffect(() => {
    if (isOpen) {
      setProjectName('');
      setError('');
      setIsTouched(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Validate project name
  const validateName = (name, checkRequired = false) => {
    if (checkRequired && !name) {
      return 'Project name is required';
    }
    if (!name) return '';
    
    // Check for spaces or special characters
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(name)) {
      return 'Only alphanumeric characters, hyphens (-), and underscores (_) are allowed. No spaces.';
    }
    
    // Case-insensitive duplicate check
    const isDuplicate = existingProjectNames?.some(
      (existingName) => existingName.toLowerCase() === name.trim().toLowerCase()
    );
    if (isDuplicate) {
      return 'Project name already exists. Please choose a different name.';
    }
    
    return '';
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setProjectName(val);
    setError(validateName(val, isTouched));
  };

  const handleInputBlur = () => {
    setIsTouched(true);
    setError(validateName(projectName, true));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('[DERA Client Modal] Submitting project modal with name:', projectName);
    setIsTouched(true);
    
    const validationError = validateName(projectName, true);
    if (validationError) {
      console.warn('[DERA Client Modal] Validation failed:', validationError);
      setError(validationError);
      inputRef.current?.focus();
      return;
    }

    console.log('[DERA Client Modal] Validation passed. Triggering onCreate...');
    onCreate(projectName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Semi-transparent dark overlay */}
      <div 
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-left align-middle shadow-2xl transition-all duration-300 ease-out scale-100 opacity-100">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 p-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
 
        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
            <FolderPlus className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold font-heading text-zinc-100">Create New ML Project</h3>
            <p className="text-xs text-zinc-500">Initializing workspace for {algorithm.name}</p>
          </div>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="projectName" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Project / Folder Name
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                id="projectName"
                value={projectName}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                placeholder="customer_churn_project"
                className={`w-full rounded-lg border bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all duration-200 ${
                  error 
                    ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20' 
                    : 'border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700/50'
                }`}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-2.5 flex items-start gap-2 text-xs text-red-400 font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Micro Hint */}
            {!error && (
              <p className="mt-2 text-[11px] text-zinc-500 leading-normal">
                Avoid spaces, slashes, or special symbols. Example: <span className="font-mono text-zinc-400">housing_model_v1</span>.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-zinc-100 hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
