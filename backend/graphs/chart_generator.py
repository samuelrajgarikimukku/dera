import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from chart_styles import apply_light_theme

# ==============================================================================
# INDIVIDUAL CHART GENERATORS (CHART_REGISTRY)
# ==============================================================================

class BaseChart:
    @staticmethod
    def get_supported_options():
        """Returns list of active options for this chart: ['binning', 'aggregation', 'sorting', 'topN']"""
        return []

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        pass

class ScatterChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return []

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        for y_c in y_cols:
            marker_size = 20 if len(df) < 5000 else 8
            alpha_val = 0.6 if len(df) < 5000 else 0.2
            sns.scatterplot(data=df, x=x_cols[0], y=y_c, label=y_c, alpha=alpha_val, edgecolor='none', s=marker_size, ax=ax, zorder=3)
        if len(y_cols) > 1:
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
        ax.set_title(f'Scatter Plot: Y vs {x_cols[0]}', fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        ax.set_ylabel('Values', color='#4b5563', fontsize=9)

class LineChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['aggregation', 'sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        line_df = df.sort_values(by=x_cols[0])
        for y_c in y_cols:
            sns.lineplot(data=line_df, x=x_cols[0], y=y_c, label=y_c, errorbar=None, ax=ax, zorder=3)
        if len(y_cols) > 1:
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
        ax.set_title(f'Line Chart: Y vs {x_cols[0]}', fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        ax.set_ylabel('Values', color='#4b5563', fontsize=9)

class HistogramChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['binning']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        bins = int(options.get('binCount', 10)) if options.get('binningEnabled') else 'auto'
        # Check if density is active
        kde_val = options.get('densityEnabled', True)
        for col in x_cols:
            sns.histplot(data=df, x=col, kde=kde_val, bins=bins, label=col, alpha=0.5, ax=ax, zorder=3)
        if len(x_cols) > 1:
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
        ax.set_title('Histogram Distribution', fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel('Value', color='#4b5563', fontsize=9)
        ax.set_ylabel('Density' if kde_val else 'Count', color='#4b5563', fontsize=9)

class BarChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['aggregation', 'sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if y_cols:
            melted = df.melt(id_vars=[x_cols[0]], value_vars=y_cols, var_name='Metric', value_name='Value')
            sns.barplot(data=melted, x=x_cols[0], y='Value', hue='Metric', errorbar=None, ax=ax, zorder=3)
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
            ax.set_ylabel('Value', color='#4b5563', fontsize=9)
            title_str = f'Bar Chart by {x_cols[0]}'
        else:
            sns.countplot(data=df, x=x_cols[0], color='#635AC7', ax=ax, zorder=3)
            ax.set_ylabel('Count', color='#4b5563', fontsize=9)
            title_str = f'Frequency of {x_cols[0]}'
        
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        plt.xticks(rotation=45, ha='right')

class StackedBarChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['aggregation', 'sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if y_cols:
            # Set index to x_col and plot stacked bar using pandas
            grouped = df.set_index(x_cols[0])[y_cols]
            grouped.plot(kind='bar', stacked=True, ax=ax, zorder=3)
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
            ax.set_ylabel('Value', color='#4b5563', fontsize=9)
            title_str = f'Stacked Bar Chart by {x_cols[0]}'
        else:
            # Frequency count stacked? In seaborn countplot with a dummy hue can do it,
            # or calculate count frequencies and plot.
            counts = df.groupby([x_cols[0]]).size().unstack(fill_value=0)
            counts.plot(kind='bar', stacked=True, ax=ax, zorder=3)
            ax.set_ylabel('Count', color='#4b5563', fontsize=9)
            title_str = f'Frequency of {x_cols[0]}'
        
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        plt.xticks(rotation=45, ha='right')

class HorizontalBarChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['aggregation', 'sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if y_cols:
            melted = df.melt(id_vars=[x_cols[0]], value_vars=y_cols, var_name='Metric', value_name='Value')
            sns.barplot(data=melted, y=x_cols[0], x='Value', hue='Metric', orient='h', errorbar=None, ax=ax, zorder=3)
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
            ax.set_xlabel('Value', color='#4b5563', fontsize=9)
            title_str = f'Horizontal Bar Chart by {x_cols[0]}'
        else:
            sns.countplot(data=df, y=x_cols[0], color='#635AC7', orient='h', ax=ax, zorder=3)
            ax.set_xlabel('Count', color='#4b5563', fontsize=9)
            title_str = f'Frequency of {x_cols[0]}'
        
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_ylabel(x_cols[0], color='#4b5563', fontsize=9)

class AreaChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['aggregation', 'sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        sorted_df = df.sort_values(by=x_cols[0])
        if y_cols:
            sorted_df.set_index(x_cols[0])[y_cols].plot(kind='area', stacked=False, ax=ax, alpha=0.4, zorder=3)
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
            ax.set_ylabel('Value', color='#4b5563', fontsize=9)
            title_str = f'Area Chart of Y vs {x_cols[0]}'
        else:
            # Fallback
            sorted_df.plot(kind='area', ax=ax, alpha=0.4, zorder=3)
            title_str = 'Area Chart'
        
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)

class BubbleChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return []

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if len(y_cols) >= 2:
            size_col = y_cols[1]
            sns.scatterplot(data=df, x=x_cols[0], y=y_cols[0], size=size_col, sizes=(20, 200), alpha=0.6, ax=ax, zorder=3)
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
            title_str = f'Bubble Chart: {y_cols[0]} vs {x_cols[0]} (Size: {size_col})'
        else:
            y_col = y_cols[0] if y_cols else x_cols[0]
            sns.scatterplot(data=df, x=x_cols[0], y=y_col, s=100, alpha=0.6, ax=ax, zorder=3)
            title_str = f'Bubble Chart: {y_col} vs {x_cols[0]}'
        
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        if y_cols:
            ax.set_ylabel(y_cols[0], color='#4b5563', fontsize=9)

class BoxPlotChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if y_cols:
            melted = df.melt(id_vars=[x_cols[0]], value_vars=y_cols, var_name='Metric', value_name='Value')
            sns.boxplot(data=melted, x=x_cols[0], y='Value', hue='Metric', ax=ax, zorder=3)
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
            title_str = f'Box Plot by {x_cols[0]}'
        else:
            sns.boxplot(data=df, y=x_cols[0], color='#635AC7', ax=ax, zorder=3)
            title_str = f'Box Plot of {x_cols[0]}'
            
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        ax.set_ylabel('Values', color='#4b5563', fontsize=9)
        plt.xticks(rotation=45, ha='right')

class ViolinPlotChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if y_cols:
            melted = df.melt(id_vars=[x_cols[0]], value_vars=y_cols, var_name='Metric', value_name='Value')
            sns.violinplot(data=melted, x=x_cols[0], y='Value', hue='Metric', ax=ax, zorder=3)
            ax.legend(facecolor='#ffffff', edgecolor='#e5e7eb', labelcolor='#1f2937')
            title_str = f'Violin Plot by {x_cols[0]}'
        else:
            sns.violinplot(data=df, y=x_cols[0], color='#635AC7', ax=ax, zorder=3)
            title_str = f'Violin Plot of {x_cols[0]}'
            
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        ax.set_ylabel('Values', color='#4b5563', fontsize=9)
        plt.xticks(rotation=45, ha='right')

class HeatmapChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return []

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        all_cols = list(set(x_cols + y_cols))
        corr_df = df[all_cols].corr().replace({np.nan: 0.0})
        sns.heatmap(corr_df, annot=True, cmap='Purples', cbar=True, ax=ax, zorder=3)
        ax.set_title('Correlation Heatmap', fontsize=12, pad=12, color='#1f2937', weight='bold')

class CountPlotChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['sorting', 'topN']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        sns.countplot(data=df, x=x_cols[0], color='#635AC7', ax=ax, zorder=3)
        ax.set_ylabel('Count', color='#4b5563', fontsize=9)
        ax.set_title(f'Count Plot of {x_cols[0]}', fontsize=12, pad=12, color='#1f2937', weight='bold')
        plt.xticks(rotation=45, ha='right')

class DensityPlotChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['binning']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if y_cols:
            sns.kdeplot(data=df, x=x_cols[0], y=y_cols[0], fill=True, cmap='Purples', ax=ax, zorder=3)
            title_str = f'Bivariate Density Plot: {y_cols[0]} vs {x_cols[0]}'
        else:
            sns.kdeplot(data=df, x=x_cols[0], fill=True, color='#635AC7', ax=ax, zorder=3)
            title_str = f'Univariate Density Plot of {x_cols[0]}'
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')

class KDEChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['binning']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        if y_cols:
            sns.kdeplot(data=df, x=x_cols[0], y=y_cols[0], fill=False, cmap='Purples', ax=ax, zorder=3)
            title_str = f'2D KDE Plot: {y_cols[0]} vs {x_cols[0]}'
        else:
            sns.kdeplot(data=df, x=x_cols[0], fill=True, color='#635AC7', ax=ax, zorder=3)
            title_str = f'KDE Plot of {x_cols[0]}'
        ax.set_title(title_str, fontsize=12, pad=12, color='#1f2937', weight='bold')

class HexbinChart(BaseChart):
    @staticmethod
    def get_supported_options():
        return ['binning']

    @staticmethod
    def plot(df, x_cols, y_cols, ax, options):
        grid = int(options.get('binCount', 20)) if options.get('binningEnabled') else 20
        y_val = y_cols[0] if y_cols else x_cols[0]
        hb = ax.hexbin(df[x_cols[0]], df[y_val], gridsize=grid, cmap='Purples', mincnt=1, zorder=3)
        cb = ax.get_figure().colorbar(hb, ax=ax)
        cb.outline.set_linewidth(0)
        ax.set_title(f'Hexbin Plot: {y_val} vs {x_cols[0]}', fontsize=12, pad=12, color='#1f2937', weight='bold')
        ax.set_xlabel(x_cols[0], color='#4b5563', fontsize=9)
        ax.set_ylabel(y_val, color='#4b5563', fontsize=9)


CHART_REGISTRY = {
    "scatter": ScatterChart,
    "line": LineChart,
    "histogram": HistogramChart,
    "bar": BarChart,
    "stacked_bar": StackedBarChart,
    "horizontal_bar": HorizontalBarChart,
    "area": AreaChart,
    "bubble": BubbleChart,
    "box": BoxPlotChart,
    "violin": ViolinPlotChart,
    "heatmap": HeatmapChart,
    "count": CountPlotChart,
    "density": DensityPlotChart,
    "kde": KDEChart,
    "hexbin": HexbinChart
}

# ==============================================================================
# MAIN ENTRYPOINT
# ==============================================================================

def generate_chart(df, x_cols, y_cols, chart_type, zoom_level, output_path, options=None):
    if options is None:
        options = {}

    # Map zoom levels to DPI
    if zoom_level <= 1.0:
        dpi_val = 150
    elif zoom_level <= 1.25:
        dpi_val = 200
    elif zoom_level <= 1.5:
        dpi_val = 250
    else:
        dpi_val = 300

    base_figsize = (8, 4.5)
    
    fig, ax = plt.subplots(figsize=base_figsize, dpi=dpi_val)
    apply_light_theme(ax, zoom_level)

    cols_to_use = list(set(x_cols + y_cols))
    plot_df = df[[c for c in cols_to_use if c in df.columns]].dropna()

    if chart_type in CHART_REGISTRY:
        chart_class = CHART_REGISTRY[chart_type]
        supported = chart_class.get_supported_options()
        
        # Apply Top N rows if supported
        if 'topN' in supported and options.get('topNCount') and x_cols:
            try:
                top_n = int(options['topNCount'])
                top_cats = plot_df[x_cols[0]].value_counts().index[:top_n]
                plot_df = plot_df[plot_df[x_cols[0]].isin(top_cats)]
            except (ValueError, TypeError):
                pass
                
        # Apply Aggregation if supported
        agg_method = options.get('aggregationMethod', 'none')
        if 'aggregation' in supported and agg_method != 'none' and x_cols and y_cols:
            try:
                # Group by primary X column and aggregate all numerical Y columns
                numeric_y = [y for y in y_cols if pd.api.types.is_numeric_dtype(plot_df[y])]
                if numeric_y:
                    plot_df = plot_df.groupby(x_cols[0])[numeric_y].agg(agg_method).reset_index()
            except Exception as e:
                print(f"[Chart Gen] Aggregation failed: {str(e)}")

        # Apply Sorting if supported
        sort_order = options.get('sortOrder', 'none')
        if 'sorting' in supported and sort_order != 'none' and x_cols:
            try:
                if y_cols and len(y_cols) > 0 and pd.api.types.is_numeric_dtype(plot_df[y_cols[0]]):
                    plot_df = plot_df.sort_values(by=y_cols[0], ascending=(sort_order == 'asc'))
                else:
                    plot_df = plot_df.sort_values(by=x_cols[0], ascending=(sort_order == 'asc'))
            except Exception as e:
                print(f"[Chart Gen] Sorting failed: {str(e)}")

        # Render plot
        chart_class.plot(plot_df, x_cols, y_cols, ax, options)
    else:
        # Fallback to scatter
        ScatterChart.plot(plot_df, x_cols, y_cols, ax, options)

    plt.tight_layout()
    plt.savefig(output_path, dpi=dpi_val, bbox_inches='tight')
    plt.close()
    
    return {
        "dpi": dpi_val,
        "figsize": base_figsize,
        "style": "light"
    }
