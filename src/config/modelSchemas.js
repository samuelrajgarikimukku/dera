// Configuration schemas for regression, classification, and clustering models in the DERA workspace.
// This allows dynamic UI rendering and Python code generation based on schemas.

export const REGRESSION_SCHEMAS = {
  // Legacy / backward-compatible keys
  linear: {
    modelName: "Linear Regression",
    importName: "LinearRegression",
    parameters: [
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true, description: 'Whether to calculate the intercept for this model.' },
      { name: 'copyX', pythonName: 'copy_X', label: 'Copy X', type: 'boolean', defaultValue: true, description: 'If True, X will be copied; else, it may be overwritten.', advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', description: 'Number of jobs to use for the computation.', advanced: true },
      { name: 'positive', pythonName: 'positive', label: 'Force Positive', type: 'boolean', defaultValue: false, description: 'Forces the coefficients to be positive.', advanced: true }
    ]
  },
  ridge: {
    modelName: "Ridge Regression",
    importName: "Ridge",
    parameters: [
      { name: 'alpha', pythonName: 'alpha', label: 'Alpha (L2 Penalty)', type: 'number', defaultValue: 1.0, min: 0.0, step: 0.1, description: 'Regularization strength.' },
      { name: 'solver', pythonName: 'solver', label: 'Solver', type: 'select', defaultValue: 'auto', options: ['auto', 'svd', 'cholesky', 'lsqr', 'sparse_cg', 'sag', 'saga', 'lbfgs'], description: 'Solver to use.' },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None', description: 'Seed used by solver.' },
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true, description: 'Whether to calculate the intercept.', advanced: true },
      { name: 'copyX', pythonName: 'copy_X', label: 'Copy X', type: 'boolean', defaultValue: true, description: 'If True, X will be copied.', advanced: true },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'text', defaultValue: 'None', description: 'Maximum number of iterations.', advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, description: 'Tolerance for stopping criteria.', advanced: true },
      { name: 'positive', pythonName: 'positive', label: 'Force Positive', type: 'boolean', defaultValue: false, description: 'Forces coefficients to be positive.', advanced: true }
    ]
  },
  lasso: {
    modelName: "Lasso Regression",
    importName: "Lasso",
    parameters: [
      { name: 'alpha', pythonName: 'alpha', label: 'Alpha (L1 Penalty)', type: 'number', defaultValue: 1.0, min: 0.0, step: 0.1, description: 'Constant that multiplies L1 term.' },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'number', defaultValue: 1000, min: 1, description: 'The maximum number of iterations.' },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None', description: 'The seed of the generator.' },
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true, description: 'Whether to calculate the intercept.', advanced: true },
      { name: 'precompute', pythonName: 'precompute', label: 'Precompute', type: 'boolean', defaultValue: false, description: 'Whether to use a precomputed Gram matrix.', advanced: true },
      { name: 'copyX', pythonName: 'copy_X', label: 'Copy X', type: 'boolean', defaultValue: true, description: 'If True, X will be copied.', advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, description: 'Tolerance for stopping criteria.', advanced: true },
      { name: 'warmStart', pythonName: 'warm_start', label: 'Warm Start', type: 'boolean', defaultValue: false, description: 'Reuse solution of previous call as initialization.', advanced: true },
      { name: 'positive', pythonName: 'positive', label: 'Force Positive', type: 'boolean', defaultValue: false, description: 'Forces coefficients to be positive.', advanced: true },
      { name: 'selection', pythonName: 'selection', label: 'Selection Method', type: 'select', defaultValue: 'cyclic', options: ['cyclic', 'random'], description: 'Selection method.', advanced: true }
    ]
  },
  decisionTreeRegressor: {
    modelName: "Decision Tree Regressor",
    importName: "DecisionTreeRegressor",
    parameters: [
      { name: 'criterion', pythonName: 'criterion', label: 'Criterion', type: 'select', defaultValue: 'squared_error', options: ['squared_error', 'friedman_mse', 'absolute_error', 'poisson'] },
      { name: 'splitter', pythonName: 'splitter', label: 'Splitter', type: 'select', defaultValue: 'best', options: ['best', 'random'] },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'text', defaultValue: 'None' },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'minSamplesSplit', pythonName: 'min_samples_split', label: 'Min Samples Split', type: 'text', defaultValue: '2', advanced: true },
      { name: 'minSamplesLeaf', pythonName: 'min_samples_leaf', label: 'Min Samples Leaf', type: 'text', defaultValue: '1', advanced: true },
      { name: 'minWeightFractionLeaf', pythonName: 'min_weight_fraction_leaf', label: 'Min Weight Fraction Leaf', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'maxFeatures', pythonName: 'max_features', label: 'Max Features', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'maxLeafNodes', pythonName: 'max_leaf_nodes', label: 'Max Leaf Nodes', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'minImpurityDecrease', pythonName: 'min_impurity_decrease', label: 'Min Impurity Decrease', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'ccpAlpha', pythonName: 'ccp_alpha', label: 'ccp_alpha', type: 'number', defaultValue: 0.0, advanced: true }
    ]
  },

  // Algorithm ID mappings
  'linear-regression': {
    modelName: "Linear Regression",
    importName: "LinearRegression",
    parameters: [
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true },
      { name: 'copyX', pythonName: 'copy_X', label: 'Copy X', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'positive', pythonName: 'positive', label: 'Force Positive', type: 'boolean', defaultValue: false, advanced: true }
    ]
  },
  'ridge-regression': {
    modelName: "Ridge Regression",
    importName: "Ridge",
    parameters: [
      { name: 'alpha', pythonName: 'alpha', label: 'Alpha (L2 Penalty)', type: 'number', defaultValue: 1.0 },
      { name: 'solver', pythonName: 'solver', label: 'Solver', type: 'select', defaultValue: 'auto', options: ['auto', 'svd', 'cholesky', 'lsqr', 'sparse_cg', 'sag', 'saga', 'lbfgs'] },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'copyX', pythonName: 'copy_X', label: 'Copy X', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, advanced: true },
      { name: 'positive', pythonName: 'positive', label: 'Force Positive', type: 'boolean', defaultValue: false, advanced: true }
    ]
  },
  'lasso-regression': {
    modelName: "Lasso Regression",
    importName: "Lasso",
    parameters: [
      { name: 'alpha', pythonName: 'alpha', label: 'Alpha (L1 Penalty)', type: 'number', defaultValue: 1.0 },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'number', defaultValue: 1000 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'precompute', pythonName: 'precompute', label: 'Precompute', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'copyX', pythonName: 'copy_X', label: 'Copy X', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, advanced: true },
      { name: 'warmStart', pythonName: 'warm_start', label: 'Warm Start', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'positive', pythonName: 'positive', label: 'Force Positive', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'selection', pythonName: 'selection', label: 'Selection Method', type: 'select', defaultValue: 'cyclic', options: ['cyclic', 'random'], advanced: true }
    ]
  },
  'decision-tree-regressor': {
    modelName: "Decision Tree Regressor",
    importName: "DecisionTreeRegressor",
    parameters: [
      { name: 'criterion', pythonName: 'criterion', label: 'Criterion', type: 'select', defaultValue: 'squared_error', options: ['squared_error', 'friedman_mse', 'absolute_error', 'poisson'] },
      { name: 'splitter', pythonName: 'splitter', label: 'Splitter', type: 'select', defaultValue: 'best', options: ['best', 'random'] },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'text', defaultValue: 'None' },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'minSamplesSplit', pythonName: 'min_samples_split', label: 'Min Samples Split', type: 'text', defaultValue: '2', advanced: true },
      { name: 'minSamplesLeaf', pythonName: 'min_samples_leaf', label: 'Min Samples Leaf', type: 'text', defaultValue: '1', advanced: true },
      { name: 'minWeightFractionLeaf', pythonName: 'min_weight_fraction_leaf', label: 'Min Weight Fraction Leaf', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'maxFeatures', pythonName: 'max_features', label: 'Max Features', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'maxLeafNodes', pythonName: 'max_leaf_nodes', label: 'Max Leaf Nodes', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'minImpurityDecrease', pythonName: 'min_impurity_decrease', label: 'Min Impurity Decrease', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'ccpAlpha', pythonName: 'ccp_alpha', label: 'ccp_alpha', type: 'number', defaultValue: 0.0, advanced: true }
    ]
  },
  'random-forest-regressor': {
    modelName: "Random Forest Regressor",
    importName: "RandomForestRegressor",
    parameters: [
      { name: 'nEstimators', pythonName: 'n_estimators', label: 'n_estimators', type: 'number', defaultValue: 100 },
      { name: 'criterion', pythonName: 'criterion', label: 'Criterion', type: 'select', defaultValue: 'squared_error', options: ['squared_error', 'absolute_error', 'friedman_mse', 'poisson'] },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'text', defaultValue: 'None' },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'minSamplesSplit', pythonName: 'min_samples_split', label: 'Min Samples Split', type: 'text', defaultValue: '2', advanced: true },
      { name: 'minSamplesLeaf', pythonName: 'min_samples_leaf', label: 'Min Samples Leaf', type: 'text', defaultValue: '1', advanced: true },
      { name: 'maxFeatures', pythonName: 'max_features', label: 'Max Features', type: 'text', defaultValue: '1.0', advanced: true },
      { name: 'bootstrap', pythonName: 'bootstrap', label: 'Bootstrap', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'maxLeafNodes', pythonName: 'max_leaf_nodes', label: 'Max Leaf Nodes', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'minImpurityDecrease', pythonName: 'min_impurity_decrease', label: 'Min Impurity Decrease', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'ccpAlpha', pythonName: 'ccp_alpha', label: 'ccp_alpha', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'oobScore', pythonName: 'oob_score', label: 'OOB Score', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'verbose', pythonName: 'verbose', label: 'Verbose', type: 'number', defaultValue: 0, advanced: true },
      { name: 'warmStart', pythonName: 'warm_start', label: 'Warm Start', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'maxSamples', pythonName: 'max_samples', label: 'Max Samples', type: 'text', defaultValue: 'None', advanced: true }
    ]
  },
  'xgboost-regressor': {
    modelName: "XGBoost Regressor",
    importName: "XGBRegressor",
    parameters: [
      { name: 'nEstimators', pythonName: 'n_estimators', label: 'n_estimators', type: 'number', defaultValue: 100 },
      { name: 'learningRate', pythonName: 'learning_rate', label: 'Learning Rate', type: 'number', defaultValue: 0.3 },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'number', defaultValue: 6 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'booster', pythonName: 'booster', label: 'Booster', type: 'select', defaultValue: 'gbtree', options: ['gbtree', 'gblinear', 'dart'], advanced: true },
      { name: 'subsample', pythonName: 'subsample', label: 'Subsample', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'colsampleBytree', pythonName: 'colsample_bytree', label: 'Colsample Bytree', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'regAlpha', pythonName: 'reg_alpha', label: 'L1 Regularization (alpha)', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'regLambda', pythonName: 'reg_lambda', label: 'L2 Regularization (lambda)', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'gamma', pythonName: 'gamma', label: 'Gamma', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'minChildWeight', pythonName: 'min_child_weight', label: 'Min Child Weight', type: 'number', defaultValue: 1.0, advanced: true }
    ]
  },
  'svr': {
    modelName: "SVR",
    importName: "SVR",
    parameters: [
      { name: 'kernel', pythonName: 'kernel', label: 'Kernel', type: 'select', defaultValue: 'rbf', options: ['linear', 'poly', 'rbf', 'sigmoid'] },
      { name: 'C', pythonName: 'C', label: 'C (Regularization)', type: 'number', defaultValue: 1.0 },
      { name: 'epsilon', pythonName: 'epsilon', label: 'Epsilon', type: 'number', defaultValue: 0.1 },
      { name: 'degree', pythonName: 'degree', label: 'Degree', type: 'number', defaultValue: 3, advanced: true },
      { name: 'gamma', pythonName: 'gamma', label: 'Gamma', type: 'text', defaultValue: 'scale', advanced: true },
      { name: 'coef0', pythonName: 'coef0', label: 'Coef0', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.001, advanced: true },
      { name: 'shrinking', pythonName: 'shrinking', label: 'Shrinking', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'cacheSize', pythonName: 'cache_size', label: 'Cache Size', type: 'number', defaultValue: 200, advanced: true },
      { name: 'verbose', pythonName: 'verbose', label: 'Verbose', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'number', defaultValue: -1, advanced: true }
    ]
  },
  'elasticnet': {
    modelName: "ElasticNet",
    importName: "ElasticNet",
    parameters: [
      { name: 'alpha', pythonName: 'alpha', label: 'Alpha', type: 'number', defaultValue: 1.0 },
      { name: 'l1Ratio', pythonName: 'l1_ratio', label: 'L1 Ratio', type: 'number', defaultValue: 0.5 },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'number', defaultValue: 1000 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'precompute', pythonName: 'precompute', label: 'Precompute', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'copyX', pythonName: 'copy_X', label: 'Copy X', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, advanced: true },
      { name: 'warmStart', pythonName: 'warm_start', label: 'Warm Start', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'positive', pythonName: 'positive', label: 'Force Positive', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'selection', pythonName: 'selection', label: 'Selection Method', type: 'select', defaultValue: 'cyclic', options: ['cyclic', 'random'], advanced: true }
    ]
  },
  'knn-regressor': {
    modelName: "KNN Regressor",
    importName: "KNeighborsRegressor",
    parameters: [
      { name: 'nNeighbors', pythonName: 'n_neighbors', label: 'n_neighbors', type: 'number', defaultValue: 5 },
      { name: 'weights', pythonName: 'weights', label: 'Weights', type: 'select', defaultValue: 'uniform', options: ['uniform', 'distance'] },
      { name: 'algorithm', pythonName: 'algorithm', label: 'Algorithm', type: 'select', defaultValue: 'auto', options: ['auto', 'ball_tree', 'kd_tree', 'brute'] },
      { name: 'leafSize', pythonName: 'leaf_size', label: 'Leaf Size', type: 'number', defaultValue: 30, advanced: true },
      { name: 'p', pythonName: 'p', label: 'Power Parameter (p)', type: 'number', defaultValue: 2, advanced: true },
      { name: 'metric', pythonName: 'metric', label: 'Metric', type: 'text', defaultValue: 'minkowski', advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true }
    ]
  },
  'adaboost-regressor': {
    modelName: "AdaBoost Regressor",
    importName: "AdaBoostRegressor",
    parameters: [
      { name: 'nEstimators', pythonName: 'n_estimators', label: 'n_estimators', type: 'number', defaultValue: 50 },
      { name: 'learningRate', pythonName: 'learning_rate', label: 'Learning Rate', type: 'number', defaultValue: 1.0 },
      { name: 'loss', pythonName: 'loss', label: 'Loss', type: 'select', defaultValue: 'linear', options: ['linear', 'square', 'exponential'] },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' }
    ]
  },
  'gradient-boosting-regressor': {
    modelName: "Gradient Boosting Regressor",
    importName: "GradientBoostingRegressor",
    parameters: [
      { name: 'nEstimators', pythonName: 'n_estimators', label: 'n_estimators', type: 'number', defaultValue: 100 },
      { name: 'learningRate', pythonName: 'learning_rate', label: 'Learning Rate', type: 'number', defaultValue: 0.1 },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'number', defaultValue: 3 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'loss', pythonName: 'loss', label: 'Loss', type: 'select', defaultValue: 'squared_error', options: ['squared_error', 'absolute_error', 'huber', 'quantile'], advanced: true },
      { name: 'subsample', pythonName: 'subsample', label: 'Subsample', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'criterion', pythonName: 'criterion', label: 'Criterion', type: 'select', defaultValue: 'friedman_mse', options: ['friedman_mse', 'squared_error'], advanced: true },
      { name: 'minSamplesSplit', pythonName: 'min_samples_split', label: 'Min Samples Split', type: 'text', defaultValue: '2', advanced: true },
      { name: 'minSamplesLeaf', pythonName: 'min_samples_leaf', label: 'Min Samples Leaf', type: 'text', defaultValue: '1', advanced: true },
      { name: 'maxFeatures', pythonName: 'max_features', label: 'Max Features', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'alpha', pythonName: 'alpha', label: 'Alpha', type: 'number', defaultValue: 0.9, advanced: true },
      { name: 'verbose', pythonName: 'verbose', label: 'Verbose', type: 'number', defaultValue: 0, advanced: true },
      { name: 'maxLeafNodes', pythonName: 'max_leaf_nodes', label: 'Max Leaf Nodes', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'warmStart', pythonName: 'warm_start', label: 'Warm Start', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'validationFraction', pythonName: 'validation_fraction', label: 'Validation Fraction', type: 'number', defaultValue: 0.1, advanced: true },
      { name: 'nIterNoChange', pythonName: 'n_iter_no_change', label: 'N Iter No Change', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, advanced: true },
      { name: 'ccpAlpha', pythonName: 'ccp_alpha', label: 'ccp_alpha', type: 'number', defaultValue: 0.0, advanced: true }
    ]
  },

  // CLASSIFICATION
  'logistic-regression': {
    modelName: "Logistic Regression",
    importName: "LogisticRegression",
    parameters: [
      { name: 'penalty', pythonName: 'penalty', label: 'Penalty', type: 'select', defaultValue: 'l2', options: ['l1', 'l2', 'elasticnet', 'none'] },
      { name: 'C', pythonName: 'C', label: 'C (Regularization)', type: 'number', defaultValue: 1.0 },
      { name: 'solver', pythonName: 'solver', label: 'Solver', type: 'select', defaultValue: 'lbfgs', options: ['lbfgs', 'liblinear', 'newton-cg', 'newton-cholesky', 'sag', 'saga'] },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'number', defaultValue: 100 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'dual', pythonName: 'dual', label: 'Dual Formulation', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, advanced: true },
      { name: 'fitIntercept', pythonName: 'fit_intercept', label: 'Fit Intercept', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'interceptScaling', pythonName: 'intercept_scaling', label: 'Intercept Scaling', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'classWeight', pythonName: 'class_weight', label: 'Class Weight', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'verbose', pythonName: 'verbose', label: 'Verbose', type: 'number', defaultValue: 0, advanced: true },
      { name: 'warmStart', pythonName: 'warm_start', label: 'Warm Start', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'l1Ratio', pythonName: 'l1_ratio', label: 'L1 Ratio', type: 'text', defaultValue: 'None', advanced: true }
    ]
  },
  'decision-tree-classifier': {
    modelName: "Decision Tree Classifier",
    importName: "DecisionTreeClassifier",
    parameters: [
      { name: 'criterion', pythonName: 'criterion', label: 'Criterion', type: 'select', defaultValue: 'gini', options: ['gini', 'entropy', 'log_loss'] },
      { name: 'splitter', pythonName: 'splitter', label: 'Splitter', type: 'select', defaultValue: 'best', options: ['best', 'random'] },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'text', defaultValue: 'None' },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'minSamplesSplit', pythonName: 'min_samples_split', label: 'Min Samples Split', type: 'text', defaultValue: '2', advanced: true },
      { name: 'minSamplesLeaf', pythonName: 'min_samples_leaf', label: 'Min Samples Leaf', type: 'text', defaultValue: '1', advanced: true },
      { name: 'minWeightFractionLeaf', pythonName: 'min_weight_fraction_leaf', label: 'Min Weight Fraction Leaf', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'maxFeatures', pythonName: 'max_features', label: 'Max Features', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'maxLeafNodes', pythonName: 'max_leaf_nodes', label: 'Max Leaf Nodes', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'minImpurityDecrease', pythonName: 'min_impurity_decrease', label: 'Min Impurity Decrease', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'classWeight', pythonName: 'class_weight', label: 'Class Weight', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'ccpAlpha', pythonName: 'ccp_alpha', label: 'ccp_alpha', type: 'number', defaultValue: 0.0, advanced: true }
    ]
  },
  'random-forest-classifier': {
    modelName: "Random Forest Classifier",
    importName: "RandomForestClassifier",
    parameters: [
      { name: 'nEstimators', pythonName: 'n_estimators', label: 'n_estimators', type: 'number', defaultValue: 100 },
      { name: 'criterion', pythonName: 'criterion', label: 'Criterion', type: 'select', defaultValue: 'gini', options: ['gini', 'entropy', 'log_loss'] },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'text', defaultValue: 'None' },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'minSamplesSplit', pythonName: 'min_samples_split', label: 'Min Samples Split', type: 'text', defaultValue: '2', advanced: true },
      { name: 'minSamplesLeaf', pythonName: 'min_samples_leaf', label: 'Min Samples Leaf', type: 'text', defaultValue: '1', advanced: true },
      { name: 'maxFeatures', pythonName: 'max_features', label: 'Max Features', type: 'text', defaultValue: 'sqrt', advanced: true },
      { name: 'bootstrap', pythonName: 'bootstrap', label: 'Bootstrap', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'maxLeafNodes', pythonName: 'max_leaf_nodes', label: 'Max Leaf Nodes', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'minImpurityDecrease', pythonName: 'min_impurity_decrease', label: 'Min Impurity Decrease', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'ccpAlpha', pythonName: 'ccp_alpha', label: 'ccp_alpha', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'oobScore', pythonName: 'oob_score', label: 'OOB Score', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'verbose', pythonName: 'verbose', label: 'Verbose', type: 'number', defaultValue: 0, advanced: true },
      { name: 'warmStart', pythonName: 'warm_start', label: 'Warm Start', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'classWeight', pythonName: 'class_weight', label: 'Class Weight', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'maxSamples', pythonName: 'max_samples', label: 'Max Samples', type: 'text', defaultValue: 'None', advanced: true }
    ]
  },
  'svm-classifier': {
    modelName: "SVM Classifier",
    importName: "SVC",
    parameters: [
      { name: 'C', pythonName: 'C', label: 'C (Regularization)', type: 'number', defaultValue: 1.0 },
      { name: 'kernel', pythonName: 'kernel', label: 'Kernel', type: 'select', defaultValue: 'rbf', options: ['linear', 'poly', 'rbf', 'sigmoid'] },
      { name: 'probability', pythonName: 'probability', label: 'Probability Estimation', type: 'boolean', defaultValue: true },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'degree', pythonName: 'degree', label: 'Degree', type: 'number', defaultValue: 3, advanced: true },
      { name: 'gamma', pythonName: 'gamma', label: 'Gamma', type: 'text', defaultValue: 'scale', advanced: true },
      { name: 'coef0', pythonName: 'coef0', label: 'Coef0', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'shrinking', pythonName: 'shrinking', label: 'Shrinking', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.001, advanced: true },
      { name: 'cacheSize', pythonName: 'cache_size', label: 'Cache Size', type: 'number', defaultValue: 200, advanced: true },
      { name: 'classWeight', pythonName: 'class_weight', label: 'Class Weight', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'verbose', pythonName: 'verbose', label: 'Verbose', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'number', defaultValue: -1, advanced: true },
      { name: 'decisionFunctionShape', pythonName: 'decision_function_shape', label: 'Decision Function Shape', type: 'select', defaultValue: 'ovr', options: ['ovo', 'ovr'], advanced: true },
      { name: 'breakTies', pythonName: 'break_ties', label: 'Break Ties', type: 'boolean', defaultValue: false, advanced: true }
    ]
  },
  'knn-classifier': {
    modelName: "KNN Classifier",
    importName: "KNeighborsClassifier",
    parameters: [
      { name: 'nNeighbors', pythonName: 'n_neighbors', label: 'n_neighbors', type: 'number', defaultValue: 5 },
      { name: 'weights', pythonName: 'weights', label: 'Weights', type: 'select', defaultValue: 'uniform', options: ['uniform', 'distance'] },
      { name: 'algorithm', pythonName: 'algorithm', label: 'Algorithm', type: 'select', defaultValue: 'auto', options: ['auto', 'ball_tree', 'kd_tree', 'brute'] },
      { name: 'leafSize', pythonName: 'leaf_size', label: 'Leaf Size', type: 'number', defaultValue: 30, advanced: true },
      { name: 'p', pythonName: 'p', label: 'Power Parameter (p)', type: 'number', defaultValue: 2, advanced: true },
      { name: 'metric', pythonName: 'metric', label: 'Metric', type: 'text', defaultValue: 'minkowski', advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true }
    ]
  },
  'naive-bayes': {
    modelName: "Naive Bayes",
    importName: "GaussianNB",
    parameters: [
      { name: 'varSmoothing', pythonName: 'var_smoothing', label: 'Var Smoothing', type: 'number', defaultValue: 1e-9 },
      { name: 'priors', pythonName: 'priors', label: 'Priors', type: 'text', defaultValue: 'None', advanced: true }
    ]
  },
  'xgboost-classifier': {
    modelName: "XGBoost Classifier",
    importName: "XGBClassifier",
    parameters: [
      { name: 'nEstimators', pythonName: 'n_estimators', label: 'n_estimators', type: 'number', defaultValue: 100 },
      { name: 'learningRate', pythonName: 'learning_rate', label: 'Learning Rate', type: 'number', defaultValue: 0.3 },
      { name: 'maxDepth', pythonName: 'max_depth', label: 'Max Depth', type: 'number', defaultValue: 6 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'useLabelEncoder', pythonName: 'use_label_encoder', label: 'Use Label Encoder', type: 'boolean', defaultValue: false, advanced: true },
      { name: 'booster', pythonName: 'booster', label: 'Booster', type: 'select', defaultValue: 'gbtree', options: ['gbtree', 'gblinear', 'dart'], advanced: true },
      { name: 'subsample', pythonName: 'subsample', label: 'Subsample', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'colsampleBytree', pythonName: 'colsample_bytree', label: 'Colsample Bytree', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'regAlpha', pythonName: 'reg_alpha', label: 'L1 Regularization (alpha)', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'regLambda', pythonName: 'reg_lambda', label: 'L2 Regularization (lambda)', type: 'number', defaultValue: 1.0, advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'gamma', pythonName: 'gamma', label: 'Gamma', type: 'number', defaultValue: 0.0, advanced: true },
      { name: 'minChildWeight', pythonName: 'min_child_weight', label: 'Min Child Weight', type: 'number', defaultValue: 1.0, advanced: true }
    ]
  },
  'adaboost-classifier': {
    modelName: "AdaBoost Classifier",
    importName: "AdaBoostClassifier",
    parameters: [
      { name: 'nEstimators', pythonName: 'n_estimators', label: 'n_estimators', type: 'number', defaultValue: 50 },
      { name: 'learningRate', pythonName: 'learning_rate', label: 'Learning Rate', type: 'number', defaultValue: 1.0 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'algorithm', pythonName: 'algorithm', label: 'Algorithm', type: 'select', defaultValue: 'SAMME.R', options: ['SAMME', 'SAMME.R'], advanced: true }
    ]
  },

  // CLUSTERING
  'kmeans': {
    modelName: "KMeans",
    importName: "KMeans",
    parameters: [
      { name: 'nClusters', pythonName: 'n_clusters', label: 'n_clusters', type: 'number', defaultValue: 8 },
      { name: 'init', pythonName: 'init', label: 'Init', type: 'select', defaultValue: 'k-means++', options: ['k-means++', 'random'] },
      { name: 'maxIter', pythonName: 'max_iter', label: 'Max Iterations', type: 'number', defaultValue: 300 },
      { name: 'randomState', pythonName: 'random_state', label: 'Random State', type: 'text', defaultValue: 'None' },
      { name: 'nInit', pythonName: 'n_init', label: 'n_init', type: 'text', defaultValue: 'auto', advanced: true },
      { name: 'tol', pythonName: 'tol', label: 'Tolerance', type: 'number', defaultValue: 0.0001, advanced: true },
      { name: 'verbose', pythonName: 'verbose', label: 'Verbose', type: 'number', defaultValue: 0, advanced: true },
      { name: 'copyX', pythonName: 'copy_x', label: 'Copy X', type: 'boolean', defaultValue: true, advanced: true },
      { name: 'algorithm', pythonName: 'algorithm', label: 'Algorithm', type: 'select', defaultValue: 'lloyd', options: ['lloyd', 'elkan'], advanced: true }
    ]
  },
  'dbscan': {
    modelName: "DBSCAN",
    importName: "DBSCAN",
    parameters: [
      { name: 'eps', pythonName: 'eps', label: 'Eps', type: 'number', defaultValue: 0.5 },
      { name: 'minSamples', pythonName: 'min_samples', label: 'Min Samples', type: 'number', defaultValue: 5 },
      { name: 'metric', pythonName: 'metric', label: 'Metric', type: 'select', defaultValue: 'euclidean', options: ['euclidean', 'l1', 'l2', 'manhattan', 'cosine'] },
      { name: 'algorithm', pythonName: 'algorithm', label: 'Algorithm', type: 'select', defaultValue: 'auto', options: ['auto', 'ball_tree', 'kd_tree', 'brute'], advanced: true },
      { name: 'leafSize', pythonName: 'leaf_size', label: 'Leaf Size', type: 'number', defaultValue: 30, advanced: true },
      { name: 'p', pythonName: 'p', label: 'Power Parameter (p)', type: 'number', defaultValue: 2, advanced: true },
      { name: 'nJobs', pythonName: 'n_jobs', label: 'n_jobs', type: 'text', defaultValue: 'None', advanced: true }
    ]
  },
  'agglomerative-clustering': {
    modelName: "Agglomerative Clustering",
    importName: "AgglomerativeClustering",
    parameters: [
      { name: 'nClusters', pythonName: 'n_clusters', label: 'n_clusters', type: 'number', defaultValue: 2 },
      { name: 'metric', pythonName: 'metric', label: 'Metric', type: 'select', defaultValue: 'euclidean', options: ['euclidean', 'l1', 'l2', 'manhattan', 'cosine'] },
      { name: 'linkage', pythonName: 'linkage', label: 'Linkage', type: 'select', defaultValue: 'ward', options: ['ward', 'complete', 'average', 'single'] },
      { name: 'connectivity', pythonName: 'connectivity', label: 'Connectivity', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'computeFullTree', pythonName: 'compute_full_tree', label: 'Compute Full Tree', type: 'text', defaultValue: 'auto', advanced: true },
      { name: 'distanceThreshold', pythonName: 'distance_threshold', label: 'Distance Threshold', type: 'text', defaultValue: 'None', advanced: true },
      { name: 'computeDistances', pythonName: 'compute_distances', label: 'Compute Distances', type: 'boolean', defaultValue: false, advanced: true }
    ]
  }
};
