// Dynamic machine learning algorithms configuration for DERA platform.
// This structure is scalable, allowing easy addition of new models and hyperparameters in the future.

export const ALGORITHMS = [
  // REGRESSION
  {
    id: 'linear-regression',
    name: 'Linear Regression',
    category: 'Regression',
    iconName: 'LineChart',
    tags: ['Supervised', 'Continuous', 'Parametric']
  },
  {
    id: 'ridge-regression',
    name: 'Ridge Regression',
    category: 'Regression',
    iconName: 'TrendingUp',
    tags: ['Supervised', 'Continuous', 'Regularization']
  },
  {
    id: 'lasso-regression',
    name: 'Lasso Regression',
    category: 'Regression',
    iconName: 'Activity',
    tags: ['Supervised', 'Continuous', 'Feature-Selection']
  },
  {
    id: 'decision-tree-regressor',
    name: 'Decision Tree Regressor',
    category: 'Regression',
    iconName: 'GitFork',
    tags: ['Supervised', 'Non-Parametric', 'Non-Linear']
  },
  {
    id: 'random-forest-regressor',
    name: 'Random Forest Regressor',
    category: 'Regression',
    iconName: 'Boxes',
    tags: ['Supervised', 'Ensemble', 'Tree-Based']
  },
  {
    id: 'xgboost-regressor',
    name: 'XGBoost Regressor',
    category: 'Regression',
    iconName: 'Zap',
    tags: ['Supervised', 'Boosting', 'Ensemble']
  },
  {
    id: 'svr',
    name: 'SVR',
    category: 'Regression',
    iconName: 'GitMerge',
    tags: ['Supervised', 'Kernel-Method', 'SVM']
  },
  {
    id: 'elasticnet',
    name: 'ElasticNet',
    category: 'Regression',
    iconName: 'Sliders',
    tags: ['Supervised', 'Continuous', 'Regularization']
  },
  {
    id: 'knn-regressor',
    name: 'KNN Regressor',
    category: 'Regression',
    iconName: 'Network',
    tags: ['Supervised', 'Distance-Based', 'Non-Parametric']
  },
  {
    id: 'adaboost-regressor',
    name: 'AdaBoost Regressor',
    category: 'Regression',
    iconName: 'Flame',
    tags: ['Supervised', 'Boosting', 'Ensemble']
  },
  {
    id: 'gradient-boosting-regressor',
    name: 'Gradient Boosting Regressor',
    category: 'Regression',
    iconName: 'Sparkles',
    tags: ['Supervised', 'Boosting', 'Ensemble']
  },

  // CLASSIFICATION
  {
    id: 'logistic-regression',
    name: 'Logistic Regression',
    category: 'Classification',
    iconName: 'PieChart',
    tags: ['Supervised', 'Categorical', 'Linear']
  },
  {
    id: 'decision-tree-classifier',
    name: 'Decision Tree Classifier',
    category: 'Classification',
    iconName: 'GitPullRequest',
    tags: ['Supervised', 'Tree-Based', 'Non-Linear']
  },
  {
    id: 'random-forest-classifier',
    name: 'Random Forest Classifier',
    category: 'Classification',
    iconName: 'Layers',
    tags: ['Supervised', 'Ensemble', 'Tree-Based']
  },
  {
    id: 'svm-classifier',
    name: 'SVM Classifier',
    category: 'Classification',
    iconName: 'Shield',
    tags: ['Supervised', 'Kernel-Method', 'SVM']
  },
  {
    id: 'knn-classifier',
    name: 'KNN Classifier',
    category: 'Classification',
    iconName: 'Users',
    tags: ['Supervised', 'Distance-Based', 'Non-Parametric']
  },
  {
    id: 'naive-bayes',
    name: 'Naive Bayes',
    category: 'Classification',
    iconName: 'Binary',
    tags: ['Supervised', 'Probabilistic', 'Bayesian']
  },
  {
    id: 'xgboost-classifier',
    name: 'XGBoost Classifier',
    category: 'Classification',
    iconName: 'Bolt',
    tags: ['Supervised', 'Boosting', 'Ensemble']
  },
  {
    id: 'adaboost-classifier',
    name: 'AdaBoost Classifier',
    category: 'Classification',
    iconName: 'Gauge',
    tags: ['Supervised', 'Boosting', 'Ensemble']
  },

  // CLUSTERING
  {
    id: 'kmeans',
    name: 'KMeans',
    category: 'Clustering',
    iconName: 'Target',
    tags: ['Unsupervised', 'Centroid-Based', 'Partitioning']
  },
  {
    id: 'dbscan',
    name: 'DBSCAN',
    category: 'Clustering',
    iconName: 'Dribbble',
    tags: ['Unsupervised', 'Density-Based', 'Spatial']
  },
  {
    id: 'agglomerative-clustering',
    name: 'Agglomerative Clustering',
    category: 'Clustering',
    iconName: 'Workflow',
    tags: ['Unsupervised', 'Hierarchical', 'Linkage-Based']
  }
];
